"""KPI definitions and parameterized queries shared by dashboard and conversational BI."""
from calendar import monthrange
from datetime import date, timedelta

import sqlalchemy as sa
from fastapi import HTTPException

from backend.app.db import (
    calendar,
    companies,
    customers,
    datasets,
    enterprise_datasets,
    inventory,
    marketing,
    products,
    sales,
    tenant_inventory_daily,
    tenant_marketing_daily,
    tenant_multimodal_insights,
    tenant_products,
    tenant_transactions,
)

DAY = timedelta(days=1)
SALES_SOURCE = sales.join(products).join(customers)
FULL_CAPABILITIES = {
    "has_date": True,
    "has_revenue": True,
    "has_product": True,
    "has_category": True,
    "has_quantity": True,
    "has_cost_or_profit": True,
    "has_customer": True,
    "has_region": True,
    "has_channel": True,
    "has_marketing": True,
    "has_inventory": True,
    "supports_dashboard": True,
    "supports_ask": True,
    "supports_anomalies": True,
    "supports_forecast": True,
    "supports_price_scenario": True,
    "supports_marketing_scenario": True,
    "supports_inventory_scenario": True,
}
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


def is_partitioned(info: dict | None) -> bool:
    return bool(info and info.get("storage_mode") == "partitioned")


def _caps(info: dict | None) -> dict:
    return (info or {}).get("capabilities") or FULL_CAPABILITIES


def _format_enterprise_row(ds: dict, company_name: str, legacy_payload: dict | None = None) -> dict:
    meta = dict(ds.get("metadata_json") or {})
    if ds.get("storage_mode") == "legacy_snapshot" and legacy_payload:
        return {
            **legacy_payload,
            "company_id": ds["company_id"],
            "company_name": company_name,
            "storage_mode": "legacy_snapshot",
            "capabilities": ds.get("capabilities_json") or FULL_CAPABILITIES,
            "is_active": bool(ds.get("is_active", True)),
            "data_source_id": ds.get("data_source_id"),
            "quality_score": meta.get("quality_score"),
        }
    return {
        "dataset_id": ds["id"],
        "company_id": ds["company_id"],
        "company_name": company_name,
        "data_source_id": ds["data_source_id"],
        "kind": ds.get("kind") or "uploaded",
        "title": ds["name"],
        "status": ds["status"],
        "storage_mode": ds.get("storage_mode") or "partitioned",
        "start": ds["date_start"].isoformat() if ds.get("date_start") else meta.get("start"),
        "end": ds["date_end"].isoformat() if ds.get("date_end") else meta.get("end"),
        "currency": meta.get("currency", "USD"),
        "timezone": meta.get("timezone", "Asia/Ho_Chi_Minh"),
        "counts": meta.get("counts", {"sales_transactions": ds.get("valid_rows", 0)}),
        "capabilities": ds.get("capabilities_json") or FULL_CAPABILITIES,
        "quality_score": meta.get("quality_score"),
        "is_active": bool(ds.get("is_active")),
    }


def dataset_info(conn, company_id: str = "comp-default", dataset_id: str | None = None):
    company = conn.execute(sa.select(companies).where(companies.c.id == company_id)).mappings().first()
    if company is None and company_id != "comp-default":
        raise HTTPException(404, f"Company workspace '{company_id}' does not exist.")
    company_name = company["name"] if company else "Default Enterprise Workspace"
    legacy = conn.scalar(sa.select(datasets.c.payload))

    if dataset_id:
        ds = conn.execute(sa.select(enterprise_datasets).where(enterprise_datasets.c.id == dataset_id)).mappings().first()
        if ds is not None:
            if ds["company_id"] != company_id:
                raise HTTPException(403, "Dataset does not belong to your active company workspace.")
            if ds["status"] != "imported":
                raise HTTPException(422, f"Dataset '{ds['name']}' is in stage '{ds['status']}' and requires explicit confirmation and import before analytics.")
            return _format_enterprise_row(dict(ds), company_name, legacy)
        if company_id == "comp-default" and legacy and legacy.get("dataset_id") == dataset_id:
            return {
                **legacy,
                "company_id": "comp-default",
                "company_name": company_name,
                "storage_mode": "legacy_snapshot",
                "capabilities": FULL_CAPABILITIES,
                "is_active": True,
            }
        raise HTTPException(404, "Requested dataset was not found in this workspace.")

    if company and company.get("active_dataset_id"):
        ds = conn.execute(
            sa.select(enterprise_datasets).where(enterprise_datasets.c.id == company["active_dataset_id"])
        ).mappings().first()
        if ds is not None and ds["company_id"] == company_id and ds["status"] == "imported":
            return _format_enterprise_row(dict(ds), company_name, legacy)

    if company_id == "comp-default" and legacy:
        return {
            **legacy,
            "company_id": "comp-default",
            "company_name": company_name,
            "storage_mode": "legacy_snapshot",
            "capabilities": FULL_CAPABILITIES,
            "is_active": True,
        }
    raise HTTPException(503, "Load a validated dataset first.")


