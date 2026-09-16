"""Serialized pilot writes and conservative expiry cleanup (no user data deletion)."""

import argparse
import json

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from .config import Settings
from .database import create_database
from .models import AuthSession, Invitation, now


def lock_writes(session: Session) -> None:
    # One transaction lock shared by ALL HTTP mutations and cleanup. This small-pilot
    # tradeoff also protects count-then-insert quotas across independent API processes.
    # SQLite must acquire its write reservation before any authentication SELECT.
    if session.get_bind().dialect.name == "sqlite":
        session.execute(text("BEGIN IMMEDIATE"))
    else:
        session.execute(text("SELECT pg_advisory_xact_lock(734812901)"))


def cleanup_expired(sessions, *, apply: bool = True) -> dict[str, int]:
    with sessions() as session:
        lock_writes(session)
        cutoff = now()
        counts = {}
        for model, label in [(AuthSession, "sessions"), (Invitation, "invitations")]:
            condition = model.expires_at <= cutoff
            counts[label] = session.scalar(select(func.count()).select_from(model).where(condition))
            if apply:
                session.execute(delete(model).where(condition))
        if apply:
            session.commit()
        return counts


def main():
    parser = argparse.ArgumentParser(description="Count expired records; delete only with --apply.")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    engine, sessions = create_database(Settings().database_url)
    try:
        print(json.dumps({"applied": args.apply, **cleanup_expired(sessions, apply=args.apply)}))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
