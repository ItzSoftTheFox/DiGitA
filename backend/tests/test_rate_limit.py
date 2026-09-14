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
