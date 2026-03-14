import os
from datetime import datetime, timedelta
import re

import jwt
from flask import Blueprint, jsonify, request
from flask_bcrypt import Bcrypt
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from db import get_db_connection


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
bcrypt = Bcrypt()
limiter = Limiter(key_func=get_remote_address)

JWT_EXPIRY_HOURS = 24


def _get_secret_key() -> str:
    secret = os.getenv("SECRET_KEY")
    if not secret:
        raise RuntimeError("SECRET_KEY must be set in the environment.")
    return secret


def _validate_password(password: str):
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not re.search(r"[A-Z]", password):
        return "Password must contain an uppercase letter"
    if not re.search(r"\d", password):
        return "Password must contain a number"
    return None


@auth_bp.post("/register")
@limiter.limit("5 per minute")
def register():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = (payload.get("password") or "").strip()

    if not email or not password:
        return jsonify({"error": "Both 'email' and 'password' are required."}), 400

    password_error = _validate_password(password)
    if password_error:
        return jsonify({"error": password_error}), 400

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Check if email already exists
        cur.execute("SELECT id FROM users WHERE email = %s;", (email,))
        existing = cur.fetchone()
        if existing:
            return jsonify({"error": "Email is already registered."}), 400

        password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        cur.execute(
            """
            INSERT INTO users (email, password_hash)
            VALUES (%s, %s)
            RETURNING id;
            """,
            (email, password_hash),
        )
        row = cur.fetchone()
        conn.commit()

        user_id = row["id"]
        secret = _get_secret_key()
        expiry = datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
        token = jwt.encode(
            {"user_id": user_id, "exp": expiry},
            secret,
            algorithm="HS256",
        )

        return jsonify({"message": "Registered successfully", "token": token}), 201
    except Exception as e:  # pragma: no cover - simple error passthrough
        print(f"AUTH ERROR: {e}")
        if conn is not None:
            conn.rollback()
        return (
            jsonify({"error": "Failed to register user."}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


@auth_bp.post("/login")
@limiter.limit("10 per minute")
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = (payload.get("password") or "").strip()

    if not email or not password:
        return jsonify({"error": "Both 'email' and 'password' are required."}), 400

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, password_hash FROM users WHERE email = %s;",
            (email,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Invalid email or password."}), 401

        user_id = row["id"]
        password_hash = row["password_hash"]

        if not bcrypt.check_password_hash(password_hash, password):
            return jsonify({"error": "Invalid email or password."}), 401

        secret = _get_secret_key()
        expiry = datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
        token = jwt.encode(
            {"user_id": user_id, "exp": expiry},
            secret,
            algorithm="HS256",
        )

        return jsonify({"token": token})
    except Exception as e:  # pragma: no cover - simple error passthrough
        print(f"AUTH ERROR: {e}")
        return (
            jsonify({"error": "Failed to login."}),
            500,
        )
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()

