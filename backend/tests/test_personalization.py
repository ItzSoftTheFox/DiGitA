from datetime import timedelta

import pytest
from starlette.websockets import WebSocketDisconnect

from digita_api.models import Invitation, now

from .test_api import invite, join, team
from .test_realtime import authenticate, presence, room, state

DEFAULTS = {"avatar": "initials", "avatar_color": "slate", "custom_status": ""}
PROFILE = {
    "display_name": "New Name",
    "avatar": "fox",
    "avatar_color": "green",
    "custom_status": "Reviewing changes",
}


def test_profile_defaults_update_reset_and_member_privacy(client, account):
    user, owner = account()
    _, member = account("member")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    assert {key: user[key] for key in DEFAULTS} == DEFAULTS
    response = client.patch(
        "/auth/me",
        headers=owner,
        json={**PROFILE, "display_name": "  New Name  ", "custom_status": " Reviewing changes "},
    )
    assert response.status_code == 200
    updated = response.json()
    assert {key: updated[key] for key in PROFILE} == PROFILE
    assert updated["email"] == user["email"] and updated["id"] == user["id"]
    assert client.get("/auth/me", headers=owner).json() == updated
    members = client.get(f"/teams/{team_id}/members", headers=member).json()
    profile = next(m for m in members if m["user_id"] == user["id"])
    assert {key: profile[key] for key in PROFILE} == PROFILE
    assert set(profile) == {"user_id", "role", *PROFILE}
    response = client.patch("/auth/me", headers=owner, json={"display_name": "Reset"})
    assert response.status_code == 200
    assert {key: response.json()[key] for key in DEFAULTS} == DEFAULTS


@pytest.mark.parametrize(
    "invalid",
    [
        {"display_name": ""},
        {"display_name": "   "},
        {"display_name": "x" * 81},
        {"display_name": None},
        {"display_name": 42},
        {"avatar": "https://example.com/avatar.png"},
        {"avatar": None},
        {"avatar_color": "#fff"},
        {"avatar_color": None},
        {"custom_status": "x" * 121},
        {"custom_status": None},
        {"email": "other@example.com"},
        {"password": "a new secret password"},
        {"role": "owner"},
        {"id": "other"},
    ],
)
def test_profile_validation_is_atomic_and_does_not_echo_input(client, account, invalid):
    original, owner = account()
    response = client.patch("/auth/me", headers=owner, json={**PROFILE, **invalid})
    assert response.status_code == 422
    assert all("input" not in e and "ctx" not in e for e in response.json()["detail"])
    assert client.get("/auth/me", headers=owner).json() == original


def test_profile_name_is_required_and_boundary_lengths_are_accepted(client, account):
    _, owner = account()
    assert client.patch("/auth/me", headers=owner, json={}).status_code == 422
    response = client.patch(
        "/auth/me",
        headers=owner,
        json={**PROFILE, "display_name": "x" * 80, "custom_status": "x" * 120},
    )
    assert response.status_code == 200


def test_active_invitation_list_permissions_and_redaction(client, account):
    _, owner = account()
    admin_user, admin = account("admin")
    _, member = account("member")
    _, outsider = account("outsider")
    team_id = team(client, owner)
    join(client, team_id, owner, admin)
    join(client, team_id, owner, member)
    assert (
        client.patch(
            f"/teams/{team_id}/members/{admin_user['id']}", headers=owner, json={"role": "admin"}
        ).status_code
        == 200
    )
    path = f"/teams/{team_id}/invitations"
    active = invite(client, team_id, owner)
    expired = invite(client, team_id, owner)
    with client.app.state.sessions() as session:
        session.get(Invitation, expired["id"]).expires_at = now() - timedelta(seconds=1)
        session.commit()
    for headers in [owner, admin]:
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        assert response.json() == [{"id": active["id"], "expires_at": active["expires_at"]}]
        assert active["code"] not in response.text
    assert client.get(path, headers=member).status_code == 403
    assert client.get(path, headers=outsider).status_code == 404
    assert client.delete(f"{path}/{active['id']}", headers=admin).status_code == 204
    assert client.get(path, headers=owner).json() == []
    assert (
        client.post(
            "/invitations/accept", headers=outsider, json={"code": active["code"]}
        ).status_code
        == 404
    )