def bounds(info, start=None, end=None):
    if not info.get("start") or not info.get("end"):
        raise HTTPException(
            422,
            "Active dataset does not yet contain dated financial transactions. Approve structured/financial records before requesting time-series KPIs.",
        )
    oldest, latest = date.fromisoformat(info["start"]), date.fromisoformat(info["end"])
    start, end = start or max(latest.replace(day=1),oldest), end or latest
    if start > end:
        raise HTTPException(422, "Start date must precede or equal end date.")
    if start < oldest or end > latest:
        raise HTTPException(422, f"Choose dates between {oldest} and {latest}.")
    return start, end


def approved_multimodal_insights(conn, info: dict, limit: int = 12) -> list[dict]:
    cid = info.get("company_id", "comp-default")
    q = (
        sa.select(tenant_multimodal_insights)
        .where(
            tenant_multimodal_insights.c.company_id == cid,
            tenant_multimodal_insights.c.validation_status == "approved",
        )
        .order_by(tenant_multimodal_insights.c.approved_at.desc())
        .limit(limit)
    )
    rows = conn.execute(q).mappings().all()
    return [
        {
            "id": r["id"],
            "dataset_id": r["dataset_id"],
            "source_file_id": r["source_file_id"],
            "modality": r["modality"],
            "entity_type": r["entity_type"],
            "insight_date": r["insight_date"].isoformat() if r.get("insight_date") else None,
            "title": r["title"],
            "summary_text": r["summary_text"],
            "metrics": r.get("metrics_json") or {},
            "source_location": r.get("source_location_json") or {},
            "confidence_score": r.get("confidence_score"),
            "extraction_method": r["extraction_method"],
            "approved_by": r["approved_by"],
            "approved_at": r["approved_at"].isoformat() if hasattr(r.get("approved_at"), "isoformat") else r.get("approved_at"),
        }
        for r in rows
    ]


def previous_period(start, end, calendar_aligned=False):
    prior_end = start - DAY
    if calendar_aligned and start.day == 1 and start.month == end.month:
        full_month = end.day == monthrange(end.year,end.month)[1]
        return prior_end.replace(day=1), prior_end if full_month else prior_end.replace(day=min(end.day,prior_end.day))
    return prior_end - (end-start), prior_end


def options(conn, info=None):
    if is_partitioned(info):
        cid, did = info["company_id"], info["dataset_id"]
        caps = _caps(info)
        product_rows = conn.execute(
            sa.select(tenant_products)
            .where(tenant_products.c.company_id == cid, tenant_products.c.dataset_id == did)
            .order_by(tenant_products.c.product_name)
        ).mappings().all()
        def unique_tx(column):
            return list(conn.scalars(
                sa.select(column).distinct().where(
                    tenant_transactions.c.company_id == cid,
                    tenant_transactions.c.dataset_id == did,
                ).order_by(column)
            ))
        m_channels = (
            list(conn.scalars(
                sa.select(tenant_marketing_daily.c.channel).distinct().where(
                    tenant_marketing_daily.c.company_id == cid,
                    tenant_marketing_daily.c.dataset_id == did,
                ).order_by(tenant_marketing_daily.c.channel)
            ))
            if caps.get("has_marketing")
            else []
        )
        return dict(
            products=[dict(p) for p in product_rows],
            categories=unique_tx(tenant_transactions.c.category),
            regions=unique_tx(tenant_transactions.c.region),
            channels=unique_tx(tenant_transactions.c.sales_channel),
            marketing_channels=m_channels,
            segments=unique_tx(tenant_transactions.c.customer_segment),
        )

    product_rows = conn.execute(sa.select(products).order_by(products.c.product_name)).mappings().all()
    def unique(column):
        return list(conn.scalars(sa.select(column).distinct().order_by(column)))
    return dict(products=[dict(p) for p in product_rows], categories=unique(products.c.category),
                regions=unique(sales.c.region), channels=unique(sales.c.sales_channel),
                marketing_channels=unique(marketing.c.channel), segments=unique(customers.c.customer_segment))


