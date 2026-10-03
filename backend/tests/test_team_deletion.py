from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event

import pytest
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from digita_api.models import AuthSession, Invitation, Membership, Room, Team, User, now

from .test_api import invite, join, team
from .test_realtime import authenticate, presence, room, state


def test_only_owner_can_delete_and_failures_preserve_team(client, account):
    owner_user, owner = account()
    admin_user, admin = account("admin")
    _, member = account("member")
    _, outsider = account("outsider")
    _, expired = account("expired")
    team_id = team(client, owner)
    for headers in [admin, member]:
        join(client, team_id, owner, headers)
    client.patch(
        f"/teams/{team_id}/members/{admin_user['id']}", headers=owner, json={"role": "admin"}
    )
    path = f"/teams/{team_id}"
    with client.app.state.sessions() as session:
        auth = session.scalar(select(AuthSession).join(User).where(User.display_name == "expired"))
        auth.expires_at = now() - timedelta(seconds=1)
        session.commit()
    for headers in [admin, member]:
        response = client.delete(path, headers=headers)
        assert response.status_code == 403
        assert response.json() == {"detail": "Only the team owner can delete this team."}
    for headers in [{}, expired, {"Authorization": "Bearer invalid"}]:
        assert client.delete(path, headers=headers).status_code == 401
    assert client.delete(path, headers=outsider).status_code == 404
    assert client.delete("/teams/missing", headers=owner).status_code == 404
    members = client.get(f"{path}/members", headers=owner).json()
    assert len(members) == 3
    assert next(m for m in members if m["user_id"] == owner_user["id"])["role"] == "owner"
    assert client.delete(path, headers=owner).status_code == 204
    assert client.delete(path, headers=owner).status_code == 404


def test_deletion_cascades_and_preserves_accounts_sessions_other_teams(client, account):
    users = [account(), account("member")]
    owner, member = [headers for _, headers in users]
    deleted = team(client, owner)
    survivor = team(client, owner, "Survivor")
    for team_id in [deleted, survivor]:
        join(client, team_id, owner, member)
    deleted_rooms = [room(client, owner, deleted)]
    deleted_rooms.append(
        client.post(f"/teams/{deleted}/rooms", headers=owner, json={"name": "Second"}).json()["id"]
    )
    survivor_room = room(client, owner, survivor)
    deleted_invite = invite(client, deleted, owner)
    survivor_invite = invite(client, survivor, owner)
    response = client.delete(f"/teams/{deleted}", headers=owner)
    assert response.status_code == 204 and response.content == b""
    with client.app.state.sessions() as session:
        assert session.get(Team, deleted) is None
        for model in [Membership, Room, Invitation]:
            assert not list(session.scalars(select(model).where(model.team_id == deleted)))
        assert session.get(Invitation, survivor_invite["id"]) is not None
        for user, _ in users:
            assert session.get(User, user["id"]) is not None
            assert session.scalar(select(AuthSession).where(AuthSession.user_id == user["id"]))
    for headers in [owner, member]:
        assert client.get("/auth/me", headers=headers).status_code == 200
        assert [t["id"] for t in client.get("/teams", headers=headers).json()] == [survivor]
        assert client.get(f"/rooms/{survivor_room}", headers=headers).status_code == 200
        for room_id in deleted_rooms:
            assert client.get(f"/rooms/{room_id}", headers=headers).status_code == 404
    assert (
        client.post(
            "/invitations/accept", headers=member, json={"code": deleted_invite["code"]}
        ).status_code
        == 404
    )


