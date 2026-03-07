import asyncio
import base64
import json
import os
import re
import subprocess
import time
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

from dotenv import load_dotenv
load_dotenv()

import httpx
import yt_dlp
import static_ffmpeg
static_ffmpeg.add_paths()  # Makes ffmpeg/ffprobe available for yt-dlp
from youtube_transcript_api import YouTubeTranscriptApi
print(f"[init] yt-dlp version: {yt_dlp.version.__version__}")
from google import genai
from google.genai import types
import bcrypt
import jwt
try:
    import feedparser
    from bs4 import BeautifulSoup
    SCRAPER_AVAILABLE = True
except ImportError as e:
    print(f"[init] WARNING: Scraper dependencies missing ({e}), scraper disabled")
    SCRAPER_AVAILABLE = False
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import random

from database import (
    init_db, close_db, insert_article, get_all_articles, get_article_by_slug,
    get_all_channels, get_articles_by_channel_slug, generate_channel_slug,
    update_article, delete_article,
    insert_source, get_all_sources, toggle_source, delete_source,
    is_url_seen, insert_seen_url, get_recent_article_titles,
    get_all_tags, get_articles_by_tag,
    get_setting, get_setting_with_timestamp, upsert_setting,
)


# ── App setup ─────────────────────────────────────────────────────────────────

_scraper_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scraper_task
    print("[startup] Initializing database...")
    try:
        await init_db()
        print("[startup] Database ready!")
    except Exception as e:
        print(f"[startup] FATAL: Database init failed: {e}")
        raise
    # Start background scraper
    if SCRAPER_AVAILABLE:
        try:
            _scraper_task = asyncio.create_task(_scraper_loop())
            print("[startup] Background scraper started (30-min interval)")
        except Exception as e:
            print(f"[startup] WARNING: Failed to start scraper: {e}")
    else:
        print("[startup] Scraper disabled (missing dependencies)")
    yield
    # Shutdown
    if _scraper_task:
        _scraper_task.cancel()
        try:
            await _scraper_task
        except asyncio.CancelledError:
            pass
    await close_db()
    print("[shutdown] Database closed")

app = FastAPI(lifespan=lifespan)

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global exception handler to ensure CORS headers on 500 errors ────────────
from starlette.requests import Request
from starlette.responses import JSONResponse


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions so CORS middleware can still add headers."""
    print(f"[error] Unhandled exception on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}"},
    )

ASSEMBLYAI_KEY = os.environ.get("ASSEMBLYAI_API_KEY", "")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")

# Configure Gemini client
gemini_client = genai.Client(api_key=GEMINI_KEY)

# 10 fixed writer accounts — articles are distributed round-robin
_AMERICAN_AUTHOR_NAMES = [
    "James Mitchell", "Sarah Johnson", "Michael Chen", "Emily Rodriguez",
    "David Thompson", "Jessica Williams", "Ryan Parker", "Amanda Foster",
    "Christopher Lee", "Lauren Martinez",
]
_author_index = 0  # round-robin counter


YOUTUBE_URL_PATTERN = re.compile(
    r"^(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[\w-]{11}"
)

# ── Admin auth config ─────────────────────────────────────────────────────────

ADMIN_USER = os.environ.get("ADMIN_USER", "DevashishBhuyan")
ADMIN_PASSWORD_HASH = os.environ.get(
    "ADMIN_PASSWORD_HASH",
    bcrypt.hashpw(b"Devashishone23@", bcrypt.gensalt()).decode(),
)
JWT_SECRET = os.environ.get("JWT_SECRET", os.urandom(32).hex())
JWT_EXPIRY_HOURS = 24

_login_attempts: dict[str, list[float]] = {}  # IP -> timestamps for rate limiting


def _verify_admin_token(authorization: str = Header(None)) -> str:
    """FastAPI dependency to verify JWT token on admin endpoints."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Request models ────────────────────────────────────────────────────────────

class ConvertRequest(BaseModel):
    url: str
    language: Literal["english", "hindi", "hinglish"] = "english"


class PublishRequest(BaseModel):
    title: str
    meta_description: str = ""
    channel: str
    channel_avatar: str = ""
    thumbnail: str
    duration: int
    youtube_url: str
    language: Literal["english", "hindi", "hinglish"]
    transcript: str
    article: str
    tags: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


class UpdateArticleRequest(BaseModel):
    title: str
    meta_description: str = ""
    article: str


class AddSourceRequest(BaseModel):
    name: str
    rss_url: str


# ── Language instructions for GPT ─────────────────────────────────────────────

LANGUAGE_INSTRUCTIONS = {
    "english": "Write the article in standard English.",
    "hindi": (
        "Write the article in romanized Hindi using the English/Latin alphabet. "
        "Use native Hindi phrasing and sentence structure, but keep technical terms, "
        "brand names, and commonly used English words in English. "
        "Example style: 'YouTube se audio download karna bahut aasaan hai. "
        "Sabse pehle aapko video ka URL copy karna hoga.'"
    ),
    "hinglish": (
        "Write the article in Hinglish — a casual, natural mix of Hindi and English "
        "as commonly used in Indian internet content. Use the English/Latin alphabet throughout. "
        "Mix Hindi and English words freely within sentences. "
        "Example style: 'Agar aap crypto trading mein interested ho, toh yeh article "
        "aapke liye perfect hai. Let\\'s start with the basics.'"
    ),
}


# ── Step 1: Download audio from YouTube ───────────────────────────────────────

def _get_cookies_file(db_cookies: str | None = None):
    """Write cookies to a temp file and return the path.
    Priority: db_cookies param > YOUTUBE_COOKIES env var.
    """
    cookies = db_cookies or os.environ.get("YOUTUBE_COOKIES", "")
    if not cookies:
        return None
    # Fix newlines that may get escaped in env vars
    cookies = cookies.replace("\\n", "\n")
    path = os.path.join(tempfile.gettempdir(), "yt_cookies.txt")
    with open(path, "w") as f:
        f.write(cookies)
    line_count = cookies.count("\n")
    print(f"[cookies] Written cookies file: {len(cookies)} chars, {line_count} lines")
    return path


# Cached DB cookies (refreshed on save or every scrape cycle)
_db_cookies_cache: str | None = None


async def _load_db_cookies():
    """Load cookies from DB settings table, cache in memory."""
    global _db_cookies_cache
    val = await get_setting("youtube_cookies")
    _db_cookies_cache = val
    return val


def _get_cookies_file_with_db():
    """Sync wrapper that uses cached DB cookies, falling back to env."""
    return _get_cookies_file(db_cookies=_db_cookies_cache)


