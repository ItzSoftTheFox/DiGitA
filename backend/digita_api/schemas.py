from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Password = Annotated[str, StringConstraints(min_length=12, max_length=128)]
# SQLite drops timezone information; all persisted timestamps originate in UTC.
Timestamp = Annotated[
    datetime,
    AfterValidator(
        lambda value: value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    ),
]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Input):
    email: EmailStr = Field(max_length=254)
    password: Password

    @field_validator("email", mode="after")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class Register(Login):
    display_name: Name


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(Output):
    id: str
    email: str
    display_name: str
    created_at: Timestamp


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: Timestamp


class Named(Input):
    name: Name


class TeamOut(Output):
    id: str
    name: str
    created_at: Timestamp


class RoomOut(TeamOut):
    team_id: str


class MemberOut(BaseModel):
    user_id: str
    display_name: str
    role: Literal["owner", "admin", "member"]


class RoleUpdate(Input):
    role: Literal["admin", "member"]


class InviteOut(BaseModel):
    id: str
    code: str
    expires_at: Timestamp


class AcceptInvite(Input):
    code: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")