def conditions(start, end, filters, info=None):
    if is_partitioned(info):
        cid, did = info["company_id"], info["dataset_id"]
        tx = tenant_transactions.c
        clauses = [tx.company_id == cid, tx.dataset_id == did, tx.date.between(start, end)]
        columns = {
            "category": tx.category,
            "product": tx.product_id,
            "region": tx.region,
            "channel": tx.sales_channel,
            "segment": tx.customer_segment,
        }
        clauses.extend(columns[key] == value for key, value in filters.items() if value and key in columns)
        return clauses

    clauses = [sales.c.date.between(start, end)]
    columns = {"category": products.c.category, "product": sales.c.product_id, "region": sales.c.region,
               "channel": sales.c.sales_channel, "segment": customers.c.customer_segment}
    clauses.extend(columns[key] == value for key, value in filters.items() if value and key in columns)
    return clauses


def sales_total(conn, start, end, filters, info=None):
    if is_partitioned(info):
        cid, did = info["company_id"], info["dataset_id"]
        caps = _caps(info)
        tx = tenant_transactions.c
        clauses = conditions(start, end, filters, info)
        gp_expr = (
            sa.func.coalesce(sa.func.sum(tx.gross_profit), 0).label("gross_profit")
            if caps.get("has_cost_or_profit", True)
            else sa.literal(None).label("gross_profit")
        )
        row = dict(
            conn.execute(
                sa.select(
                    sa.func.coalesce(sa.func.sum(tx.revenue), 0).label("revenue"),
                    gp_expr,
                    sa.func.coalesce(sa.func.sum(tx.quantity), 0).label("units"),
                    sa.func.count().label("orders"),
                    sa.func.count(sa.distinct(tx.customer_id)).label("customers"),
                ).where(*clauses)
            ).mappings().one()
        )
        total = {
            "revenue": round(float(row["revenue"] or 0), 2),
            "gross_profit": round(float(row["gross_profit"] or 0), 2) if caps.get("has_cost_or_profit", True) else None,
            "units": int(row["units"] or 0),
            "orders": int(row["orders"] or 0),
        }
        if caps.get("has_customer", True):
            total["customers"] = int(row["customers"] or 0)
            first = (
                sa.select(tx.customer_id, sa.func.min(tx.date).label("first_day"))
                .where(tx.company_id == cid, tx.dataset_id == did)
                .group_by(tx.customer_id)
                .subquery()
            )
            new_cnt = conn.scalar(
                sa.select(sa.func.count(sa.distinct(tx.customer_id)))
                .select_from(tenant_transactions.join(first, first.c.customer_id == tx.customer_id))
                .where(first.c.first_day.between(start, end), *clauses)
            ) or 0
            total["new_customers"] = int(new_cnt)
            total["returning_customers"] = max(0, total["customers"] - total["new_customers"])
        else:
            total["customers"] = None
            total["new_customers"] = None
            total["returning_customers"] = None
        total["margin"] = ratio(total["gross_profit"], total["revenue"]) if total["gross_profit"] is not None else None
        total["aov"] = ratio(total["revenue"], total["orders"])
        return total

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


def trend(conn, start, end, filters, grain="daily", info=None):
    if is_partitioned(info):
        caps = _caps(info)
        has_gp = caps.get("has_cost_or_profit", True)
        tx = tenant_transactions.c
        q = (
            sa.select(
                tx.date,
                sa.func.sum(tx.revenue).label("revenue"),
                (sa.func.sum(tx.gross_profit).label("gross_profit") if has_gp else sa.literal(0.0).label("gross_profit")),
                sa.func.count().label("orders"),
                sa.func.sum(tx.quantity).label("units"),
            )
            .where(*conditions(start, end, filters, info))
            .group_by(tx.date)
        )
        values = {r["date"]: r for r in conn.execute(q).mappings()}
        output = {}
        for offset in range((end - start).days + 1):
            day = start + timedelta(days=offset)
            bucket = day if grain == "daily" else (day - DAY * day.weekday() if grain == "weekly" else day.replace(day=1))
            row = output.setdefault(
                bucket,
                dict(date=bucket.isoformat(), revenue=0.0, gross_profit=(0.0 if has_gp else None), orders=0, units=0),
            )
            if day in values:
                row["revenue"] = round(row["revenue"] + float(values[day]["revenue"] or 0), 2)
                if has_gp:
                    row["gross_profit"] = round((row["gross_profit"] or 0.0) + float(values[day]["gross_profit"] or 0), 2)
                row["orders"] += int(values[day]["orders"] or 0)
                row["units"] += int(values[day]["units"] or 0)
        return list(output.values())

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