async def _validate_youtube_cookies(cookie_text: str) -> dict:
    """Test if cookies are valid by trying a yt-dlp info extract."""
    cookie_path = _get_cookies_file(db_cookies=cookie_text)
    if not cookie_path:
        return {"valid": False, "error": "No cookies provided"}
    try:
        test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "cookiefile": cookie_path,
            "extract_flat": True,
            "socket_timeout": 15,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(test_url, download=False)
            if info and info.get("title"):
                return {"valid": True, "error": None}
            return {"valid": False, "error": "Could not extract video info"}
    except Exception as e:
        err_msg = str(e)
        if "Sign in" in err_msg or "cookies" in err_msg.lower() or "login" in err_msg.lower():
            return {"valid": False, "error": "Cookies expired or invalid"}
        return {"valid": False, "error": err_msg[:200]}


# ── Audio download: Cobalt (self-hosted, optional) + yt-dlp fallback ──────────

# Cobalt API for audio download (fallback when YouTube captions unavailable)
COBALT_API_URL = os.environ.get("COBALT_API_URL", "https://api.qwkuns.me/")

# yt-dlp player clients for fallback
_PLAYER_CLIENTS = [["default"], ["mediaconnect"], ["tv_embedded"], ["web"]]


def _get_video_id(url: str) -> str:
    """Extract YouTube video ID from URL."""
    match = re.search(r'(?:v=|youtu\.be/)([\w-]{11})', url)
    return match.group(1) if match else ""


def _get_audio_duration(filepath: str) -> int:
    """Get audio duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", filepath],
            capture_output=True, text=True, timeout=10,
        )
        return int(float(result.stdout.strip()))
    except Exception:
        return 0


def _fetch_channel_avatar(author_url: str) -> str:
    """Fetch channel profile picture from YouTube channel page og:image."""
    if not author_url:
        return ""
    try:
        with httpx.Client(timeout=10, follow_redirects=True) as client:
            resp = client.get(author_url)
            resp.raise_for_status()
            # Extract og:image from HTML
            match = re.search(r'<meta\s+property="og:image"\s+content="([^"]+)"', resp.text)
            if match:
                avatar = match.group(1)
                print(f"[metadata] Channel avatar: {avatar[:80]}")
                return avatar
    except Exception as e:
        print(f"[metadata] Channel avatar fetch failed: {e}")
    return ""


def _fetch_metadata(url: str, video_id: str) -> dict:
    """Get video metadata from YouTube oEmbed API (public, no auth)."""
    metadata = {"title": "", "channel": "", "duration": 0, "thumbnail": "", "channel_avatar": ""}
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(f"https://www.youtube.com/oembed?url={url}&format=json")
            resp.raise_for_status()
            data = resp.json()
        metadata["title"] = data.get("title", "")
        metadata["channel"] = data.get("author_name", "")
        metadata["thumbnail"] = data.get("thumbnail_url", "")

        # Fetch channel profile picture from author_url
        author_url = data.get("author_url", "")
        metadata["channel_avatar"] = _fetch_channel_avatar(author_url)

        # Try higher-res thumbnails (not all videos have them)
        if video_id:
            with httpx.Client(timeout=10) as client:
                for suffix in ("maxresdefault.jpg", "hq720.jpg", "sddefault.jpg"):
                    hi_res = f"https://i.ytimg.com/vi/{video_id}/{suffix}"
                    try:
                        check = client.head(hi_res, timeout=5)
                        if check.status_code == 200:
                            metadata["thumbnail"] = hi_res
                            break
                    except Exception:
                        continue

        print(f"[metadata] oEmbed OK: {metadata['title'][:60]} | thumb: {metadata['thumbnail']}")
    except Exception as e:
        print(f"[metadata] oEmbed failed: {e}")
        if video_id:
            metadata["thumbnail"] = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    return metadata


def get_youtube_transcript(video_id: str) -> str:
    """Get transcript from YouTube's built-in captions (auto-generated or manual).

    Works from cloud servers since it fetches captions, not video/audio streams.
    """
    try:
        entries = YouTubeTranscriptApi.get_transcript(video_id)
        text = " ".join(entry["text"] for entry in entries)
        if len(text) < 100:
            print(f"[transcript] YouTube captions too short ({len(text)} chars), skipping")
            return None
        print(f"[transcript] YouTube captions OK: {len(text)} chars")
        return text
    except Exception as e:
        print(f"[transcript] YouTube captions unavailable: {e}")
        return None


def _download_via_cobalt(url: str, tmp_dir: str) -> str:
    """Download audio via self-hosted Cobalt v10 API. Returns filepath.

    Response types handled:
      tunnel/redirect → single url field
      local-processing → tunnel[] array (needs client-side merge)
      picker → audio field (e.g. slideshow posts)
      error → raises
    """
    if not COBALT_API_URL:
        raise Exception("COBALT_API_URL not configured")

    print(f"[download] Cobalt: {COBALT_API_URL}")
    cobalt_key = os.environ.get("COBALT_API_KEY", "")
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if cobalt_key:
        headers["Authorization"] = f"Api-Key {cobalt_key}"

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            COBALT_API_URL,
            json={"url": url, "downloadMode": "audio", "audioFormat": "mp3"},
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

    status = data.get("status")
    print(f"[download] Cobalt status={status}")

    if status == "error":
        raise Exception(f"Cobalt error: {data.get('error', data)}")

    # Extract download URL based on response type
    audio_url = None
    if status in ("tunnel", "redirect"):
        audio_url = data.get("url")
    elif status == "local-processing":
        tunnels = data.get("tunnel") or []
        audio_url = tunnels[0] if tunnels else None
    elif status == "picker":
        audio_url = data.get("audio")

    if not audio_url:
        raise Exception(f"No download URL in Cobalt response (status={status})")

    filename = data.get("filename", "audio.mp3")
    filepath = os.path.join(tmp_dir, filename)
    print(f"[download] Downloading from Cobalt: {filename}")
    with httpx.Client(timeout=180, follow_redirects=True) as client:
        audio_resp = client.get(audio_url)
        audio_resp.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(audio_resp.content)

    if os.path.getsize(filepath) == 0:
        raise Exception("Downloaded file is empty")
    print(f"[download] Cobalt OK: {os.path.getsize(filepath)} bytes")
    return filepath


def download_audio(url: str) -> tuple[str, dict]:
    """Download audio — tries Cobalt (if configured), then yt-dlp as fallback."""
    tmp_dir = tempfile.mkdtemp()
    video_id = _get_video_id(url)
    metadata = _fetch_metadata(url, video_id)

    cobalt_error = None

    # ── Try Cobalt (only if self-hosted instance is configured) ──
    if COBALT_API_URL:
        try:
            filepath = _download_via_cobalt(url, tmp_dir)
            metadata["duration"] = _get_audio_duration(filepath)
            return filepath, metadata
        except Exception as e:
            cobalt_error = str(e)
            print(f"[download] Cobalt failed: {e}")
            for fname in os.listdir(tmp_dir):
                try:
                    os.remove(os.path.join(tmp_dir, fname))
                except OSError:
                    pass

    # ── Fallback: yt-dlp ──
    print(f"[download] Using yt-dlp...")
    cookies_file = _get_cookies_file_with_db()
    output_path = os.path.join(tmp_dir, "audio.%(ext)s")

    last_error = None
    for player_client in _PLAYER_CLIENTS:
        client_name = ",".join(player_client)
        try:
            print(f"[download] yt-dlp client={client_name}")
            opts = {
                "format": "ba/bestaudio/best",
                "extract_audio": True,
                "outtmpl": output_path,
                "noplaylist": True,
                "extractor_args": {"youtube": {"player_client": player_client}},
                "socket_timeout": 30,
                "retries": 3,
                "fragment_retries": 3,
            }
            if cookies_file:
                opts["cookiefile"] = cookies_file

            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)

            if not metadata["title"]:
                metadata["title"] = info.get("title", "")
            if not metadata["channel"]:
                metadata["channel"] = info.get("uploader", info.get("channel", ""))
            if not metadata["duration"]:
                metadata["duration"] = info.get("duration", 0)
            if not metadata["thumbnail"]:
                metadata["thumbnail"] = info.get("thumbnail", "")

            for fname in os.listdir(tmp_dir):
                fpath = os.path.join(tmp_dir, fname)
                if os.path.isfile(fpath) and os.path.getsize(fpath) > 0:
                    print(f"[download] yt-dlp OK: {fname} ({os.path.getsize(fpath)} bytes)")
                    return fpath, metadata

            raise Exception("No file after yt-dlp download")
        except Exception as e:
            print(f"[download] yt-dlp client={client_name} failed: {e}")
            last_error = e
            for fname in os.listdir(tmp_dir):
                try:
                    os.remove(os.path.join(tmp_dir, fname))
                except OSError:
                    pass
            continue

    errors = []
    if cobalt_error:
        errors.append(f"Cobalt: {cobalt_error}")
    if last_error:
        errors.append(f"yt-dlp: {last_error}")
    raise HTTPException(
        status_code=400,
        detail=f"Failed to download audio — {' | '.join(errors)}",
    )


# ── Step 2: Transcribe with AssemblyAI ────────────────────────────────────────

ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2"


async def transcribe_audio(filepath: str) -> str:
    """Upload audio to AssemblyAI and return the transcript text."""
    headers = {"authorization": ASSEMBLYAI_KEY}

    async with httpx.AsyncClient(timeout=300) as client:
        with open(filepath, "rb") as f:
            upload_resp = await client.post(
                f"{ASSEMBLYAI_BASE}/upload",
                headers=headers,
                content=f.read(),
            )
        if upload_resp.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload audio: {upload_resp.status_code} - {upload_resp.text}",
            )
        upload_url = upload_resp.json()["upload_url"]

        transcript_resp = await client.post(
            f"{ASSEMBLYAI_BASE}/transcript",
            headers=headers,
            json={"audio_url": upload_url, "speech_models": ["universal-2"]},
        )
        if transcript_resp.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start transcription: {transcript_resp.status_code} - {transcript_resp.text}",
            )
        transcript_id = transcript_resp.json()["id"]

        while True:
            poll_resp = await client.get(
                f"{ASSEMBLYAI_BASE}/transcript/{transcript_id}",
                headers=headers,
            )
            data = poll_resp.json()
            status = data["status"]
            if status == "completed":
                return data["text"]
            elif status == "error":
                raise HTTPException(status_code=500, detail=f"Transcription failed: {data.get('error')}")
            time.sleep(3)


# ── Step 3: Generate SEO article with Gemini ─────────────────────────────────

def _clean_tags(raw_tags: str) -> str:
    """Normalize AI-generated tags: lowercase, strip, deduplicate."""
    seen = set()
    cleaned = []
    for tag in raw_tags.split(","):
        tag = tag.strip().lower().replace(" ", "-")
        tag = re.sub(r"[^a-z0-9-]", "", tag)
        if tag and tag not in seen:
            seen.add(tag)
            cleaned.append(tag)
    return ",".join(cleaned[:8])


def generate_article(transcript: str, title: str, channel: str, language: str) -> dict:
    """Use Gemini to turn a transcript into a CoinDesk-style news article.

    Returns dict with keys: title, meta_description, body, tags
    """
    lang_instruction = LANGUAGE_INSTRUCTIONS[language]

    prompt = f"""You are tasked with transforming a YouTube transcript into a high-quality, SEO-optimized crypto article written from the influencer's first-person perspective.

