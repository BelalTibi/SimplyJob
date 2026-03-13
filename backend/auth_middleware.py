import os
from functools import wraps

import jwt
from flask import jsonify, request, g


SECRET_KEY = os.getenv("SECRET_KEY", "change_me")


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
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            user_id = data.get("user_id")
            if not user_id:
                raise jwt.InvalidTokenError("user_id missing in token payload")
            g.current_user_id = user_id
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid authentication token."}), 401

        return f(*args, **kwargs)

    return decorated

