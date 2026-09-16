import certifi
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


def create_database(url: str):
    address = make_url(url)
    if address.drivername == "postgresql+psycopg" and address.query.get("sslrootcert") == "system":
        # Binary libpq/OpenSSL may look outside the host's CA directory. Use an
        # explicit portable trust bundle for both Alembic and runtime connections.
        # Preserve the verify-full guarantee implied by sslrootcert=system.
        address = address.update_query_dict(
            {"sslrootcert": certifi.where(), "sslmode": "verify-full"}
        )
    options = {"check_same_thread": False} if address.get_backend_name() == "sqlite" else {}
    engine = create_engine(address, connect_args=options, pool_pre_ping=True)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    return engine, sessionmaker(engine, expire_on_commit=False)
