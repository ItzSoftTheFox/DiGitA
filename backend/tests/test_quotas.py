from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from digita_api.config import Settings
from digita_api.main import create_app
from digita_api.maintenance import cleanup_expired
from digita_api.models import AuthSession, Invitation, Membership, Room, Team, User, now

from .test_api import invite, team


@pytest.fixture
def client(database_url):
    with TestClient(
        create_app(
            Settings(
                database_url=database_url,
                max_owned_teams=2,
                max_joined_teams=3,
                max_team_members=2,
                max_team_rooms=2,
                max_team_invitations=2,
                max_user_sessions=2,
            )
        )
    ) as c:
        yield c


def test_owned_team_limit_preserves_existing_data(client, account):
    _, owner = account()
    team(client, owner, "One")
    team(client, owner, "Two")
    assert client.post("/teams", headers=owner, json={"name": "Three"}).status_code == 409
    assert len(client.get("/teams", headers=owner).json()) == 2


def test_room_limit_is_atomic_and_authorization_runs_first(client, account):
    _, owner = account()
    _, outsider = account("outsider")
    path = f"/teams/{team(client, owner)}/rooms"
    assert client.post(path, headers=owner, json={"name": "First"}).status_code == 201
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(
            pool.map(
                lambda name: client.post(path, headers=owner, json={"name": name}).status_code,
                ["Second", "Third"],
            )
        )
    assert sorted(codes) == [201, 409]
    assert client.post(path, headers=outsider, json={"name": "Hidden"}).status_code == 404
    assert len(client.get(path, headers=owner).json()) == 2


def test_invite_limit_expiry_and_revocation_release_capacity(client, account):
    _, owner = account()
    tid = team(client, owner)
    first, second = invite(client, tid, owner), invite(client, tid, owner)
    path = f"/teams/{tid}/invitations"
    assert client.post(path, headers=owner).status_code == 409
    with client.app.state.sessions() as session:
        session.get(Invitation, first["id"]).expires_at = now() - timedelta(seconds=1)
        session.commit()
    invite(client, tid, owner)
    assert client.delete(f"{path}/{second['id']}", headers=owner).status_code == 204
    invite(client, tid, owner)
    with client.app.state.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Invitation)) == 2


def test_member_limit_preserves_invite_until_capacity_freed(client, account):
    _, owner = account()
    user, first = account("first")
    _, second = account("second")
    tid = team(client, owner)
    code1, code2 = invite(client, tid, owner)["code"], invite(client, tid, owner)["code"]
    assert (
        client.post("/invitations/accept", headers=first, json={"code": code1}).status_code == 200
    )
    assert (
        client.post("/invitations/accept", headers=second, json={"code": code2}).status_code == 409
    )
    assert client.delete(f"/teams/{tid}/members/{user['id']}", headers=first).status_code == 204
    assert (
        client.post("/invitations/accept", headers=second, json={"code": code2}).status_code == 200
    )


def test_joined_limit_includes_owned_teams_and_rolls_back_invite(client, account):
    _, owner = account()
    _, member = account("member")
    team(client, member, "Mine one")
    team(client, member, "Mine two")
    first, second = team(client, owner, "Shared one"), team(client, owner, "Shared two")
    code = invite(client, first, owner)["code"]
    assert (
        client.post("/invitations/accept", headers=member, json={"code": code}).status_code == 200
    )
    code = invite(client, second, owner)["code"]
    assert (
        client.post("/invitations/accept", headers=member, json={"code": code}).status_code == 409
    )
    with client.app.state.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Invitation)) == 1


def test_session_limit_replaces_earliest_expiry_and_allows_new_login(client, account):
    _, first = account()
    tokens = [first]
    for _ in range(2):
        response = client.post(
            "/auth/login",
            json={
                "email": "owner@example.com",
                "password": "a long test password",  # pragma: allowlist secret
            },
        )
        assert response.status_code == 200
        tokens.append({"Authorization": "Bearer " + response.json()["access_token"]})
    assert client.get("/auth/me", headers=tokens[0]).status_code == 401
    for headers in tokens[1:]:
        assert client.get("/auth/me", headers=headers).status_code == 200
    with client.app.state.sessions() as session:
        assert session.scalar(select(func.count()).select_from(AuthSession)) == 2


def test_registration_cap_is_atomic_across_app_instances(database_url):
    settings = Settings(database_url=database_url, max_users=1)
    with TestClient(create_app(settings)) as first, TestClient(create_app(settings)) as second:

        def register(pair):
            client, name = pair
            return client.post(
                "/auth/register",
                json={
                    "email": f"{name}@example.com",
                    "display_name": name,
                    "password": "a long test password",  # pragma: allowlist secret
                },
            ).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(register, [(first, "first"), (second, "second")])) == [201, 409]
        with first.app.state.sessions() as session:
            assert session.scalar(select(func.count()).select_from(User)) == 1


def test_cleanup_dry_run_apply_repeat_preserve_live_data(client, account):
    user, headers = account()
    tid = team(client, headers)
    client.post(f"/teams/{tid}/rooms", headers=headers, json={"name": "Keep"})
    valid, expired = invite(client, tid, headers), invite(client, tid, headers)
    with client.app.state.sessions() as session:
        session.add(
            AuthSession(
                token_hash="expired", user_id=user["id"], expires_at=now() - timedelta(seconds=1)
            )
        )
        session.get(Invitation, expired["id"]).expires_at = now() - timedelta(seconds=1)
        session.commit()
    sessions = client.app.state.sessions
    assert cleanup_expired(sessions, apply=False) == {"sessions": 1, "invitations": 1}
    assert cleanup_expired(sessions) == {"sessions": 1, "invitations": 1}
    assert cleanup_expired(sessions) == {"sessions": 0, "invitations": 0}
    assert client.get("/auth/me", headers=headers).status_code == 200
    with sessions() as session:
        assert session.get(Invitation, valid["id"]) is not None
        for model in [User, Team, Room, Membership, AuthSession, Invitation]:
            assert session.scalar(select(func.count()).select_from(model)) == 1


def test_startup_cleanup(database_url, client, account):
    user, headers = account()
    with client.app.state.sessions() as session:
        session.add(
            AuthSession(
                token_hash="startup-expired",
                user_id=user["id"],
                expires_at=now() - timedelta(seconds=1),
            )
        )
        session.commit()
    # Shutdown joins the initial cleanup task; no sleeps needed.
    with TestClient(create_app(Settings(database_url=database_url))):
        pass
    with client.app.state.sessions() as session:
        assert session.get(AuthSession, "startup-expired") is None
    assert client.get("/auth/me", headers=headers).status_code == 200
