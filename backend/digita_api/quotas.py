from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def enforce_quota(session: Session, model, limit: int, message: str, *conditions) -> None:
    # Caller holds the transaction-wide write lock until commit/rollback.
    count = session.scalar(select(func.count()).select_from(model).where(*conditions))
    if count >= limit:
        raise HTTPException(409, message)