def test_deletion_closes_idle_rooms_and_purges_live_state(client, account):
    _, owner = account()
    _, member = account("member")
    deleted = team(client, owner)
    survivor = team(client, owner, "Survivor")
    for team_id in [deleted, survivor]:
        join(client, team_id, owner, member)
    first_room = room(client, owner, deleted)
    second_room = client.post(
        f"/teams/{deleted}/rooms", headers=owner, json={"name": "Second"}
    ).json()["id"]
    survivor_room = room(client, owner, survivor)
    hub = client.app.state.hub
    with (
        client.websocket_connect(f"/rooms/{first_room}/live") as first,
        client.websocket_connect(f"/rooms/{first_room}/live") as teammate,
        client.websocket_connect(f"/rooms/{second_room}/live") as second,
        client.websocket_connect(f"/rooms/{survivor_room}/live") as unaffected,
    ):
        for ws, headers in [
            (first, owner),
            (teammate, member),
            (second, member),
            (unaffected, member),
        ]:
            authenticate(ws, headers)
            state(ws)
        first.send_json(presence(first_room))
        state(first, lambda s: any(m["presence"] for m in s["members"]))
        teammate.send_json(presence(first_room))
        for ws in [first, teammate]:
            state(ws, lambda s: bool(s["conflicts"]))
        unaffected.send_json(presence(survivor_room))
        baseline = state(unaffected, lambda s: bool(s["members"][0]["presence"]))
        unaffected_peer = next(iter(hub.rooms[survivor_room].peers.values()))
        old_rooms = [hub.rooms[first_room], hub.rooms[second_room]]
        assert client.delete(f"/teams/{deleted}", headers=owner).status_code == 204
        for ws in [first, teammate, second]:
            with pytest.raises(WebSocketDisconnect) as error:
                ws.receive_json()
            assert error.value.code == 4403
        assert first_room not in hub.rooms and second_room not in hub.rooms
        for old in old_rooms:
            assert not old.peers and not old.conflicts and not old.events
        unaffected.send_json({"type": "ping"})
        assert unaffected.receive_json()["type"] == "pong"
        assert unaffected_peer.presence == baseline["members"][0]["presence"]
        with client.websocket_connect(f"/rooms/{first_room}/live") as rejected:
            authenticate(rejected, owner)
            with pytest.raises(WebSocketDisconnect) as error:
                rejected.receive_json()
            assert error.value.code == 4403
    # Old socket finalization cannot restore deleted room state.
    assert first_room not in hub.rooms and second_room not in hub.rooms


def test_failed_commit_preserves_database_and_live_access(client, account, monkeypatch):
    _, owner = account()
    team_id = team(client, owner)
    room_id = room(client, owner, team_id)
    original_commit = Session.commit

    def fail_commit(session):
        raise SQLAlchemyError("Simulated commit failure")

    with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
        authenticate(ws, owner)
        state(ws)
        monkeypatch.setattr(Session, "commit", fail_commit)
        with pytest.raises(SQLAlchemyError):
            client.delete(f"/teams/{team_id}", headers=owner)
        monkeypatch.setattr(Session, "commit", original_commit)
        assert client.get(f"/rooms/{room_id}", headers=owner).status_code == 200
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"


def test_concurrent_room_creation_and_delete_cannot_leave_orphans(client, account):
    _, owner = account()
    team_id = team(client, owner)
    with ThreadPoolExecutor(max_workers=2) as pool:
        created = pool.submit(
            client.post, f"/teams/{team_id}/rooms", headers=owner, json={"name": "Concurrent"}
        )
        deleted = pool.submit(client.delete, f"/teams/{team_id}", headers=owner)
        assert deleted.result().status_code == 204
        assert created.result().status_code in {201, 404}
    with client.app.state.sessions() as session:
        assert session.get(Team, team_id) is None
        assert not list(session.scalars(select(Room).where(Room.team_id == team_id)))


def test_authorization_started_before_delete_cannot_restore_live_room(client, account, monkeypatch):
    _, owner = account()
    team_id = team(client, owner)
    room_id = room(client, owner, team_id)
    hub = client.app.state.hub
    original_identity = hub.identity
    started, resume = Event(), Event()

    def delayed_identity(room_id, token_hash):
        identity = original_identity(room_id, token_hash)
        if not started.is_set():
            started.set()
            assert resume.wait(5)
        return identity

    monkeypatch.setattr(hub, "identity", delayed_identity)
    with client.websocket_connect(f"/rooms/{room_id}/live") as ws:
        authenticate(ws, owner)
        assert started.wait(5)
        assert client.delete(f"/teams/{team_id}", headers=owner).status_code == 204
        resume.set()
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 4403
    assert room_id not in hub.rooms
