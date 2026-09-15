import pytest
from starlette.websockets import WebSocketDisconnect

from digita_api.realtime import Ambient

from .test_api import join, team
from .test_realtime import authenticate, room, state


def test_clock_pause_resume_wrap_and_throttle(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr("digita_api.realtime.monotonic", lambda: clock[0])
    ambient = Ambient()
    assert ambient.set_playing(True)
    clock[0] += 31.25
    assert ambient.snapshot()["position_ms"] == pytest.approx(1250)
    assert ambient.set_playing(False)
    assert not ambient.set_playing(True)  # Shared half-second anti-flapping window.
    clock[0] += 50
    assert ambient.snapshot()["position_ms"] == pytest.approx(1250)
    assert ambient.set_playing(True)
    clock[0] += 2
    assert ambient.snapshot()["position_ms"] == pytest.approx(3250)
    assert ambient.snapshot()["revision"] == 3


def test_shared_controls_reconnect_ping_and_room_isolation(client, account, monkeypatch):
    clock = [100.0]
    monkeypatch.setattr("digita_api.realtime.monotonic", lambda: clock[0])
    _, owner = account()
    _, member = account("member")
    team_id = team(client, owner)
    join(client, team_id, owner, member)
    room_id = room(client, owner, team_id)
    other_room = client.post(
        f"/teams/{team_id}/rooms", headers=owner, json={"name": "Other"}
    ).json()["id"]
    with client.websocket_connect(f"/rooms/{room_id}/live") as first:
        authenticate(first, owner)
        assert not state(first)["ambient"]["playing"]
        first.send_json({"type": "ambient.set", "playing": True})
        data = state(first, lambda s: s["ambient"]["playing"])
        assert data["events"][-1]["type"] == "ambient.started"
        clock[0] += 7
        with client.websocket_connect(f"/rooms/{room_id}/live") as second:
            authenticate(second, member)
            assert state(second)["ambient"]["position_ms"] == pytest.approx(7000)
            second.send_json({"type": "ambient.set", "playing": False})
            paused = state(first, lambda s: not s["ambient"]["playing"])
            assert paused["ambient"]["position_ms"] == pytest.approx(7000)
        with client.websocket_connect(f"/rooms/{room_id}/live") as second:
            authenticate(second, member)
            data = state(second)
            assert not data["ambient"]["playing"]
            second.send_json({"type": "ping"})
            assert second.receive_json()["ambient"] == data["ambient"]
        with client.websocket_connect(f"/rooms/{other_room}/live") as other:
            authenticate(other, owner)
            assert state(other)["ambient"]["position_ms"] == 0
    with client.websocket_connect(f"/rooms/{room_id}/live") as first:
        authenticate(first, owner)
        assert state(first)["ambient"]["revision"] == 0  # Empty rooms release state.


@pytest.mark.parametrize(
    "payload",
    [
        {"type": "ambient.set", "playing": "yes"},
        {"type": "ambient.set", "playing": True, "track": "https://unknown/audio"},
        {"type": "ambient.set", "playing": True, "position_ms": -1},
    ],
)
def test_rejects_invalid_commands(client, account, payload):
    _, owner = account()
    room_id = room(client, owner, team(client, owner))
    with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
        authenticate(ws, owner)
        state(ws)
        ws.send_json(payload)
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 1008


def test_revoked_member_cannot_control_audio(client, account):
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
            client.delete(f"/teams/{team_id}/members/{user['id']}", headers=owner)
            second.send_json({"type": "ambient.set", "playing": True})
            with pytest.raises(WebSocketDisconnect) as error:
                second.receive_json()
            assert error.value.code == 4403
        data = state(first, lambda s: len(s["members"]) == 1)
        assert not data["ambient"]["playing"]
