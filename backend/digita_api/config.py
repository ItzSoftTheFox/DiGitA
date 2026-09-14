from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DIGITA_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://digita:digita-local@127.0.0.1:5433/digita"
    session_hours: int = Field(default=24, ge=1, le=720)
    invite_hours: int = Field(default=48, ge=1, le=168)
    auth_requests_per_minute: int = Field(default=20, ge=1, le=1000)
    allowed_origins: list[str] = [
        "http://127.0.0.1:1420",
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]