def test_role_changes_refresh_live_identity_and_permissions(client, account):
    owner_user, owner = account()
    user, member = account("member")
    other_user, other = account("other")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    join(client, team_id, owner, other)
    client.patch("/auth/me", headers=member, json=PROFILE)
    room_id = room(client, owner, team_id)
    path = f"/teams/{team_id}/members/{user['id']}"
    with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
        authenticate(ws, member)
        assert state(ws)["members"][0]["role"] == "member"
        response = client.patch(path, headers=owner, json={"role": "admin"})
        assert response.status_code == 200
        assert {key: response.json()[key] for key in PROFILE} == PROFILE
        assert "email" not in response.json()
        assert state(ws)["members"][0]["role"] == "admin"
        assert client.get(f"/teams/{team_id}/invitations", headers=member).status_code == 200
        assert (
            client.delete(
                f"/teams/{team_id}/members/{other_user['id']}", headers=member
            ).status_code
            == 403
        )
        assert (
            client.delete(
                f"/teams/{team_id}/members/{owner_user['id']}", headers=member
            ).status_code
            == 409
        )
        assert client.delete(path, headers=other).status_code == 403
        assert client.patch(path, headers=member, json={"role": "member"}).status_code == 403
        client.patch(path, headers=owner, json={"role": "member"})
        assert state(ws)["members"][0]["role"] == "member"
        assert client.get(f"/teams/{team_id}/invitations", headers=member).status_code == 403


def test_live_profile_update_preserves_presence_conflicts_and_playback(client, account):
    _, owner = account()
    user, member = account("member")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    room_id = room(client, owner, team_id)
    with client.websocket_connect(f"/rooms/{room_id}/live") as first:
        authenticate(first, owner)
        state(first)
        with client.websocket_connect(f"/rooms/{room_id}/live") as second:
            authenticate(second, member)
            state(second)
            first.send_json(presence(room_id))
            state(first, lambda s: any(m["presence"] for m in s["members"]))
            second.send_json(presence(room_id))
            baseline = state(first, lambda s: bool(s["conflicts"]))
            first.send_json({"type": "ambient.set", "playing": True})
            playing = state(first, lambda s: s["ambient"]["playing"])
            client.patch("/auth/me", headers=member, json=PROFILE)
            updated = state(
                first, lambda s: any(m["display_name"] == "New Name" for m in s["members"])
            )
            live_member = next(m for m in updated["members"] if m["user_id"] == user["id"])
            assert {key: live_member[key] for key in PROFILE} == PROFILE
            assert "email" not in live_member
            assert live_member["presence"] == presence(room_id)["presence"]
            assert updated["conflicts"] == baseline["conflicts"]
            assert updated["ambient"]["playing"]
            assert updated["ambient"]["revision"] == playing["ambient"]["revision"]


@pytest.mark.parametrize("leave_self", [False, True])
def test_member_removal_immediately_clears_idle_live_presence_and_conflicts(
    client, account, leave_self
):
    _, owner = account()
    user, member = account("member")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    room_id = room(client, owner, team_id)
    with client.websocket_connect(f"/rooms/{room_id}/live") as first:
        authenticate(first, owner)
        state(first)
        with client.websocket_connect(f"/rooms/{room_id}/live") as second:
            authenticate(second, member)
            state(second)
            first.send_json(presence(room_id))
            state(first, lambda s: any(m["presence"] for m in s["members"]))
            second.send_json(presence(room_id))
            state(first, lambda s: bool(s["conflicts"]))
            state(second, lambda s: bool(s["conflicts"]))
            response = client.delete(
                f"/teams/{team_id}/members/{user['id']}", headers=member if leave_self else owner
            )
            assert response.status_code == 204
            with pytest.raises(WebSocketDisconnect) as error:
                second.receive_json()
            assert error.value.code == 4403
            updated = state(first, lambda s: len(s["members"]) == 1)
            assert not updated["conflicts"]
            assert "src/auth.ts" not in str(updated["events"])
            assert updated["members"][0]["presence"] is not None
            assert client.get(f"/rooms/{room_id}", headers=member).status_code == 404


def test_removal_closes_all_team_rooms_and_preserves_another_team(client, account):
    _, owner = account()
    user, member = account("member")
    team_id = team(client, owner)
    another_team = team(client, owner, "Another team")
    join(client, team_id, owner, member)
    join(client, another_team, owner, member)
    first_room = room(client, owner, team_id)
    second_room = client.post(
        f"/teams/{team_id}/rooms", headers=owner, json={"name": "Second"}
    ).json()["id"]
    unaffected_room = room(client, owner, another_team)
    with (
        client.websocket_connect(f"/rooms/{first_room}/live") as first,
        client.websocket_connect(f"/rooms/{second_room}/live") as second,
        client.websocket_connect(f"/rooms/{unaffected_room}/live") as unaffected,
    ):
        for ws in [first, second, unaffected]:
            authenticate(ws, member)
            state(ws)
        unaffected.send_json(presence(unaffected_room))
        baseline = state(unaffected, lambda s: bool(s["members"][0]["presence"]))
        assert (
            client.delete(f"/teams/{team_id}/members/{user['id']}", headers=owner).status_code
            == 204
        )
        for ws in [first, second]:
            with pytest.raises(WebSocketDisconnect) as error:
                ws.receive_json()
            assert error.value.code == 4403
        updated = state(unaffected)
        assert updated["members"] == baseline["members"]
        unaffected.send_json({"type": "ping"})
        assert unaffected.receive_json()["type"] == "pong"
        assert client.get(f"/rooms/{unaffected_room}", headers=member).status_code == 200