Influencer / Channel: {channel}
Video Title: {title}

Language instruction: {lang_instruction}

PHASE 1: TRANSCRIPT ANALYSIS
* The "Alpha" Extraction: Identify the influencer's most unique opinion or contrarian thesis. Ignore the fluff.
* Entity Mapping: Identify the key "Entities" mentioned (Protocols, Founders, Tokens, Regulatory bodies).
* Voice Match: Analyze the influencer's tone (e.g., skeptical, hyper-bullish, technical, or macro-focused) and mirror it perfectly in the first person ("I," "my," "me").

PHASE 2: GEO & SEO ARCHITECTURE
To ensure this article is picked up by AI and Search Engines, you must:
1. Information Gain: Focus on the unique insights the influencer provides that aren't found in generic news.
2. The "Featured Snippet" Hook: Start with a 2-3 sentence "Bottom Line Up Front" (BLUF) that directly answers the main question of the topic.
3. Authority Fact-Citing with Hyperlinks: Identify 4-6 specific factual claims or data points in the transcript. **Bold** these key facts and include markdown hyperlinks to reputable crypto data sources where possible. Use real, well-known URL patterns like:
   - Token data: https://coinmarketcap.com/currencies/bitcoin/ or https://www.coingecko.com/en/coins/ethereum
   - DeFi metrics: https://defillama.com/protocol/aave
   - On-chain data: reference Glassnode, Dune Analytics, etc.
   Example: "**Bitcoin dominance hit 58%** according to [CoinMarketCap](https://coinmarketcap.com/charts/#dominance-percentage)"
