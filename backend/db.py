import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv


load_dotenv()


def get_db_connection():
    """
    Create and return a new database connection.

    Uses DATABASE_URL when available (Render), otherwise falls back
    to individual DATABASE_* environment variables.
    """
    database_url = os.getenv("DATABASE_URL")

    try:
        if database_url:
            if database_url.startswith("postgres://"):
                database_url = database_url.replace("postgres://", "postgresql://", 1)
            conn = psycopg2.connect(
                database_url,
                cursor_factory=psycopg2.extras.RealDictCursor,
                sslmode='require'
            )
        else:
            conn = psycopg2.connect(
                host=os.getenv("DATABASE_HOST"),
                port=os.getenv("DATABASE_PORT", 5432),
                dbname=os.getenv("DATABASE_NAME"),
                user=os.getenv("DATABASE_USER"),
                password=os.getenv("DATABASE_PASSWORD"),
                cursor_factory=psycopg2.extras.RealDictCursor,
            )
        return conn
    except psycopg2.Error as exc:
        raise RuntimeError("Failed to connect to the PostgreSQL database.") from exc