import asyncpg
import os
import re
from typing import Optional

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Module-level pool reference, initialized in init_db()
_pool: Optional[asyncpg.Pool] = None


def _row_to_dict(row: asyncpg.Record) -> dict:
    """Convert asyncpg Record to dict, serializing datetimes to strings."""
    d = dict(row)
    if "created_at" in d and d["created_at"] is not None:
        # Format to match old SQLite string format so frontend's "+ Z" logic works
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

        # Add channel_slug column if it doesn't exist (idempotent migration)
        await conn.execute("""
            ALTER TABLE articles
            ADD COLUMN IF NOT EXISTS channel_slug TEXT NOT NULL DEFAULT ''
        """)

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

        print(f"[db] Table verified")


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
    thumbnail: str,
    duration: int,
    youtube_url: str,
    language: str,
    transcript: str,
    article: str,
) -> dict:
    async with _pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO articles
               (slug, title, meta_description, channel, channel_slug, thumbnail,
                duration, youtube_url, language, transcript, article)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)""",
            slug, title, meta_description, channel, channel_slug, thumbnail,
            duration, youtube_url, language, transcript, article,
        )
    return await get_article_by_slug(slug)


async def get_all_articles() -> list[dict]:
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, slug, title, meta_description, channel, channel_slug, "
            "thumbnail, duration, language, created_at "
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
    """Get all unique channels with article counts."""
    async with _pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT channel, channel_slug, COUNT(*) as article_count
            FROM articles
            WHERE channel_slug != ''
            GROUP BY channel, channel_slug
            ORDER BY article_count DESC
        """)
        return [dict(row) for row in rows]


async def get_articles_by_channel_slug(channel_slug: str) -> dict | None:
    """Get channel info and all articles for a channel slug."""
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, slug, title, meta_description, channel, channel_slug,
                      thumbnail, duration, language, created_at
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
            "article_count": len(articles),
            "articles": articles,
        }
