from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DIGITA_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://digita:digita-local@127.0.0.1:5433/digita"
    session_hours: int = Field(default=24, ge=1, le=720)
    invite_hours: int = Field(default=48, ge=1, le=168)
    auth_requests_per_minute: int = Field(default=20, ge=1, le=1000)
    api_requests_per_minute: int = Field(default=120, ge=1, le=10000)
    max_request_bytes: int = Field(default=16384, ge=1024, le=65536)
    registration_enabled: bool = True
    max_users: int = Field(default=50, ge=1, le=10000)
    max_owned_teams: int = Field(default=3, ge=1, le=100)
    max_joined_teams: int = Field(default=5, ge=1, le=100)
    max_team_members: int = Field(default=10, ge=1, le=100)
    max_team_rooms: int = Field(default=5, ge=1, le=100)
    max_team_invitations: int = Field(default=10, ge=1, le=100)
    max_user_sessions: int = Field(default=5, ge=1, le=100)
    cleanup_interval_seconds: int = Field(default=3600, ge=60, le=86400)
    allowed_origins: list[str] = [
        "http://127.0.0.1:1420",
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]
