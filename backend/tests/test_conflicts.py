import asyncio
from unittest.mock import AsyncMock

import pytest

from digita_api.realtime import Hub, LiveRoom, Peer

from .test_api import join, team
from .test_realtime import authenticate, presence, room, state


@pytest.mark.parametrize("ending", ["files", "privacy", "disconnect", "logout", "membership"])
def test_conflict_lifecycle_and_privacy(client, account, ending):
    first_user, owner = account()
    second_user, member = account("member")
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
            second.send_json(presence(room_id, files=["src/auth.ts", "src/auth.ts"]))
            data = state(first, lambda s: bool(s["conflicts"]))
            assert len(data["conflicts"]) == 1
            warning = data["conflicts"][0]
            assert warning["path"] == "src/auth.ts"
            assert set(warning["user_ids"]) == {first_user["id"], second_user["id"]}
            assert "src/auth.ts" not in str(data["events"])
            second.send_json(presence(room_id, commit_hash="b" * 40))
            data = state(
                first,
                lambda s: any(
                    m["presence"] and m["presence"]["commit_hash"] == "b" * 40 for m in s["members"]
                ),
            )
            assert data["conflicts"][0]["id"] == warning["id"]
            assert sum(e["type"] == "conflict.detected" for e in data["events"]) == 1
            if ending == "files":
                second.send_json(presence(room_id, files=[]))
            elif ending == "privacy":
                second.send_json(presence(room_id, sharing={}))
            elif ending in ("logout", "membership"):
                if ending == "logout":
                    client.post("/auth/logout", headers=member)
                else:
                    client.delete(f"/teams/{team_id}/members/{second_user['id']}", headers=owner)
                first.send_json(presence(room_id, branch="changed"))
            else:
                second.close()
            data = state(first, lambda s: not s["conflicts"])
            assert any(e["type"] == "conflict.resolved" for e in data["events"])
            assert "src/auth.ts" not in str(data["events"])


def peer(user, files, sharing=True):
    return Peer(
        AsyncMock(),
        user,
        user,
        user,
        presence("room", files=files, sharing={"files": sharing})["presence"],
    )


def test_groups_multiple_members_exact_paths_and_suppresses_flapping():
    hub = Hub(None)
    live = LiveRoom(
        peers={
            "a": peer("a", ["src/A.ts", "src/A.ts"]),
            "b": peer("b", ["src/a.ts"]),
            "c": peer("c", ["src/A.ts"], False),
        }
    )
    hub.update_conflicts(live)
    assert not live.conflicts  # Case-sensitive Git paths; hidden fields never participate.
    live.peers["b"].presence["files"] = ["src/A.ts"]
    live.peers["c"].presence["sharing"]["files"] = True
    hub.update_conflicts(live)
    assert live.conflicts["src/A.ts"]["user_ids"] == ["a", "b", "c"]
    for _ in range(5):
        live.peers["a"].presence["files"] = []
        live.peers["b"].presence["files"] = []
        hub.update_conflicts(live)
        assert not live.conflicts
        live.peers["a"].presence["files"] = ["src/A.ts"]
        hub.update_conflicts(live)
        assert live.conflicts
    assert [e["type"] for e in live.events] == ["conflict.detected", "conflict.resolved"]
    assert not LiveRoom().conflicts  # State never crosses room boundaries.


def test_failed_delivery_removes_stale_warning_from_survivors():
    hub = Hub(None)
    hub.identity = lambda *_: ("user", "name")
    first, second = peer("a", ["file"]), peer("b", ["file"])
    second.socket.send_json.side_effect = OSError("disconnected")
    live = LiveRoom(peers={"a": first, "b": second})
    asyncio.run(hub.broadcast("room", live))
    assert first.socket.send_json.call_args.args[0]["conflicts"] == []
    assert not live.conflicts
