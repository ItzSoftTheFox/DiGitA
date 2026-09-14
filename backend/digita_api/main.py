from collections.abc import Generator
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Annotated

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
from .models import AuthSession, Invitation, Membership, Room, Team, User, now
from .rate_limit import AuthRateLimit
from .realtime import Hub, router
from .security import digest, dummy_hash, new_token, passwords

bearer = HTTPBearer(auto_error=False)


def db(request: Request) -> Generator[Session]:
    with request.app.state.sessions() as session:
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
            401, "Přihlášení je neplatné nebo vypršelo.", headers={"WWW-Authenticate": "Bearer"}
        )
    return auth


Auth = Annotated[AuthSession, Depends(authenticated)]


def membership(session: Session, team_id: str, user_id: str) -> Membership:
    member = session.get(Membership, (team_id, user_id))
    if member is None:
        # Do not disclose other teams to non-members.
        raise HTTPException(404, "Tým nebyl nalezen.")
    return member


def manager(session: Session, team_id: str, user_id: str) -> Membership:
    member = membership(session, team_id, user_id)
    if member.role not in {"owner", "admin"}:
        raise HTTPException(403, "Tato akce vyžaduje správce týmu.")
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
        yield
        engine.dispose()

    app = FastAPI(title="DiGitA API", version="0.2.0", lifespan=lifespan)
    app.state.sessions = sessions
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(router(Hub(sessions), settings.allowed_origins))
    auth_limit = AuthRateLimit(settings.auth_requests_per_minute)

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
        if (
            request.method == "POST"
            and request.url.path.rstrip("/") in {"/auth/register", "/auth/login"}
            and not auth_limit.allow(address)
        ):
            response = JSONResponse(
                status_code=429,
                content={"detail": "Příliš mnoho pokusů. Zkuste to za minutu."},
                headers={"Retry-After": "60"},
            )
        else:
            response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health")
    def health(session: DB):
        try:
            session.execute(text("SELECT 1"))
        except SQLAlchemyError:
            raise HTTPException(503, "Databáze není dostupná.") from None
        return {"status": "ok"}

    @app.post("/auth/register", response_model=s.UserOut, status_code=201)
    def register(body: s.Register, session: DB):
        user = User(
            email=str(body.email),
            display_name=body.display_name,
            password_hash=passwords.hash(body.password),
        )
        session.add(user)
        commit(session, "Účet s tímto e-mailem již existuje.")
        return user

    @app.post("/auth/login", response_model=s.TokenOut)
    def login(body: s.Login, session: DB):
        user = session.scalar(select(User).where(User.email == str(body.email)))
        valid = passwords.verify(body.password, user.password_hash if user else dummy_hash)
        if not valid or user is None:
            raise HTTPException(
                401, "Nesprávný e-mail nebo heslo.", headers={"WWW-Authenticate": "Bearer"}
            )
        token = new_token()
        expiry = now() + timedelta(hours=settings.session_hours)
        session.execute(
            delete(AuthSession).where(
                AuthSession.user_id == user.id, AuthSession.expires_at <= now()
            )
        )
        session.add(AuthSession(token_hash=digest(token), user_id=user.id, expires_at=expiry))
        session.commit()
        return s.TokenOut(access_token=token, expires_at=expiry)

    @app.post("/auth/logout", status_code=204)
    def logout(auth: Auth, session: DB):
        session.delete(auth)
        session.commit()
        return Response(status_code=204)

    @app.get("/auth/me", response_model=s.UserOut)
    def me(auth: Auth, session: DB):
        return session.get(User, auth.user_id)

    @app.post("/teams", response_model=s.TeamOut, status_code=201)
    def create_team(body: s.Named, auth: Auth, session: DB):
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
            s.MemberOut(user_id=u.id, display_name=u.display_name, role=m.role) for m, u in rows
        ]

    @app.patch("/teams/{team_id}/members/{user_id}", response_model=s.MemberOut)
    def set_role(team_id: str, user_id: str, body: s.RoleUpdate, auth: Auth, session: DB):
        caller = membership(session, team_id, auth.user_id)
        if caller.role != "owner":
            raise HTTPException(403, "Role může měnit pouze vlastník týmu.")
        target = membership(session, team_id, user_id)
        if target.role == "owner":
            raise HTTPException(409, "Roli vlastníka nelze změnit.")
        target.role = body.role
        session.commit()
        user = session.get(User, user_id)
        return s.MemberOut(user_id=user_id, display_name=user.display_name, role=target.role)

    @app.delete("/teams/{team_id}/members/{user_id}", status_code=204)
    def remove_member(team_id: str, user_id: str, auth: Auth, session: DB):
        caller = membership(session, team_id, auth.user_id)
        target = membership(session, team_id, user_id)
        if target.role == "owner":
            raise HTTPException(409, "Vlastník nemůže opustit tým ani být odebrán.")
        if user_id != auth.user_id and caller.role != "owner":
            raise HTTPException(403, "Členy může odebírat pouze vlastník týmu.")
        session.delete(target)
        session.commit()
        return Response(status_code=204)

    @app.post("/teams/{team_id}/rooms", response_model=s.RoomOut, status_code=201)
    def create_room(team_id: str, body: s.Named, auth: Auth, session: DB):
        manager(session, team_id, auth.user_id)
        room = Room(team_id=team_id, name=body.name)
        session.add(room)
        commit(session, "Místnost s tímto názvem již v týmu existuje.")
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
            raise HTTPException(404, "Místnost nebyla nalezena.")
        membership(session, room.team_id, auth.user_id)
        return room

    @app.post("/teams/{team_id}/invitations", response_model=s.InviteOut, status_code=201)
    def invite(team_id: str, auth: Auth, session: DB):
        manager(session, team_id, auth.user_id)
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
            raise HTTPException(404, "Pozvánka nebyla nalezena.")
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
            raise HTTPException(404, "Pozvánka je neplatná nebo vypršela.")
        if session.get(Membership, (team_id, auth.user_id)):
            session.rollback()
            raise HTTPException(409, "Již jste členem tohoto týmu.")
        session.add(Membership(team_id=team_id, user_id=auth.user_id, role="member"))
        commit(session, "Již jste členem tohoto týmu.")
        return session.get(Team, team_id)

    return app
