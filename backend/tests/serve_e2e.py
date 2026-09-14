"""Disposable API instance used only by Playwright."""

import os
from tempfile import TemporaryDirectory

import uvicorn
from alembic import command
from alembic.config import Config

from digita_api.config import Settings
from digita_api.main import create_app

if __name__ == "__main__":
    with TemporaryDirectory(prefix="digita-e2e-") as directory:
        os.environ["DIGITA_DATABASE_URL"] = f"sqlite:///{directory}/e2e.db"
        command.upgrade(Config("alembic.ini"), "head")
        app = create_app(
            Settings(allowed_origins=["http://127.0.0.1:1421"], auth_requests_per_minute=1000)
        )
        uvicorn.run(app, host="127.0.0.1", port=8001, ws_max_size=65536, proxy_headers=False)
