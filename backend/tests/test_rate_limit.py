from fastapi.testclient import TestClient

from digita_api.config import Settings
from digita_api.main import create_app
from digita_api.rate_limit import AuthRateLimit


def test_auth_rate_limit_applies_before_password_work(database_url):
    app = create_app(Settings(database_url=database_url, auth_requests_per_minute=2))
    with TestClient(app) as client:
        assert client.post("/auth/login", json={}).status_code == 422
        assert client.post("/auth/register", json={}).status_code == 422
        response = client.post("/auth/login", json={})
        assert response.status_code == 429
        assert response.headers["Retry-After"] == "60"
        assert response.headers["Cache-Control"] == "no-store"
        assert client.get("/health").status_code == 200


def test_rate_limit_expires_and_separates_clients(monkeypatch):
    monkeypatch.setattr("digita_api.rate_limit.monotonic", lambda: 100)
    limiter = AuthRateLimit(1)
    assert limiter.allow("first")
    assert not limiter.allow("first")
    assert limiter.allow("second")
    monkeypatch.setattr("digita_api.rate_limit.monotonic", lambda: 161)
    assert limiter.allow("first")


def test_rate_limit_is_readable_only_from_trusted_origins(database_url):
    app = create_app(
        Settings(
            database_url=database_url,
            auth_requests_per_minute=1,
            allowed_origins=["http://tauri.localhost"],
        )
    )
    with TestClient(app) as client:
        client.post("/auth/login", json={})
        for origin in ["http://tauri.localhost", "https://untrusted.example"]:
            response = client.post("/auth/login", json={}, headers={"Origin": origin})
            assert response.status_code == 429
            assert response.headers["Retry-After"] == "60"
            if origin == "http://tauri.localhost":
                assert response.headers["access-control-allow-origin"] == origin
                assert "Retry-After" in response.headers["access-control-expose-headers"]
            else:
                assert "access-control-allow-origin" not in response.headers
