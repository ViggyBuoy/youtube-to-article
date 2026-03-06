import json
import os
import re
import subprocess
import time
import uuid
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import init_db, close_db, insert_article, get_all_articles, get_article_by_slug


# ── App setup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] Initializing database...")
    try:
        await init_db()
        print("[startup] Database ready!")
    except Exception as e:
        print(f"[startup] FATAL: Database init failed: {e}")
        raise
    yield
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

ASSEMBLYAI_KEY = os.environ.get("ASSEMBLYAI_API_KEY", "")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")

# Configure Gemini client
gemini_client = genai.Client(api_key=GEMINI_KEY)

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
STATIC_DIR = Path(__file__).parent / "static"
THUMBNAILS_DIR = STATIC_DIR / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

YOUTUBE_URL_PATTERN = re.compile(
    r"^(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[\w-]{11}"
)


# ── Request models ────────────────────────────────────────────────────────────

class ConvertRequest(BaseModel):
    url: str
    language: Literal["english", "hindi", "hinglish"] = "english"


class PublishRequest(BaseModel):
    title: str
    meta_description: str = ""
    channel: str
    thumbnail: str
    duration: int
    youtube_url: str
    language: Literal["english", "hindi", "hinglish"]
    transcript: str
    article: str


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

def _get_cookies_file():
    """Write YOUTUBE_COOKIES env var to a temp file and return the path."""
    cookies = os.environ.get("YOUTUBE_COOKIES", "")
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


# ── Audio download: Cobalt (self-hosted, optional) + yt-dlp fallback ──────────

# Cobalt API for audio download (fallback when YouTube captions unavailable)
COBALT_API_URL = os.environ.get("COBALT_API_URL", "https://cookie.br0k3.me/")

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


def _fetch_metadata(url: str, video_id: str) -> dict:
    """Get video metadata from YouTube oEmbed API (public, no auth)."""
    metadata = {"title": "", "channel": "", "duration": 0, "thumbnail": ""}
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(f"https://www.youtube.com/oembed?url={url}&format=json")
            resp.raise_for_status()
            data = resp.json()
        metadata["title"] = data.get("title", "")
        metadata["channel"] = data.get("author_name", "")
        metadata["thumbnail"] = (
            f"https://i.ytimg.com/vi/{video_id}/hq720.jpg" if video_id
            else data.get("thumbnail_url", "")
        )
        print(f"[metadata] oEmbed OK: {metadata['title'][:60]}")
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
    cookies_file = _get_cookies_file()
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

