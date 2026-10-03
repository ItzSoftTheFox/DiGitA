from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from digita_api.models import Base

from .conftest import ROOT


def test_migration_round_trip(database_url):
    config = Config(str(ROOT / "alembic.ini"))
    command.check(config)
    command.downgrade(config, "base")
    engine = create_engine(database_url)
    assert set(inspect(engine).get_table_names()) == {"alembic_version"}
    command.upgrade(config, "head")
    assert set(inspect(engine).get_table_names()) == set(Base.metadata.tables) | {"alembic_version"}
    command.check(config)
    engine.dispose()


def test_profile_migration_backfills_existing_accounts_and_keeps_old_writers(database_url):
    config = Config(str(ROOT / "alembic.ini"))
    command.downgrade(config, "6cf731084972")
    engine = create_engine(database_url)

    def old_writer(connection, user_id):
        connection.execute(
            text(
                "INSERT INTO users (id, email, display_name, password_hash, created_at) "
                "VALUES (:id, :email, :name, :password, CURRENT_TIMESTAMP)"
            ),
            {
                "id": user_id,
                "email": f"{user_id}@example.com",
                "name": "Existing",
                "password": "hash",
            },
        )

    with engine.begin() as connection:
        old_writer(connection, "existing")
    command.upgrade(config, "head")
    with engine.begin() as connection:
        old_writer(connection, "old-writer")
        profiles = connection.execute(
            text("SELECT avatar, avatar_color, custom_status FROM users ORDER BY id")
        ).all()
        assert profiles == [("initials", "slate", ""), ("initials", "slate", "")]
        connection.execute(
            text(
                "UPDATE users SET avatar = 'fox', custom_status = 'Reviewing' WHERE id = 'existing'"
            )
        )
    command.downgrade(config, "6cf731084972")
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM users")).scalar() == 2
        assert "avatar" not in {
            column["name"] for column in inspect(connection).get_columns("users")
        }
    command.upgrade(config, "head")
    command.check(config)
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT avatar, avatar_color, custom_status FROM users WHERE id = 'existing'")
        ).one() == ("initials", "slate", "")
    engine.dispose()
