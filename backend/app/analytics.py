"""KPI definitions and parameterized queries shared by dashboard and conversational BI."""
from calendar import monthrange
from datetime import date, timedelta

import sqlalchemy as sa
from fastapi import HTTPException

from backend.app.db import calendar, customers, datasets, inventory, marketing, products, sales

DAY = timedelta(days=1)
SALES_SOURCE = sales.join(products).join(customers)
FORMULAS = {
    "revenue": "Sum of quantity × unit price × (1 − discount rate), rounded per transaction",
    "gross_profit": "Revenue − direct product cost",
    "margin": "Gross profit ÷ revenue",
    "orders": "Distinct transaction IDs (one transaction represents one order in this dataset)",
    "units": "Sum of sold units",
    "aov": "Revenue ÷ orders",
    "customers": "Distinct purchasing customers in the period",
    "new_customers": "Purchasing customers whose first recorded order falls inside the period",
    "returning_customers": "Purchasing customers with an earlier order before the period",
    "spend": "Sum of reported campaign spend",
    "roas": "Attributed revenue ÷ campaign spend",
    "cac": "Marketing spend ÷ new purchasing customers first attributed to the selected campaign scope",
    "conversion": "Attributed orders ÷ campaign leads",
    "inventory_availability": "Physical SKU-days with stock at close ÷ observed SKU-days",
}


def ratio(numerator, denominator):
    return numerator/denominator if denominator else None


def dataset_info(conn):
    data = conn.scalar(sa.select(datasets.c.payload))
    if not data:
        raise HTTPException(503, "Load a validated dataset first.")
    return data


def bounds(info, start=None, end=None):
    oldest, latest = date.fromisoformat(info["start"]), date.fromisoformat(info["end"])
    start, end = start or max(latest.replace(day=1),oldest), end or latest
    if start > end:
        raise HTTPException(422, "Start date must precede or equal end date.")
    if start < oldest or end > latest:
        raise HTTPException(422, f"Choose dates between {oldest} and {latest}.")
    return start, end


def previous_period(start, end, calendar_aligned=False):
    prior_end = start - DAY
    if calendar_aligned and start.day == 1 and start.month == end.month:
        full_month = end.day == monthrange(end.year,end.month)[1]
        return prior_end.replace(day=1), prior_end if full_month else prior_end.replace(day=min(end.day,prior_end.day))
    return prior_end - (end-start), prior_end


def options(conn):
    product_rows = conn.execute(sa.select(products).order_by(products.c.product_name)).mappings().all()
    def unique(column):
        return list(conn.scalars(sa.select(column).distinct().order_by(column)))
    return dict(products=[dict(p) for p in product_rows], categories=unique(products.c.category),
                regions=unique(sales.c.region), channels=unique(sales.c.sales_channel),
                marketing_channels=unique(marketing.c.channel), segments=unique(customers.c.customer_segment))


def conditions(start, end, filters):
    clauses = [sales.c.date.between(start, end)]
    columns = {"category": products.c.category, "product": sales.c.product_id, "region": sales.c.region,
               "channel": sales.c.sales_channel, "segment": customers.c.customer_segment}
    clauses.extend(columns[key] == value for key, value in filters.items() if value and key in columns)
    return clauses


def sales_total(conn, start, end, filters):
    cols = sales.c
    measures = [sa.func.coalesce(sa.func.sum(cols[name]), 0).label(label)
                for name, label in (("revenue","revenue"),("gross_profit","gross_profit"),("quantity","units"))]
    total = dict(conn.execute(sa.select(*measures, sa.func.count().label("orders"),
                    sa.func.count(sa.distinct(cols.customer_id)).label("customers"))
                    .select_from(SALES_SOURCE).where(*conditions(start, end, filters))).mappings().one())
    total = {k: int(v) for k, v in total.items()}
    first = sa.select(cols.customer_id, sa.func.min(cols.date).label("first_day")).group_by(cols.customer_id).subquery()
    total["new_customers"] = conn.scalar(sa.select(sa.func.count(sa.distinct(cols.customer_id)))
        .select_from(SALES_SOURCE.join(first, first.c.customer_id == cols.customer_id))
        .where(first.c.first_day.between(start, end), *conditions(start, end, filters)))
    total["returning_customers"] = total["customers"] - total["new_customers"]
    total["margin"] = ratio(total["gross_profit"], total["revenue"])
    total["aov"] = ratio(total["revenue"], total["orders"])
    return total


