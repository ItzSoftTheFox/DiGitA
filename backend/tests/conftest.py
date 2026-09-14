import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from digita_api.config import Settings
from digita_api.main import create_app
from digita_api.models import Base

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def database_url(tmp_path, monkeypatch):
    # PostgreSQL integration tests must use a dedicated, disposable database.
    url = os.environ.get("DIGITA_TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    if "DIGITA_TEST_DATABASE_URL" in os.environ:
        if not (make_url(url).database or "").endswith("_test"):
            raise ValueError(
                "DIGITA_TEST_DATABASE_URL must name a disposable database ending in _test"
            )
    monkeypatch.setenv("DIGITA_DATABASE_URL", url)
    config = Config(str(ROOT / "alembic.ini"))
    command.upgrade(config, "head")
    engine = create_engine(url)
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())
    engine.dispose()
    yield url


@pytest.fixture
def client(database_url):
    with TestClient(create_app(Settings(database_url=database_url))) as client:
        yield client


@pytest.fixture
def account(client):
    def make(name="owner"):
        body = {
            "email": f"{name}@example.com",
            "password": "a long test password",
            "display_name": name,
        }
        response = client.post("/auth/register", json=body)
        assert response.status_code == 201, response.text
        user = response.json()
        response = client.post(
            "/auth/login", json={"email": body["email"], "password": body["password"]}
        )
        assert response.status_code == 200, response.text
        return user, {"Authorization": "Bearer " + response.json()["access_token"]}

    return make
