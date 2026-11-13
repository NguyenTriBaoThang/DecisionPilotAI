"""Accounting decomposition: each residual cell is assigned at most once."""
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median

import sqlalchemy as sa

from backend.app.db import customers, marketing, sales


@dataclass(frozen=True)
class CauseShare:
    key: str
    label_vi: str
    delta_daily: float
    share: float
    rows_current: int
    rows_prior: int
    days: int


@dataclass(frozen=True)
class Decomposition:
    total_delta_daily: float
    prior_daily: float
    current_daily: float
    causes: list[CauseShare]
    raw_slice_shares: dict[str, float]


def month_periods(end: date) -> tuple[tuple[date, date], tuple[date, date]]:
    start = end.replace(day=1)
    previous_end = start - timedelta(days=1)
    return (start, end), (previous_end.replace(day=1), previous_end)


def scope_conditions(scope: dict | None) -> list:
    columns = {"segment": customers.c.customer_segment, "product": sales.c.product_id,
               "region": sales.c.region, "channel": marketing.c.channel}
    unknown = set(scope or {}) - columns.keys()
    if unknown:
        raise ValueError(f"Unsupported investigation scope: {sorted(unknown)}")
    return [columns[key] == value for key, value in (scope or {}).items()]


SOURCE = sales.join(customers).outerjoin(marketing, sa.and_(
    sales.c.campaign_id == marketing.c.campaign_id, sales.c.date == marketing.c.date))


def decompose_revenue(conn, current: tuple[date, date], prior: tuple[date, date],
                      scope: dict | None = None) -> Decomposition:
    dimensions = [sales.c.region, customers.c.customer_segment,
                  sa.func.coalesce(marketing.c.channel, "Không quảng cáo")]
    periods = []
    day_sets = []
    for start, end in (current, prior):
        days = (end - start).days + 1
        if days <= 0:
            raise ValueError("Period end must not precede start")
        conditions = [sales.c.date.between(start, end), *scope_conditions(scope)]
        rows = conn.execute(sa.select(*dimensions, sa.func.sum(sales.c.revenue), sa.func.count())
                            .select_from(SOURCE).where(*conditions).group_by(*dimensions)).all()
        periods.append({tuple(row[:3]): (float(row[3]) / days, row[4]) for row in rows})
        dated = conn.execute(sa.select(*dimensions, sales.c.date).select_from(SOURCE)
                             .where(*conditions).distinct()).all()
        day_sets.append({key: {r[3] for r in dated if tuple(r[:3]) == key} for key in periods[-1]})
    now, before = periods
    cells = sorted(now.keys() | before.keys())
    def value(mapping, key):
        return mapping.get(key, (0.0, 0))[0]
    current_daily = sum(value(now, c) for c in cells)
    prior_daily = sum(value(before, c) for c in cells)
    total = current_daily - prior_daily
    ratios = []
    for region in sorted({c[0] for c in cells}):
        previous = sum(value(before, c) for c in cells if c[0] == region)
        if previous:
            ratios.append(sum(value(now, c) for c in cells if c[0] == region) / previous)
    r = median(ratios) if ratios else 1.0
    demand = prior_daily * (r - 1)
    gaps = {c: value(now, c) - value(before, c) * r for c in cells}
    causes = []
    def cause(key, label, delta, selected, share=None):
        # Actual observed dates, not the requested period length, determine sample sufficiency.
        observed = max((len(set().union(*(dates.get(c, set()) for c in selected))) for dates in day_sets), default=0)
        causes.append(CauseShare(key, label, delta, delta / total if total else (share or 0.0),
                                 sum(now.get(c, (0, 0))[1] for c in selected),
                                 sum(before.get(c, (0, 0))[1] for c in selected), observed))
    cause("demand", "Nhu cầu chung", demand, cells)
    remaining = set(cells)
    raw = {"demand": demand / total if total else 0.0}
    for index, dimension, label in ((2, "marketing", "Quảng cáo"), (1, "segment", "Khách hàng"), (0, "region", "Khu vực")):
        for val in sorted({c[index] for c in cells}):
            key = f"{dimension}:{val}"
            raw[key] = sum(value(now, c) - value(before, c) for c in cells if c[index] == val) / total if total else 0.0
            selected = sorted(c for c in remaining if c[index] == val)
            gap = sum(gaps[c] for c in selected)
            if gap * total > 0 and abs(gap) >= 0.10 * abs(total):
                cause(key, f"{label}: {val}", gap, selected)
                remaining.difference_update(selected)
    cause("other", "Chưa giải thích", total - sum(c.delta_daily for c in causes), sorted(remaining), share=1.0)
    return Decomposition(total, prior_daily, current_daily, causes, raw)
