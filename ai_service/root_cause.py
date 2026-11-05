"""Independent additive drilldowns for changes in observed sales."""
from backend.app.analytics import grouped, ratio, sales_total

DIMENSIONS = ("product", "category", "region", "marketing", "segment", "channel")


def decompose(conn, current, prior, filters, metric="revenue"):
    actual = sales_total(conn, *current, filters)[metric]
    expected = sales_total(conn, *prior, filters)[metric]
    delta = actual - expected
    slices = {}
    for dimension in DIMENSIONS:
        now = {row["name"]: row[metric] for row in grouped(conn, *current, filters, dimension)}
        before = {row["name"]: row[metric] for row in grouped(conn, *prior, filters, dimension)}
        rows = []
        for name in now.keys() | before.keys():
            change = now.get(name, 0)-before.get(name, 0)
            rows.append(dict(name=name, actual=now.get(name,0), baseline=before.get(name,0), delta=change,
                             share_of_net_change=ratio(change, delta)))
        slices[dimension] = sorted(rows, key=lambda row: (-abs(row["delta"]),row["name"]))
    return dict(metric=metric, actual=actual, baseline=expected, delta=delta, relative_change=ratio(delta,expected),
                current=[str(d) for d in current], prior=[str(d) for d in prior], contributions=slices,
                interpretation="Each dimension independently reconciles to the total change. Shares can be negative or exceed 100% when groups offset. These are observed contributions; causal effects require a separate study.")
