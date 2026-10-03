import asyncio
import logging
from collections.abc import Generator
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Annotated

from anyio import from_thread
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from . import schemas as s
from .config import Settings
from .database import create_database
from .maintenance import cleanup_expired, lock_writes
from .models import AuthSession, Invitation, Membership, Room, Team, User, now
from .quotas import enforce_quota
from .rate_limit import AuthRateLimit
from .realtime import Hub, router
from .request_limits import RequestBodyLimit
from .security import digest, dummy_hash, new_token, passwords

bearer = HTTPBearer(auto_error=False)
audit = logging.getLogger("digita.security")


def db(request: Request) -> Generator[Session]:
    with request.app.state.sessions() as session:
        if request.method in {"POST", "PATCH", "DELETE"}:
            lock_writes(session)
        yield session


DB = Annotated[Session, Depends(db)]


def authenticated(
    session: DB,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> AuthSession:
    token = credentials.credentials if credentials else ""
    auth = (
        session.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == digest(token), AuthSession.expires_at > now()
            )
        )
        if len(token) == 43
        else None
    )
    if auth is None:
        raise HTTPException(
            401, "Your session is invalid or has expired.", headers={"WWW-Authenticate": "Bearer"}
        )
    return auth


Auth = Annotated[AuthSession, Depends(authenticated)]


def membership(session: Session, team_id: str, user_id: str) -> Membership:
    member = session.get(Membership, (team_id, user_id))
    if member is None:
        # Do not disclose other teams to non-members.
        raise HTTPException(404, "Team not found.")
    return member


def manager(session: Session, team_id: str, user_id: str) -> Membership:
    member = membership(session, team_id, user_id)
    if member.role not in {"owner", "admin"}:
        raise HTTPException(403, "This action requires a team admin.")
    return member


