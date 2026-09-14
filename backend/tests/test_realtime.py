import pytest
from starlette.websockets import WebSocketDisconnect

from .test_api import join, team


def room(client, headers, team_id):
    return client.post(f"/teams/{team_id}/rooms", headers=headers, json={"name": "Live"}).json()[
        "id"
    ]


def authenticate(ws, headers):
    ws.send_json({"type": "auth", "token": headers["Authorization"][7:]})


def state(ws, condition=lambda value: True):
    for _ in range(12):
        data = ws.receive_json()
        if data.get("type") == "room.state" and condition(data):
            return data
    raise AssertionError("Expected room state not received")


def presence(room_id, **overrides):
    return {
        "type": "presence.update",
        "presence": {
            "repository_id": room_id,
            "branch": "feature/login",
            "files": ["src/auth.ts"],
            "changed_count": 1,
            "commit_hash": "a" * 40,
            "commit_message": "Private message",
            "sharing": {"branch": True, "files": True, "commit_message": True},
            **overrides,
        },
    }


def test_two_members_presence_privacy_timeline_and_disconnect(client, account):
    owner_user, owner = account()
    _, member = account("member")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    room_id = room(client, owner, team_id)
    with client.websocket_connect(f"/rooms/{room_id}/live") as first:
        authenticate(first, owner)
        assert len(state(first)["members"]) == 1
        with client.websocket_connect(f"/rooms/{room_id}/live") as second:
            authenticate(second, member)
            assert len(state(second)["members"]) == 2
            state(first, lambda s: len(s["members"]) == 2)
            first.send_json(presence(room_id))
            data = state(second, lambda s: any(m["presence"] for m in s["members"]))
            assert next(m for m in data["members"] if m["user_id"] == owner_user["id"])["presence"][
                "files"
            ] == ["src/auth.ts"]
            first.send_json(presence(room_id, sharing={}))
            data = state(
                second,
                lambda s: any(
                    m["presence"] and m["presence"]["files"] is None for m in s["members"]
                ),
            )
            shared = next(m for m in data["members"] if m["presence"])["presence"]
            assert shared["branch"] is None and shared["commit_message"] is None
            assert "src/auth.ts" not in str(data["events"])
            assert "Private message" not in str(data["events"])
            first.send_json(presence(room_id, commit_hash="b" * 40, sharing={}))
            data = state(second, lambda s: s["events"][-1]["type"] == "git.commit_created")
            first.send_json({"type": "presence.update", "presence": None})
            state(second, lambda s: all(m["presence"] is None for m in s["members"]))
        data = state(first, lambda s: len(s["members"]) == 1)
        assert data["events"][-1]["type"] == "presence.left"


def test_reconnect_receives_current_state(client, account):
    _, owner = account()
    _, member = account("member")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    room_id = room(client, owner, team_id)
    with client.websocket_connect(f"/rooms/{room_id}/live") as first:
        authenticate(first, owner)
        state(first)
        first.send_json(presence(room_id))
        state(first, lambda s: s["members"][0]["presence"] is not None)
        for _ in range(2):
            with client.websocket_connect(f"/rooms/{room_id}/live") as second:
                authenticate(second, member)
                data = state(second)
                assert any(
                    m["presence"] and m["presence"]["files"] == ["src/auth.ts"]
                    for m in data["members"]
                )


def test_non_member_and_revoked_session_cannot_join(client, account):
    _, owner = account()
    _, outsider = account("outsider")
    room_id = room(client, owner, team(client, owner))
    for headers in [outsider, {"Authorization": "Bearer " + "x" * 43}]:
        with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
            authenticate(ws, headers)
            with pytest.raises(WebSocketDisconnect) as error:
                ws.receive_json()
            assert error.value.code == 4403
    client.post("/auth/logout", headers=owner)
    with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
        authenticate(ws, owner)
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


@pytest.mark.parametrize("revoke", ["logout", "membership"])
def test_live_access_is_revoked_before_next_broadcast(client, account, revoke):
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
            state(first, lambda s: len(s["members"]) == 2)
            if revoke == "logout":
                client.post("/auth/logout", headers=member)
            else:
                client.delete(f"/teams/{team_id}/members/{user['id']}", headers=owner)
            first.send_json(presence(room_id))
            with pytest.raises(WebSocketDisconnect) as error:
                second.receive_json()
            assert error.value.code == 4403
            assert len(state(first)["members"]) == 1


@pytest.mark.parametrize(
    "invalid",
    [
        {"repository_id": "another-room"},
        {"files": ["/home/private/file"]},
        {"files": ["../secret"]},
        {"source_code": "do not accept"},
        {"files": ["x"] * 501},
    ],
)
def test_presence_rejects_other_projects_paths_and_extra_fields(client, account, invalid):
    _, owner = account()
    room_id = room(client, owner, team(client, owner))
    with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
        authenticate(ws, owner)
        state(ws)
        ws.send_json(presence(room_id, **invalid))
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 1008


def test_untrusted_browser_origin_is_rejected(client, account):
    _, owner = account()
    room_id = room(client, owner, team(client, owner))
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/rooms/{room_id}/live", headers={"origin": "https://unknown.example"}
        ):
            pass
