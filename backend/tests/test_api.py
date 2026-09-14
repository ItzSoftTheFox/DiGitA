from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import select

from digita_api.models import AuthSession, Invitation, User, now
from digita_api.security import digest


def team(client, headers, name="DiGitA"):
    response = client.post("/teams", headers=headers, json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def invite(client, team_id, headers):
    response = client.post(f"/teams/{team_id}/invitations", headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def join(client, team_id, owner, member):
    code = invite(client, team_id, owner)["code"]
    response = client.post("/invitations/accept", headers=member, json={"code": code})
    assert response.status_code == 200, response.text


def test_registration_login_logout_and_secret_storage(client, account):
    user, headers = account()
    assert "password_hash" not in user
    response = client.get("/auth/me", headers=headers)
    assert response.json() == user
    assert response.headers["Cache-Control"] == "no-store"
    token = headers["Authorization"].removeprefix("Bearer ")
    with client.app.state.sessions() as session:
        stored = session.get(User, user["id"])
        assert stored.password_hash.startswith("$argon2id$")
        assert "a long test password" not in stored.password_hash
        auth = session.scalar(select(AuthSession))
        assert auth.token_hash == digest(token)
        assert auth.token_hash != token
    assert client.post("/auth/logout", headers=headers).status_code == 204
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_case_insensitive_email_and_duplicate_registration(client, account):
    account()
    response = client.post(
        "/auth/register",
        json={
            "email": "OWNER@example.com",
            "password": "a long test password",
            "display_name": "Other",
        },
    )
    assert response.status_code == 409
    assert (
        client.post(
            "/auth/login", json={"email": "OWNER@example.com", "password": "a long test password"}
        ).status_code
        == 200
    )


def test_unknown_and_wrong_password_have_same_response(client, account):
    account()
    responses = [
        client.post("/auth/login", json={"email": email, "password": "the wrong test password"})
        for email in ["owner@example.com", "unknown@example.com"]
    ]
    assert [r.status_code for r in responses] == [401, 401]
    assert responses[0].json() == responses[1].json()
    assert responses[0].headers["WWW-Authenticate"] == "Bearer"


def test_expired_and_malformed_tokens(client, account):
    _, headers = account()
    with client.app.state.sessions() as session:
        auth = session.scalar(select(AuthSession))
        auth.expires_at = now() - timedelta(seconds=1)
        session.commit()
    for auth_headers in [
        headers,
        {},
        {"Authorization": "Bearer invalid"},
        {"Authorization": "Basic abc"},
    ]:
        assert client.get("/auth/me", headers=auth_headers).status_code == 401


def test_logout_only_revokes_current_session(client, account):
    _, first = account()
    token = client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "a long test password"}
    ).json()["access_token"]
    second = {"Authorization": f"Bearer {token}"}
    client.post("/auth/logout", headers=first)
    assert client.get("/auth/me", headers=second).status_code == 200


@pytest.mark.parametrize(
    "field,value",
    [
        ("password", "s3cr3t!"),
        ("password", "x" * 129),
        ("email", "invalid"),
        ("display_name", "  "),
        ("display_name", "x" * 81),
        ("role", "owner"),
    ],
)
def test_registration_validation_does_not_echo_secrets(client, field, value):
    body = {
        "email": "person@example.com",
        "password": "a long test password",
        "display_name": "Test",
        field: value,
    }
    response = client.post("/auth/register", json=body)
    assert response.status_code == 422
    assert body["password"] not in response.text
    assert all("input" not in error and "ctx" not in error for error in response.json()["detail"])


def test_teams_and_rooms_are_isolated(client, account):
    _, owner = account()
    _, outsider = account("outsider")
    team_id = team(client, owner)
    room = client.post(f"/teams/{team_id}/rooms", headers=owner, json={"name": " Main "})
    assert room.status_code == 201
    room_id = room.json()["id"]
    assert room.json()["name"] == "Main"
    assert client.get("/teams", headers=outsider).json() == []
    for path in [f"/teams/{team_id}/rooms", f"/teams/{team_id}/members", f"/rooms/{room_id}"]:
        assert client.get(path, headers=outsider).status_code == 404
        assert client.get(path).status_code == 401
        assert client.get(path, headers=owner).status_code == 200
    assert (
        client.post(
            f"/teams/{team_id}/rooms", headers=outsider, json={"name": "Intruder"}
        ).status_code
        == 404
    )
    assert client.post(f"/teams/{team_id}/invitations", headers=outsider).status_code == 404
    assert (
        client.post(f"/teams/{team_id}/rooms", headers=owner, json={"name": "Main"}).status_code
        == 409
    )
    other_team = team(client, owner, "Second")
    assert (
        client.post(f"/teams/{other_team}/rooms", headers=owner, json={"name": "Main"}).status_code
        == 201
    )