4. Structured Data: Convert any comparisons, lists of steps, or numerical data from the transcript into a Markdown Table or Bullet Points for AI readability.

PHASE 3: THE ARTICLE STRUCTURE (800-1200 Words)
* The "H1" Headline: A bold, citable headline containing the primary SEO keyword and the influencer's main stance. The title MUST end with " | {channel}" to credit the creator (e.g., "Bitcoin Bull Run Analysis | Raoul Pal").
* The First-Person Intro: Establish the influencer's authority immediately. No "In this video" or "He says."
* The Thesis (H2): Use a question-based subheading (e.g., "Why the Layer 2 Narrative is Shifting").
* The Evidence (H2/H3): Expand on the creator's logic. Integrate the bolded factual claims with hyperlinked source citations.
* The "So What?" (Conclusion): A definitive closing statement that summarizes the influencer's unique perspective and future outlook.
* VIDEO CTA: At the very end of the body, include this exact line: "\\n\\n---\\n\\n**You can also check out my full video breakdown on this topic below.**\\n"

STRICT CONSTRAINTS
* Perspective: STRICTLY first-person. The influencer is the author.
* No Metadata Talk: Never mention "the transcript," "the video," or "the creator."
* Tone: Expert, polished, and assertive. Replace filler words with professional crypto terminology (e.g., "liquidity crunch" instead of "no money left").
* Formatting: Use Markdown (H2, H3, Bold, Lists, Tables, Hyperlinks).
* Title: The title field MUST be plain text only — NO markdown, NO asterisks (**), NO quotes. Must end with " | {channel}".

You MUST return your response as valid JSON with exactly these four fields:
{{
  "title": "The H1 headline ending with ' | {channel}' (50-90 characters, plain text only)",
  "meta_description": "A 1-2 sentence BLUF summary for SEO meta tags (150-160 characters)",
  "body": "The full article body in Markdown format (800-1200 words). Written in FIRST PERSON as the influencer. Must end with the video CTA line. Do NOT include the title or meta description in the body.",
  "tags": "5-8 lowercase comma-separated crypto/topic tags relevant to this article (e.g. bitcoin,ethereum,defi,market-analysis,layer-2)"
}}

Return ONLY the JSON object, no markdown code fences, no extra text.

TRANSCRIPT TO PROCESS:
{transcript}"""

    print(f"[article] Model: gemini-3.1-flash-lite-preview | Temperature: 0.6")
    print(f"[article] Prompt length: {len(prompt)} chars | Transcript length: {len(transcript)} chars")

    response = gemini_client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.6),
    )
    raw = response.text.strip()
    print(f"[article] Response length: {len(raw)} chars")
    print(f"[article] Response preview: {raw[:300]}...")

    # Parse the JSON response
    try:
        # Remove markdown code fences if Gemini wraps them
        cleaned = raw
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
        result = json.loads(cleaned)
        # Strip any stray markdown formatting from title (e.g., **bold**)
        clean_title = result.get("title", title).strip().strip("*").strip('"').strip()
        print(f"[article] JSON parsed OK — title: {clean_title[:80]}")
        return {
            "title": clean_title,
            "meta_description": result.get("meta_description", "").strip().strip('"'),
            "body": result.get("body", raw),
            "tags": _clean_tags(result.get("tags", "")),
        }
    except (json.JSONDecodeError, AttributeError) as e:
        # Fallback: use raw text as body, keep YouTube title
        print(f"[article] WARNING: JSON parse failed ({e}), using raw text as body")
        return {
            "title": title,
            "meta_description": "",
            "body": raw,
            "tags": "",
        }


# ── Slug generation ───────────────────────────────────────────────────────────

def generate_slug(title: str, article: str) -> str:
    """Use Gemini to extract long-tail keywords and create a URL slug."""
    prompt = f"""Extract 5-8 long-tail SEO keywords from this article title and content.
Return ONLY a single hyphen-separated slug string, lowercase, no special characters.
Example output: how-to-trade-crypto-futures-in-inr-on-mudrex

Title: {title}

