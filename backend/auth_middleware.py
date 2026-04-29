import os
from functools import wraps

import jwt
from flask import jsonify, request, g

from db import get_db_connection


SECRET_KEY = os.getenv("SECRET_KEY", "change_me")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_JWKS_URL = os.getenv("SUPABASE_JWKS_URL", "").strip()


_supabase_jwk_client = None


def _get_supabase_jwks_url() -> str:
    if SUPABASE_JWKS_URL:
        return SUPABASE_JWKS_URL
    if SUPABASE_URL:
        return f"{SUPABASE_URL}/auth/v1/keys"
    return ""


def _decode_supabase_jwt(token: str):
    """
    Validate and decode a Supabase-issued JWT using the project's JWKS.

    Returns decoded claims dict on success, or raises jwt.InvalidTokenError.
    """
    jwks_url = _get_supabase_jwks_url()
    if not jwks_url:
        raise jwt.InvalidTokenError("Supabase JWKS URL not configured")

    global _supabase_jwk_client  # pylint: disable=global-statement
    if _supabase_jwk_client is None:
        _supabase_jwk_client = jwt.PyJWKClient(jwks_url)

    signing_key = _supabase_jwk_client.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        options={"verify_aud": False},
    )


def _get_or_create_user_id_for_email(email: str):
    if not email:
        return None

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE email = %s;", (email,))
        row = cur.fetchone()
        if row and row.get("id"):
            return row["id"]

        # users.password_hash is NOT NULL in this app's schema; keep a placeholder
        # so OAuth users can still use all existing app features.
        try:
            from routes.auth import bcrypt  # local import avoids circulars

            placeholder = os.getenv("SUPABASE_OAUTH_PLACEHOLDER_PASSWORD", "supabase_oauth")
            password_hash = bcrypt.generate_password_hash(placeholder).decode("utf-8")
        except Exception:
            password_hash = "supabase_oauth"

        cur.execute(
            """
            INSERT INTO users (email, password_hash)
            VALUES (%s, %s)
            RETURNING id;
            """,
            (email, password_hash),
        )
        created = cur.fetchone()
        conn.commit()
        return created["id"] if created else None
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


def token_required(f):
    """
    Decorator that ensures a valid JWT is provided via Authorization header.

    On success, attaches `g.current_user_id` for downstream handlers.
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        parts = auth_header.split()

        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({"error": "Authorization header missing or malformed."}), 401

        token = parts[1]

        try:
            # Legacy (pre-Supabase) tokens are HS256 with a local user_id.
            # Kept temporarily for stability during rollout.
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            user_id = data.get("user_id")
            if not user_id:
                raise jwt.InvalidTokenError("user_id missing in token payload")
            g.current_user_id = user_id
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired."}), 401
        except jwt.InvalidTokenError:
            try:
                claims = _decode_supabase_jwt(token)
                email = (claims.get("email") or "").strip().lower()
                internal_user_id = _get_or_create_user_id_for_email(email)
                if not internal_user_id:
                    raise jwt.InvalidTokenError("Unable to map Supabase user to internal user")
                g.current_user_id = internal_user_id
            except jwt.ExpiredSignatureError:
                return jsonify({"error": "Token has expired."}), 401
            except jwt.InvalidTokenError:
                return jsonify({"error": "Invalid authentication token."}), 401

        return f(*args, **kwargs)

    return decorated

