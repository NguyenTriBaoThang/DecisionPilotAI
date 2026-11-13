"""Ordered, append-only investigation events."""
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from backend.app.db import inv_trace


def emit(conn, case_id: str, agent: str, type: str, payload: dict) -> int:
    for attempt in range(8):
        try:
            with conn.begin_nested():
                seq = (conn.scalar(sa.select(sa.func.max(inv_trace.c.seq)).where(inv_trace.c.case_id == case_id)) or 0) + 1
                conn.execute(inv_trace.insert().values(case_id=case_id, seq=seq, agent=agent, type=type, payload=payload))
            return seq
        except IntegrityError:
            if attempt == 7:
                raise
    raise RuntimeError("Trace sequence allocation failed")


def read_after(conn, case_id: str, after_seq: int) -> list[dict]:
    return [dict(row) for row in conn.execute(sa.select(
        inv_trace.c.seq, inv_trace.c.agent, inv_trace.c.type, inv_trace.c.payload, inv_trace.c.created_at
    ).where(inv_trace.c.case_id == case_id, inv_trace.c.seq > after_seq).order_by(inv_trace.c.seq)).mappings()]
