"""One-time migration: SQLite -> Neon PostgreSQL

Usage:
    1. Make sure DATABASE_URL is set in .env
    2. Run: python migrate_to_neon.py
"""
import asyncio
import sqlite3
import asyncpg
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "articles.db")
DATABASE_URL = os.environ["DATABASE_URL"]


async def migrate():
    # Read from SQLite
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT * FROM articles ORDER BY id")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    print(f"Read {len(rows)} articles from SQLite")

    # Connect to Neon PostgreSQL
    pg = await asyncpg.connect(DATABASE_URL, ssl="require")

    # Ensure table exists
    await pg.execute("""
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

    migrated = 0
    for row in rows:
        try:
            # Parse SQLite datetime string to Python datetime object
            created_at = datetime.strptime(row["created_at"], "%Y-%m-%d %H:%M:%S")
            await pg.execute(
                """INSERT INTO articles
                   (slug, title, meta_description, channel, thumbnail, duration,
                    youtube_url, language, transcript, article, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                   ON CONFLICT (slug) DO NOTHING""",
                row["slug"], row["title"], row.get("meta_description", ""),
                row["channel"], row["thumbnail"], row["duration"],
                row["youtube_url"], row["language"], row["transcript"],
                row["article"], created_at,
            )
            migrated += 1
            print(f"  Migrated: {row['slug']}")
        except Exception as e:
            print(f"  FAILED: {row['slug']} — {e}")

    # Verify
    count = await pg.fetchval("SELECT COUNT(*) FROM articles")
    await pg.close()
    print(f"\nMigration complete! {migrated} articles migrated. Total in Neon: {count}")


if __name__ == "__main__":
    asyncio.run(migrate())