def test_invitation_join_roles_and_removal(client, account):
    owner_user, owner = account()
    user, member = account("member")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    assert client.get("/teams", headers=member).json()[0]["id"] == team_id
    members = client.get(f"/teams/{team_id}/members", headers=member).json()
    assert {m["role"] for m in members} == {"owner", "member"}
    assert all("email" not in m for m in members)
    path = f"/teams/{team_id}/members/{user['id']}"
    room_path = f"/teams/{team_id}/rooms"
    assert client.post(room_path, headers=member, json={"name": "Main"}).status_code == 403
    assert client.post(f"/teams/{team_id}/invitations", headers=member).status_code == 403
    assert client.patch(path, headers=member, json={"role": "admin"}).status_code == 403
    assert client.patch(path, headers=owner, json={"role": "owner"}).status_code == 422
    assert client.patch(path, headers=owner, json={"role": "admin"}).status_code == 200
    room = client.post(room_path, headers=member, json={"name": "Main"})
    assert room.status_code == 201
    assert client.post(f"/teams/{team_id}/invitations", headers=member).status_code == 201
    owner_path = f"/teams/{team_id}/members/{owner_user['id']}"
    assert client.patch(owner_path, headers=owner, json={"role": "member"}).status_code == 409
    assert client.delete(owner_path, headers=owner).status_code == 409
    assert client.patch(path, headers=owner, json={"role": "member"}).status_code == 200
    assert client.post(room_path, headers=member, json={"name": "Other"}).status_code == 403
    assert client.delete(path, headers=owner).status_code == 204
    assert client.get(f"/rooms/{room.json()['id']}", headers=member).status_code == 404
    assert client.get("/teams", headers=member).json() == []


def test_member_can_leave_but_cannot_remove_others(client, account):
    _, owner = account()
    user, member = account("member")
    other_user, other = account("other")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    join(client, team_id, owner, other)
    assert (
        client.delete(f"/teams/{team_id}/members/{other_user['id']}", headers=member).status_code
        == 403
    )
    assert (
        client.delete(f"/teams/{team_id}/members/{user['id']}", headers=member).status_code == 204
    )


def test_invitation_expiry_revocation_and_storage(client, account):
    _, owner = account()
    _, member = account("member")
    team_id = team(client, owner)
    invitation = invite(client, team_id, owner)
    with client.app.state.sessions() as session:
        stored = session.get(Invitation, invitation["id"])
        assert stored.token_hash == digest(invitation["code"])
        stored.expires_at = now() - timedelta(seconds=1)
        session.commit()
    assert (
        client.post(
            "/invitations/accept", headers=member, json={"code": invitation["code"]}
        ).status_code
        == 404
    )
    invitation = invite(client, team_id, owner)
    path = f"/teams/{team_id}/invitations/{invitation['id']}"
    other_team = team(client, owner, "Other")
    assert (
        client.delete(
            f"/teams/{other_team}/invitations/{invitation['id']}", headers=owner
        ).status_code
        == 404
    )
    assert client.delete(path, headers=member).status_code == 404
    assert client.delete(path, headers=owner).status_code == 204
    assert (
        client.post(
            "/invitations/accept", headers=member, json={"code": invitation["code"]}
        ).status_code
        == 404
    )


def test_existing_member_does_not_consume_invitation(client, account):
    _, owner = account()
    _, member = account("member")
    code = invite(client, team(client, owner), owner)["code"]
    assert client.post("/invitations/accept", headers=owner, json={"code": code}).status_code == 409
    assert (
        client.post("/invitations/accept", headers=member, json={"code": code}).status_code == 200
    )
    assert (
        client.post("/invitations/accept", headers=member, json={"code": code}).status_code == 404
    )


def test_invitation_can_only_be_consumed_once_concurrently(client, account):
    _, owner = account()
    _, first = account("first")
    _, second = account("second")
    team_id = team(client, owner)
    code = invite(client, team_id, owner)["code"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda headers: (
                    client.post(
                        "/invitations/accept", headers=headers, json={"code": code}
                    ).status_code
                ),
                [first, second],
            )
        )
    assert sorted(results) == [200, 404]
    assert len(client.get(f"/teams/{team_id}/members", headers=owner).json()) == 2


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
