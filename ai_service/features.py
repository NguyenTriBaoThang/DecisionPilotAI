"""Point-in-time features and daily observations read from the validated dataset."""
import numpy as np
import pandas as pd
import sqlalchemy as sa

from backend.app.db import calendar, customers, inventory, marketing, products, sales

FEATURES = ("lag_1","lag_7","lag_14","lag_28","mean_7","std_7","mean_14","std_14","mean_28","std_28",
            "growth_7","weekday","month","quarter","weekend","holiday","scale")
HOLIDAYS = {(1, 1), (4, 30), (5, 1), (9, 2), (12, 25)}


def lag_features(history, day, scale, holiday=None):
    history = np.asarray(history) / scale[:, None]
    lag = [history[:, -i] for i in (1, 7, 14, 28)]
    rolling = [column for w in (7,14,28) for column in (history[:,-w:].mean(1),history[:,-w:].std(1))]
    growth = np.clip((lag[0] - lag[1]) / np.maximum(lag[1], .1), -3, 3)
    if holiday is None:
        holiday = (day.month, day.day) in HOLIDAYS
    constants = [day.weekday(),day.month,(day.month-1)//3+1,day.weekday() >= 5,holiday]
    return np.column_stack([*lag, *rolling, growth, *[np.full(len(scale), x) for x in constants], np.log1p(scale)])


def observed_series(conn, info):
    """Target matrices are indexed by dataset date and scope, with zero-sale days retained."""
    dates = pd.date_range(info["start"], info["end"])
    catalog = pd.read_sql(sa.select(products.c.product_id, products.c.category), conn)
    cols = sales.c
    frame = pd.read_sql(sa.select(cols.date, cols.product_id, sa.func.sum(cols.revenue).label("revenue"),
        sa.func.count().label("orders"), sa.func.sum(cols.quantity).label("demand")).group_by(cols.date,cols.product_id), conn)
    frame["date"] = pd.to_datetime(frame["date"])
    ids = sorted(catalog.product_id)
    categories = sorted(catalog.category.unique())
    by_category = catalog.groupby("category").product_id.apply(list)
    labels = ["all", *["sku:"+x for x in ids], *["category:"+x for x in categories]]
    matrices = {}
    for target in ("revenue","orders","demand"):
        pivot = frame.pivot(index="date", columns="product_id", values=target).reindex(index=dates, columns=ids).fillna(0)
        matrices[target] = np.vstack([pivot.sum(axis=1), pivot.to_numpy().T,
                                     *[pivot[by_category[c]].sum(axis=1) for c in categories]]).astype(float)
    holidays = dict(conn.execute(sa.select(calendar.c.date,calendar.c.is_holiday)).all())
    return [d.date() for d in dates], labels, matrices, holidays


def anomaly_frame(conn, info):
    days = pd.date_range(info["start"],info["end"])
    frame = pd.read_sql(sa.text("SELECT date, revenue, gross_profit, units, orders FROM daily_sales ORDER BY date"),conn)
    frame.date = pd.to_datetime(frame.date)
    frame = frame.set_index("date").reindex(days).fillna(0)
    frame["margin"] = frame.gross_profit / frame.revenue.where(frame.revenue > 0)
    c = marketing.c
    campaigns = pd.read_sql(sa.select(c.date, *(sa.func.sum(c[k]).label(k) for k in
        ("spend","attributed_revenue","orders","leads"))).where(c.channel == "Facebook Ads").group_by(c.date),conn)
    campaigns.date = pd.to_datetime(campaigns.date)
    campaigns = campaigns.set_index("date").reindex(days)
    frame["facebook_spend"] = campaigns.spend
    frame["facebook_roas"] = campaigns.attributed_revenue / campaigns.spend.where(campaigns.spend > 0)
    frame["facebook_conversion"] = campaigns.orders / campaigns.leads.where(campaigns.leads > 0)
    other = pd.read_sql(sa.select(c.date, sa.func.sum(c.spend).label("spend"),
        sa.func.sum(c.attributed_revenue).label("attributed_revenue"), sa.func.sum(c.orders).label("orders"),
        sa.func.sum(c.leads).label("leads")).group_by(c.date),conn)
    other.date = pd.to_datetime(other.date)
    other = other.set_index("date").reindex(days)
    frame["marketing_spend"] = other.spend
    frame["marketing_roas"] = other.attributed_revenue / other.spend.where(other.spend > 0)
    frame["marketing_conversion"] = other.orders / other.leads.where(other.leads > 0)
    return frame


def business_features(conn, info):
    """Cutoff-aligned feature tables for offline analysis; forecasts use only their lag/calendar subset."""
    days = pd.date_range(info["start"], info["end"])
    daily = anomaly_frame(conn, info)
    m = pd.read_sql(sa.text("SELECT date, spend, attributed_revenue, leads, orders FROM daily_marketing"), conn)
    m.date = pd.to_datetime(m.date)
    daily = daily.join(m.set_index("date")[["spend","attributed_revenue","leads","orders"]]
                       .rename(columns={"orders":"attributed_orders"}))
    s = sales.c
    ranked = sa.select(s.date, s.campaign_id, sa.func.row_number().over(
        partition_by=s.customer_id, order_by=(s.date, s.transaction_id)).label("n")).subquery()
    acquisition = pd.read_sql(sa.select(ranked.c.date, sa.func.count().label("new_attributed")).where(
        ranked.c.n == 1, ranked.c.campaign_id.is_not(None)).group_by(ranked.c.date), conn)
    acquisition.date = pd.to_datetime(acquisition.date)
    daily = daily.join(acquisition.set_index("date")).fillna({"new_attributed": 0})
    daily["cac"] = daily.spend / daily.new_attributed.where(daily.new_attributed > 0)
    for col in ("revenue", "units", "orders"):
        for lag in (1,7,14,28):
            daily[f"{col}_lag_{lag}"] = daily[col].shift(lag)
        for window in (7,14,28):
            roll = daily[col].shift(1).rolling(window)
            daily[f"{col}_mean_{window}"] = roll.mean()
            daily[f"{col}_std_{window}"] = roll.std()
        prior = daily[col].shift(8)
        daily[f"{col}_growth_7"] = daily[col].shift(1) / prior.where(prior > 0) - 1
    events = pd.read_sql(sa.select(calendar), conn)
    events.date = pd.to_datetime(events.date)
    daily = daily.join(events.set_index("date"))
    rfm = pd.read_sql(sa.select(customers.c.customer_id, sa.func.max(s.date).label("last_date"),
        sa.func.count(s.transaction_id).label("frequency"),
        sa.func.coalesce(sa.func.sum(s.revenue), 0).label("monetary")).select_from(customers.outerjoin(sales))
        .group_by(customers.c.customer_id), conn)
    rfm["recency_days"] = (days[-1] - pd.to_datetime(rfm.pop("last_date"))).dt.days
    stock = pd.read_sql(sa.select(inventory).order_by(inventory.c.date), conn)
    grouped = stock.groupby("product_id").sold_qty
    stock["previous_7d_mean_units"] = grouped.transform(lambda x: x.shift(1).rolling(7).mean())
    stock["demand_to_opening_stock"] = stock.previous_7d_mean_units / (stock.opening_stock + stock.received_qty).replace(0,np.nan)
    stock["pre_sales_stock_risk"] = stock.previous_7d_mean_units > stock.opening_stock + stock.received_qty
    return daily, rfm, stock