def commit(session: Session, detail: str) -> None:
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, detail) from None


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine, sessions = create_database(settings.database_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        stop = asyncio.Event()

        async def clean():
            try:
                await asyncio.to_thread(cleanup_expired, sessions)
            except SQLAlchemyError:
                # Do not include SQL parameters/connection credentials in logs.
                audit.error("maintenance.cleanup_failed")

        async def maintenance():
            while not stop.is_set():
                try:
                    await asyncio.wait_for(stop.wait(), settings.cleanup_interval_seconds)
                except TimeoutError:
                    await clean()

        await clean()
        task = asyncio.create_task(maintenance())
        try:
            yield
        finally:
            stop.set()
            await task
            engine.dispose()

    app = FastAPI(title="DiGitA API", version="0.2.0", lifespan=lifespan)
    app.state.sessions = sessions
    hub = Hub(sessions)
    app.state.hub = hub
    app.add_middleware(RequestBodyLimit, max_bytes=settings.max_request_bytes)
    app.include_router(router(hub, settings.allowed_origins))
    auth_limit = AuthRateLimit(settings.auth_requests_per_minute)
    api_limit = AuthRateLimit(settings.api_requests_per_minute)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, error: RequestValidationError):
        # FastAPI's default validation response can echo passwords and invitation codes.
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {"type": e["type"], "loc": e["loc"], "msg": e["msg"]} for e in error.errors()
                ]
            },
        )

    @app.middleware("http")
    async def private_responses(request: Request, call_next):
        address = request.client.host if request.client else "unknown"
        if not api_limit.allow(address) or (
            request.method == "POST"
            and request.url.path.rstrip("/") in {"/auth/register", "/auth/login"}
            and not auth_limit.allow(address)
        ):
            audit.warning("request.rate_limited")
            response = JSONResponse(
                status_code=429,
                content={"detail": "Too many attempts. Try again in a minute."},
                headers={"Retry-After": "60"},
            )
        else:
            response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    # Wrap rate-limit responses too, so trusted clients can read their cooldown.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Retry-After"],
    )

    @app.get("/health")
    def health(session: DB):
        try:
            session.execute(text("SELECT 1"))
        except SQLAlchemyError:
            raise HTTPException(503, "The database is unavailable.") from None
        return {"status": "ok"}

    @app.post("/auth/register", response_model=s.UserOut, status_code=201)
    def register(body: s.Register, session: DB):
        if not settings.registration_enabled:
            raise HTTPException(403, "Registration is currently closed.")
        enforce_quota(session, User, settings.max_users, "The pilot has reached its capacity.")
        user = User(
            email=str(body.email),
            display_name=body.display_name,
            password_hash=passwords.hash(body.password),
        )
        session.add(user)
        commit(session, "An account with this email already exists.")
        audit.info("auth.registered")
        return user

    @app.post("/auth/login", response_model=s.TokenOut)
    def login(body: s.Login, session: DB):
        user = session.scalar(select(User).where(User.email == str(body.email)))
        valid = passwords.verify(body.password, user.password_hash if user else dummy_hash)
        if not valid or user is None:
            audit.warning("auth.login_failed")
            raise HTTPException(
                401, "Incorrect email or password.", headers={"WWW-Authenticate": "Bearer"}
            )
        token = new_token()
        expiry = now() + timedelta(hours=settings.session_hours)
        session.execute(
            delete(AuthSession).where(
                AuthSession.user_id == user.id, AuthSession.expires_at <= now()
            )
        )
        # Allow a fresh login at capacity; revoke the earliest-expiring sessions.
        existing = session.scalars(
            select(AuthSession)
            .where(AuthSession.user_id == user.id)
            .order_by(AuthSession.expires_at, AuthSession.token_hash)
        ).all()
        for old in existing[: max(0, len(existing) - settings.max_user_sessions + 1)]:
            session.delete(old)
        session.add(AuthSession(token_hash=digest(token), user_id=user.id, expires_at=expiry))
        session.commit()
        audit.info("auth.login_succeeded")
        return s.TokenOut(access_token=token, expires_at=expiry)

    @app.post("/auth/logout", status_code=204)
    def logout(auth: Auth, session: DB):
        session.delete(auth)
        session.commit()
        audit.info("auth.logged_out")
        return Response(status_code=204)

    @app.get("/auth/me", response_model=s.UserOut)
    def me(auth: Auth, session: DB):
        return session.get(User, auth.user_id)

    @app.patch("/auth/me", response_model=s.UserOut)
    def update_profile(body: s.ProfileUpdate, auth: Auth, session: DB):
        user = session.get(User, auth.user_id)
        for field, value in body.model_dump().items():
            setattr(user, field, value)
        session.commit()
        from_thread.run(hub.refresh_user, auth.user_id)
        return user

    @app.post("/teams", response_model=s.TeamOut, status_code=201)
    def create_team(body: s.Named, auth: Auth, session: DB):
        enforce_quota(
            session,
            Membership,
            settings.max_owned_teams,
            "You have reached the limit for owned teams.",
            Membership.user_id == auth.user_id,
            Membership.role == "owner",
        )
        enforce_quota(
            session,
            Membership,
            settings.max_joined_teams,
            "You have reached the team membership limit.",
            Membership.user_id == auth.user_id,
        )
        team = Team(name=body.name)
        session.add(team)
        session.flush()
        session.add(Membership(team_id=team.id, user_id=auth.user_id, role="owner"))
        session.commit()
        return team

    @app.get("/teams", response_model=list[s.TeamOut])
    def list_teams(auth: Auth, session: DB):
        return session.scalars(
            select(Team)
            .join(Membership)
            .where(Membership.user_id == auth.user_id)
            .order_by(Team.created_at, Team.id)
        ).all()

    @app.delete("/teams/{team_id}", status_code=204)
    def delete_team(team_id: str, auth: Auth, session: DB):
        caller = membership(session, team_id, auth.user_id)
        if caller.role != "owner":
            raise HTTPException(403, "Only the team owner can delete this team.")
        room_ids = list(session.scalars(select(Room.id).where(Room.team_id == team_id)))
        # Database foreign keys remove rooms, memberships and invitations atomically.
        session.execute(delete(Team).where(Team.id == team_id))
        session.commit()
        from_thread.run(hub.revoke_rooms, room_ids)
        return Response(status_code=204)

    @app.get("/teams/{team_id}/members", response_model=list[s.MemberOut])
    def list_members(team_id: str, auth: Auth, session: DB):
        membership(session, team_id, auth.user_id)
        rows = session.execute(
            select(Membership, User)
            .join(User)
            .where(Membership.team_id == team_id)
            .order_by(User.display_name, User.id)
        )
        return [
            s.MemberOut(
                user_id=u.id,
                display_name=u.display_name,
                avatar=u.avatar,
                avatar_color=u.avatar_color,
                custom_status=u.custom_status,
                role=m.role,
            )
            for m, u in rows
        ]

    @app.patch("/teams/{team_id}/members/{user_id}", response_model=s.MemberOut)
    def set_role(team_id: str, user_id: str, body: s.RoleUpdate, auth: Auth, session: DB):
        caller = membership(session, team_id, auth.user_id)
        if caller.role != "owner":
            raise HTTPException(403, "Only the team owner can change roles.")
        target = membership(session, team_id, user_id)
        if target.role == "owner":
            raise HTTPException(409, "The owner's role cannot be changed.")
        target.role = body.role
        session.commit()
        from_thread.run(hub.refresh_user, user_id)
        user = session.get(User, user_id)
        return s.MemberOut(
            user_id=user_id,
            display_name=user.display_name,
            avatar=user.avatar,
            avatar_color=user.avatar_color,
            custom_status=user.custom_status,
            role=target.role,
        )

    @app.delete("/teams/{team_id}/members/{user_id}", status_code=204)
    def remove_member(team_id: str, user_id: str, auth: Auth, session: DB):
        caller = membership(session, team_id, auth.user_id)
        target = membership(session, team_id, user_id)
        if target.role == "owner":
            raise HTTPException(409, "The owner cannot leave or be removed from the team.")
        if user_id != auth.user_id and caller.role != "owner":
            raise HTTPException(403, "Only the team owner can remove members.")
        session.delete(target)
        session.commit()
        from_thread.run(hub.refresh_user, user_id)
        return Response(status_code=204)

    @app.post("/teams/{team_id}/rooms", response_model=s.RoomOut, status_code=201)
    def create_room(team_id: str, body: s.Named, auth: Auth, session: DB):
        manager(session, team_id, auth.user_id)
        enforce_quota(
            session,
            Room,
            settings.max_team_rooms,
            "The team has reached its room limit.",
            Room.team_id == team_id,
        )
        room = Room(team_id=team_id, name=body.name)
        session.add(room)
        commit(session, "A room with this name already exists in the team.")
        return room

    @app.get("/teams/{team_id}/rooms", response_model=list[s.RoomOut])
    def list_rooms(team_id: str, auth: Auth, session: DB):
        membership(session, team_id, auth.user_id)
        return session.scalars(
            select(Room).where(Room.team_id == team_id).order_by(Room.created_at, Room.id)
        ).all()

    @app.get("/rooms/{room_id}", response_model=s.RoomOut)
    def get_room(room_id: str, auth: Auth, session: DB):
        room = session.get(Room, room_id)
        if room is None:
            raise HTTPException(404, "Room not found.")
        membership(session, room.team_id, auth.user_id)
        return room

    @app.get("/teams/{team_id}/invitations", response_model=list[s.InvitationOut])
    def list_invitations(team_id: str, auth: Auth, session: DB):
        manager(session, team_id, auth.user_id)
        return session.scalars(
            select(Invitation)
            .where(Invitation.team_id == team_id, Invitation.expires_at > now())
            .order_by(Invitation.expires_at, Invitation.id)
        ).all()

    @app.post("/teams/{team_id}/invitations", response_model=s.InviteOut, status_code=201)
    def invite(team_id: str, auth: Auth, session: DB):
        manager(session, team_id, auth.user_id)
        session.execute(
            delete(Invitation).where(Invitation.team_id == team_id, Invitation.expires_at <= now())
        )
        enforce_quota(
            session,
            Invitation,
            settings.max_team_invitations,
            "The team has reached its active invitation limit.",
            Invitation.team_id == team_id,
        )
        token = new_token()
        expiry = now() + timedelta(hours=settings.invite_hours)
        invitation = Invitation(team_id=team_id, token_hash=digest(token), expires_at=expiry)
        session.add(invitation)
        session.commit()
        return s.InviteOut(id=invitation.id, code=token, expires_at=expiry)

    @app.delete("/teams/{team_id}/invitations/{invite_id}", status_code=204)
    def revoke_invite(team_id: str, invite_id: str, auth: Auth, session: DB):
        manager(session, team_id, auth.user_id)
        result = session.execute(
            delete(Invitation).where(Invitation.id == invite_id, Invitation.team_id == team_id)
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Invitation not found.")
        session.commit()
        return Response(status_code=204)

    @app.post("/invitations/accept", response_model=s.TeamOut)
    def accept_invite(body: s.AcceptInvite, auth: Auth, session: DB):
        # DELETE RETURNING atomically consumes the code even with concurrent requests.
        team_id = session.scalar(
            delete(Invitation)
            .where(Invitation.token_hash == digest(body.code), Invitation.expires_at > now())
            .returning(Invitation.team_id)
        )
        if team_id is None:
            raise HTTPException(404, "The invitation is invalid or has expired.")
        if session.get(Membership, (team_id, auth.user_id)):
            session.rollback()
            raise HTTPException(409, "You are already a member of this team.")
        enforce_quota(
            session,
            Membership,
            settings.max_joined_teams,
            "You have reached the team membership limit.",
            Membership.user_id == auth.user_id,
        )
        enforce_quota(
            session,
            Membership,
            settings.max_team_members,
            "The team has reached its member limit.",
            Membership.team_id == team_id,
        )
        session.add(Membership(team_id=team_id, user_id=auth.user_id, role="member"))
        commit(session, "You are already a member of this team.")
        return session.get(Team, team_id)

    return app
