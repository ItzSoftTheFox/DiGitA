from types import SimpleNamespace

import pytest

from digita_api import deploy


@pytest.mark.parametrize(
    "url",
    [
        "sqlite:///local.db",
        "postgresql+psycopg://localhost/db?sslmode=verify-full",
        "postgresql+psycopg://db.example.com/db?sslmode=require",
    ],
)
def test_deploy_rejects_unsafe_database_before_migrations(monkeypatch, url):
    monkeypatch.setattr(deploy, "Settings", lambda: SimpleNamespace(database_url=url))
    monkeypatch.setattr(deploy.command, "upgrade", lambda *args: pytest.fail("must not migrate"))
    with pytest.raises(SystemExit):
        deploy.main()


def test_deploy_migrates_then_starts_single_worker_without_implicit_proxy_trust(monkeypatch):
    monkeypatch.setattr(
        deploy,
        "Settings",
        lambda: SimpleNamespace(
            database_url="postgresql+psycopg://db.example.com/db?sslmode=verify-full"
        ),
    )
    monkeypatch.delenv("FORWARDED_ALLOW_IPS", raising=False)
    monkeypatch.setenv("PORT", "10000")
    calls = []
    monkeypatch.setattr(deploy.command, "upgrade", lambda *args: calls.append("migrate"))
    monkeypatch.setattr(deploy.os, "execv", lambda path, args: calls.append(args))
    deploy.main()
    assert calls[0] == "migrate"
    args = calls[1]
    assert args[args.index("--workers") + 1] == "1"
    assert args[args.index("--port") + 1] == "10000"
    assert "--no-proxy-headers" in args
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "*")
    calls.clear()
    with pytest.raises(SystemExit):
        deploy.main()
    assert calls == []