def grouped(conn, start, end, filters, dimension, limit=None, info=None):
    if is_partitioned(info):
        caps = _caps(info)
        has_gp = caps.get("has_cost_or_profit", True)
        tx = tenant_transactions.c
        dimensions = {
            "product": tx.product_name,
            "category": tx.category,
            "region": tx.region,
            "channel": tx.sales_channel,
            "segment": tx.customer_segment,
            "marketing": sa.func.coalesce(tx.marketing_channel, tx.sales_channel, "Unattributed"),
        }
        name = dimensions[dimension]
        q = (
            sa.select(
                name.label("name"),
                sa.func.sum(tx.revenue).label("revenue"),
                (sa.func.sum(tx.gross_profit).label("gross_profit") if has_gp else sa.literal(None).label("gross_profit")),
                sa.func.count().label("orders"),
                sa.func.sum(tx.quantity).label("units"),
            )
            .where(*conditions(start, end, filters, info))
            .group_by(name)
            .order_by(sa.desc("revenue"), name)
        )
        rows = conn.execute(q.limit(limit) if limit else q).mappings()
        return [
            {
                "name": str(row["name"]),
                "revenue": round(float(row["revenue"] or 0), 2),
                "gross_profit": round(float(row["gross_profit"] or 0), 2) if has_gp else None,
                "orders": int(row["orders"] or 0),
                "units": int(row["units"] or 0),
            }
            for row in rows
        ]

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


def marketing_summary(conn, start, end, channel=None, info=None):
    if is_partitioned(info):
        caps = _caps(info)
        if not caps.get("has_marketing"):
            empty_total = dict(spend=None, orders=0, leads=0, attributed_revenue=0.0, acquisitions=0,
                               roas=None, conversion=None, cac=None)
            return empty_total, []
        cid, did = info["company_id"], info["dataset_id"]
        c = tenant_marketing_daily.c
        cols = ("spend", "orders", "leads", "attributed_revenue")
        q = sa.select(c.channel.label("name"), *(sa.func.sum(c[key]).label(key) for key in cols)).where(
            c.company_id == cid, c.dataset_id == did, c.date.between(start, end)
        )
        if channel:
            q = q.where(c.channel == channel)
        rows = []
        for r in conn.execute(q.group_by(c.channel).order_by(c.channel)).mappings():
            spend = round(float(r["spend"] or 0), 2)
            attr_rev = round(float(r["attributed_revenue"] or 0), 2)
            orders = int(r["orders"] or 0)
            leads = int(r["leads"] or 0)
            rows.append({
                "name": str(r["name"]),
                "spend": spend,
                "attributed_revenue": attr_rev,
                "orders": orders,
                "leads": leads,
                "roas": ratio(attr_rev, spend),
                "conversion": ratio(orders, leads) if leads > 0 else None,
                "acquisitions": orders,
                "cac": ratio(spend, orders) if orders > 0 else None,
            })
        total = {
            "spend": round(sum(r["spend"] for r in rows), 2),
            "attributed_revenue": round(sum(r["attributed_revenue"] for r in rows), 2),
            "orders": sum(r["orders"] for r in rows),
            "leads": sum(r["leads"] for r in rows),
            "acquisitions": sum(r["acquisitions"] for r in rows),
        }
        total.update(
            roas=ratio(total["attributed_revenue"], total["spend"]),
            conversion=ratio(total["orders"], total["leads"]) if total["leads"] > 0 else None,
            cac=ratio(total["spend"], total["acquisitions"]) if total["acquisitions"] > 0 else None,
        )
        return total, rows

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


def availability(conn, start, end, filters, info=None):
    if is_partitioned(info):
        caps = _caps(info)
        if not caps.get("has_inventory"):
            return None
        cid, did = info["company_id"], info["dataset_id"]
        c = tenant_inventory_daily.c
        q = sa.select(
            sa.func.count(),
            sa.func.sum(sa.case((c.stockout_flag, 0), else_=1)),
        ).select_from(
            tenant_inventory_daily.join(
                tenant_products,
                sa.and_(
                    tenant_inventory_daily.c.company_id == tenant_products.c.company_id,
                    tenant_inventory_daily.c.dataset_id == tenant_products.c.dataset_id,
                    tenant_inventory_daily.c.product_id == tenant_products.c.product_id,
                ),
            )
        ).where(c.company_id == cid, c.dataset_id == did, c.date.between(start, end))
        if filters.get("category"):
            q = q.where(tenant_products.c.category == filters["category"])
        if filters.get("product"):
            q = q.where(c.product_id == filters["product"])
        total, available = conn.execute(q).one()
        return ratio(available, total)

    c = inventory.c
    q = sa.select(sa.func.count(), sa.func.sum(sa.case((c.stockout_flag, 0), else_=1))).select_from(
        inventory.join(products)).where(c.date.between(start,end))
    if filters.get("category"):
        q = q.where(products.c.category == filters["category"])
    if filters.get("product"):
        q = q.where(c.product_id == filters["product"])
    total, available = conn.execute(q).one()
    return ratio(available, total)
