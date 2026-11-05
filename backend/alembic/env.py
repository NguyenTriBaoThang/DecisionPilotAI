from alembic import context

from backend.app.db import make_engine, metadata


def migrate():
    engine = make_engine()
    if context.is_offline_mode():
        context.configure(url=engine.url, target_metadata=metadata, literal_binds=True)
        with context.begin_transaction():
            context.run_migrations()
    else:
        with engine.connect() as conn:
            context.configure(connection=conn, target_metadata=metadata)
            with context.begin_transaction():
                context.run_migrations()


migrate()
