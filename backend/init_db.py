import os

import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv


load_dotenv()


def get_base_connection():
    """
    Connect to the default PostgreSQL database (usually 'postgres')
    in order to create the application database if it does not exist.
    """
    conn = psycopg2.connect(
        host=os.getenv("DATABASE_HOST", "localhost"),
        port=os.getenv("DATABASE_PORT", "5432"),
        dbname=os.getenv("POSTGRES_DB", "postgres"),
        user=os.getenv("DATABASE_USER"),
        password=os.getenv("DATABASE_PASSWORD"),
    )
    conn.autocommit = True
    return conn


def create_database_if_not_exists():
    target_db = os.getenv("DATABASE_NAME")
    if not target_db:
        raise RuntimeError("DATABASE_NAME must be set in the environment.")

    conn = None
    cur = None
    try:
        conn = get_base_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s;",
            (target_db,),
        )
        exists = cur.fetchone()
        if not exists:
            cur.execute(
                sql.SQL("CREATE DATABASE {} ENCODING 'UTF8';").format(
                    sql.Identifier(target_db)
                )
            )
            print(f"Database '{target_db}' created.")
        else:
            print(f"Database '{target_db}' already exists.")
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


def create_users_table():
    """
    Create the 'users' table inside the application database
    if it does not already exist.
    """
    from db import get_db_connection  # local import to reuse existing helper

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                cv_feedback TEXT,
                cv_feedback_date TIMESTAMP
            );
            """
        )
        # Ensure new columns exist for older installations
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS cv_feedback TEXT;
            """
        )
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS cv_feedback_date TIMESTAMP;
            """
        )
        conn.commit()
        print("Table 'users' ensured (created/updated as needed).")
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


def create_jobs_table():
    """
    Create the 'jobs' table inside the application database
    if it does not already exist, and ensure it has a user_id column.
    """
    from db import get_db_connection  # local import to reuse existing helper

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                company VARCHAR(255) NOT NULL,
                priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
                status VARCHAR(50) NOT NULL DEFAULT 'Applied'
                    CHECK (status IN ('Applied', 'Interview', 'Offer', 'Rejected')),
                applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
                notes TEXT,
                url VARCHAR(2048),
                user_id INTEGER,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        print("Checked/created 'jobs' table.")

        # Ensure user_id column exists with a foreign key to users.id
        cur.execute(
            """
            ALTER TABLE jobs
            ADD COLUMN IF NOT EXISTS user_id INTEGER
            REFERENCES users(id)
            ON DELETE CASCADE;
            """
        )
        print("Ensured 'jobs.user_id' column exists and references 'users(id)'.")

        # Ensure priority column exists
        cur.execute(
            """
            ALTER TABLE jobs
            ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'Medium';
            """
        )
        print("Ensured 'jobs.priority' column exists with default 'Medium'.")

        # In case the column existed without a foreign key, ensure the constraint too.
        cur.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'jobs_user_id_fkey'
                ) THEN
                    ALTER TABLE jobs
                    ADD CONSTRAINT jobs_user_id_fkey
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE;
                END IF;
            END$$;
            """
        )
        conn.commit()
        print("Table 'jobs' ensured (created/updated as needed).")
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


def create_user_ai_calls_table():
    """
    Create the 'user_ai_calls' table used for tracking
    per-user daily AI feedback usage.
    """
    from db import get_db_connection  # local import to reuse existing helper

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS user_ai_calls (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                call_date DATE NOT NULL DEFAULT CURRENT_DATE,
                call_count INTEGER NOT NULL DEFAULT 0,
                cv_call_date DATE,
                CONSTRAINT user_ai_calls_user_date_unique UNIQUE (user_id, call_date)
            );
            """
        )
        # Ensure cv_call_date column exists for older installations
        cur.execute(
            """
            ALTER TABLE user_ai_calls
            ADD COLUMN IF NOT EXISTS cv_call_date DATE;
            """
        )
        conn.commit()
        print("Table 'user_ai_calls' ensured (created/updated as needed).")
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


def main():
    if os.getenv("DATABASE_URL"):
        print("Using existing database from DATABASE_URL")
    else:
        create_database_if_not_exists()
    create_users_table()
    create_jobs_table()
    create_user_ai_calls_table()
    print("Database initialization complete.")


if __name__ == "__main__":
    main()

