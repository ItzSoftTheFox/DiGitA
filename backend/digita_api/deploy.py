"""Production launcher: validate external DB, migrate, then run one API worker."""

import os

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

from .config import Settings


def main():
    settings = Settings()
    url = make_url(settings.database_url)
    if (
        url.drivername != "postgresql+psycopg"
        or not url.host
        or url.host in {"localhost", "127.0.0.1", "::1"}
        or url.query.get("sslmode") not in {"verify-ca", "verify-full"}
    ):
        raise SystemExit(
            "Configure an external PostgreSQL URL with verified TLS before deployment."
        )
    # Unknown proxy addresses are never trusted implicitly. Configure verified CIDRs
    # at the hosting provider before relying on per-client-IP rate limiting.
    trusted = os.environ.get("FORWARDED_ALLOW_IPS", "")
    if trusted == "*":
        raise SystemExit("Configure explicit trusted proxy addresses, not '*'.")
    command.upgrade(Config("alembic.ini"), "head")
    os.execv(
        ".venv/bin/uvicorn",
        [
            "uvicorn",
            "digita_api.main:create_app",
            "--factory",
            "--host",
            "0.0.0.0",
            "--port",
            os.environ.get("PORT", "8000"),
            "--workers",
            "1",
            "--ws-max-size",
            "65536",
            *(
                ["--proxy-headers", "--forwarded-allow-ips", trusted]
                if trusted
                else ["--no-proxy-headers"]
            ),
        ],
    )


if __name__ == "__main__":
    main()
