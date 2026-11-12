"""Postgres returns NUMERIC as Decimal; JSON columns must still serialize it (governance sync crashed with 500)."""
from decimal import Decimal

import sqlalchemy as sa

from backend.app.db import json_serializer


def test_json_serializer_handles_decimal_and_dates():
    import datetime as dt
    out = json_serializer({"score": Decimal("1.5"), "day": dt.date(2026, 9, 30)})
    assert out == '{"score": 1.5, "day": "2026-09-30"}'


def test_engine_json_column_accepts_decimal():
    engine = sa.create_engine("sqlite://", json_serializer=json_serializer)
    t = sa.Table("t", sa.MetaData(), sa.Column("j", sa.JSON))
    t.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(t.insert().values(j={"v": Decimal("2.25")}))
        assert conn.execute(sa.select(t.c.j)).scalar_one() == {"v": 2.25}