Article (first 500 chars): {article[:500]}"""

    response = gemini_client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=100),
    )
    raw_slug = response.text.strip()
    slug = re.sub(r"[^a-z0-9-]", "", raw_slug.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or f"article-{int(time.time())}"


# ── Step 4: Generate AI thumbnail ─────────────────────────────────────────────

def generate_thumbnail(image_url: str, article_title: str = "") -> str:
    """Download an image, transform it via Gemini into a
    comic-book style crypto news thumbnail, and return a base64 data URL.
    Falls back to the original URL on error.
    """
    try:
        # Download the original thumbnail
        print(f"[thumbnail] Downloading thumbnail: {image_url[:80]}")
        with httpx.Client(timeout=30, headers={"User-Agent": "Mozilla/5.0"}) as client:
            img_resp = client.get(image_url)
            img_resp.raise_for_status()
            original_bytes = img_resp.content
        print(f"[thumbnail] Downloaded: {len(original_bytes)} bytes")

        title_line = f"\n\nArticle title: {article_title}" if article_title else ""
        prompt = (
            "Transform this image to a high-contrast, comic-book style illustration "
            "for a crypto news thumbnail. The style should be inspired by modern graphic "
            "novels with bold, dark ink outlines and clean cel-shading. "
            "The elements in the image should be heavily inspired by the title of the "
            "article and image I have shared. "
            "Make sure you remove any logo if you find in the image. "
            "IMPORTANT: The output image MUST be exactly 1200 pixels wide and 630 pixels tall "
            "(1200x630, landscape orientation, 1.91:1 aspect ratio). This is the standard "
            "Open Graph social media preview size. Ensure ALL visual elements fit within "
            "the frame with no cropping — leave adequate padding around edges."
            f"{title_line}"
        )
        print(f"[thumbnail] Model: gemini-3.1-flash-image-preview")

        response = gemini_client.models.generate_content(
            model="gemini-3.1-flash-image-preview",
            contents=[
                types.Part.from_bytes(data=original_bytes, mime_type="image/jpeg"),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_modalities=["image", "text"],
            ),
        )

        # Extract the generated image and return as base64 data URL
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                mime = part.inline_data.mime_type
                b64 = base64.b64encode(part.inline_data.data).decode()
                data_url = f"data:{mime};base64,{b64}"
                print(f"[thumbnail] SUCCESS: generated {len(part.inline_data.data)} bytes as data URL")
                return data_url

        # No image part found – fall back
        print("[thumbnail] Gemini returned no image parts, using original thumbnail")
        return image_url

    except Exception as e:
        print(f"[thumbnail] Failed to generate AI thumbnail: {e}")
        return image_url


# ── Scraper: RSS parsing, article extraction, dedup, rewrite ─────────────────

SCRAPE_INTERVAL = int(os.environ.get("SCRAPE_INTERVAL_SECONDS", 1800))  # 30 min

# In-memory scraper log (last 50 entries) for debugging
_scraper_log: list[dict] = []


def _log_scraper(message: str, level: str = "info"):
    """Add entry to scraper log and print it."""
    entry = {"time": datetime.now(timezone.utc).isoformat(), "level": level, "msg": message}
    _scraper_log.append(entry)
    if len(_scraper_log) > 50:
        _scraper_log.pop(0)
    print(f"[scraper] {message}")

_STOPWORDS = frozenset(
    "the a an is in for to of and or but on at by with from as it its that this "
    "are was were be been has have had do does did will would could should may "
    "can not no so if then than also just about up out into over after before "
    "between through during each all both few more most other some such only same "
    "very what which who how when where why new".split()
)


def _extract_keywords(text: str) -> set[str]:
    """Extract meaningful keywords from text for dedup comparison."""
    words = re.sub(r"[^a-z0-9\s]", "", text.lower()).split()
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _is_duplicate_topic(new_title: str, recent_titles: list[str], threshold: float = 0.45) -> bool:
    """Check if new_title is too similar to any recent title by keyword overlap."""
    new_kw = _extract_keywords(new_title)
    if not new_kw:
        return False
    for existing_title in recent_titles:
        existing_kw = _extract_keywords(existing_title)
        if not existing_kw:
            continue
        overlap = len(new_kw & existing_kw)
        ratio = overlap / min(len(new_kw), len(existing_kw))
        if ratio >= threshold:
            print(f"[scraper] Duplicate detected: '{new_title[:50]}' ~ '{existing_title[:50]}' (ratio={ratio:.2f})")
            return True
    return False


def _fetch_rss_entries(rss_url: str) -> list[dict]:
    """Parse RSS feed and return recent entries."""
    try:
        # Fetch RSS with User-Agent to avoid blocks
        with httpx.Client(timeout=15, headers=_SCRAPER_HEADERS) as client:
            resp = client.get(rss_url)
            resp.raise_for_status()
        feed = feedparser.parse(resp.text)
        entries = []
        for entry in feed.entries[:10]:
            entries.append({
                "title": entry.get("title", ""),
                "link": entry.get("link", ""),
            })
        print(f"[scraper] RSS OK: {len(entries)} entries from {rss_url[:50]}")
        return entries
    except Exception as e:
        print(f"[scraper] RSS parse error for {rss_url}: {e}")
        return []


_SCRAPER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _extract_article_text(url: str) -> tuple[str, str]:
    """Fetch page HTML, extract article text and og:image. Returns (text, og_image_url)."""
    try:
        with httpx.Client(timeout=20, follow_redirects=True, headers=_SCRAPER_HEADERS) as client:
            resp = client.get(url)
            resp.raise_for_status()
            html = resp.text

        soup = BeautifulSoup(html, "html.parser")

        # Extract og:image for thumbnail
        og_image = ""
        og_tag = soup.find("meta", property="og:image")
        if og_tag and og_tag.get("content"):
            og_image = og_tag["content"]

        # Remove script/style tags
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        # Try <article> first, then <main>, then largest text block
        content = None
        for selector in ["article", "main", '[role="main"]']:
            el = soup.find(selector)
            if el:
                content = el.get_text(separator="\n", strip=True)
                break

        if not content:
            # Fallback: get body text
            body = soup.find("body")
            content = body.get_text(separator="\n", strip=True) if body else soup.get_text(separator="\n", strip=True)

        # Clean up
        lines = [line.strip() for line in content.split("\n") if line.strip()]
        text = "\n".join(lines)[:15000]

        if len(text) < 200:
            print(f"[scraper] Article text too short ({len(text)} chars) for {url}")
            return "", og_image

        return text, og_image
    except Exception as e:
        print(f"[scraper] Failed to extract text from {url}: {e}")
        return "", ""


def generate_rewritten_article(original_text: str, original_title: str, source_name: str, original_url: str = "") -> dict:
    """Use Gemini to rewrite a news article in original voice.

    Returns dict with keys: title, meta_description, body, tags
    """
    source_link_instruction = ""
    if original_url:
        source_link_instruction = f'Include a hyperlink to the original source: [{source_name}]({original_url})'

    prompt = f"""You are a senior crypto news editor at a major publication. Transform the following article into an original, heavily SEO-optimized crypto news piece.

Source: {source_name}
Original Title: {original_title}

INSTRUCTIONS:
1. Write in THIRD PERSON, objective journalist voice
2. Do NOT copy phrases verbatim from the source — rewrite everything in your own words
3. Maintain all factual accuracy — preserve key data points, numbers, quotes

SEO OPTIMIZATION:
1. Featured Snippet Hook: Start with a 2-3 sentence "Bottom Line Up Front" (BLUF) that directly answers the main question
2. Hyperlinked Facts: For key factual claims, include markdown hyperlinks to reputable crypto data sources. Use real, well-known URL patterns:
   - Token data: https://coinmarketcap.com/currencies/bitcoin/ or https://www.coingecko.com/en/coins/ethereum
   - DeFi metrics: https://defillama.com/protocol/aave
   - On-chain: reference Glassnode, Dune Analytics, etc.
   Example: "**Bitcoin surged past $70,000** according to [CoinMarketCap](https://coinmarketcap.com/currencies/bitcoin/)"
3. {source_link_instruction}
4. Structured Data: Convert comparisons, lists, or numerical data into Markdown Tables or Bullet Points
5. **Bold** all key data points, statistics, and numbers

ARTICLE STRUCTURE (600-1000 Words):
* Compelling, SEO-keyword-rich headline (plain text, no markdown)
* 2-3 sentence intro summary (the BLUF / Featured Snippet hook)
* Body with H2 subheadings — each subheading should be question-based or keyword-rich
* Data-rich evidence sections with hyperlinked citations
* Definitive conclusion with forward-looking analysis

STRICT CONSTRAINTS:
* Title MUST be plain text only — NO markdown, asterisks, or quotes
* Use Markdown formatting (H2, H3, Bold, Lists, Tables, Hyperlinks)
* Do NOT copy phrases verbatim — fully rewrite in original language

