"""Independent additive drilldowns for changes in observed sales."""
from fastapi import HTTPException

from backend.app.analytics import grouped, ratio, sales_total

DIMENSIONS = ("product", "category", "region", "marketing", "segment", "channel")


def decompose(conn, current, prior, filters, metric="revenue", info=None):
    tot_now = sales_total(conn, *current, filters, info=info)
    tot_prior = sales_total(conn, *prior, filters, info=info)
    actual = tot_now.get(metric)
    expected = tot_prior.get(metric)
    if actual is None or expected is None:
        raise HTTPException(422, "Gross profit contribution analysis requires a mapped Cost or Profit column.")
    delta = actual - expected
    caps = (info or {}).get("capabilities") or {}
    dims = DIMENSIONS
    if info and info.get("storage_mode") == "partitioned" and not caps.get("has_marketing"):
        dims = tuple(d for d in DIMENSIONS if d != "marketing")
    slices = {}
    for dimension in dims:
        now = {row["name"]: row[metric] for row in grouped(conn, *current, filters, dimension, info=info)}
        before = {row["name"]: row[metric] for row in grouped(conn, *prior, filters, dimension, info=info)}
        rows = []
        for name in now.keys() | before.keys():
            change = (now.get(name, 0) or 0) - (before.get(name, 0) or 0)
            rows.append(dict(name=name, actual=now.get(name, 0) or 0, baseline=before.get(name, 0) or 0, delta=change,
                             share_of_net_change=ratio(change, delta)))
        slices[dimension] = sorted(rows, key=lambda row: (-abs(row["delta"]), row["name"]))
    return dict(metric=metric, actual=actual, baseline=expected, delta=delta, relative_change=ratio(delta, expected),
                current=[str(d) for d in current], prior=[str(d) for d in prior], contributions=slices,
                interpretation="Each dimension independently reconciles to the total change. Shares can be negative or exceed 100% when groups offset. These are observed contributions; causal effects require a separate study.")
