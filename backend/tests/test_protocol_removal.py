import pytest
from starlette.websockets import WebSocketDisconnect

from .test_api import team
from .test_realtime import authenticate, room, state


def test_room_state_and_heartbeat_exclude_removed_audio(client, account):
    _, owner = account()
    room_id = room(client, owner, team(client, owner))
    with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
        authenticate(ws, owner)
        assert "ambient" not in state(ws)
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


@pytest.mark.parametrize(
    "payload",
    [
        {"type": "ambient.set", "playing": True},
        {"type": "ambient.set", "playing": False},
        {"type": "ambient.set", "playing": "yes"},
        {"type": "ambient.set", "playing": True, "track": "https://unknown/audio"},
    ],
)
def test_removed_audio_commands_are_rejected(client, account, payload):
    _, owner = account()
    room_id = room(client, owner, team(client, owner))
    with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
        authenticate(ws, owner)
        state(ws)
        ws.send_json(payload)
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 1008
