import asyncpg
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Module-level pool reference, initialized in init_db()
_pool: Optional[asyncpg.Pool] = None


def _row_to_dict(row: asyncpg.Record) -> dict:
    """Convert asyncpg Record to dict, serializing datetimes to strings."""
    d = dict(row)
    if "created_at" in d and d["created_at"] is not None:
        d["created_at"] = d["created_at"].strftime("%Y-%m-%d %H:%M:%S")
    return d


def generate_channel_slug(channel_name: str) -> str:
    """Convert 'Dishant Chaudhary' to 'dishant-chaudhary'."""
    slug = channel_name.strip().lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s-]+', '-', slug).strip('-')
    return slug or 'unknown-channel'


async def init_db():
    """Create the connection pool and ensure the articles table exists."""
    global _pool

    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set!")

    print(f"[db] Connecting to database... (URL starts with: {DATABASE_URL[:30]}...)")
    try:
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            ssl="require",
            command_timeout=60,
            timeout=30,
            statement_cache_size=0,  # Disable statement caching to avoid schema migration issues
        )
        print(f"[db] Connection pool created successfully")
    except Exception as e:
        print(f"[db] ERROR connecting to database: {e}")
        raise

    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS articles (
                id               SERIAL PRIMARY KEY,
                slug             TEXT UNIQUE NOT NULL,
                title            TEXT NOT NULL,
                meta_description TEXT NOT NULL DEFAULT '',
                channel          TEXT NOT NULL,
                thumbnail        TEXT NOT NULL,
                duration         INTEGER NOT NULL,
                youtube_url      TEXT NOT NULL,
                language         TEXT NOT NULL CHECK(language IN ('english', 'hindi', 'hinglish')),
                transcript       TEXT NOT NULL,
                article          TEXT NOT NULL,
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)

        # Idempotent migrations
        await conn.execute(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS channel_slug TEXT NOT NULL DEFAULT ''"
        )
        await conn.execute(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS channel_avatar TEXT NOT NULL DEFAULT ''"
        )

        # Backfill channel_slug for existing rows
        rows = await conn.fetch(
            "SELECT id, channel FROM articles WHERE channel_slug = '' AND channel != ''"
        )
        if rows:
            print(f"[db] Backfilling channel_slug for {len(rows)} articles...")
            for row in rows:
                slug = generate_channel_slug(row["channel"])
                await conn.execute(
                    "UPDATE articles SET channel_slug = $1 WHERE id = $2",
                    slug, row["id"],
                )
            print(f"[db] Backfill complete")

        print(f"[db] Articles table verified")

        # ── Sources + seen_urls tables ──
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sources (
                id         SERIAL PRIMARY KEY,
                name       TEXT NOT NULL,
                rss_url    TEXT UNIQUE NOT NULL,
                enabled    BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS seen_urls (
                id         SERIAL PRIMARY KEY,
                url        TEXT UNIQUE NOT NULL,
                source_id  INTEGER REFERENCES sources(id) ON DELETE CASCADE,
                title      TEXT NOT NULL DEFAULT '',
                status     TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        print(f"[db] Sources + seen_urls tables verified")

        # ── Tags column migration ──
        await conn.execute(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT ''"
        )
        print(f"[db] Tags column verified")

        # ── Sentiment columns migration ──
        await conn.execute(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS sentiment TEXT NOT NULL DEFAULT 'neutral'"
        )
        await conn.execute(
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS sentiment_score INTEGER NOT NULL DEFAULT 50"
        )
        print(f"[db] Sentiment columns verified")

        # ── Settings table (key-value store) ──
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        print(f"[db] Settings table verified")


async def close_db():
    """Close the connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def insert_article(
    slug: str,
    title: str,
    meta_description: str,
    channel: str,
    channel_slug: str,
    channel_avatar: str,
    thumbnail: str,
    duration: int,
    youtube_url: str,
    language: str,
    transcript: str,
    article: str,
    tags: str = "",
    sentiment: str = "neutral",
    sentiment_score: int = 50,
) -> dict:
    async with _pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO articles
               (slug, title, meta_description, channel, channel_slug, channel_avatar,
                thumbnail, duration, youtube_url, language, transcript, article, tags,
                sentiment, sentiment_score)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)""",
            slug, title, meta_description, channel, channel_slug, channel_avatar,
            thumbnail, duration, youtube_url, language, transcript, article, tags,
            sentiment, sentiment_score,
        )
    return await get_article_by_slug(slug)


async def get_all_articles() -> list[dict]:
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, slug, title, meta_description, channel, channel_slug, "
            "channel_avatar, thumbnail, duration, language, tags, "
            "sentiment, sentiment_score, created_at "
            "FROM articles ORDER BY created_at DESC"
        )
        return [_row_to_dict(row) for row in rows]


async def get_article_by_slug(slug: str):
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM articles WHERE slug = $1", slug
        )
        return _row_to_dict(row) if row else None


