import hashlib
import secrets

from pwdlib import PasswordHash

passwords = PasswordHash.recommended()
# Verify against a real hash even when the email is unknown.
dummy_hash = passwords.hash(secrets.token_urlsafe(32))


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)
