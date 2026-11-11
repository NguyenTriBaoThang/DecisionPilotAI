"""Baseline snapshot computation, Data Readiness scoring, and typed bounded variable catalog."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
import os
from typing import Any
from uuid import uuid4

import sqlalchemy as sa

from backend.app import services
from backend.app.analytics import (
    FULL_CAPABILITIES,
    availability,
    dataset_info,
    grouped,
    is_partitioned,
    marketing_summary,
    options,
    ratio,
    sales_total,
)
from backend.app.db import (
    companies,
    customers,
    data_sources,
    dataset_quality_reports,
    enterprise_datasets,
    inventory,
    multimodal_files,
    products,
    rag_documents,
    tenant_customers,
    tenant_inventory_daily,
    tenant_products,
    twin_scenario_variables,
    twin_scenarios,
)
from backend.app.simulator.topology import (
    EDGE_DEFINITIONS,
    NODE_DEFINITIONS,
    ZONE_DEFINITIONS,
    build_honest_ai_inventory,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()
    if isinstance(dt, date):
        return dt.isoformat()
    return str(dt)


def compute_data_readiness(
    conn: sa.Connection,
    *,
    company_id: str,
    info: dict[str, Any] | None,
) -> dict[str, Any]:
    """Compute ingestion readiness separately from forecast accuracy."""
    if not info:
        return {
            "score": 0.0,
            "tier": "not_ready",
            "days_observed": 0,
            "quality_score": None,
            "missing_capabilities": list(FULL_CAPABILITIES.keys()),
            "supported_scenarios": [],
            "unsupported_reasons": ["No validated/imported dataset in active company workspace."],
            "checks": [],
            "disclaimer": "Data Readiness Score measures structural validation & schema coverage only. It does NOT represent forecast accuracy.",
        }

    caps = info.get("capabilities") or FULL_CAPABILITIES
    dec = is_partitioned(info)
    start_s, end_s = info.get("start"), info.get("end")
    days_observed = 0
    if start_s and end_s:
        days_observed = max(1, (date.fromisoformat(end_s) - date.fromisoformat(start_s)).days + 1)

    qr = conn.execute(
        sa.select(dataset_quality_reports)
        .where(
            dataset_quality_reports.c.company_id == company_id,
            dataset_quality_reports.c.dataset_id == info["dataset_id"],
        )
        .order_by(dataset_quality_reports.c.created_at.desc())
        .limit(1)
    ).mappings().first()

    if qr:
        quality_score = float(qr["overall_score"])
        dims = {
            "completeness": float(qr["completeness_score"]),
            "validity": float(qr["validity_score"]),
            "consistency": float(qr["consistency_score"]),
            "uniqueness": float(qr["uniqueness_score"]),
            "accuracy": float(qr["accuracy_score"]),
        }
        invalid_rows = int(qr["invalid_rows"] or 0)
        missing_values = int(qr["missing_values_count"] or 0)
        duplicate_records = int(qr["duplicate_records_count"] or 0)
    else:
        quality_score = float(info.get("quality_score")) if info.get("quality_score") is not None else 100.0
        dims = {"completeness": 100.0, "validity": 100.0, "consistency": 100.0, "uniqueness": 100.0, "accuracy": 100.0}
        invalid_rows = 0
        missing_values = 0
        duplicate_records = 0

    cap_flags = [
        ("date_coverage", bool(start_s and end_s), "Date column mapped"),
        ("revenue", bool(caps.get("has_revenue", True)), "Revenue column mapped"),
        ("product", bool(caps.get("has_product", True)), "Product / SKU column mapped"),
        ("cost_or_profit", bool(caps.get("has_cost_or_profit", True)), "Direct Cost or Profit mapped"),
        ("customer", bool(caps.get("has_customer", True)), "Customer identifier mapped"),
        ("marketing", bool(caps.get("has_marketing", True)), "Marketing Spend / Campaigns mapped"),
        ("inventory", bool(caps.get("has_inventory", True)), "Inventory stock levels mapped"),
    ]
    cap_ratio = sum(1 for _, ok, _ in cap_flags if ok) / len(cap_flags)
    horizon_score = 100.0 if days_observed >= 201 else (75.0 if days_observed >= 28 else (50.0 if days_observed >= 7 else 15.0))
    readiness = round(0.55 * quality_score + 0.30 * (cap_ratio * 100.0) + 0.15 * horizon_score, 1)
    tier = "high" if readiness >= 80 else ("moderate" if readiness >= 55 else "low")

    missing_caps = [name for name, ok, _ in cap_flags if not ok]
    supported = ["baseline", "custom"]
    unsupported_reasons: list[str] = []

    if caps.get("has_revenue", True) and days_observed >= 1:
        supported.extend(["revenue_growth"])
    if caps.get("has_product", True) and caps.get("has_revenue", True) and days_observed >= 7:
        supported.append("pricing_strategy")
    else:
        unsupported_reasons.append("Pricing strategy needs mapped Product SKU + Revenue + >=7 historical days.")

    if caps.get("has_marketing", True):
        supported.append("marketing_optimization")
    else:
        unsupported_reasons.append("Marketing optimization requires mapped Marketing Spend data (or explicit user assumption).")

    if caps.get("has_inventory", True) and caps.get("has_product", True) and days_observed >= 7:
        supported.extend(["inventory_optimization", "supply_chain_disruption"])
    else:
        unsupported_reasons.append("Inventory & Supply Chain disruption scenarios require mapped Inventory & Product SKU + >=7d history.")

    if caps.get("has_cost_or_profit", True):
        supported.append("cost_reduction")
    else:
        unsupported_reasons.append("Direct COGS/Profit column not mapped; Cost Reduction needs explicit Cost/Opex user input.")

    # Customer retention is flagged as sensitivity heuristic (no trained classifier in system)
    if caps.get("has_customer", True):
        supported.append("customer_retention")
    unsupported_reasons.append(
        "Churn/Retention Classification model is NOT integrated; customer retention scenarios use deterministic cohort sensitivity only."
    )

    checks = [
        {"name": label_text, "passed": ok, "category": "schema"}
        for _, ok, label_text in cap_flags
    ]
    checks.append({
        "name": f"Historical window ({days_observed} days observed; >=201d needed for full LightGBM)",
        "passed": days_observed >= 7,
        "category": "timeseries",
    })
    checks.append({
        "name": f"Validation quality ({quality_score:.1f}% overall · {invalid_rows} invalid / {duplicate_records} duplicates)",
        "passed": quality_score >= 60.0,
        "category": "quality",
    })

    return {
        "score": readiness,
        "tier": tier,
        "days_observed": days_observed,
        "quality_score": quality_score,
        "quality_dimensions": dims,
        "invalid_rows": invalid_rows,
        "missing_values": missing_values,
        "duplicate_records": duplicate_records,
        "missing_capabilities": missing_caps,
        "supported_scenarios": sorted(set(supported)),
        "unsupported_reasons": unsupported_reasons,
        "checks": checks,
        "storage_mode": info.get("storage_mode", "legacy_snapshot") if not dec else "partitioned",
        "disclaimer": (
            "Data Readiness Score measures ingestion completeness, schema coverage, and validation quality only. "
            "It is NOT a guarantee or measure of AI forecast accuracy."
        ),
    }


def compute_baseline_snapshot(
    conn: sa.Connection,
    *,
    company_id: str,
    info: dict[str, Any],
    horizon_days: int = 30,
) -> dict[str, Any]:
    """Compute truthful zone-by-zone observed baseline metrics using real SQL Analytics."""
    dec = is_partitioned(info)
    caps = info.get("capabilities") or FULL_CAPABILITIES
    currency = info.get("currency") or "VND"
    end_d = date.fromisoformat(info["end"])
    oldest_d = date.fromisoformat(info["start"])
    window_days = min(horizon_days, (end_d - oldest_d).days + 1)
    start_d = max(oldest_d, end_d - timedelta(days=window_days - 1))
    scale_to_horizon = float(horizon_days) / float(max(1, (end_d - start_d).days + 1))

    sales_tot = sales_total(conn, start_d, end_d, {}, info=info)
    opts = options(conn, info=info)
    prods = opts.get("products") or []
    physical_prods = [p for p in prods if p.get("is_physical", True) and p.get("current_stock") is not None]

    # Prorated to selected horizon when dataset span < horizon
    base_orders = round(float(sales_tot.get("orders") or 0) * scale_to_horizon, 2)
    base_units = round(float(sales_tot.get("units") or 0) * scale_to_horizon, 2)
    base_revenue = round(float(sales_tot.get("revenue") or 0) * scale_to_horizon, 2)
    has_gp = sales_tot.get("gross_profit") is not None
    base_gp = round(float(sales_tot["gross_profit"]) * scale_to_horizon, 2) if has_gp else None
    base_cogs = round(base_revenue - base_gp, 2) if (has_gp and base_gp is not None) else None
    base_margin = sales_tot.get("margin")
    avg_unit_price = round(base_revenue / base_units, 2) if base_units > 0 else (
        float(prods[0]["list_price"]) if prods else None
    )

    # Marketing zone
    mkt_totals, mkt_channels = (
        marketing_summary(conn, start_d, end_d, info=info)
        if caps.get("has_marketing", True)
        else ({"spend": None, "roas": None, "conversion": None, "cac": None, "attributed_revenue": None, "leads": 0, "orders": 0, "acquisitions": 0}, [])
    )
    mkt_spend = round(float(mkt_totals["spend"]) * scale_to_horizon, 2) if mkt_totals.get("spend") is not None else None

    # Inventory & Supply Chain zone
    inv_avail = availability(conn, start_d, end_d, {}, info=info) if caps.get("has_inventory", True) else None
    if physical_prods:
        total_stock = int(sum(int(p.get("current_stock") or 0) for p in physical_prods))
        avg_reorder = round(sum(float(p.get("reorder_point") or 0) for p in physical_prods) / len(physical_prods), 1)
        avg_lead_time = round(sum(float(p.get("lead_time_days") or 7) for p in physical_prods) / len(physical_prods), 1)
        low_stock_skus = sum(
            1 for p in physical_prods if int(p.get("current_stock") or 0) <= int(p.get("reorder_point") or 0)
        )
        stockout_sku_days = int(
            conn.scalar(
                sa.select(sa.func.count()).select_from(
                    tenant_inventory_daily if dec else inventory
                ).where(
                    *(
                        [
                            tenant_inventory_daily.c.company_id == info["company_id"],
                            tenant_inventory_daily.c.dataset_id == info["dataset_id"],
                            tenant_inventory_daily.c.stockout_flag.is_(True),
                            tenant_inventory_daily.c.date.between(start_d, end_d),
                        ]
                        if dec
                        else [inventory.c.stockout_flag.is_(True), inventory.c.date.between(start_d, end_d)]
                    )
                )
            )
            or 0
        )
    else:
        total_stock = None
        avg_reorder = None
        avg_lead_time = None
        low_stock_skus = None
        stockout_sku_days = None

    # Customer zone (strictly from SQL Analytics or customer table)
    if caps.get("has_customer", True):
        cust_count = sales_tot.get("customers")
        new_cust = sales_tot.get("new_customers")
        ret_cust = sales_tot.get("returning_customers")
        observed_ret_ratio = ratio(ret_cust, cust_count)
        if dec:
            avg_ltv = conn.scalar(
                sa.select(sa.func.avg(tenant_customers.c.lifetime_value)).where(
                    tenant_customers.c.company_id == info["company_id"],
                    tenant_customers.c.dataset_id == info["dataset_id"],
                )
            )
        else:
            avg_ltv = conn.scalar(sa.select(sa.func.avg(customers.c.lifetime_value)))
        avg_ltv = round(float(avg_ltv), 2) if avg_ltv is not None else None
    else:
        cust_count = new_cust = ret_cust = observed_ret_ratio = avg_ltv = None

    # Default focus product & marketing channel
    default_prod = None
    if prods:
        top_prod_rows = grouped(conn, start_d, end_d, {}, "product", 3, info=info)
        if top_prod_rows:
            top_name = top_prod_rows[0]["name"]
            default_prod = next((p for p in prods if p["product_name"] == top_name), prods[0])
        else:
            default_prod = prods[0]
    default_channel = mkt_channels[0]["name"] if mkt_channels else (opts["marketing_channels"][0] if opts.get("marketing_channels") else None)

    bundle = services.artifact(info)
    days_total = max(1, (end_d - oldest_d).days + 1)
    short_window = bool(bundle and any(
        entry.get("report", {}).get("short_window_fallback")
        for t_info in (bundle.get("forecast") or {}).values()
        for entry in (t_info.get("series") or {}).values()
    ))
    rag_cnt = int(
        conn.scalar(
            sa.select(sa.func.count()).select_from(rag_documents).where(rag_documents.c.company_id == company_id)
        )
        or 0
    )
    ai_inventory = build_honest_ai_inventory(
        has_artifact=bool(bundle),
        model_version=bundle["version"] if bundle else None,
        short_window=short_window,
        days_count=days_total,
        rag_doc_count=rag_cnt,
        llm_provider=os.getenv("LLM_PROVIDER", "none").strip().lower(),
        capabilities=caps,
    )

    zones: dict[str, dict[str, Any]] = {
        "marketing": {
            "zone_id": "marketing",
            "supported": bool(caps.get("has_marketing", True)),
            "metrics": {
                "marketing_budget": mkt_spend,
                "active_channels": len(mkt_channels),
                "conversion_rate": mkt_totals.get("conversion"),
                "roas": mkt_totals.get("roas"),
                "cac": mkt_totals.get("cac"),
                "customer_acquisitions": mkt_totals.get("acquisitions"),
            },
            "channels": mkt_channels,
            "missing_reason": None if caps.get("has_marketing", True) else "No Marketing Spend column mapped in active dataset.",
        },
        "customers": {
            "zone_id": "customers",
            "supported": bool(caps.get("has_customer", True)),
            "metrics": {
                "active_customers": cust_count,
                "new_customers": new_cust,
                "returning_customers": ret_cust,
                "returning_share": observed_ret_ratio,
                "avg_lifetime_value": avg_ltv,
                "churn_risk_model": "Not Integrated (Classification model unavailable)",
            },
            "segments": grouped(conn, start_d, end_d, {}, "segment", 6, info=info) if caps.get("has_customer", True) else [],
            "missing_reason": None if caps.get("has_customer", True) else "Customer identifier not mapped in active dataset.",
        },
        "sales": {
            "zone_id": "sales",
            "supported": bool(caps.get("has_revenue", True)),
            "metrics": {
                "orders": base_orders,
                "units_sold": base_units,
                "revenue": base_revenue,
                "avg_unit_price": avg_unit_price,
                "aov": sales_tot.get("aov"),
                "top_products": grouped(conn, start_d, end_d, {}, "product", 5, info=info),
                "sales_channels": grouped(conn, start_d, end_d, {}, "channel", 5, info=info),
            },
            "missing_reason": None,
        },
        "inventory": {
            "zone_id": "inventory",
            "supported": bool(caps.get("has_inventory", True)) and bool(physical_prods),
            "metrics": {
                "total_stock_on_hand": total_stock,
                "avg_reorder_point": avg_reorder,
                "availability_rate": inv_avail,
                "low_stock_skus": low_stock_skus,
                "recent_stockout_sku_days": stockout_sku_days,
                "physical_sku_count": len(physical_prods),
                "skus": [
                    {
                        "product_id": p["product_id"],
                        "product_name": p["product_name"],
                        "current_stock": p.get("current_stock"),
                        "reorder_point": p.get("reorder_point"),
                        "lead_time_days": p.get("lead_time_days"),
                    }
                    for p in physical_prods[:12]
                ],
            },
            "missing_reason": None if (caps.get("has_inventory", True) and physical_prods) else "No physical inventory levels mapped in active dataset.",
        },
        "supply_chain": {
            "zone_id": "supply_chain",
            "supported": bool(caps.get("has_inventory", True)) and bool(physical_prods),
            "metrics": {
                "supplier_count": len({p.get("supplier") for p in prods if p.get("supplier")}),
                "avg_lead_time_days": avg_lead_time,
                "disruption_factor_pct": 0.0,
                "supply_capacity_pct": 100.0,
            },
            "missing_reason": None if physical_prods else "Supplier lead times require tracked physical product catalog.",
        },
        "finance_ops": {
            "zone_id": "finance_ops",
            "supported": bool(caps.get("has_cost_or_profit", True)),
            "metrics": {
                "revenue": base_revenue,
                "direct_cogs": base_cogs,
                "gross_profit": base_gp,
                "gross_margin": base_margin,
                "operating_expenses": None,
                "cash_flow": None,
            },
            "missing_reason": (
                "Operating Expenses & Cash Flow are not present in transaction columns — enter explicit Finance assumptions in Cost Reduction or Custom scenarios."
                if caps.get("has_cost_or_profit", True)
                else "Direct Cost / Profit columns not mapped in dataset; gross profit and operating costs require explicit input."
            ),
        },
        "ai_engine": {
            "zone_id": "ai_engine",
            "supported": True,
            "metrics": {
                "integrated_count": sum(1 for m in ai_inventory if m["status"] == "integrated"),
                "degraded_or_partial_count": sum(1 for m in ai_inventory if m["status"] in {"degraded", "partial"}),
                "not_integrated_count": sum(1 for m in ai_inventory if m["status"] == "not_integrated"),
                "model_version": bundle["version"] if bundle else None,
            },
            "models": ai_inventory,
        },
        "outcomes": {
            "zone_id": "outcomes",
            "supported": True,
            "metrics": {
                "horizon_days": horizon_days,
                "window_start": str(start_d),
                "window_end": str(end_d),
                "scale_factor": round(scale_to_horizon, 3),
                "currency": currency,
            },
        },
    }

    return {
        "company_id": company_id,
        "dataset_id": info["dataset_id"],
        "dataset_title": info["title"],
        "currency": currency,
        "horizon_days": horizon_days,
        "window_start": str(start_d),
        "window_end": str(end_d),
        "default_product": default_prod,
        "default_channel": default_channel,
        "zones": zones,
        "ai_models": ai_inventory,
        "options": opts,
    }


def build_variable_catalog(
    *,
    scenario_type: str,
    baseline: dict[str, Any],
    overrides: dict[str, float | None] | None = None,
) -> list[dict[str, Any]]:
    """Build strictly typed, bounded variables anchored to observed baseline (never faked defaults)."""
    overrides = overrides or {}
    z = baseline["zones"]
    mkt = z["marketing"]["metrics"]
    cust = z["customers"]["metrics"]
    sales = z["sales"]["metrics"]
    inv = z["inventory"]["metrics"]
    sc = z["supply_chain"]["metrics"]
    fin = z["finance_ops"]["metrics"]
    def_prod = baseline.get("default_product") or {}

    base_mkt_budget = mkt.get("marketing_budget")
    has_mkt = z["marketing"]["supported"] and base_mkt_budget is not None
    base_conv = mkt.get("conversion_rate")
    base_price = float(def_prod["list_price"]) if def_prod.get("list_price") else sales.get("avg_unit_price")
    base_elast = float(def_prod["elasticity"]) if def_prod.get("elasticity") is not None else None
    has_inv = z["inventory"]["supported"]
    base_inv_lvl = float(def_prod["current_stock"]) if def_prod.get("current_stock") is not None else inv.get("total_stock_on_hand")
    base_reorder = float(def_prod["reorder_point"]) if def_prod.get("reorder_point") is not None else inv.get("avg_reorder_point")
    base_lt = float(def_prod["lead_time_days"]) if def_prod.get("lead_time_days") is not None else sc.get("avg_lead_time_days")
    has_cust = z["customers"]["supported"]
    base_ret_pct = round(float(cust["returning_share"]) * 100.0, 2) if cust.get("returning_share") is not None else None
    has_cost = z["finance_ops"]["supported"] and fin.get("direct_cogs") is not None
    base_margin_pct = round(float(fin["gross_margin"]) * 100.0, 2) if fin.get("gross_margin") is not None else None

    all_vars: list[dict[str, Any]] = [
        # Marketing
        {
            "domain": "marketing",
            "variable_name": "marketing_budget_change_pct",
            "label": "Marketing Budget Change",
            "baseline_value": 0.0 if has_mkt else None,
            "scenario_value": (15.0 if scenario_type in {"revenue_growth", "marketing_optimization"} else 0.0) if has_mkt else None,
            "unit": "%",
            "min_value": -80.0,
            "max_value": 200.0,
            "validation_rule": "Between -80% and +200% relative to 28d prorated ad spend",
            "source_or_assumption": (
                f"SQL tenant/marketing spend baseline ({base_mkt_budget:,.0f} {baseline['currency']})"
                if has_mkt else "Unsupported: no Marketing Spend column mapped (enter assumption only if modeling hypothetically)"
            ),
            "supported": has_mkt,
            "metadata": {"baseline_absolute_spend": base_mkt_budget, "channel": baseline.get("default_channel")},
        },
        {
            "domain": "marketing",
            "variable_name": "response_exponent",
            "label": "Marketing Diminishing Returns Exponent (alpha)",
            "baseline_value": 0.65 if has_mkt else None,
            "scenario_value": 0.65 if has_mkt else None,
            "unit": "ratio",
            "min_value": 0.2,
            "max_value": 0.95,
            "validation_rule": "Concave attribution curve exponent in [0.20, 0.95]",
            "source_or_assumption": "Scenario Engine concave attribution model (not causal incrementality)",
            "supported": has_mkt,
            "metadata": {},
        },
        {
            "domain": "marketing",
            "variable_name": "campaign_duration_days",
            "label": "Campaign Duration",
            "baseline_value": float(baseline["horizon_days"]),
            "scenario_value": float(baseline["horizon_days"]),
            "unit": "days",
            "min_value": 7.0,
            "max_value": 90.0,
            "validation_rule": "7 to 90 days aligned with simulation horizon",
            "source_or_assumption": "Simulation horizon configuration",
            "supported": True,
            "metadata": {},
        },
        {
            "domain": "marketing",
            "variable_name": "conversion_rate_assumption_pct",
            "label": "Funnel Conversion Rate Assumption",
            "baseline_value": round(min(100.0, max(0.0, float(base_conv) * 100.0)), 2) if base_conv is not None else None,
            "scenario_value": round(min(100.0, max(0.0, float(base_conv) * 100.0)), 2) if base_conv is not None else None,
            "unit": "%",
            "min_value": 0.0,
            "max_value": 100.0,
            "validation_rule": "Funnel order/lead conversion percentage [0.0%, 100%]",
            "source_or_assumption": (
                "Observed attributed orders / campaign leads"
                if base_conv is not None else "No marketing lead funnel data in dataset"
            ),
            "supported": base_conv is not None,
            "metadata": {},
        },
        # Pricing & Sales
        {
            "domain": "pricing",
            "variable_name": "discount_rate_pct",
            "label": "Price Discount Rate",
            "baseline_value": 0.0,
            "scenario_value": (5.0 if scenario_type == "pricing_strategy" else (2.0 if scenario_type == "revenue_growth" else 0.0)),
            "unit": "%",
            "min_value": -30.0,
            "max_value": 50.0,
            "validation_rule": "-30% (price hike) to +50% (list discount)",
            "source_or_assumption": (
                f"Product list/realized price baseline ({base_price:,.0f} {baseline['currency']})"
                if base_price is not None else "Realized average price baseline"
            ),
            "supported": base_price is not None,
            "metadata": {"baseline_unit_price": base_price, "product_id": def_prod.get("product_id")},
        },
        {
            "domain": "pricing",
            "variable_name": "price_elasticity",
            "label": "Price Elasticity Assumption",
            "baseline_value": base_elast if base_elast is not None else -1.0,
            "scenario_value": base_elast if base_elast is not None else -1.0,
            "unit": "elasticity",
            "min_value": -5.0,
            "max_value": 0.0,
            "validation_rule": "Elasticity between -5.0 and 0.0",
            "source_or_assumption": (
                f"Catalog SKU assumption ({def_prod.get('product_name')})"
                if base_elast is not None else "Default linear elasticity (-1.0) sensitivity assumption"
            ),
            "supported": True,
            "metadata": {},
        },
        {
            "domain": "sales",
            "variable_name": "demand_growth_pct",
            "label": "Exogenous Demand Growth Assumption",
            "baseline_value": 0.0,
            "scenario_value": (8.0 if scenario_type == "revenue_growth" else 0.0),
            "unit": "%",
            "min_value": -60.0,
            "max_value": 150.0,
            "validation_rule": "Demand shift percentage [-60%, +150%] on top of LightGBM / baseline forecast",
            "source_or_assumption": "User demand sensitivity overlay over LightGBM baseline",
            "supported": True,
            "metadata": {"baseline_orders": sales.get("orders"), "baseline_units": sales.get("units")},
        },
        # Inventory & Supply Chain
        {
            "domain": "inventory",
            "variable_name": "safety_stock_units",
            "label": "Safety Stock Target",
            "baseline_value": base_reorder if has_inv else None,
            "scenario_value": (round(float(base_reorder) * 1.15) if (has_inv and base_reorder is not None and scenario_type == "inventory_optimization") else base_reorder) if has_inv else None,
            "unit": "units",
            "min_value": 0.0,
            "max_value": 1_000_000.0,
            "validation_rule": "Non-negative integer/unit safety buffer",
            "source_or_assumption": (
                f"Product catalog reorder point ({def_prod.get('product_name', 'SKU mean')})"
                if has_inv else "Unsupported: no physical Inventory column mapped"
            ),
            "supported": has_inv,
            "metadata": {"current_stock": base_inv_lvl},
        },
        {
            "domain": "inventory",
            "variable_name": "replenishment_qty_units",
            "label": "Planned Reorder Quantity",
            "baseline_value": 0.0 if has_inv else None,
            "scenario_value": (round(float(base_reorder or 50) * 1.5) if (has_inv and scenario_type == "inventory_optimization") else (0.0 if has_inv else None)),
            "unit": "units",
            "min_value": 0.0,
            "max_value": 1_000_000.0,
            "validation_rule": "0 to 1,000,000 units scheduled after lead time",
            "source_or_assumption": "Lead-time replenishment order arrival input" if has_inv else "Unsupported: Inventory not mapped",
            "supported": has_inv,
            "metadata": {},
        },
        {
            "domain": "supply_chain",
            "variable_name": "supplier_lead_time_days",
            "label": "Supplier Lead Time",
            "baseline_value": base_lt if has_inv else None,
            "scenario_value": (float(base_lt or 7) + (5.0 if scenario_type == "supply_chain_disruption" else 0.0)) if has_inv else None,
            "unit": "days",
            "min_value": 1.0,
            "max_value": 90.0,
            "validation_rule": "1 to 90 calendar days until PO arrival",
            "source_or_assumption": "Product catalog supplier lead time" if has_inv else "Unsupported: Inventory/Supply Chain not mapped",
            "supported": has_inv,
            "metadata": {},
        },
        {
            "domain": "supply_chain",
            "variable_name": "supply_capacity_pct",
            "label": "Inbound Supply Capacity Factor",
            "baseline_value": 100.0 if has_inv else None,
            "scenario_value": (70.0 if scenario_type == "supply_chain_disruption" else 100.0) if has_inv else None,
            "unit": "%",
            "min_value": 0.0,
            "max_value": 150.0,
            "validation_rule": "0% (total halt) to 150% expanded inbound fulfillment",
            "source_or_assumption": "Operator supply disruption assumption (baseline 100%)",
            "supported": has_inv,
            "metadata": {},
        },
        # Finance
        {
            "domain": "finance",
            "variable_name": "direct_cogs_reduction_pct",
            "label": "Direct COGS Efficiency Shift",
            "baseline_value": 0.0 if has_cost else None,
            "scenario_value": (6.0 if scenario_type == "cost_reduction" else 0.0) if has_cost else None,
            "unit": "%",
            "min_value": -50.0,
            "max_value": 50.0,
            "validation_rule": "-50% (cost inflation) to +50% (COGS savings)",
            "source_or_assumption": (
                f"Observed transaction COGS ({fin.get('direct_cogs'):,.0f} {baseline['currency']})"
                if has_cost else "Unsupported: no Cost or Profit column mapped"
            ),
            "supported": has_cost,
            "metadata": {},
        },
        {
            "domain": "finance",
            "variable_name": "operating_cost_assumption",
            "label": "Fixed Operating Overhead (Manual Input)",
            "baseline_value": None,
            "scenario_value": None,
            "unit": baseline["currency"],
            "min_value": 0.0,
            "max_value": 1_000_000_000_000.0,
            "validation_rule": "Requires explicit positive operator baseline + scenario input (not in transactions)",
            "source_or_assumption": "Requires Operator Assumption — Operating Expenses not mapped in dataset",
            "supported": False,
            "metadata": {"requires_operator_assumption": True},
        },
        {
            "domain": "finance",
            "variable_name": "target_margin_pct",
            "label": "Target Gross Margin Guardrail",
            "baseline_value": round(min(100.0, max(-100.0, float(base_margin_pct))), 2) if (has_cost and base_margin_pct is not None) else None,
            "scenario_value": round(min(100.0, max(-100.0, float(base_margin_pct))), 2) if (has_cost and base_margin_pct is not None) else None,
            "unit": "%",
            "min_value": -100.0,
            "max_value": 100.0,
            "validation_rule": "Target margin constraint between -100% and 100%",
            "source_or_assumption": "Observed period Gross Profit / Revenue" if has_cost else "No Cost/Profit column mapped",
            "supported": has_cost,
            "metadata": {},
        },
        # Customers (explicitly transparent about missing ML Classifier!)
        {
            "domain": "customers",
            "variable_name": "retention_rate_shift_pct",
            "label": "Returning Cohort Retention Shift (Sensitivity Only)",
            "baseline_value": base_ret_pct if has_cust else None,
            "scenario_value": (min(98.0, float(base_ret_pct or 50.0) + 4.0) if scenario_type == "customer_retention" else base_ret_pct) if has_cust else None,
            "unit": "%",
            "min_value": 0.0,
            "max_value": 100.0,
            "validation_rule": "Cohort retention share assumption [0%, 100%] — sensitivity heuristic only",
            "source_or_assumption": (
                "Observed returning-customer share via SQL; Classification ML model is NOT integrated"
                if has_cust else "Unsupported: no Customer column mapped"
            ),
            "supported": has_cust,
            "metadata": {"model_status": "sensitivity_heuristic_no_classifier"},
        },
    ]

    relevant_by_type: dict[str, set[str]] = {
        "baseline": set(),
        "revenue_growth": {
            "marketing_budget_change_pct", "response_exponent", "discount_rate_pct", "price_elasticity",
            "demand_growth_pct", "safety_stock_units", "target_margin_pct",
        },
        "marketing_optimization": {
            "marketing_budget_change_pct", "response_exponent", "campaign_duration_days", "conversion_rate_assumption_pct",
        },
        "pricing_strategy": {
            "discount_rate_pct", "price_elasticity", "target_margin_pct", "safety_stock_units",
        },
        "inventory_optimization": {
            "safety_stock_units", "replenishment_qty_units", "supplier_lead_time_days", "demand_growth_pct",
        },
        "supply_chain_disruption": {
            "supplier_lead_time_days", "supply_capacity_pct", "replenishment_qty_units", "safety_stock_units",
        },
        "customer_retention": {
            "retention_rate_shift_pct", "demand_growth_pct", "marketing_budget_change_pct",
        },
        "cost_reduction": {
            "direct_cogs_reduction_pct", "operating_cost_assumption", "target_margin_pct",
        },
        "custom": {v["variable_name"] for v in all_vars},
    }

    keep_names = relevant_by_type.get(scenario_type, relevant_by_type["custom"])
    result: list[dict[str, Any]] = []
    for item in all_vars:
        if scenario_type != "baseline" and item["variable_name"] not in keep_names:
            continue
        cloned = dict(item)
        if scenario_type == "baseline":
            cloned["scenario_value"] = cloned["baseline_value"]
        if cloned["variable_name"] in overrides and overrides[cloned["variable_name"]] is not None:
            val = float(overrides[cloned["variable_name"]])
            cloned["scenario_value"] = val
            cloned["source_or_assumption"] = "Operator Assumption (custom scenario value)"
            if cloned["baseline_value"] is None and not cloned["supported"]:
                cloned["supported"] = True
        result.append(cloned)
    return result


def get_or_create_baseline_scenario(
    engine: sa.Engine,
    *,
    company_id: str,
    info: dict[str, Any],
    actor: str = "system",
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Ensure a canonical Baseline Scenario row exists for (company_id, dataset_id)."""
    ds_id = info["dataset_id"]
    with engine.begin() as conn:
        existing = conn.execute(
            sa.select(twin_scenarios)
            .where(
                twin_scenarios.c.company_id == company_id,
                twin_scenarios.c.dataset_id == ds_id,
                twin_scenarios.c.is_baseline.is_(True),
            )
            .order_by(twin_scenarios.c.created_at.desc())
            .limit(1)
        ).mappings().first()

        if existing and not force_refresh:
            vars_rows = [
                dict(r)
                for r in conn.execute(
                    sa.select(twin_scenario_variables).where(twin_scenario_variables.c.scenario_id == existing["id"])
                ).mappings()
            ]
            return {**dict(existing), "variables": vars_rows}

        snapshot = compute_baseline_snapshot(conn, company_id=company_id, info=info, horizon_days=30)
        readiness = compute_data_readiness(conn, company_id=company_id, info=info)
        vars_spec = build_variable_catalog(scenario_type="custom", baseline=snapshot)
        now = _utc_now()

        if existing:
            sid = existing["id"]
            conn.execute(
                twin_scenarios.update()
                .where(twin_scenarios.c.id == sid)
                .values(
                    data_sources_json={"dataset_id": ds_id, "title": info["title"], "window": [snapshot["window_start"], snapshot["window_end"]], "readiness": readiness},
                    models_json=snapshot["ai_models"],
                    configuration_json={"snapshot_summary": {k: v["metrics"] for k, v in snapshot["zones"].items() if k != "ai_engine"}},
                    updated_at=now,
                )
            )
            conn.execute(twin_scenario_variables.delete().where(twin_scenario_variables.c.scenario_id == sid))
        else:
            sid = f"scen-base-{hashlib.sha1(f'{company_id}:{ds_id}'.encode()).hexdigest()[:12]}"
            conn.execute(
                twin_scenarios.insert().values(
                    id=sid,
                    company_id=company_id,
                    dataset_id=ds_id,
                    scenario_type="baseline",
                    name=f"Baseline ({info['title']})",
                    description="Observed historical business state anchored to live SQL analytics & validated ingestion snapshot.",
                    baseline_reference=None,
                    objective="balanced",
                    horizon_days=30,
                    is_baseline=True,
                    constraints_json={},
                    configuration_json={"snapshot_summary": {k: v["metrics"] for k, v in snapshot["zones"].items() if k != "ai_engine"}},
                    data_sources_json={"dataset_id": ds_id, "title": info["title"], "window": [snapshot["window_start"], snapshot["window_end"]], "readiness": readiness},
                    models_json=snapshot["ai_models"],
                    created_by=actor,
                    created_at=now,
                    updated_at=now,
                )
            )

        inserted_vars = []
        for idx, spec in enumerate(vars_spec):
            vid = f"var-{uuid4().hex[:12]}"
            row = {
                "id": vid,
                "company_id": company_id,
                "scenario_id": sid,
                "domain": spec["domain"],
                "variable_name": spec["variable_name"],
                "label": spec["label"],
                "baseline_value": spec["baseline_value"],
                "scenario_value": spec["baseline_value"],
                "unit": spec["unit"],
                "min_value": spec["min_value"],
                "max_value": spec["max_value"],
                "validation_rule": spec["validation_rule"],
                "source_or_assumption": spec["source_or_assumption"],
                "supported": spec["supported"],
                "metadata_json": spec["metadata"],
            }
            conn.execute(twin_scenario_variables.insert().values(**row))
            inserted_vars.append(row)

        saved = conn.execute(sa.select(twin_scenarios).where(twin_scenarios.c.id == sid)).mappings().one()
        return {**dict(saved), "variables": inserted_vars}