async def get_all_channels() -> list[dict]:
    """Get all unique channels with article counts and avatar."""
    async with _pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT channel, channel_slug,
                   MAX(channel_avatar) as channel_avatar,
                   COUNT(*) as article_count,
                   MIN(created_at) as first_article
            FROM articles
            WHERE channel_slug != ''
            GROUP BY channel, channel_slug
            ORDER BY article_count DESC
        """)
        return [_row_to_dict(row) for row in rows]


async def get_articles_by_channel_slug(channel_slug: str) -> dict | None:
    """Get channel info and all articles for a channel slug."""
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, slug, title, meta_description, channel, channel_slug,
                      channel_avatar, thumbnail, duration, language, created_at
               FROM articles WHERE channel_slug = $1
               ORDER BY created_at DESC""",
            channel_slug,
        )
        if not rows:
            return None
        articles = [_row_to_dict(row) for row in rows]
        return {
            "channel": articles[0]["channel"],
            "channel_slug": channel_slug,
            "channel_avatar": articles[0].get("channel_avatar", ""),
            "article_count": len(articles),
            "articles": articles,
        }


# ── Admin CRUD ────────────────────────────────────────────────────────────────

async def update_article(slug: str, title: str, meta_description: str, article: str) -> dict | None:
    """Update an article's editable fields."""
    async with _pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE articles
               SET title = $1, meta_description = $2, article = $3
               WHERE slug = $4""",
            title, meta_description, article, slug,
        )
        if result == "UPDATE 0":
            return None
    return await get_article_by_slug(slug)


async def delete_article(slug: str) -> bool:
    """Delete an article by slug."""
    async with _pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM articles WHERE slug = $1", slug
        )
        return result != "DELETE 0"


# ── Sources CRUD ─────────────────────────────────────────────────────────────

async def insert_source(name: str, rss_url: str) -> dict:
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO sources (name, rss_url)
               VALUES ($1, $2)
               RETURNING *""",
            name, rss_url,
        )
        return _row_to_dict(row)


async def get_all_sources() -> list[dict]:
    async with _pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT s.*,
                   COUNT(su.id) FILTER (WHERE su.status = 'published') AS published_count,
                   COUNT(su.id) FILTER (WHERE su.status = 'skipped_dup') AS skipped_count,
                   COUNT(su.id) AS total_seen
            FROM sources s
            LEFT JOIN seen_urls su ON su.source_id = s.id
            GROUP BY s.id
            ORDER BY s.created_at DESC
        """)
        return [_row_to_dict(row) for row in rows]


async def toggle_source(source_id: int, enabled: bool) -> dict | None:
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE sources SET enabled = $1 WHERE id = $2 RETURNING *",
            enabled, source_id,
        )
        return _row_to_dict(row) if row else None


async def delete_source(source_id: int) -> bool:
    async with _pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM sources WHERE id = $1", source_id
        )
        return result != "DELETE 0"


# ── Seen URLs ────────────────────────────────────────────────────────────────

async def is_url_seen(url: str) -> bool:
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM seen_urls WHERE url = $1", url
        )
        return row is not None


async def insert_seen_url(url: str, source_id: int, title: str, status: str) -> dict:
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO seen_urls (url, source_id, title, status)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (url) DO UPDATE SET status = $4
               RETURNING *""",
            url, source_id, title, status,
        )
        return _row_to_dict(row)


async def get_recent_article_titles(hours: int = 24) -> list[str]:
    """Get article titles published in the last N hours for dedup."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT title FROM articles WHERE created_at >= $1",
            cutoff,
        )
        return [row["title"] for row in rows]


# ── Tags ────────────────────────────────────────────────────────────────────

async def get_all_tags() -> list[dict]:
    """Get all tags with article counts, sorted by count desc."""
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT tags FROM articles WHERE tags != ''"
        )
    # Aggregate tag counts in Python
    counts: dict[str, int] = {}
    for row in rows:
        for tag in row["tags"].split(","):
            tag = tag.strip().lower()
            if tag:
                counts[tag] = counts.get(tag, 0) + 1
    return sorted(
        [{"name": name, "count": count} for name, count in counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )


async def get_articles_by_tag(tag: str, limit: int = 20) -> list[dict]:
    """Get articles that contain a specific tag."""
    tag = tag.strip().lower()
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, slug, title, meta_description, channel, channel_slug, "
            "channel_avatar, thumbnail, duration, language, tags, created_at "
            "FROM articles WHERE tags ILIKE $1 "
            "ORDER BY created_at DESC LIMIT $2",
            f"%{tag}%", limit,
        )
    # Filter for exact tag match (not substring)
    results = []
    for row in rows:
        article_tags = [t.strip().lower() for t in row["tags"].split(",")]
        if tag in article_tags:
            results.append(_row_to_dict(row))
    return results


# ── Settings ───────────────────────────────────────────────────────────────

async def get_setting(key: str) -> Optional[str]:
    """Get a setting value by key. Returns None if not found."""
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT value FROM settings WHERE key = $1", key
        )
        return row["value"] if row else None


async def get_setting_with_timestamp(key: str) -> Optional[dict]:
    """Get a setting value + updated_at timestamp."""
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT value, updated_at FROM settings WHERE key = $1", key
        )
        if not row:
            return None
        return {
            "value": row["value"],
            "updated_at": row["updated_at"].strftime("%Y-%m-%d %H:%M:%S"),
        }


async def upsert_setting(key: str, value: str) -> None:
    """Insert or update a setting."""
    async with _pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO settings (key, value, updated_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (key) DO UPDATE
               SET value = $2, updated_at = NOW()""",
            key, value,
        )
