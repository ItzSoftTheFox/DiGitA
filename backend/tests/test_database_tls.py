from pathlib import Path

import certifi
import pytest

from digita_api.database import create_database


@pytest.mark.parametrize("mode", ["", "&sslmode=verify-full", "&sslmode=require"])
def test_system_ca_uses_portable_bundle_and_full_hostname_verification(mode):
    engine, _ = create_database(
        "postgresql+psycopg://db.example.com/pilot?sslrootcert=system"
        "&channel_binding=require" + mode
    )
    try:
        _, params = engine.dialect.create_connect_args(engine.url)
        assert params["sslrootcert"] == certifi.where()
        assert Path(params["sslrootcert"]).is_file()
        assert params["sslmode"] == "verify-full"
        assert params["channel_binding"] == "require"
        assert params["host"] == "db.example.com"
    finally:
        engine.dispose()


def test_explicit_custom_ca_is_preserved():
    engine, _ = create_database(
        "postgresql+psycopg://db.example.com/pilot?sslrootcert=/custom/ca.pem&sslmode=verify-full"
    )
    try:
        assert engine.url.query["sslrootcert"] == "/custom/ca.pem"
        assert engine.url.query["sslmode"] == "verify-full"
    finally:
        engine.dispose()


def test_sqlite_remains_usable():
    engine, _ = create_database("sqlite:///:memory:")
    try:
        with engine.connect() as connection:
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
    finally:
        engine.dispose()
