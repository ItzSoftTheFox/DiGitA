import asyncio
import json
from collections import deque
from dataclasses import dataclass, field
from time import monotonic
from typing import Literal

from anyio import CancelScope
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select

from .models import AuthSession, Membership, Room, User, identifier, now
from .security import digest


class Sharing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    branch: bool = False
    files: bool = False
    commit_message: bool = False


class Presence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repository_id: str = Field(max_length=36)
    branch: str | None = Field(default=None, max_length=256)
    files: list[str] | None = Field(default=None, max_length=500)
    changed_count: int = Field(ge=0, le=10000000)
    commit_hash: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{40,64}$")
    commit_message: str | None = Field(default=None, max_length=512)
    sharing: Sharing = Field(default_factory=Sharing)


class Update(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["presence.update"]
    presence: Presence | None


class AmbientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["ambient.set"]
    playing: bool = Field(strict=True)


@dataclass
class Ambient:
    playing: bool = False
    position_ms: float = 0
    anchor: float = field(default_factory=monotonic)
    revision: int = 0
    last_change: float = float("-inf")

    def snapshot(self):
        elapsed = (monotonic() - self.anchor) * 1000 if self.playing else 0
        return {
            "track": "soft-noise-v1",
            "duration_ms": 30000,
            "playing": self.playing,
            "position_ms": (self.position_ms + elapsed) % 30000,
            "revision": self.revision,
        }

    def set_playing(self, playing: bool):
        timestamp = monotonic()
        if self.playing == playing or timestamp - self.last_change < 0.5:
            return False
        self.position_ms = self.snapshot()["position_ms"]
        self.anchor = timestamp
        self.playing = playing
        self.revision += 1
        self.last_change = timestamp
        return True


@dataclass
class Peer:
    socket: WebSocket
    user_id: str
    name: str
    token_hash: str
    presence: dict | None = None


@dataclass
class LiveRoom:
    peers: dict[str, Peer] = field(default_factory=dict)
    events: deque = field(default_factory=lambda: deque(maxlen=100))
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    ambient: Ambient = field(default_factory=Ambient)
    conflicts: dict[str, dict] = field(default_factory=dict)
    conflict_event_times: dict[str, float] = field(default_factory=dict)


class Hub:
    """Single-process room state. No source text or paths are stored in the timeline."""

    def __init__(self, sessions):
        self.sessions = sessions
        self.rooms: dict[str, LiveRoom] = {}

    def identity(self, room_id: str, token_hash: str):
        with self.sessions() as session:
            row = session.execute(
                select(User.id, User.display_name)
                .join(AuthSession, AuthSession.user_id == User.id)
                .join(Membership, Membership.user_id == User.id)
                .join(Room, Room.team_id == Membership.team_id)
                .where(
                    Room.id == room_id,
                    AuthSession.token_hash == token_hash,
                    AuthSession.expires_at > now(),
                )
            ).first()
            return tuple(row) if row else None

    def event(self, room: LiveRoom, peer: Peer, kind: str):
        room.events.append(
            {
                "id": identifier(),
                "type": kind,
                "created_at": now().isoformat(),
                "user_id": peer.user_id,
                "display_name": peer.name,
            }
        )

    def update_conflicts(self, room: LiveRoom):
        owners: dict[str, list[str]] = {}
        for peer in room.peers.values():
            presence = peer.presence
            if presence and presence["sharing"]["files"]:
                for path in set(presence["files"] or []):
                    owners.setdefault(path, []).append(peer.user_id)
        current = {
            path: {
                "id": room.conflicts[path]["id"] if path in room.conflicts else identifier(),
                "path": path,
                "user_ids": sorted(users),
            }
            for path, users in sorted(owners.items())
            if len(users) > 1
        }
        for kind, changed in (
            ("conflict.detected", current.keys() - room.conflicts.keys()),
            ("conflict.resolved", room.conflicts.keys() - current.keys()),
        ):
            timestamp = monotonic()
            if changed and timestamp - room.conflict_event_times.get(kind, float("-inf")) >= 30:
                # One generic event per batch, throttled during reconnects/privacy toggles.
                # Never retain paths or participants in historical conflict events.
                room.events.append(
                    {
                        "id": identifier(),
                        "type": kind,
                        "created_at": now().isoformat(),
                        "user_id": None,
                        "display_name": "Conflict Radar",
                    }
                )
                room.conflict_event_times[kind] = timestamp
        room.conflicts = current

    async def broadcast(self, room_id: str, room: LiveRoom):
        # Recheck recipients before sending private room state, including revoked sessions.
        for user_id, peer in list(room.peers.items()):
            if not await asyncio.to_thread(self.identity, room_id, peer.token_hash):
                room.peers.pop(user_id, None)
                try:
                    await asyncio.wait_for(peer.socket.close(code=4403), 2)
                except (TimeoutError, RuntimeError, OSError):
                    pass
        while True:
            self.update_conflicts(room)
            state = {
                "type": "room.state",
                "room_id": room_id,
                "members": [
                    {"user_id": p.user_id, "display_name": p.name, "presence": p.presence}
                    for p in room.peers.values()
                ],
                "events": list(room.events),
                "conflicts": list(room.conflicts.values()),
                "ambient": room.ambient.snapshot(),
            }
            failed = False
            for user_id, peer in list(room.peers.items()):
                try:
                    await asyncio.wait_for(peer.socket.send_json(state), 2)
                except (TimeoutError, RuntimeError, OSError):
                    room.peers.pop(user_id, None)
                    failed = True
                    try:
                        await asyncio.wait_for(peer.socket.close(code=1013), 2)
                    except (TimeoutError, RuntimeError, OSError):
                        pass
            if not failed:
                break
            # Survivors must not retain warnings involving a failed recipient.


def router(hub: Hub, allowed_origins: list[str]) -> APIRouter:
    routes = APIRouter()

    @routes.websocket("/rooms/{room_id}/live")
    async def live(socket: WebSocket, room_id: str):
        origin = socket.headers.get("origin")
        if origin and origin not in allowed_origins:
            await socket.close(code=4403)
            return
        await socket.accept()
        peer = None
        room = None
        try:
            # Credentials are in the first frame, never URLs or access logs.
            raw = await asyncio.wait_for(socket.receive_text(), 5)
            if len(raw) > 256:
                await socket.close(code=4401)
                return
            auth = json.loads(raw)
            token = auth.get("token") if isinstance(auth, dict) else None
            if not isinstance(token, str) or len(token) != 43 or auth.get("type") != "auth":
                await socket.close(code=4401)
                return
            token_hash = digest(token)
            identity = await asyncio.to_thread(hub.identity, room_id, token_hash)
            if not identity:
                await socket.close(code=4403)
                return
            if room_id not in hub.rooms and len(hub.rooms) >= 1000:
                await socket.close(code=1013)
                return
            room = hub.rooms.setdefault(room_id, LiveRoom())
            peer = Peer(socket, identity[0], identity[1], token_hash)
            async with room.lock:
                old = room.peers.get(peer.user_id)
                if old:
                    await asyncio.wait_for(old.socket.close(code=4009), 2)
                elif len(room.peers) >= 32:
                    await socket.close(code=1013)
                    return
                room.peers[peer.user_id] = peer
                hub.event(room, peer, "presence.joined")
                await hub.broadcast(room_id, room)
            last_seen = monotonic()
            messages = deque()
            while room.peers.get(peer.user_id) is peer:
                try:
                    raw = await asyncio.wait_for(socket.receive_text(), 10)
                except TimeoutError:
                    if monotonic() - last_seen > 40:
                        await socket.close(code=4408)
                        break
                    if not await asyncio.to_thread(hub.identity, room_id, token_hash):
                        await socket.close(code=4403)
                        break
                    continue
                last_seen = monotonic()
                while messages and messages[0] < last_seen - 1:
                    messages.popleft()
                messages.append(last_seen)
                if len(messages) > 8 or len(raw.encode()) > 65536:
                    await socket.close(code=1008)
                    break
                if not await asyncio.to_thread(hub.identity, room_id, token_hash):
                    await socket.close(code=4403)
                    break
                data = json.loads(raw)
                if data == {"type": "ping"}:
                    await socket.send_json({"type": "pong", "ambient": room.ambient.snapshot()})
                    continue
                if isinstance(data, dict) and data.get("type") == "ambient.set":
                    update = AmbientUpdate.model_validate(data)
                    async with room.lock:
                        if room.peers.get(peer.user_id) is not peer:
                            break
                        if room.ambient.set_playing(update.playing):
                            hub.event(
                                room,
                                peer,
                                "ambient.started" if update.playing else "ambient.paused",
                            )
                        await hub.broadcast(room_id, room)
                    continue
                update = Update.model_validate(data)
                presence = update.presence
                if presence:
                    if presence.repository_id != room_id:
                        await socket.close(code=1008)
                        break
                    if presence.files and any(
                        not path
                        or len(path) > 512
                        or path.startswith(("/", "\\"))
                        or ".." in path.replace("\\", "/").split("/")
                        or any(ord(char) < 32 or ord(char) == 127 for char in path)
                        or (len(path) > 1 and path[1] == ":")
                        for path in presence.files
                    ):
                        await socket.close(code=1008)
                        break
                    # Enforce privacy on the server too; never retain hidden fields.
                    if not presence.sharing.branch:
                        presence.branch = None
                    if not presence.sharing.files:
                        presence.files = None
                    if not presence.sharing.commit_message:
                        presence.commit_message = None
                next_presence = presence.model_dump() if presence else None
                async with room.lock:
                    if room.peers.get(peer.user_id) is not peer:
                        break
                    previous = peer.presence
                    if next_presence != previous:
                        kind = "git.working_tree_changed"
                        if previous is None:
                            kind = "git.connected"
                        elif next_presence is None:
                            kind = "git.disconnected"
                        elif (
                            previous.get("commit_hash")
                            and next_presence.get("commit_hash")
                            and previous["commit_hash"] != next_presence["commit_hash"]
                        ):
                            kind = "git.commit_created"
                        elif (
                            previous.get("branch")
                            and next_presence.get("branch")
                            and previous["branch"] != next_presence["branch"]
                        ):
                            kind = "git.branch_changed"
                        peer.presence = next_presence
                        hub.event(room, peer, kind)
                        await hub.broadcast(room_id, room)
        except (WebSocketDisconnect, TimeoutError):
            pass
        except (ValueError, ValidationError, KeyError):
            await socket.close(code=1008)
        finally:
            if room and peer:
                # ASGI may cancel the handler as soon as the connection closes.
                # Finish removing its presence and notifying peers before returning.
                with CancelScope(shield=True):
                    async with room.lock:
                        if room.peers.get(peer.user_id) is peer:
                            room.peers.pop(peer.user_id)
                            hub.event(room, peer, "presence.left")
                            await hub.broadcast(room_id, room)
                        if not room.peers and hub.rooms.get(room_id) is room:
                            hub.rooms.pop(room_id, None)

    return routes