def trend(conn, start, end, filters, grain="daily"):
    daily_view = sa.table("daily_sales", sa.column("date", sa.Date()), sa.column("revenue"), sa.column("gross_profit"),
                         sa.column("orders"), sa.column("units"))
    if not any(filters.values()):
        q = sa.select(daily_view).where(daily_view.c.date.between(start, end))
    else:
        c = sales.c
        q = sa.select(c.date, sa.func.sum(c.revenue).label("revenue"),
            sa.func.sum(c.gross_profit).label("gross_profit"), sa.func.count().label("orders"),
            sa.func.sum(c.quantity).label("units")).select_from(SALES_SOURCE).where(
                *conditions(start,end,filters)).group_by(c.date)
    values = {r["date"]: r for r in conn.execute(q).mappings()}
    output = {}
    for offset in range((end-start).days+1):
        day = start + timedelta(days=offset)
        bucket = day if grain == "daily" else (day-DAY*day.weekday() if grain == "weekly" else day.replace(day=1))
        row = output.setdefault(bucket, dict(date=bucket.isoformat(), revenue=0, gross_profit=0, orders=0, units=0))
        for key in ("revenue","gross_profit","orders","units"):
            row[key] += int(values[day][key]) if day in values else 0
    return list(output.values())


def grouped(conn, start, end, filters, dimension, limit=None):
    s, p, c, m = sales.c, products.c, customers.c, marketing.c
    dimensions = dict(product=p.product_name, category=p.category, region=s.region,
                      channel=s.sales_channel, segment=c.customer_segment, marketing=m.channel)
    name = dimensions[dimension]
    source = SALES_SOURCE
    if dimension == "marketing":
        source = source.outerjoin(marketing, sa.and_(m.campaign_id == s.campaign_id, m.date == s.date))
        name = sa.func.coalesce(name, "Unattributed")
    q = (sa.select(name.label("name"), sa.func.sum(s.revenue).label("revenue"),
          sa.func.sum(s.gross_profit).label("gross_profit"), sa.func.count().label("orders"),
          sa.func.sum(s.quantity).label("units")).select_from(source).where(*conditions(start,end,filters))
          .group_by(name).order_by(sa.desc("revenue"), name))
    return [{k: int(v) if k != "name" else v for k,v in row.items()}
            for row in conn.execute(q.limit(limit) if limit else q).mappings()]


def marketing_summary(conn, start, end, channel=None):
    c = marketing.c
    cols = ("spend", "orders", "leads", "attributed_revenue")
    q = sa.select(c.channel.label("name"), *(sa.func.sum(c[key]).label(key) for key in cols)).where(c.date.between(start,end))
    if channel:
        q = q.where(c.channel == channel)
    rows = [{k: int(v) if k != "name" else v for k,v in row.items()}
            for row in conn.execute(q.group_by(c.channel).order_by(c.channel)).mappings()]
    s = sales.c
    # First-order attribution uses date and transaction ID as a deterministic tie-break.
    ranked = sa.select(s.customer_id, s.date, s.campaign_id, sa.func.row_number().over(
        partition_by=s.customer_id, order_by=(s.date, s.transaction_id)).label("purchase_number")).subquery()
    acquisition = dict(conn.execute(sa.select(c.channel, sa.func.count()).select_from(
        ranked.join(marketing, sa.and_(ranked.c.date == c.date, ranked.c.campaign_id == c.campaign_id)))
        .where(ranked.c.purchase_number == 1, ranked.c.date.between(start,end)).group_by(c.channel)).all())
    for row in rows:
        row.update(roas=ratio(row["attributed_revenue"], row["spend"]),
                   conversion=ratio(row["orders"],row["leads"]),
                   acquisitions=acquisition.get(row["name"],0), cac=ratio(row["spend"],acquisition.get(row["name"],0)))
    total = {key: sum(row[key] for row in rows) for key in (*cols, "acquisitions")}
    total.update(roas=ratio(total["attributed_revenue"],total["spend"]), conversion=ratio(total["orders"],total["leads"]),
                 cac=ratio(total["spend"],total["acquisitions"]))
    return total, rows


def availability(conn, start, end, filters):
    c = inventory.c
    q = sa.select(sa.func.count(), sa.func.sum(sa.case((c.stockout_flag, 0), else_=1))).select_from(
        inventory.join(products)).where(c.date.between(start,end))
    if filters.get("category"):
        q = q.where(products.c.category == filters["category"])
    if filters.get("product"):
        q = q.where(c.product_id == filters["product"])
    total, available = conn.execute(q).one()
    return ratio(available, total)
