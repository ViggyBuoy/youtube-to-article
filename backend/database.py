import asyncpg
import os
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
               (slug, title, meta_description, channel, thumbnail, duration,
                youtube_url, language, transcript, article)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
            slug, title, meta_description, channel, thumbnail, duration,
            youtube_url, language, transcript, article,
        )
    return await get_article_by_slug(slug)


async def get_all_articles() -> list[dict]:
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, slug, title, meta_description, channel, thumbnail, "
            "duration, language, created_at "
            "FROM articles ORDER BY created_at DESC"
        )
        return [_row_to_dict(row) for row in rows]


async def get_article_by_slug(slug: str):
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM articles WHERE slug = $1", slug
        )
        return _row_to_dict(row) if row else None
