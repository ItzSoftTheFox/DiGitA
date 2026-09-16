"""Adversarial HTTP and ASGI regressions for the web deployment boundary."""

import asyncio
import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from digita_api.config import Settings
from digita_api.main import create_app
from digita_api.models import User
from digita_api.request_limits import RequestBodyLimit


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/auth/me", None),
        ("POST", "/auth/logout", None),
        ("GET", "/teams", None),
        ("POST", "/teams", {"name": "x"}),
        ("GET", "/teams/unknown/members", None),
        ("PATCH", "/teams/unknown/members/unknown", {"role": "admin"}),
        ("DELETE", "/teams/unknown/members/unknown", None),
        ("GET", "/teams/unknown/rooms", None),
        ("POST", "/teams/unknown/rooms", {"name": "x"}),
        ("GET", "/rooms/unknown", None),
        ("POST", "/teams/unknown/invitations", None),
        ("DELETE", "/teams/unknown/invitations/unknown", None),
        ("POST", "/invitations/accept", {"code": "a" * 43}),
    ],
)
def test_every_private_http_route_requires_auth(client, method, path, body):
    response = client.request(method, path, json=body)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


def test_registration_can_be_closed_without_creating_accounts(database_url):
    with TestClient(
        create_app(Settings(database_url=database_url, registration_enabled=False))
    ) as c:
        response = c.post(
            "/auth/register",
            json={
                "email": "test@example.com",
                "display_name": "Test",
                "password": "long password!",
            },
        )
        assert response.status_code == 403
        with c.app.state.sessions() as session:
            assert session.scalar(select(func.count()).select_from(User)) == 0


def test_api_limit_includes_non_auth_requests_and_ignores_spoofed_proxy_header(database_url):
    with TestClient(
        create_app(Settings(database_url=database_url, api_requests_per_minute=2))
    ) as c:
        assert c.get("/teams").status_code == 401
        assert c.get("/teams", headers={"X-Forwarded-For": "1.2.3.4"}).status_code == 401
        response = c.get("/health", headers={"X-Forwarded-For": "5.6.7.8"})
        assert response.status_code == 429
        assert response.headers["retry-after"] == "60"


def test_oversized_http_body_rejected_before_validation(client):
    response = client.post("/auth/register", content=b"x" * 16385)
    assert response.status_code == 413
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize("headers", [[], [(b"content-length", b"1")]])
def test_chunked_body_cannot_bypass_limit_with_missing_or_false_length(headers):
    async def exercise():
        called = False
        sent = []
        chunks = iter(
            [
                {"type": "http.request", "body": b"a" * 8, "more_body": True},
                {"type": "http.request", "body": b"b" * 8, "more_body": False},
            ]
        )

        async def app(scope, receive, send):
            nonlocal called
            called = True

        async def receive():
            return next(chunks)

        async def send(message):
            sent.append(message)

        await RequestBodyLimit(app, max_bytes=10)(
            {"type": "http", "headers": headers}, receive, send
        )
        assert not called
        assert sent[0]["status"] == 413

    asyncio.run(exercise())


def test_slow_body_times_out_before_application():
    async def exercise():
        sent = []

        async def app(scope, receive, send):
            pytest.fail("Timed out body reached application")

        async def receive():
            await asyncio.Event().wait()

        async def send(message):
            sent.append(message)

        await RequestBodyLimit(app, max_bytes=10, timeout=0.01)(
            {"type": "http", "headers": []}, receive, send
        )
        assert sent[0]["status"] == 408

    asyncio.run(exercise())


def test_cors_only_permits_exact_trusted_origin(client):
    for origin, allowed in [
        ("http://localhost:1420", True),
        ("http://localhost:1420.evil.example", False),
        ("https://evil.example", False),
        ("null", False),
    ]:
        response = client.options(
            "/teams",
            headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
        )
        assert response.status_code == (200 if allowed else 400)
        assert response.headers.get("access-control-allow-origin") == (origin if allowed else None)


def test_auth_audit_never_includes_submitted_secrets(client, account, caplog):
    caplog.set_level(logging.INFO, logger="digita.security")
    _, headers = account()
    client.post("/auth/login", json={"email": "owner@example.com", "password": "wrong password!"})
    client.post("/auth/logout", headers=headers)
    events = [r.getMessage() for r in caplog.records if r.name == "digita.security"]
    assert events == [
        "auth.registered",
        "auth.login_succeeded",
        "auth.login_failed",
        "auth.logged_out",
    ]
    assert "owner@example.com" not in caplog.text
    assert "a long test password" not in caplog.text
    assert "wrong password!" not in caplog.text
    assert headers["Authorization"][7:] not in caplog.text


def test_sql_metacharacters_are_data_and_role_injection_is_rejected(client, account):
    _, headers = account()
    name = "Robert'); DROP TABLE users;--"
    response = client.post("/teams", headers=headers, json={"name": name})
    assert response.status_code == 201
    assert response.json()["name"] == name
    assert client.get("/auth/me", headers=headers).status_code == 200
    assert (
        client.post("/teams", headers=headers, json={"name": "x", "role": "owner"}).status_code
        == 422
    )