def generate_article(transcript: str, title: str, channel: str, language: str) -> dict:
    """Use Gemini to turn a transcript into a CoinDesk-style news article.

    Returns dict with keys: title, meta_description, body
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
3. Authority Fact-Citing: Identify 4-6 specific factual claims or data points in the transcript. **Bold** these key facts and mention the source name inline (e.g., "according to Glassnode data", "per CoinMarketCap"). Do NOT generate hyperlinks or URLs — only cite source names in plain text.
4. Structured Data: Convert any comparisons, lists of steps, or numerical data from the transcript into a Markdown Table or Bullet Points for AI readability.

PHASE 3: THE ARTICLE STRUCTURE (800-1200 Words)
* The "H1" Headline: A bold, citable headline containing the primary SEO keyword and the influencer's main stance.
* The First-Person Intro: Establish the influencer's authority immediately. No "In this video" or "He says."
* The Thesis (H2): Use a question-based subheading (e.g., "Why the Layer 2 Narrative is Shifting").
* The Evidence (H2/H3): Expand on the creator's logic. Integrate the bolded factual claims with source citations here to ground their opinion in verified data.
* The "So What?" (Conclusion): A definitive closing statement that summarizes the influencer's unique perspective and future outlook.

STRICT CONSTRAINTS
* Perspective: STRICTLY first-person. The influencer is the author.
* No Metadata Talk: Never mention "the transcript," "the video," or "the creator."
* Tone: Expert, polished, and assertive. Replace filler words with professional crypto terminology (e.g., "liquidity crunch" instead of "no money left").
* Formatting: Use Markdown (H2, H3, Bold, Lists, Tables).
* Title: The title field MUST be plain text only — NO markdown, NO asterisks (**), NO quotes. Just a clean headline string.
* No URLs: Do NOT include any hyperlinks or URLs in the article body. Cite sources by name only (e.g., "according to Glassnode").

You MUST return your response as valid JSON with exactly these three fields:
{{
  "title": "The H1 headline — bold, citable, contains primary SEO keyword and influencer's main stance (50-80 characters)",
  "meta_description": "A 1-2 sentence BLUF summary for SEO meta tags (150-160 characters)",
  "body": "The full article body in Markdown format (800-1200 words). Written in FIRST PERSON as the influencer. Do NOT include the title or meta description in the body."
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
        }
    except (json.JSONDecodeError, AttributeError) as e:
        # Fallback: use raw text as body, keep YouTube title
        print(f"[article] WARNING: JSON parse failed ({e}), using raw text as body")
        return {
            "title": title,
            "meta_description": "",
            "body": raw,
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

def generate_thumbnail(youtube_thumbnail_url: str) -> str:
    """Download the YouTube thumbnail, transform it via Gemini into a
    comic-book style crypto news thumbnail, and return the public URL
    of the generated image.  Falls back to the original YouTube URL on error.
    """
    try:
        # Download the original YouTube thumbnail
        print(f"[thumbnail] Downloading YouTube thumbnail: {youtube_thumbnail_url}")
        with httpx.Client(timeout=30) as client:
            img_resp = client.get(youtube_thumbnail_url)
            img_resp.raise_for_status()
            original_bytes = img_resp.content
        print(f"[thumbnail] Downloaded: {len(original_bytes)} bytes")

        prompt = (
            "Transform this image to a high-contrast, comic-book style illustration "
            "for a crypto news thumbnail. The style should be inspired by modern graphic "
            "novels with bold, dark ink outlines and clean cel-shading.\n"
            "Color Palette: Use a 'teal and orange' cinematic color grade with vibrant "
            "highlights and deep, inked shadows."
        )
        print(f"[thumbnail] Model: gemini-3.1-flash-image-preview")
        print(f"[thumbnail] Prompt: {prompt}")

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

        # Extract the generated image from response parts
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                # Save the generated image
                ext = part.inline_data.mime_type.split("/")[-1]
                filename = f"{uuid.uuid4().hex}.{ext}"
                filepath = THUMBNAILS_DIR / filename
                filepath.write_bytes(part.inline_data.data)
                url = f"{BACKEND_URL}/static/thumbnails/{filename}"
                print(f"[thumbnail] SUCCESS: saved {len(part.inline_data.data)} bytes -> {url}")
                return url

        # No image part found – fall back
        print("[thumbnail] Gemini returned no image parts, using YouTube thumbnail")
        return youtube_thumbnail_url

    except Exception as e:
        print(f"[thumbnail] Failed to generate AI thumbnail: {e}")
        return youtube_thumbnail_url


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/debug-formats")
async def debug_formats(url: str):
    """Debug: see what formats YouTube returns on this server."""
    if not YOUTUBE_URL_PATTERN.match(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    cookies_file = _get_cookies_file()
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

    # Download audio via Cobalt API
    filepath, metadata = download_audio(url)

    # Start thumbnail generation in parallel
    executor = ThreadPoolExecutor(max_workers=1)
    thumbnail_future = executor.submit(generate_thumbnail, metadata["thumbnail"])

    try:
        transcript = await transcribe_audio(filepath)
        article_data = generate_article(transcript, metadata["title"], metadata["channel"], req.language)
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)

    ai_thumbnail = thumbnail_future.result(timeout=60)
    executor.shutdown(wait=False)
    metadata["thumbnail"] = ai_thumbnail
    print(f"[convert] Thumbnail ready: {ai_thumbnail[:80]}...")

    return {
        "metadata": metadata,
        "transcript": transcript,
        "title": article_data["title"],
        "meta_description": article_data["meta_description"],
        "article": article_data["body"],
        "language": req.language,
    }


@app.post("/api/publish")
async def publish(req: PublishRequest):
    slug = generate_slug(req.title, req.article)

    existing = await get_article_by_slug(slug)
    if existing:
        slug = f"{slug}-{int(time.time())}"

    article_record = await insert_article(
        slug=slug,
        title=req.title,
        meta_description=req.meta_description,
        channel=req.channel,
        thumbnail=req.thumbnail,
        duration=req.duration,
        youtube_url=req.youtube_url,
        language=req.language,
        transcript=req.transcript,
        article=req.article,
    )
    return {"slug": slug, "article": article_record}


@app.get("/api/articles")
async def list_articles():
    articles = await get_all_articles()
    return {"articles": articles}


@app.get("/api/articles/{slug}")
async def get_article(slug: str):
    article = await get_article_by_slug(slug)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


# ── Static files (must be LAST) ──────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
