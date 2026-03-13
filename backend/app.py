import os

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

from routes.auth import auth_bp, bcrypt
from routes.jobs import jobs_bp
from routes.ai import ai_bp


limiter = Limiter(key_func=get_remote_address)

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN", ""),
    integrations=[FlaskIntegration()],
    traces_sample_rate=0.1,
)


def create_app() -> Flask:
    """
    Application factory for the SimplyJob backend.

    Loads configuration from environment variables and
    registers blueprints and extensions.
    """
    load_dotenv()

    app = Flask(__name__)

    # Secret key for sessions / JWT signing
    app.config["SECRET_KEY"] = os.getenv(
        "SECRET_KEY", "simplyjob_secret_key_change_in_production"
    )

    # Basic configuration from environment variables
    app.config["ENV"] = os.getenv("FLASK_ENV", "development")
    app.config["DEBUG"] = os.getenv("FLASK_DEBUG", "0") == "1"

    # Enable CORS for local dev + configured frontend origin
    allowed_origins = [
        "http://localhost:3000",
        os.getenv("FRONTEND_ORIGIN", ""),
    ]
    allowed_origins = [o for o in allowed_origins if o]

    CORS(
        app,
        origins=allowed_origins,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        supports_credentials=True,
    )

    # Register extensions
    bcrypt.init_app(app)
    limiter.init_app(app)

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(ai_bp)

    # Simple health check
    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "service": "simplyjob-backend"})

    return app


app = create_app()


if __name__ == "__main__":
    # For local development only; in production use a WSGI server.
    port = int(os.getenv("BACKEND_PORT", "5000"))
    app.run(host="0.0.0.0", port=port)

