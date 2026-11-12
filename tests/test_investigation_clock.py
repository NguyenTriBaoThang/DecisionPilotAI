from datetime import date
import sqlalchemy as sa

from backend.app.db import datasets, sales
from backend.app.investigation.timemachine import advance, reset
from test_investigation import inv_env


def test_advance_appends_without_touching_history(inv_env):
    engine = inv_env[1]
    with engine.connect() as conn:
        old = conn.execute(sa.select(sales).where(sales.c.date <= date(2026, 9, 30)).order_by(sales.c.transaction_id)).all()
        dataset_id = conn.scalar(sa.select(datasets.c.payload))['dataset_id']
    advanced = advance(engine, 'comp-default', 7)
    assert advanced['current_end'] == '2026-10-07'
    with engine.connect() as conn:
        assert conn.execute(sa.select(sales).where(sales.c.date <= date(2026, 9, 30)).order_by(sales.c.transaction_id)).all() == old
        assert conn.scalar(sa.select(datasets.c.payload))['dataset_id'] == dataset_id
        assert conn.scalar(sa.select(sa.func.max(sales.c.date))) == date(2026, 10, 7)
    reset(engine, 'comp-default')