You MUST return valid JSON with exactly these six fields:
{{
  "title": "A compelling, SEO-optimized headline (50-80 characters, plain text only)",
  "meta_description": "A 1-2 sentence BLUF summary for SEO (150-160 characters)",
  "body": "The full rewritten article in Markdown (600-1000 words)",
  "tags": "5-8 lowercase comma-separated crypto/topic tags relevant to this article (e.g. bitcoin,ethereum,defi,regulation,market-analysis)",
  "sentiment": "One of: bullish, neutral, bearish — based on overall market sentiment of the article",
  "sentiment_score": "A PRECISE integer from 0-100 reflecting exact sentiment intensity. DO NOT round to multiples of 5 or 10 — use granular values like 23, 67, 81, 14, 93, 42, 58, 76, etc. Scale: 0-15=very bearish, 16-35=bearish, 36-45=slightly bearish, 46-55=neutral, 56-65=slightly bullish, 66-85=bullish, 86-100=very bullish. Analyze the specific language, data points, and tone to pick a PRECISE number."
}}

Return ONLY the JSON object, no markdown code fences, no extra text.

ARTICLE TO REWRITE:
{original_text}"""

    print(f"[scraper] Rewriting: '{original_title[:60]}' | Model: gemini-3.1-flash-lite-preview")

    response = gemini_client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.6),
    )
    raw = response.text.strip()

    try:
        cleaned = raw
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
        result = json.loads(cleaned)
        clean_title = result.get("title", original_title).strip().strip("*").strip('"').strip()
        sentiment = result.get("sentiment", "neutral").strip().lower()
        if sentiment not in ("bullish", "neutral", "bearish"):
            sentiment = "neutral"
        try:
            sentiment_score = int(result.get("sentiment_score", 50))
            sentiment_score = max(0, min(100, sentiment_score))
        except (ValueError, TypeError):
            sentiment_score = 50
        return {
            "title": clean_title,
            "meta_description": result.get("meta_description", "").strip().strip('"'),
            "body": result.get("body", raw),
            "tags": _clean_tags(result.get("tags", "")),
            "sentiment": sentiment,
            "sentiment_score": sentiment_score,
        }
    except (json.JSONDecodeError, AttributeError) as e:
        print(f"[scraper] JSON parse failed ({e}), using raw text")
        return {"title": original_title, "meta_description": "", "body": raw, "tags": "", "sentiment": "neutral", "sentiment_score": 50}


async def _run_scrape_cycle():
    """Run one full scrape cycle across all enabled sources."""
    sources = await get_all_sources()
    enabled = [s for s in sources if s.get("enabled")]
    if not enabled:
        return

    _log_scraper(f"Starting cycle: {len(enabled)} enabled sources")
    recent_titles = await get_recent_article_titles(hours=24)
    published = 0
    skipped = 0
    MAX_PER_SOURCE = 3  # Limit articles per source per cycle to avoid API exhaustion

    for source in enabled:
        try:
            entries = await asyncio.to_thread(_fetch_rss_entries, source["rss_url"])
            _log_scraper(f"{source['name']}: {len(entries)} RSS entries")
            source_published = 0

            for entry in entries:
                if source_published >= MAX_PER_SOURCE:
                    _log_scraper(f"{source['name']}: hit {MAX_PER_SOURCE}-article limit, moving to next source")
                    break
                url = entry["link"]
                title = entry["title"]

                if not url:
                    continue

                # Already processed?
                if await is_url_seen(url):
                    continue

                # Topic dedup
                if _is_duplicate_topic(title, recent_titles):
                    await insert_seen_url(url, source["id"], title, "skipped_dup")
                    skipped += 1
                    continue

                try:
                    # Extract article text
                    _log_scraper(f"Extracting: {title[:50]}")
                    text, og_image = await asyncio.to_thread(_extract_article_text, url)
                    if not text:
                        _log_scraper(f"Skip (no text): {title[:50]}", "warn")
                        await insert_seen_url(url, source["id"], title, "skipped_dup")
                        skipped += 1
                        continue

                    # Rewrite with Gemini (pass original URL for source linking)
                    _log_scraper(f"Rewriting: {title[:50]}")
                    article_data = await asyncio.to_thread(
                        generate_rewritten_article, text, title, source["name"], url
                    )

                    # Generate slug
                    slug = await asyncio.to_thread(generate_slug, article_data["title"], article_data["body"])
                    existing = await get_article_by_slug(slug)
                    if existing:
                        slug = f"{slug}-{int(time.time())}"

                    # Generate AI comic-book thumbnail from og:image
                    if og_image:
                        _log_scraper(f"Generating thumbnail: {title[:40]}")
                        thumbnail = await asyncio.to_thread(
                            generate_thumbnail, og_image, article_data["title"]
                        )
                    else:
                        thumbnail = ""

                    # Round-robin author assignment across 10 writers
                    global _author_index
                    author_name = _AMERICAN_AUTHOR_NAMES[_author_index % len(_AMERICAN_AUTHOR_NAMES)]
                    _author_index += 1

                    # Publish
                    channel_slug = generate_channel_slug(author_name)
                    await insert_article(
                        slug=slug,
                        title=article_data["title"],
                        meta_description=article_data["meta_description"],
                        channel=author_name,
                        channel_slug=channel_slug,
                        channel_avatar="",
                        thumbnail=thumbnail,
                        duration=0,
                        youtube_url=url,
                        language="english",
                        transcript=text,
                        article=article_data["body"],
                        tags=article_data.get("tags", ""),
                        sentiment=article_data.get("sentiment", "neutral"),
                        sentiment_score=article_data.get("sentiment_score", 50),
                    )

                    await insert_seen_url(url, source["id"], article_data["title"], "published")
                    recent_titles.append(article_data["title"])
                    published += 1
                    source_published += 1
                    _log_scraper(f"Published: '{article_data['title'][:60]}' by {author_name}")

                    # Rate limit: wait between articles to avoid Gemini API exhaustion
                    await asyncio.sleep(15)

                except Exception as entry_err:
                    _log_scraper(f"Error processing entry '{title[:50]}': {entry_err}", "error")
                    skipped += 1
                    try:
                        await insert_seen_url(url, source["id"], title, "error")
                    except Exception:
                        pass
                    continue

        except Exception as e:
            _log_scraper(f"Error fetching RSS for '{source['name']}': {e}", "error")

    _log_scraper(f"Cycle complete: {published} published, {skipped} skipped")


COOKIE_CHECK_INTERVAL = 6 * 3600  # 6 hours in seconds
_last_cookie_check: float = 0


async def _check_cookie_health():
    """Check if YouTube cookies are still valid, store result in DB."""
    global _last_cookie_check
    now = time.time()
    if now - _last_cookie_check < COOKIE_CHECK_INTERVAL:
        return  # Not time yet
    _last_cookie_check = now
    print("[cookies] Running scheduled cookie health check...")
    cookie_text = await get_setting("youtube_cookies")
    if not cookie_text:
        # Also check env var
        cookie_text = os.environ.get("YOUTUBE_COOKIES", "")
    if not cookie_text:
        result = {"status": "not_set", "error": "No cookies configured", "checked_at": datetime.now(timezone.utc).isoformat()}
        await upsert_setting("cookie_health", json.dumps(result))
        print("[cookies] Health check: no cookies set")
        return
    validation = await _validate_youtube_cookies(cookie_text)
    status = "valid" if validation["valid"] else "expired"
    result = {
        "status": status,
        "error": validation.get("error"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    await upsert_setting("cookie_health", json.dumps(result))
    _log_scraper(f"Cookie health check: {status}" + (f" ({validation['error']})" if validation.get("error") else ""))
    print(f"[cookies] Health check result: {status}")


async def _scraper_loop():
    """Background loop that runs scrape cycles every SCRAPE_INTERVAL seconds."""
    _log_scraper("Background loop started, waiting 10s for init...")
    await asyncio.sleep(10)
    # Load DB cookies on startup
    await _load_db_cookies()
    while True:
        try:
            await _check_cookie_health()
        except Exception as e:
            print(f"[cookies] Health check error: {e}")
        try:
            await _run_scrape_cycle()
        except Exception as e:
            print(f"[scraper] Loop error: {e}")
        await asyncio.sleep(SCRAPE_INTERVAL)


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "scraper_available": SCRAPER_AVAILABLE}


@app.get("/api/debug-formats")
async def debug_formats(url: str):
    """Debug: see what formats YouTube returns on this server."""
    if not YOUTUBE_URL_PATTERN.match(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    cookies_file = _get_cookies_file_with_db()
    results = {"yt_dlp_version": yt_dlp.version.__version__}

    for player_client in [["default"], ["mediaconnect"], ["tv_embedded"]]:
        client_name = ",".join(player_client)
        try:
            opts = {
                "quiet": True,
                "noplaylist": True,
                "extractor_args": {"youtube": {"player_client": player_client}},
            }
            if cookies_file:
                opts["cookiefile"] = cookies_file
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            formats = info.get("formats") or []
            audio_fmts = [f for f in formats if f.get("acodec", "none") != "none"]
            results[client_name] = {
                "title": info.get("title", "")[:50],
                "total_formats": len(formats),
                "audio_formats": len(audio_fmts),
                "audio_details": [
                    {
                        "itag": f.get("format_id"),
                        "ext": f.get("ext"),
                        "acodec": f.get("acodec"),
                        "abr": f.get("abr"),
                        "has_url": bool(f.get("url")),
                    }
                    for f in audio_fmts[:10]
                ],
            }
        except Exception as e:
            results[client_name] = {"error": str(e)}
    return results


@app.post("/api/convert")
async def convert(req: ConvertRequest):
    url = req.url.strip()
    if not YOUTUBE_URL_PATTERN.match(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    if not ASSEMBLYAI_KEY:
        raise HTTPException(status_code=500, detail="ASSEMBLYAI_API_KEY not set")
    if not GEMINI_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")

    # Download audio
    try:
        filepath, metadata = download_audio(url)
    except Exception as e:
        print(f"[convert] Audio download failed: {e}")
        raise HTTPException(status_code=502, detail=f"Audio download failed: {e}")

    # Start thumbnail generation in parallel (with article title for context)
    executor = ThreadPoolExecutor(max_workers=1)
    thumbnail_future = executor.submit(
        generate_thumbnail, metadata["thumbnail"], metadata["title"]
    )

    try:
        transcript = await transcribe_audio(filepath)
        article_data = generate_article(transcript, metadata["title"], metadata["channel"], req.language)
    except Exception as e:
        print(f"[convert] Processing failed: {e}")
        raise HTTPException(status_code=502, detail=f"Article generation failed: {e}")
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)

    try:
        ai_thumbnail = thumbnail_future.result(timeout=60)
    except Exception as e:
        print(f"[convert] Thumbnail generation failed: {e}")
        ai_thumbnail = metadata["thumbnail"]  # Fallback to original thumbnail
    executor.shutdown(wait=False)
    metadata["thumbnail"] = ai_thumbnail
    print(f"[convert] Thumbnail ready: {ai_thumbnail[:80]}...")

    return {
        "metadata": metadata,
        "transcript": transcript,
        "title": article_data["title"],
        "meta_description": article_data["meta_description"],
        "article": article_data["body"],
        "tags": article_data.get("tags", ""),
        "language": req.language,
    }


@app.post("/api/publish")
async def publish(req: PublishRequest):
    slug = generate_slug(req.title, req.article)

    existing = await get_article_by_slug(slug)
    if existing:
        slug = f"{slug}-{int(time.time())}"

    channel_slug = generate_channel_slug(req.channel)

    article_record = await insert_article(
        slug=slug,
        title=req.title,
        meta_description=req.meta_description,
        channel=req.channel,
        channel_slug=channel_slug,
        channel_avatar=req.channel_avatar,
        thumbnail=req.thumbnail,
        duration=req.duration,
        youtube_url=req.youtube_url,
        language=req.language,
        transcript=req.transcript,
        article=req.article,
        tags=req.tags,
    )
    return {"slug": slug, "article": article_record}


@app.get("/api/articles")
async def list_articles():
    from starlette.responses import JSONResponse as SJSONResponse
    articles = await get_all_articles()
    return SJSONResponse(
        content={"articles": articles},
        headers={"Cache-Control": "public, s-maxage=30, stale-while-revalidate=60"},
    )


@app.get("/api/articles/{slug}")
async def get_article(slug: str):
    from starlette.responses import JSONResponse as SJSONResponse
    article = await get_article_by_slug(slug)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return SJSONResponse(
        content=article,
        headers={"Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"},
    )


@app.get("/api/authors")
async def list_authors():
    channels = await get_all_channels()
    return {"authors": channels}


@app.get("/api/authors/{channel_slug}")
async def get_author(channel_slug: str):
    result = await get_articles_by_channel_slug(channel_slug)
    if not result:
        raise HTTPException(status_code=404, detail="Author not found")
    return result


# ── Tags Endpoints ──────────────────────────────────────────────────────────

@app.get("/api/tags")
async def list_tags():
    tags = await get_all_tags()
    return {"tags": tags}


@app.get("/api/tags/{tag}")
async def get_tag_articles(tag: str):
    articles = await get_articles_by_tag(tag)
    return {"tag": tag, "articles": articles}


# ── Admin Endpoints ──────────────────────────────────────────────────────────

@app.post("/api/admin/login")
async def admin_login(req: LoginRequest):
    # Rate limiting: max 5 attempts per 15 minutes per username
    now = time.time()
    key = req.username.lower()
    attempts = _login_attempts.get(key, [])
    attempts = [t for t in attempts if now - t < 900]  # Keep last 15 min
    _login_attempts[key] = attempts

    if len(attempts) >= 5:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")

    _login_attempts[key].append(now)

    if req.username != ADMIN_USER or not bcrypt.checkpw(
        req.password.encode(), ADMIN_PASSWORD_HASH.encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Clear attempts on success
    _login_attempts.pop(key, None)

    token = jwt.encode(
        {
            "sub": req.username,
            "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"token": token, "username": req.username}


@app.get("/api/admin/articles")
async def admin_list_articles(user: str = Depends(_verify_admin_token)):
    articles = await get_all_articles()
    return {"articles": articles}


@app.put("/api/admin/articles/{slug}")
async def admin_update_article(
    slug: str, req: UpdateArticleRequest, user: str = Depends(_verify_admin_token)
):
    updated = await update_article(slug, req.title, req.meta_description, req.article)
    if not updated:
        raise HTTPException(status_code=404, detail="Article not found")
    return updated


@app.delete("/api/admin/articles/{slug}")
async def admin_delete_article(slug: str, user: str = Depends(_verify_admin_token)):
    deleted = await delete_article(slug)
    if not deleted:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"deleted": True}


# ── Admin Source Endpoints ───────────────────────────────────────────────────

@app.get("/api/admin/sources")
async def admin_list_sources(user: str = Depends(_verify_admin_token)):
    sources = await get_all_sources()
    return {"sources": sources}


@app.post("/api/admin/sources")
async def admin_add_source(req: AddSourceRequest, user: str = Depends(_verify_admin_token)):
    try:
        source = await insert_source(req.name, req.rss_url)
        return source
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=400, detail="This RSS URL already exists")
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/admin/sources/{source_id}")
async def admin_delete_source(source_id: int, user: str = Depends(_verify_admin_token)):
    deleted = await delete_source(source_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"deleted": True}


@app.put("/api/admin/sources/{source_id}/toggle")
async def admin_toggle_source(source_id: int, user: str = Depends(_verify_admin_token)):
    # Fetch current state and toggle
    sources = await get_all_sources()
    current = next((s for s in sources if s["id"] == source_id), None)
    if not current:
        raise HTTPException(status_code=404, detail="Source not found")
    updated = await toggle_source(source_id, not current["enabled"])
    return updated


@app.post("/api/admin/sources/trigger")
async def admin_trigger_scrape(user: str = Depends(_verify_admin_token)):
    """Manually trigger one scrape cycle."""
    if not SCRAPER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Scraper dependencies not installed")
    _log_scraper("Manual trigger requested")
    asyncio.create_task(_run_scrape_cycle())
    return {"status": "Scrape cycle started"}


@app.get("/api/admin/sources/log")
async def admin_scraper_log(user: str = Depends(_verify_admin_token)):
    """Get recent scraper activity log for debugging."""
    return {"log": _scraper_log, "scraper_available": SCRAPER_AVAILABLE}


# ── Admin Cookie Endpoints ──────────────────────────────────────────────────

class SaveCookieRequest(BaseModel):
    cookies: str


@app.get("/api/admin/cookies")
async def admin_get_cookie_status(user: str = Depends(_verify_admin_token)):
    """Get current YouTube cookie status."""
    cookie_data = await get_setting_with_timestamp("youtube_cookies")
    health_data = await get_setting("cookie_health")

    has_cookies = cookie_data is not None
    cookie_preview = ""
    cookie_saved_at = None
    if cookie_data:
        val = cookie_data["value"]
        cookie_saved_at = cookie_data["updated_at"]
        # Show first 40 chars + last 20 chars for preview (security)
        if len(val) > 80:
            cookie_preview = val[:40] + "..." + val[-20:]
        else:
            cookie_preview = val[:60] + "..."

    health = {"status": "unknown", "error": None, "checked_at": None}
    if health_data:
        try:
            health = json.loads(health_data)
        except json.JSONDecodeError:
            pass

    # If cookies exist but no health check has been done, status is "unknown"
    if has_cookies and health["status"] == "not_set":
        health["status"] = "unknown"

    return {
        "has_cookies": has_cookies,
        "cookie_preview": cookie_preview,
        "cookie_saved_at": cookie_saved_at,
        "health": health,
    }


@app.post("/api/admin/cookies")
async def admin_save_cookies(req: SaveCookieRequest, user: str = Depends(_verify_admin_token)):
    """Save YouTube cookies to the database."""
    cookie_text = req.cookies.strip()
    if not cookie_text:
        raise HTTPException(status_code=400, detail="Cookies cannot be empty")
    if len(cookie_text) < 50:
        raise HTTPException(status_code=400, detail="Cookie text seems too short to be valid")

    await upsert_setting("youtube_cookies", cookie_text)

    # Update in-memory cache
    global _db_cookies_cache
    _db_cookies_cache = cookie_text

    # Clear old health status so it gets rechecked
    await upsert_setting("cookie_health", json.dumps({
        "status": "unknown",
        "error": None,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }))

    return {"saved": True, "message": "Cookies saved successfully"}


@app.post("/api/admin/cookies/check")
async def admin_check_cookies(user: str = Depends(_verify_admin_token)):
    """Force a cookie health check now."""
    cookie_text = await get_setting("youtube_cookies")
    if not cookie_text:
        cookie_text = os.environ.get("YOUTUBE_COOKIES", "")
    if not cookie_text:
        return {"status": "not_set", "error": "No cookies configured", "checked_at": datetime.now(timezone.utc).isoformat()}

    validation = await _validate_youtube_cookies(cookie_text)
    status = "valid" if validation["valid"] else "expired"
    result = {
        "status": status,
        "error": validation.get("error"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    await upsert_setting("cookie_health", json.dumps(result))

    # Update the last check timestamp
    global _last_cookie_check
    _last_cookie_check = time.time()

    return result


@app.get("/api/cookies/health")
async def public_cookie_health():
    """Public endpoint to check cookie health status (for 6-hour polling)."""
    health_data = await get_setting("cookie_health")
    if not health_data:
        return {"status": "unknown", "error": None, "checked_at": None}
    try:
        return json.loads(health_data)
    except json.JSONDecodeError:
        return {"status": "unknown", "error": None, "checked_at": None}

