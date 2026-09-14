from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

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
