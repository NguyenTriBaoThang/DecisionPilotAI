"""Enterprise XAI Recommendations & Tamper-Evident Audit Governance Service."""
from __future__ import annotations

import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import io
import json
import logging
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
import numpy as np
import sqlalchemy as sa

from ai_service import anomaly, explainability, root_cause, scenario
from ai_service.features import FEATURES, anomaly_frame, observed_series
from backend.app import services
from backend.app.analytics import (
    availability,
    dataset_info,
    grouped,
    is_partitioned,
    marketing_summary,
    previous_period,
    ratio,
    sales_total,
    trend,
)
from backend.app.db import (
    audit,
    audit_hash_chain,
    audit_risk_alerts,
    companies,
    data_sources,
    dataset_quality_reports,
    enterprise_datasets,
    inventory,
    marketing,
    model_evaluations,
    products,
    recommendation_actions,
    recommendation_outcomes,
    sales,
    tenant_inventory_daily,
    tenant_marketing_daily,
    tenant_products,
    tenant_transactions,
    xai_recommendations,
)
from backend.app.governance.hash_chain import (
    append_audited_event,
    csv_safe,
    redact_secrets,
    verify_audit_hash_chain,
)
from backend.app.governance.schemas import RecommendationActionRequest, RecommendationOutcomeRequest, RiskResolveRequest
from backend.app.lineage import service as lineage_service
from backend.app.schemas import (
    ForecastRequest,
    InventoryParams,
    InventoryRequest,
    MarketingParams,
    MarketingRequest,
    PriceParams,
    PriceRequest,
)

log = logging.getLogger(__name__)

CATEGORIES: list[tuple[str, str, str]] = [
    ("revenue_growth", "Revenue Growth", "Tăng trưởng doanh thu"),
    ("cost_optimization", "Cost Optimization", "Tối ưu chi phí"),
    ("marketing", "Marketing", "Marketing"),
    ("customer", "Customer Retention", "Khách hàng"),
    ("inventory", "Inventory & Stock", "Tồn kho"),
    ("operations", "Operations", "Vận hành"),
    ("risk_governance", "Risk Governance", "Quản trị rủi ro"),
]
CATEGORY_BY_CODE = {code: {"code": code, "en": en, "vi": vi} for code, en, vi in CATEGORIES}

WORKFLOW_STATUSES = [
    ("pending", "Pending", "Chờ duyệt"),
    ("review_requested", "Review Requested", "Yêu cầu xem xét thêm"),
    ("approved", "Approved", "Đã duyệt"),
    ("implemented", "Implemented", "Đã triển khai"),
    ("rejected", "Rejected", "Từ chối"),
    ("expired", "Expired", "Hết hạn"),
]
STATUS_META = {code: {"code": code, "en": en, "vi": vi} for code, en, vi in WORKFLOW_STATUSES}

PRIORITIES = [
    ("critical", "Critical", "Khẩn cấp"),
    ("high", "High", "Cao"),
    ("medium", "Medium", "Trung bình"),
    ("low", "Low", "Thấp"),
]

CONFIDENCE_LEVELS = [
    ("High", "High", "Cao"),
    ("Medium", "Medium", "Trung bình"),
    ("Low", "Low", "Thấp"),
    ("Insufficient Evidence", "Insufficient Evidence", "Chưa đủ bằng chứng"),
]

AUDIT_EVENT_BUCKETS = [
    ("data_upload", "Data Upload"),
    ("data_processing", "Data Processing"),
    ("model_execution", "Model Execution"),
    ("recommendation_generated", "Recommendation Generated"),
    ("recommendation_approved", "Recommendation Approved"),
    ("recommendation_rejected", "Recommendation Rejected"),
    ("configuration_changed", "Configuration Changed"),
    ("user_action", "User Action"),
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    return str(val)


def _det_id(prefix: str, company_id: str, dataset_id: str, key: str) -> str:
    h = hashlib.sha1(f"{company_id}:{dataset_id}:{key}".encode("utf-8")).hexdigest()[:18]
    return f"{prefix}-{h}"


def _lock_db(conn: sa.Connection) -> None:
    if conn.dialect.name == "postgresql":
        conn.exec_driver_sql("SELECT pg_advisory_xact_lock(177480299)")
    else:
        try:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
        except sa.exc.OperationalError:
            pass


def _safe_dataset_info(conn: sa.Connection, company_id: str, dataset_id: str | None) -> dict[str, Any] | None:
    try:
        return dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
    except HTTPException:
        return None


def _latest_quality_report(conn: sa.Connection, company_id: str, dataset_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        sa.select(dataset_quality_reports)
        .where(
            dataset_quality_reports.c.company_id == company_id,
            dataset_quality_reports.c.dataset_id == dataset_id,
        )
        .order_by(dataset_quality_reports.c.created_at.desc())
        .limit(1)
    ).mappings().first()
    return dict(row) if row else None


def _dataset_lineage_node(company_id: str, dataset_id: str, fallback: str = "output:recommendations_decisions") -> str:
    return "node-" + hashlib.sha1(f"{company_id}:{fallback}".encode("utf-8")).hexdigest()[:16]


def _compute_heatmap(conn: sa.Connection, info: dict[str, Any], start: date, end: date) -> dict[str, Any]:
    """Real SQL cross-tabulation Heatmap of Region x Category revenue & margin."""
    dec = is_partitioned(info)
    caps = info.get("capabilities") or {}
    has_gp = caps.get("has_cost_or_profit", True)
    if dec:
        tx = tenant_transactions.c
        q = (
            sa.select(
                tx.region.label("row_label"),
                tx.category.label("col_label"),
                sa.func.sum(tx.revenue).label("revenue"),
                (sa.func.sum(tx.gross_profit).label("gross_profit") if has_gp else sa.literal(None).label("gross_profit")),
                sa.func.count().label("orders"),
            )
            .where(
                tx.company_id == info["company_id"],
                tx.dataset_id == info["dataset_id"],
                tx.date.between(start, end),
            )
            .group_by(tx.region, tx.category)
        )
    else:
        s, p = sales.c, products.c
        q = (
            sa.select(
                s.region.label("row_label"),
                p.category.label("col_label"),
                sa.func.sum(s.revenue).label("revenue"),
                sa.func.sum(s.gross_profit).label("gross_profit"),
                sa.func.count().label("orders"),
            )
            .select_from(sales.join(products))
            .where(s.date.between(start, end))
            .group_by(s.region, p.category)
        )

    raw = [dict(r) for r in conn.execute(q).mappings()]
    rows = sorted({str(r["row_label"]) for r in raw if r.get("row_label")})[:6]
    cols = sorted({str(r["col_label"]) for r in raw if r.get("col_label")})[:6]
    max_rev = max([float(r["revenue"] or 0) for r in raw] or [1.0])
    cells = [
        {
            "row": str(r["row_label"]),
            "col": str(r["col_label"]),
            "revenue": round(float(r["revenue"] or 0), 2),
            "gross_profit": round(float(r["gross_profit"] or 0), 2) if r.get("gross_profit") is not None else None,
            "margin": ratio(float(r["gross_profit"] or 0), float(r["revenue"] or 0)) if r.get("gross_profit") is not None else None,
            "orders": int(r["orders"] or 0),
            "intensity": round(float(r["revenue"] or 0) / max(1.0, max_rev), 3),
        }
        for r in raw
        if str(r["row_label"]) in rows and str(r["col_label"]) in cols
    ]
    return {
        "title": "Revenue & Margin Concentration (Region × Category)",
        "row_dimension": "Region",
        "col_dimension": "Category",
        "rows": rows,
        "cols": cols,
        "cells": cells,
    }


def _compute_evidence_bundle(
    conn: sa.Connection,
    info: dict[str, Any],
    start: date,
    end: date,
    prior: tuple[date, date] | None,
    comparison_dimension: str = "product",
    mix_dimension: str = "channel",
    chart_override: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Assemble the 4 mandatory evidence chart datasets (Line, Bar Comparison, Donut Mix, Group Heatmap) + KPI cards."""
    t_rows = chart_override or trend(conn, start, end, {}, "daily", info=info)
    now_comp = grouped(conn, start, end, {}, comparison_dimension, limit=6, info=info)
    prior_map: dict[str, dict[str, Any]] = {}
    if prior and prior[0] >= date.fromisoformat(info["start"]):
        prior_map = {r["name"]: r for r in grouped(conn, *prior, {}, comparison_dimension, info=info)}
    comp_rows = [
        {
            "name": r["name"],
            "current_revenue": r["revenue"],
            "prior_revenue": prior_map.get(r["name"], {}).get("revenue", 0),
            "delta": round(float(r["revenue"]) - float(prior_map.get(r["name"], {}).get("revenue", 0)), 2),
            "orders": r["orders"],
        }
        for r in now_comp
    ]
    mix_rows = grouped(conn, start, end, {}, mix_dimension, limit=6, info=info)
    tot = sales_total(conn, start, end, {}, info=info)
    prior_tot = sales_total(conn, *prior, {}, info=info) if (prior and prior[0] >= date.fromisoformat(info["start"])) else {}
    return {
        "window": [str(start), str(end)],
        "prior_window": [str(prior[0]), str(prior[1])] if prior else None,
        "data_timestamp": f"Observed through {info['end']}",
        "kpi_cards": {
            "revenue": tot.get("revenue"),
            "revenue_change": ratio((tot.get("revenue") or 0) - (prior_tot.get("revenue") or 0), abs(prior_tot.get("revenue") or 0)) if prior_tot.get("revenue") else None,
            "gross_profit": tot.get("gross_profit"),
            "margin": tot.get("margin"),
            "orders": tot.get("orders"),
            "aov": tot.get("aov"),
        },
        "trend_chart": {
            "title": "Metric Trend Over Monitoring Window",
            "rows": t_rows[-30:],
            "interpretation": f"Daily progression from {start} to {end}.",
        },
        "comparison_chart": {
            "title": f"Group Comparison by {comparison_dimension.title()} (Current vs Prior)",
            "rows": comp_rows,
            "interpretation": f"Compares top {comparison_dimension} segments in [{start}..{end}] against prior period.",
        },
        "mix_chart": {
            "title": f"Revenue Distribution by {mix_dimension.title()}",
            "rows": mix_rows,
            "interpretation": f"Share of period revenue across {mix_dimension}.",
        },
        "heatmap": _compute_heatmap(conn, info, start, end),
    }


def _compute_forecast_xai(
    conn: sa.Connection,
    info: dict[str, Any],
    bundle: dict[str, Any] | None,
    *,
    target: str,
    scope: str,
) -> dict[str, Any]:
    if not bundle:
        return explainability.explain_forecast_model(
            bundle=None, target=target, scope=scope, values=np.array([]), dates=[]
        )
    try:
        dates, labels, matrices, holidays = observed_series(conn, info)
        use_scope = scope if scope in labels else "all"
        vals = matrices[target][labels.index(use_scope)]
        return explainability.explain_forecast_model(
            bundle=bundle,
            target=target,
            scope=use_scope,
            values=vals,
            dates=dates,
            holidays=holidays,
            horizon=30,
        )
    except Exception as exc:
        return {
            "available": False,
            "shap_available": False,
            "shap_unavailable_reason": f"Could not build feature matrix: {type(exc).__name__}",
            "feature_importance": {"available": False, "gain": [], "split": [], "permutation": []},
            "shap": {"available": False, "reason": str(exc)},
            "causal_disclaimer": explainability.CAUSAL_DISCLAIMER,
        }


def _decision_to_status_default(legacy_decision: str | None) -> str:
    if legacy_decision == "accepted":
        return "approved"
    if legacy_decision == "rejected":
        return "rejected"
    return "pending"


def _status_to_legacy_decision(status: str) -> str:
    if status in {"approved", "implemented"}:
        return "accepted"
    if status == "rejected":
        return "rejected"
    return "pending"


def _build_candidate_specs(conn: sa.Connection, info: dict[str, Any], bundle: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Build strictly data-backed multi-category recommendation specs (Section A–I) for any dataset."""
    cid, did = info["company_id"], info["dataset_id"]
    dec = is_partitioned(info)
    caps = info.get("capabilities") or {}
    end = date.fromisoformat(info["end"])
    start_bound = date.fromisoformat(info["start"])
    day_span = (end - start_bound).days + 1
    start = max(end.replace(day=1), start_bound)
    prior = previous_period(start, end, True)
    has_prior = prior[0] >= start_bound

    quality_row = _latest_quality_report(conn, cid, did)
    dq_score = quality_row["overall_score"] if quality_row else (96.0 if not dec else (info.get("quality_score") or 90.0))

    candidates = services.alerts(conn, info, start, end)
    anom_quality = services.model_quality(info)["anomaly"]
    currency = info.get("currency", "VND")
    evidence_base = _compute_evidence_bundle(conn, info, start, end, prior if has_prior else None)

    specs: list[dict[str, Any]] = []

    # Cache "all" revenue TreeSHAP so we don't recompute redundantly
    all_rev_xai = _compute_forecast_xai(conn, info, bundle, target="revenue", scope="all")
    all_rev_perf = explainability.evaluate_model_performance(
        bundle=bundle, target="revenue", scope="all", horizon=30, anomaly_quality=anom_quality
    )

    # ------------------------------------------------------------------
    # 1. INVENTORY REPLENISHMENT (preserves legacy key `inventory:<pid>`)
    # ------------------------------------------------------------------
    stock = next((r for r in candidates if r["metric"] == "stockout_risk" and r["end"] == str(end)), None)
    if stock and caps.get("has_inventory", True):
        pid = stock["product_id"]
        rec_key = f"inventory:{pid}"
        projection = None
        fc_payload = None
        if bundle:
            try:
                fc_payload = services.forecast(conn, info, ForecastRequest(target="demand", product=pid, horizon=30))
                projection = services.simulate(
                    conn, info, InventoryRequest(type="inventory", parameters=InventoryParams(product=pid))
                )
            except Exception:
                projection = None
        selected = projection["recommended"] if projection else None
        before = projection["baseline"] if projection else None
        alternatives = projection["alternatives"] if projection else []
        cf_rows = explainability.compute_counterfactuals(
            conn, info, kind="inventory", product_id=pid, forecast_payload=fc_payload
        )
        sku_xai = _compute_forecast_xai(conn, info, bundle, target="demand", scope=f"sku:{pid}")
        perf = explainability.evaluate_model_performance(
            bundle=bundle,
            target="demand",
            scope=f"sku:{pid}",
            horizon=30,
            anomaly_metric="stockout_risk",
            anomaly_quality=anom_quality,
        )

        # Calculate spread across upper/lower forecast bands if available
        sens_spread = None
        if projection and projection.get("sensitivity"):
            risks = [
                alt["result"].get("risk", 0) or 0
                for grp in projection["sensitivity"]
                for alt in grp.get("alternatives", [])
            ]
            if risks and max(risks) > 0:
                sens_spread = min(0.7, (max(risks) - min(risks)) / max(1.0, float(before.get("demand", 1) if before else 1)))

        conf = explainability.compute_confidence_score(
            data_quality_score=dq_score,
            evidence_completeness=0.92 if projection else 0.55,
            model_perf=perf,
            sensitivity_spread=sens_spread,
            insufficient_evidence_flag=(projection is None),
            day_span=day_span,
            domain="inventory",
        )

        ev_info = stock.get("evidence") or {}
        inv_drivers = [
            {
                "feature": "lead_time_required_stock",
                "label": "Estimated Lead-Time Demand Required",
                "label_vi": "Nhu cầu dự kiến trong thời gian chờ nhập",
                "contribution_weight": float(stock["baseline"] or 1.0),
                "current_value": stock["baseline"],
                "direction": "negative",
                "unit": "units",
            },
            {
                "feature": "closing_stock_on_hand",
                "label": "Current Closing Stock",
                "label_vi": "Tồn kho cuối ngày hiện tại",
                "contribution_weight": max(1.0, float(stock["baseline"] - stock["actual"])),
                "current_value": stock["actual"],
                "reference_value": stock["baseline"],
                "direction": "negative",
                "unit": "units",
            },
            {
                "feature": "daily_sales_velocity_28d",
                "label": "28-Day Average Daily Units Sold",
                "label_vi": "Tốc độ bán trung bình 28 ngày",
                "contribution_weight": float(ev_info.get("previous_28d_daily_sales") or 1.0) * float(ev_info.get("lead_time_days") or 7),
                "current_value": ev_info.get("previous_28d_daily_sales"),
                "direction": "negative",
                "unit": "units/day",
            },
            {
                "feature": "supplier_lead_time",
                "label": "Supplier Lead Time (Days)",
                "label_vi": "Thời gian giao hàng NCC (ngày)",
                "contribution_weight": float(ev_info.get("lead_time_days") or 7),
                "current_value": ev_info.get("lead_time_days"),
                "direction": "negative",
                "unit": "days",
            },
        ]
        xai_full = explainability.explain_domain_attributions(
            domain="inventory",
            title=f"Review replenishment for {stock['scope']}",
            drivers=inv_drivers,
            local_summary=(
                f"{stock['scope']} closed at {stock['actual']:.1f} units vs estimated lead-time requirement of {stock['baseline']:.1f} units "
                f"({stock['deviation']*100:.1f}% gap across {ev_info.get('lead_time_days', 7)}-day supplier lead time)."
            ),
            global_summary=(
                "Stockout prevention weighs physical closing inventory against trailing 28-day demand velocity, supplier lead time, and LightGBM 30-day SKU demand forecast."
            ),
            non_shap_reason="Inventory replenishment sizing uses physical balance depletion and supplier lead-time equations; TreeSHAP below explains the underlying LightGBM SKU demand forecast.",
            forecast_shap=sku_xai,
        )
        xai_full["counterfactuals"] = cf_rows

        expected_impact_legacy = (
            {
                "estimated_units_recovered": round(before["risk"] - selected["risk"], 2),
                "purchase_commitment": selected["purchase_commitment"],
            }
            if selected
            else None
        )
        expected_impact_detail = {
            "available": bool(selected and before),
            "currency": currency,
            "horizon_days": 30,
            "baseline_vs_scenario": [
                {
                    "metric": "Fulfilled Units",
                    "baseline": before["fulfilled"] if before else None,
                    "scenario": selected["fulfilled"] if selected else None,
                    "delta": round(selected["fulfilled"] - before["fulfilled"], 2) if (selected and before) else None,
                    "unit": "units",
                },
                {
                    "metric": "Unfulfilled Stockout Risk",
                    "baseline": before["risk"] if before else None,
                    "scenario": selected["risk"] if selected else None,
                    "delta": round(selected["risk"] - before["risk"], 2) if (selected and before) else None,
                    "unit": "units",
                },
                {
                    "metric": "Revenue",
                    "baseline": before["revenue"] if before else None,
                    "scenario": selected["revenue"] if selected else None,
                    "delta": selected.get("revenue_delta") if selected else None,
                    "unit": currency,
                },
                {
                    "metric": "Gross Profit",
                    "baseline": before["profit"] if before else None,
                    "scenario": selected["profit"] if selected else None,
                    "delta": selected.get("profit_delta") if selected else None,
                    "unit": currency,
                },
                {
                    "metric": "Purchase Commitment (Cash Outlay)",
                    "baseline": 0,
                    "scenario": selected["purchase_commitment"] if selected else None,
                    "delta": selected["purchase_commitment"] if selected else None,
                    "unit": currency,
                },
            ],
            "assumptions": projection["assumptions"] if projection else ["Uses trailing sales and catalog lead time."],
        }
        alt_options = (
            [
                {
                    "option": "Option A (Conservative · Status Quo)",
                    "name": before["name"],
                    "revenue": before["revenue"],
                    "profit_delta": 0,
                    "stockout_risk_units": before["risk"],
                    "effort": "None",
                    "risk_note": "Leaves exposed demand unfulfilled during peak days.",
                    "selected": selected["name"] == before["name"],
                },
                *[
                    {
                        "option": f"Option {'B' if i == 0 else 'C'} ({'Balanced Reorder' if i == 0 else 'Safety Buffer +20%'})",
                        "name": a["name"],
                        "revenue": a["revenue"],
                        "profit_delta": a.get("profit_delta"),
                        "stockout_risk_units": a.get("risk"),
                        "purchase_commitment": a.get("purchase_commitment"),
                        "effort": "Medium (PO Issuance)",
                        "risk_note": "Capital tied up if demand falls below lower forecast band.",
                        "selected": selected["name"] == a["name"],
                    }
                    for i, a in enumerate(alternatives[:2])
                ],
            ]
            if before
            else []
        )
        legacy_obj = dict(
            id=rec_key,
            title=f"Review replenishment for {stock['scope']}",
            context="Current stock is below estimated lead-time sales.",
            action=(f"Review {selected['name'].lower()} and verify receipt timing." if selected else stock["action"]),
            expected_impact=expected_impact_legacy,
            assumptions=list(projection["assumptions"] if projection else ["Uses trailing sales and catalog lead time."]),
            risk="Observed sales can be constrained by stock, and late receipts may leave unmet demand.",
            uncertainty=("Scenario estimate from forecast and assumed receipt dates." if selected else "Insufficient evidence"),
            priority=stock["severity"],
            score=int(stock["score"]),
            evidence={"alert": stock, "source": ["inventory_daily", "sales_transactions"]},
        )
        specs.append(
            {
                "rec_key": rec_key,
                "title": legacy_obj["title"],
                "category_code": "inventory",
                "category_label": CATEGORY_BY_CODE["inventory"]["vi"],
                "priority": stock["severity"],
                "score": int(stock["score"]),
                "problem_statement": f"{stock['scope']} ({pid}) closed at {stock['actual']:.0f} units, below estimated lead-time requirement ({stock['baseline']:.1f} units).",
                "recommended_action": legacy_obj["action"],
                "goal": f"Recover up to {before['risk'] - selected['risk']:.1f} at-risk units and prevent zero-stock lost sales over 30 days." if (selected and before) else "Prevent SKU stockout over upcoming supplier lead time.",
                "creator": "AI Anomaly & Inventory Engine",
                "owner": "Supply Chain Lead",
                "deadline": end + timedelta(days=7),
                "resources_needed": f"Working capital ~{selected['purchase_commitment']:,.0f} {currency} + PO approval" if selected else "PO approval",
                "tracking_kpi": "SKU Availability Rate (%) & Unfulfilled Demand Units",
                "success_criteria": f"Maintain >=97% stock availability and zero stockout days for {stock['scope']} over 30d post-receipt.",
                "stop_criteria": "Pause/downsize follow-up PO if 7-day rolling demand drops >25% below lower band.",
                "confidence": conf,
                "why_json": {
                    "triggers": [
                        {
                            "metric": "Closing Stock vs Lead-Time Requirement",
                            "current_value": stock["actual"],
                            "comparison_value": stock["baseline"],
                            "delta_pct": round((stock["deviation"] or 0) * 100, 1),
                            "window": f"28d rolling velocity ending {stock['end']}",
                            "source": "tenant_inventory_daily / inventory_daily",
                            "detection_method": "Physical depletion threshold (closing_stock < trailing_28d_rate * lead_time)",
                        }
                    ],
                    "invalidation_conditions": [
                        "Confirmed inbound purchase order arrives earlier than recorded lead time.",
                        "SKU is being discontinued or seasonal campaign is ending.",
                    ],
                },
                "model_performance_json": perf,
                "xai_json": xai_full,
                "evidence_json": evidence_base,
                "expected_impact_json": expected_impact_detail,
                "alternatives_json": {"options": alt_options, "selection_rationale": "Selects lowest stockout risk option respecting physical supplier arrival delay."},
                "action_plan_json": {
                    "steps": [
                        "Verify open purchase orders & in-transit shipments in ERP.",
                        f"Approve replenishment batch ({selected['name'] if selected else stock['action']}).",
                        "Monitor daily sell-through rate vs 30d LightGBM forecast.",
                    ]
                },
                "assumptions_json": legacy_obj["assumptions"],
                "risks_json": [legacy_obj["risk"]],
                "data_scope_json": {"date_range": [str(start), str(end)], "product_id": pid, "entity": stock["scope"], "records_analyzed": day_span},
                "legacy_payload_json": legacy_obj,
                "lineage_node_id": _dataset_lineage_node(cid, did, "output:recommendations_decisions"),
            }
        )

    # ------------------------------------------------------------------
    # 2. FACEBOOK / UNDERPERFORMING CHANNEL MARKETING (legacy `marketing:facebook`)
    # ------------------------------------------------------------------
    market = next((r for r in candidates if r["metric"] == "facebook_roas"), None)
    if market and caps.get("has_marketing", True):
        rec_key = "marketing:facebook"
        projection = services.simulate(
            conn, info, MarketingRequest(type="marketing", objective="profit", parameters=MarketingParams(channel="Facebook Ads"))
        )
        choice = projection["recommended"]
        before = projection["baseline"]
        cf_rows = explainability.compute_counterfactuals(conn, info, kind="marketing", channel="Facebook Ads")
        perf = explainability.evaluate_model_performance(
            bundle=bundle,
            target="revenue",
            scope="all",
            horizon=30,
            anomaly_metric="facebook_roas",
            anomaly_quality=anom_quality,
        )
        sens_spread = None
        if projection.get("sensitivity"):
            profs = [
                alt["result"].get("profit", 0) or 0
                for grp in projection["sensitivity"]
                for alt in grp.get("alternatives", [])
            ]
            if profs:
                sens_spread = min(0.8, (max(profs) - min(profs)) / max(1.0, abs(before["profit"])))

        conf = explainability.compute_confidence_score(
            data_quality_score=dq_score,
            evidence_completeness=0.88,
            model_perf=perf,
            sensitivity_spread=sens_spread,
            day_span=day_span,
            domain="marketing",
        )
        mkt_drivers = [
            {
                "feature": "facebook_roas_deviation",
                "label": "Facebook Ads ROAS vs 56d Baseline",
                "label_vi": "ROAS Facebook Ads so với nền 56 ngày",
                "contribution_weight": abs(float(market["deviation"] or -0.3)) * 100,
                "current_value": round(float(market["actual"] or 0), 2),
                "reference_value": round(float(market["baseline"] or 0), 2),
                "direction": "negative",
                "unit": "x",
            },
            {
                "feature": "marginal_budget_response_alpha",
                "label": "Diminishing Returns Elasticity (α=0.65)",
                "label_vi": "Độ co giãn lợi suất giảm dần (α=0.65)",
                "contribution_weight": 35.0,
                "current_value": 0.65,
                "direction": "negative",
                "unit": "exponent",
            },
            {
                "feature": "contribution_profit_delta",
                "label": "Simulated Monthly Contribution Profit Uplift",
                "label_vi": "Thay đổi lợi nhuận đóng góp tháng",
                "contribution_weight": min(100.0, abs(float(choice["profit_delta"])) / max(1.0, abs(before["profit"])) * 100),
                "current_value": choice["profit_delta"],
                "direction": "positive" if choice["profit_delta"] >= 0 else "negative",
                "unit": currency,
            },
        ]
        xai_full = explainability.explain_domain_attributions(
            domain="marketing",
            title="Review Facebook Ads allocation",
            drivers=mkt_drivers,
            local_summary=(
                f"Facebook Ads ROAS averaged {market['actual']:.2f}x vs baseline {market['baseline']:.2f}x ({(market['deviation'] or 0)*100:.1f}%). "
                f"At α=0.65 diminishing returns, {choice['name']} adjusts monthly contribution profit by {choice['profit_delta']:+,.0f} {currency}."
            ),
            global_summary=(
                "Marketing budget optimizer trades off marginal attributed gross profit against ad spend elasticity under last-click/channel attribution."
            ),
            non_shap_reason="Channel reallocation relies on iso-elastic diminishing returns response curve (Ratio^α) and ROAS anomaly Z-score rather than a LightGBM regressor.",
            forecast_shap=all_rev_xai,
        )
        xai_full["counterfactuals"] = cf_rows

        legacy_obj = dict(
            id=rec_key,
            title="Review Facebook Ads allocation",
            context="Attributed return is below the recent baseline.",
            action=f"Evaluate {choice['name'].lower()} in a controlled trial with a conversion holdout.",
            expected_impact={
                "contribution_profit_delta_vnd": choice["profit_delta"],
                "attributed_revenue_delta_vnd": choice["revenue_delta"],
            },
            assumptions=list(projection["assumptions"]),
            risk="Attribution can overstate incremental revenue.",
            uncertainty="Conditional estimate under the selected response exponent.",
            priority=market["severity"],
            score=int(market["score"]),
            evidence={"alert": market, "scenario": projection["evidence"]},
        )
        alt_options = [
            {
                "option": "Option A (Keep Current Spend)",
                "name": before["name"],
                "spend": before.get("spend"),
                "revenue": before["revenue"],
                "profit_delta": 0,
                "roas": before.get("roas"),
                "effort": "None",
                "risk_note": "Continues spend on saturated ad sets at depressed ROAS.",
                "selected": choice["name"] == before["name"],
            },
            *[
                {
                    "option": f"Option {'B' if i == 0 else 'C'}",
                    "name": alt["name"],
                    "spend": alt.get("spend"),
                    "revenue": alt["revenue"],
                    "profit_delta": alt.get("profit_delta"),
                    "roas": alt.get("roas"),
                    "effort": "Low (Ad Manager Budget Cap)",
                    "risk_note": "May throttle impression share if ROAS decline was temporary creative fatigue.",
                    "selected": choice["name"] == alt["name"],
                }
                for i, alt in enumerate(projection["alternatives"][:2])
            ],
        ]
        specs.append(
            {
                "rec_key": rec_key,
                "title": legacy_obj["title"],
                "category_code": "marketing",
                "category_label": CATEGORY_BY_CODE["marketing"]["vi"],
                "priority": market["severity"],
                "score": int(market["score"]),
                "problem_statement": f"Facebook Ads ROAS contracted {(market['deviation'] or 0)*100:.1f}% ({market['actual']:.2f}x vs {market['baseline']:.2f}x baseline) from {market['start']} to {market['end']}.",
                "recommended_action": legacy_obj["action"],
                "goal": f"Improve monthly net contribution profit by {choice['profit_delta']:+,.0f} {currency} while validating incrementality.",
                "creator": "AI Marketing Anomaly & Econometric Engine",
                "owner": "Performance Marketing Lead",
                "deadline": end + timedelta(days=5),
                "resources_needed": "Geo-holdout / Meta Conversion Lift setup; 14-day test window",
                "tracking_kpi": "Blended Incremental ROAS & Net Contribution Profit",
                "success_criteria": "Net contribution profit uplift >= simulated target delta without >5% drop in total new customer acquisitions.",
                "stop_criteria": "Revert budget split if blended CAC rises >15% over 7 consecutive days.",
                "confidence": conf,
                "why_json": {
                    "triggers": [
                        {
                            "metric": "Facebook Ads ROAS",
                            "current_value": round(float(market["actual"]), 3),
                            "comparison_value": round(float(market["baseline"]), 3),
                            "delta_pct": round(float(market["deviation"] or 0) * 100, 1),
                            "window": f"{market['start']} to {market['end']}",
                            "source": "marketing_campaigns / tenant_marketing_daily",
                            "detection_method": "Hybrid IsolationForest + 56-day Robust Z-score",
                        }
                    ],
                    "invalidation_conditions": [
                        "Attribution window lag or pixel tracking outage skewing recent conversions.",
                        "Brand awareness campaign intentionally prioritizing top-of-funnel leads over direct purchases.",
                    ],
                },
                "model_performance_json": perf,
                "xai_json": xai_full,
                "evidence_json": evidence_base,
                "expected_impact_json": {
                    "available": True,
                    "currency": currency,
                    "horizon_days": 30,
                    "baseline_vs_scenario": [
                        {"metric": "Marketing Spend", "baseline": before.get("spend"), "scenario": choice.get("spend"), "delta": round((choice.get("spend") or 0) - (before.get("spend") or 0), 2), "unit": currency},
                        {"metric": "Attributed Revenue", "baseline": before["revenue"], "scenario": choice["revenue"], "delta": choice["revenue_delta"], "unit": currency},
                        {"metric": "Net Contribution Profit", "baseline": before["profit"], "scenario": choice["profit"], "delta": choice["profit_delta"], "unit": currency},
                        {"metric": "Attributed Orders", "baseline": before["demand"], "scenario": choice["demand"], "delta": round(choice["demand"] - before["demand"], 2), "unit": "orders"},
                    ],
                    "assumptions": projection["assumptions"],
                },
                "alternatives_json": {"options": alt_options, "selection_rationale": "Maximizes contribution profit under α=0.65 diminishing-returns exponent."},
                "action_plan_json": {
                    "steps": [
                        "Audit Facebook Ads ad sets driving CPA inflation / creative fatigue.",
                        f"Configure controlled budget test ({choice['name']}) with 10–15% geo/audience holdout.",
                        "Evaluate 14-day post-test incremental lift in Audit Outcome ledger.",
                    ]
                },
                "assumptions_json": legacy_obj["assumptions"],
                "risks_json": [legacy_obj["risk"]],
                "data_scope_json": {"date_range": [str(start), str(end)], "channel": "Facebook Ads", "records_analyzed": day_span},
                "legacy_payload_json": legacy_obj,
                "lineage_node_id": _dataset_lineage_node(cid, did, "output:recommendations_decisions"),
            }
        )

    # ------------------------------------------------------------------
    # 3. REVENUE GROWTH / DECLINE INVESTIGATION (`sales:decline` OR `revenue:pricing:<top_sku>`)
    # ------------------------------------------------------------------
    if has_prior:
        analysis = root_cause.decompose(conn, (start, end), prior, {}, info=info)
        if analysis["delta"] < 0 and analysis["contributions"].get("product"):
            driver = min(analysis["contributions"]["product"], key=lambda row: row["delta"])
            driver_pid = None
            opts = conn.execute(
                sa.select(tenant_products.c.product_id, tenant_products.c.product_name)
                .where(tenant_products.c.company_id == cid, tenant_products.c.dataset_id == did)
                if dec
                else sa.select(products.c.product_id, products.c.product_name)
            ).mappings().all()
            driver_pid = next((o["product_id"] for o in opts if o["product_name"] == driver["name"]), None)

            cf_price: list[dict[str, Any]] = []
            price_proj = None
            if driver_pid and bundle and caps.get("has_product", True):
                try:
                    fc_p = services.forecast(conn, info, ForecastRequest(target="demand", product=driver_pid, horizon=30))
                    price_proj = services.simulate(
                        conn, info, PriceRequest(type="price", objective="profit", parameters=PriceParams(product=driver_pid))
                    )
                    cf_price = explainability.compute_counterfactuals(
                        conn, info, kind="price", product_id=driver_pid, forecast_payload=fc_p
                    )
                except Exception:
                    price_proj = None

            sku_scope = f"sku:{driver_pid}" if driver_pid else "all"
            rev_xai = _compute_forecast_xai(conn, info, bundle, target="revenue", scope=sku_scope)
            rev_perf = explainability.evaluate_model_performance(
                bundle=bundle, target="revenue", scope=sku_scope, horizon=30, anomaly_metric="revenue", anomaly_quality=anom_quality
            )
            prod_contribs = analysis["contributions"]["product"][:5]
            dom_drivers = [
                {
                    "feature": f"product_{i}_{c['name']}",
                    "label": c["name"],
                    "label_vi": c["name"],
                    "contribution_weight": abs(float(c["delta"])),
                    "current_value": c["actual"],
                    "reference_value": c["baseline"],
                    "direction": "negative" if c["delta"] < 0 else "positive",
                    "unit": currency,
                }
                for i, c in enumerate(prod_contribs)
            ]
            xai_full = explainability.explain_domain_attributions(
                domain="revenue_growth",
                title="Investigate the largest product contribution",
                drivers=dom_drivers,
                local_summary=(
                    f"Total revenue shifted by {analysis['delta']:+,.0f} {currency} ({(analysis['relative_change'] or 0)*100:+.1f}%). "
                    f"'{driver['name']}' contributed {driver['delta']:+,.0f} {currency} ({(driver['share_of_net_change'] or 0)*100:.1f}% of net change)."
                ),
                global_summary="Additive multi-dimensional variance decomposition reconciled independently across Product, Category, Region, and Channel.",
                non_shap_reason="Variance attribution comes from exact additive accounting decomposition; TreeSHAP below inspects the LightGBM revenue forecaster for predictive lag/calendar drivers.",
                forecast_shap=rev_xai if rev_xai.get("shap_available") else all_rev_xai,
            )
            xai_full["counterfactuals"] = cf_price

            conf = explainability.compute_confidence_score(
                data_quality_score=dq_score,
                evidence_completeness=0.90 if price_proj else 0.70,
                model_perf=rev_perf,
                sensitivity_spread=None,
                insufficient_evidence_flag=(price_proj is None),
                day_span=day_span,
                domain="revenue_growth",
            )
            rec_key = "sales:decline"
            legacy_obj = dict(
                id=rec_key,
                title="Investigate the largest product contribution",
                context="Recorded revenue declined compared with the prior calendar period.",
                action=f"Review stock, realized prices and traffic for {driver['name']} before changing pricing.",
                expected_impact=None,
                assumptions=["Contribution is computed separately for each dimension."],
                risk="Changing price without testing can reduce margin.",
                uncertainty="Insufficient evidence for an incremental impact estimate.",
                priority="high",
                score=65,
                evidence={
                    "driver": driver,
                    "revenue_delta": analysis["delta"],
                    "current": analysis["current"],
                    "prior": analysis["prior"],
                    "source": ["sales_transactions", "products"],
                },
            )
            p_base = price_proj["baseline"] if price_proj else None
            p_rec = price_proj["recommended"] if price_proj else None
            specs.append(
                {
                    "rec_key": rec_key,
                    "title": legacy_obj["title"],
                    "category_code": "revenue_growth",
                    "category_label": CATEGORY_BY_CODE["revenue_growth"]["vi"],
                    "priority": "high",
                    "score": 65,
                    "problem_statement": f"Period revenue declined {abs(analysis['delta']):,.0f} {currency} ({(analysis['relative_change'] or 0)*100:.1f}%) vs {prior[0]}..{prior[1]}, led by {driver['name']}.",
                    "recommended_action": legacy_obj["action"],
                    "goal": f"Diagnose & reverse revenue contraction in {driver['name']} without diluting gross margin.",
                    "creator": "Root-Cause Decomposition Engine",
                    "owner": "Commercial Director",
                    "deadline": end + timedelta(days=10),
                    "resources_needed": "SKU stock check + realized discount audit + controlled price/promo test",
                    "tracking_kpi": f"{driver['name']} Daily Revenue & Unit Realized Price",
                    "success_criteria": f"Stabilize {driver['name']} weekly run-rate within +/-5% of prior baseline.",
                    "stop_criteria": "Stop promotional discounting immediately if gross margin drops >3pp without compensating unit velocity.",
                    "confidence": conf,
                    "why_json": {
                        "triggers": [
                            {
                                "metric": "Net Period Revenue Delta",
                                "current_value": analysis["actual"],
                                "comparison_value": analysis["baseline"],
                                "delta_pct": round(float(analysis["relative_change"] or 0) * 100, 1),
                                "window": f"{start}..{end} vs {prior[0]}..{prior[1]}",
                                "source": "sales_transactions + products",
                                "detection_method": "Calendar-aligned period decomposition",
                            },
                            {
                                "metric": f"Top Contributor: {driver['name']}",
                                "current_value": driver["actual"],
                                "comparison_value": driver["baseline"],
                                "delta_pct": round(ratio(driver["delta"], driver["baseline"]) * 100, 1) if driver.get("baseline") else None,
                                "window": f"{start}..{end}",
                                "source": "sales_transactions",
                                "detection_method": "Minimum delta rank across products",
                            },
                        ],
                        "invalidation_conditions": [
                            "Prior period included a one-off holiday flash sale or wholesale B2B bulk order.",
                            "Current period was physically capped by zero stock availability on the SKU.",
                        ],
                    },
                    "model_performance_json": rev_perf,
                    "xai_json": xai_full,
                    "evidence_json": evidence_base,
                    "expected_impact_json": (
                        {
                            "available": True,
                            "currency": currency,
                            "horizon_days": 30,
                            "note": "Conditional price sensitivity check; historical causal incrementality requires A/B testing.",
                            "baseline_vs_scenario": [
                                {"metric": "Projected 30d SKU Revenue", "baseline": p_base["revenue"], "scenario": p_rec["revenue"], "delta": p_rec.get("revenue_delta"), "unit": currency},
                                {"metric": "Projected 30d SKU Profit", "baseline": p_base["profit"], "scenario": p_rec["profit"], "delta": p_rec.get("profit_delta"), "unit": currency},
                                {"metric": "Projected Unit Demand", "baseline": p_base["demand"], "scenario": p_rec["demand"], "delta": round(p_rec["demand"] - p_base["demand"], 2), "unit": "units"},
                            ],
                            "assumptions": price_proj["assumptions"],
                        }
                        if (p_base and p_rec)
                        else {"available": False, "reason": "Insufficient evidence for causal revenue recovery impact without controlled price experiment.", "baseline_vs_scenario": []}
                    ),
                    "alternatives_json": {
                        "options": (
                            [
                                {"option": "Option A (Hold Current Price & Investigate Stock)", "name": p_base["name"], "revenue": p_base["revenue"], "profit_delta": 0, "effort": "Low", "risk_note": "Zero margin dilution while auditing traffic/stock.", "selected": p_rec["name"] == p_base["name"]},
                                *[
                                    {"option": f"Option {'B' if i == 0 else 'C'}", "name": alt["name"], "revenue": alt["revenue"], "profit_delta": alt.get("profit_delta"), "effort": "Medium (Promo Campaign)", "risk_note": "Promo may pull forward future full-price demand.", "selected": p_rec["name"] == alt["name"]}
                                    for i, alt in enumerate(price_proj["alternatives"][:2])
                                ],
                            ]
                            if price_proj
                            else [
                                {"option": "Option A (Audit Stock & Funnel First)", "name": "Verify inventory availability & traffic sources", "effort": "Low", "risk_note": "Safest non-destructive diagnosis step.", "selected": True},
                                {"option": "Option B (Targeted 5% Loyalty Bundle)", "name": "Test selective bundle instead of across-the-board discount", "effort": "Medium", "risk_note": "Requires cohort holdout measurement.", "selected": False},
                            ]
                        ),
                        "selection_rationale": "Preserves gross margin before risking premature price cuts without causality confirmation.",
                    },
                    "action_plan_json": {
                        "steps": [
                            f"Check stockout days for {driver['name']} during {start}..{end}.",
                            "Inspect channel conversion & regional contribution breakdown in Evidence Heatmaps.",
                            "Run isolated A/B price or bundle test only if stock & traffic are healthy.",
                        ]
                    },
                    "assumptions_json": legacy_obj["assumptions"],
                    "risks_json": [legacy_obj["risk"]],
                    "data_scope_json": {"date_range": [str(start), str(end)], "product_id": driver_pid, "entity": driver["name"], "records_analyzed": day_span},
                    "legacy_payload_json": legacy_obj,
                    "lineage_node_id": _dataset_lineage_node(cid, did, "output:recommendations_decisions"),
                }
            )

    # ------------------------------------------------------------------
    # 4. MARKETING SCALING OPPORTUNITY (for top-ROAS under-allocated channel)
    # ------------------------------------------------------------------
    if caps.get("has_marketing", True):
        mkt_tot, mkt_channels = marketing_summary(conn, start, end, info=info)
        if len(mkt_channels) >= 2 and (mkt_tot.get("spend") or 0) > 0:
            blended_roas = float(mkt_tot.get("roas") or 0)
            scalable = [
                ch for ch in mkt_channels
                if (ch.get("roas") or 0) > max(1.0, blended_roas * 1.15) and (ch.get("spend") or 0) / mkt_tot["spend"] < 0.55 and ch["name"] != "Facebook Ads"
            ]
            if scalable:
                best_ch = max(scalable, key=lambda c: float(c.get("roas") or 0))
                ch_slug = "".join(ch.lower() if ch.isalnum() else "_" for ch in best_ch["name"]).strip("_")
                rec_key = f"marketing:scale:{ch_slug[:40]}"
                try:
                    proj = services.simulate(
                        conn,
                        info,
                        MarketingRequest(
                            type="marketing",
                            objective="profit",
                            parameters=MarketingParams(channel=best_ch["name"], changes=[0.15, 0.30, -0.15]),
                        ),
                    )
                    cf_scale = explainability.compute_counterfactuals(conn, info, kind="marketing", channel=best_ch["name"])
                    choice = proj["recommended"]
                    before = proj["baseline"]
                    conf = explainability.compute_confidence_score(
                        data_quality_score=dq_score,
                        evidence_completeness=0.82,
                        model_perf=all_rev_perf,
                        sensitivity_spread=0.22,
                        day_span=day_span,
                        domain="marketing",
                    )
                    xai_scale = explainability.explain_domain_attributions(
                        domain="marketing",
                        title=f"Evaluate scaling high-ROAS channel {best_ch['name']}",
                        drivers=[
                            {"feature": "channel_roas_vs_blended", "label": f"{best_ch['name']} ROAS vs Blended", "label_vi": f"ROAS {best_ch['name']} so với trung bình", "contribution_weight": (best_ch["roas"] - blended_roas) * 20, "current_value": round(best_ch["roas"], 2), "reference_value": round(blended_roas, 2), "direction": "positive", "unit": "x"},
                            {"feature": "budget_share_headroom", "label": "Current Spend Share (Headroom)", "label_vi": "Tỷ trọng chi tiêu hiện tại", "contribution_weight": 30.0, "current_value": round((best_ch["spend"] / mkt_tot["spend"]) * 100, 1), "direction": "positive", "unit": "%"},
                        ],
                        local_summary=f"{best_ch['name']} achieved {best_ch['roas']:.2f}x ROAS (portfolio blended {blended_roas:.2f}x) on only {best_ch['spend']/mkt_tot['spend']:.1%} of ad spend.",
                        global_summary="Portfolio channel reallocation identifies high-ROAS channels with scaling headroom under α=0.65 diminishing returns.",
                        non_shap_reason="Channel elasticity uses power-law attribution modeling rather than tree splits.",
                        forecast_shap=all_rev_xai,
                    )
                    xai_scale["counterfactuals"] = cf_scale
                    legacy_obj = dict(
                        id=rec_key,
                        title=f"Scale high-ROAS budget on {best_ch['name']}",
                        context=f"{best_ch['name']} ROAS ({best_ch['roas']:.2f}x) outperforms blended portfolio ({blended_roas:.2f}x).",
                        action=f"Test shifting budget via {choice['name'].lower()} on {best_ch['name']} with weekly CAC guardrails.",
                        expected_impact={"contribution_profit_delta_vnd": choice["profit_delta"], "attributed_revenue_delta_vnd": choice["revenue_delta"]},
                        assumptions=list(proj["assumptions"]),
                        risk="Scaling high-ROAS channels encounters audience saturation and rising marginal CPA.",
                        uncertainty="Conditional simulation assuming response exponent α=0.65.",
                        priority="medium",
                        score=62,
                        evidence={"channel": best_ch, "blended_roas": blended_roas, "source": ["marketing_campaigns"]},
                    )
                    specs.append(
                        {
                            "rec_key": rec_key,
                            "title": legacy_obj["title"],
                            "category_code": "marketing",
                            "category_label": CATEGORY_BY_CODE["marketing"]["vi"],
                            "priority": "medium",
                            "score": 62,
                            "problem_statement": f"{best_ch['name']} delivers {best_ch['roas']:.2f}x ROAS vs portfolio {blended_roas:.2f}x while absorbing only {best_ch['spend']/mkt_tot['spend']:.1%} of total budget.",
                            "recommended_action": legacy_obj["action"],
                            "goal": f"Capture incremental attributed contribution profit ({choice['profit_delta']:+,.0f} {currency}) via controlled reallocation.",
                            "creator": "Portfolio ROAS Optimizer",
                            "owner": "Growth Marketing Lead",
                            "deadline": end + timedelta(days=14),
                            "resources_needed": "Reallocated budget cap (+15% step)",
                            "tracking_kpi": f"{best_ch['name']} Marginal ROAS & Acquisition CAC",
                            "success_criteria": f"Marginal ROAS stays above portfolio blended {blended_roas:.2f}x after +15% spend ramp.",
                            "stop_criteria": "Cap spend back to baseline if 7d marginal ROAS drops below blended ROAS.",
                            "confidence": conf,
                            "why_json": {
                                "triggers": [
                                    {
                                        "metric": f"{best_ch['name']} ROAS vs Blended",
                                        "current_value": round(best_ch["roas"], 2),
                                        "comparison_value": round(blended_roas, 2),
                                        "delta_pct": round(ratio(best_ch["roas"] - blended_roas, blended_roas) * 100, 1),
                                        "window": f"{start}..{end}",
                                        "source": "marketing_campaigns / tenant_marketing_daily",
                                        "detection_method": "Portfolio efficiency benchmark (>1.15x blended & <55% spend share)",
                                    }
                                ],
                                "invalidation_conditions": ["High ROAS driven solely by branded search capture of existing organic intent."],
                            },
                            "model_performance_json": all_rev_perf,
                            "xai_json": xai_scale,
                            "evidence_json": evidence_base,
                            "expected_impact_json": {
                                "available": True,
                                "currency": currency,
                                "horizon_days": 30,
                                "baseline_vs_scenario": [
                                    {"metric": "Spend", "baseline": before.get("spend"), "scenario": choice.get("spend"), "delta": round((choice.get("spend") or 0) - (before.get("spend") or 0), 2), "unit": currency},
                                    {"metric": "Attributed Revenue", "baseline": before["revenue"], "scenario": choice["revenue"], "delta": choice["revenue_delta"], "unit": currency},
                                    {"metric": "Net Contribution Profit", "baseline": before["profit"], "scenario": choice["profit"], "delta": choice["profit_delta"], "unit": currency},
                                ],
                                "assumptions": proj["assumptions"],
                            },
                            "alternatives_json": {
                                "options": [
                                    {"option": "Option A (Keep Current Spend)", "name": before["name"], "profit_delta": 0, "effort": "None", "selected": False},
                                    *[
                                        {"option": f"Option {'B' if i==0 else 'C'}", "name": alt["name"], "revenue": alt["revenue"], "profit_delta": alt.get("profit_delta"), "roas": alt.get("roas"), "effort": "Low", "selected": choice["name"] == alt["name"]}
                                        for i, alt in enumerate(proj["alternatives"][:2])
                                    ],
                                ],
                                "selection_rationale": "Incremental step limits CPA spike risk.",
                            },
                            "action_plan_json": {"steps": [f"Shift +15% spend into non-branded {best_ch['name']} campaigns.", "Monitor daily CPA & incrementality holdout."]},
                            "assumptions_json": legacy_obj["assumptions"],
                            "risks_json": [legacy_obj["risk"]],
                            "data_scope_json": {"date_range": [str(start), str(end)], "channel": best_ch["name"], "records_analyzed": day_span},
                            "legacy_payload_json": legacy_obj,
                            "lineage_node_id": _dataset_lineage_node(cid, did, "output:recommendations_decisions"),
                        }
                    )
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # 5. COST & MARGIN OPTIMIZATION (`cost:margin:<low_margin_sku>`)
    # ------------------------------------------------------------------
    if caps.get("has_cost_or_profit", True) and caps.get("has_product", True):
        if dec:
            tx = tenant_transactions.c
            m_q = (
                sa.select(
                    tx.product_id,
                    tx.product_name,
                    sa.func.sum(tx.revenue).label("revenue"),
                    sa.func.sum(tx.total_cost).label("total_cost"),
                    sa.func.sum(tx.gross_profit).label("gross_profit"),
                    sa.func.avg(tx.discount_pct).label("avg_discount"),
                    sa.func.count().label("orders"),
                )
                .where(tx.company_id == cid, tx.dataset_id == did, tx.date.between(start, end))
                .group_by(tx.product_id, tx.product_name)
                .having(sa.func.sum(tx.revenue) > 0)
            )
        else:
            s, p = sales.c, products.c
            m_q = (
                sa.select(
                    s.product_id,
                    p.product_name,
                    sa.func.sum(s.revenue).label("revenue"),
                    sa.func.sum(s.total_cost).label("total_cost"),
                    sa.func.sum(s.gross_profit).label("gross_profit"),
                    sa.func.avg(s.discount_pct).label("avg_discount"),
                    sa.func.count().label("orders"),
                )
                .select_from(sales.join(products))
                .where(s.date.between(start, end))
                .group_by(s.product_id, p.product_name)
                .having(sa.func.sum(s.revenue) > 0)
            )
        sku_margins = [dict(r) for r in conn.execute(m_q).mappings()]
        for r in sku_margins:
            r["margin_pct"] = (float(r["gross_profit"] or 0) / max(1e-9, float(r["revenue"])))
        # Pick highest-cost-ratio (lowest margin) SKU with meaningful revenue >= 5% of median SKU
        sku_margins = [r for r in sku_margins if int(r["orders"] or 0) >= 3]
        if sku_margins:
            low_sku = min(sku_margins, key=lambda r: (r["margin_pct"], -float(r["revenue"])))
            avg_disc = float(low_sku.get("avg_discount") or 0)
            if low_sku["margin_pct"] < 0.42 or avg_disc >= 0.04:
                lpid = str(low_sku["product_id"])
                rec_key = f"cost:margin:{lpid[:32]}"
                sku_rev = float(low_sku["revenue"] or 0)
                sku_cost = float(low_sku["total_cost"] or 0)
                sku_gp = float(low_sku["gross_profit"] or 0)
                target_discount_trim = round(sku_rev * 0.03, 2)
                price_sim = None
                try:
                    if bundle:
                        fc_low = services.forecast(conn, info, ForecastRequest(target="demand", product=lpid, horizon=30))
                        price_sim = services.simulate(
                            conn, info, PriceRequest(type="price", objective="profit", parameters=PriceParams(product=lpid, discounts=[0.0, 0.02, 0.05]))
                        )
                except Exception:
                    price_sim = None

                sku_xai = _compute_forecast_xai(conn, info, bundle, target="revenue", scope=f"sku:{lpid}")
                conf = explainability.compute_confidence_score(
                    data_quality_score=dq_score,
                    evidence_completeness=0.86 if price_sim else 0.72,
                    model_perf=all_rev_perf,
                    sensitivity_spread=0.25 if price_sim else None,
                    day_span=day_span,
                    domain="cost_optimization",
                )
                xai_cost = explainability.explain_domain_attributions(
                    domain="cost_optimization",
                    title=f"Optimize COGS & discount leakage for {low_sku['product_name']}",
                    drivers=[
                        {"feature": "direct_cogs_share", "label": "Landed COGS Share of Revenue", "label_vi": "Tỷ trọng giá vốn trên doanh thu", "contribution_weight": (sku_cost / max(1.0, sku_rev)) * 100, "current_value": round((sku_cost / max(1.0, sku_rev)) * 100, 1), "direction": "negative", "unit": "%"},
                        {"feature": "realized_discount_rate", "label": "Average Applied Discount (%)", "label_vi": "Mức chiết khấu bình quân (%)", "contribution_weight": max(5.0, avg_disc * 100 * 2.5), "current_value": round(avg_disc * 100, 2), "direction": "negative", "unit": "%"},
                        {"feature": "gross_margin_rate", "label": "Current SKU Gross Margin (%)", "label_vi": "Biên lợi nhuận gộp hiện tại (%)", "contribution_weight": 30.0, "current_value": round(low_sku["margin_pct"] * 100, 1), "direction": "negative" if low_sku["margin_pct"] < 0.3 else "neutral", "unit": "%"},
                    ],
                    local_summary=f"{low_sku['product_name']} recorded {low_sku['margin_pct']*100:.1f}% gross margin ({sku_cost:,.0f} COGS vs {sku_rev:,.0f} revenue, avg discount {avg_disc*100:.1f}%).",
                    global_summary="Margin pressure scanner evaluates COGS share and discount erosion per active SKU across the reporting window.",
                    non_shap_reason="Cost & discount erosion audit uses transactional accounting identity (Revenue - COGS); TreeSHAP explains accompanying LightGBM revenue demand sensitivity.",
                    forecast_shap=sku_xai if sku_xai.get("shap_available") else all_rev_xai,
                )
                p_b = price_sim["baseline"] if price_sim else None
                p_r = price_sim["recommended"] if price_sim else None
                legacy_obj = dict(
                    id=rec_key,
                    title=f"Optimize unit cost & discount cap on {low_sku['product_name']}",
                    context=f"Gross margin sits at {low_sku['margin_pct']*100:.1f}% with {sku_cost/max(1.0,sku_rev)*100:.1f}% direct COGS ratio.",
                    action=f"Audit supplier unit cost and tighten promotional discounts below 5% on {low_sku['product_name']}.",
                    expected_impact=(
                        {"estimated_margin_protection_vnd": p_r["profit_delta"], "cogs_exposure_vnd": round(sku_cost, 2)}
                        if p_r
                        else {"discount_leakage_trim_estimate": target_discount_trim}
                    ),
                    assumptions=(list(price_sim["assumptions"]) if price_sim else ["Uses transactional realized price and direct COGS ledger."]),
                    risk="Sudden removal of discounts on price-elastic SKUs can contract order volume.",
                    uncertainty="Conditional price elasticity estimate or accounting sensitivity; supplier renegotiation requires procurement SLA.",
                    priority="medium",
                    score=58,
                    evidence={"sku": low_sku, "source": ["sales_transactions", "products"]},
                )
                specs.append(
                    {
                        "rec_key": rec_key,
                        "title": legacy_obj["title"],
                        "category_code": "cost_optimization",
                        "category_label": CATEGORY_BY_CODE["cost_optimization"]["vi"],
                        "priority": "medium",
                        "score": 58,
                        "problem_statement": f"{low_sku['product_name']} has the tightest margin profile ({low_sku['margin_pct']*100:.1f}%) among active multi-order SKUs due to {sku_cost/max(1.0,sku_rev)*100:.1f}% COGS load and {avg_disc*100:.1f}% avg discount.",
                        "recommended_action": legacy_obj["action"],
                        "goal": f"Expand gross margin on {low_sku['product_name']} by +2.0 to +3.0 percentage points while defending conversion.",
                        "creator": "Margin & Cost Structure Analyzer",
                        "owner": "Finance & Pricing Controller",
                        "deadline": end + timedelta(days=14),
                        "resources_needed": "Supplier quote comparison + pricing floor rule in POS/ERP",
                        "tracking_kpi": f"{low_sku['product_name']} Gross Margin (%) & Net Contribution/Order",
                        "success_criteria": f"Raise realized gross margin above {(low_sku['margin_pct']*100 + 2.5):.1f}% over 30 days.",
                        "stop_criteria": "Restore selective bundle promo if unit demand falls >15% vs baseline week.",
                        "confidence": conf,
                        "why_json": {
                            "triggers": [
                                {
                                    "metric": f"{low_sku['product_name']} Gross Margin",
                                    "current_value": round(low_sku["margin_pct"] * 100, 1),
                                    "comparison_value": 35.0,
                                    "delta_pct": round((low_sku["margin_pct"] - 0.35) * 100, 1),
                                    "window": f"{start}..{end}",
                                    "source": "sales_transactions",
                                    "detection_method": "Lowest margin rank across >=3-order SKUs",
                                }
                            ],
                            "invalidation_conditions": ["Intentional loss-leader SKU bundled to acquire high-LTV recurring customers."],
                        },
                        "model_performance_json": all_rev_perf,
                        "xai_json": xai_cost,
                        "evidence_json": evidence_base,
                        "expected_impact_json": {
                            "available": bool(p_b and p_r),
                            "currency": currency,
                            "horizon_days": 30,
                            "baseline_vs_scenario": (
                                [
                                    {"metric": "Projected 30d Gross Profit", "baseline": p_b["profit"], "scenario": p_r["profit"], "delta": p_r["profit_delta"], "unit": currency},
                                    {"metric": "Projected Revenue", "baseline": p_b["revenue"], "scenario": p_r["revenue"], "delta": p_r["revenue_delta"], "unit": currency},
                                ]
                                if (p_b and p_r)
                                else []
                            ),
                            "assumptions": legacy_obj["assumptions"],
                        },
                        "alternatives_json": {
                            "options": [
                                {"option": "Option A (Cap Promo Discount at 5%)", "name": "Tighten discount approval workflow", "effort": "Low", "risk_note": "Immediate leakage reduction.", "selected": True},
                                {"option": "Option B (Renegotiate COGS Volume Tier)", "name": "Request 3% volume rebate with supplier", "effort": "High", "risk_note": "Longer lead negotiation cycle.", "selected": False},
                            ],
                            "selection_rationale": "Discount guardrail delivers faster margin protection without supplier wait time.",
                        },
                        "action_plan_json": {"steps": [f"Audit orders on {low_sku['product_name']} with discount >= 10%.", "Enforce minimum margin guardrail in CRM/POS.", "Compare COGS across secondary suppliers."]},
                        "assumptions_json": legacy_obj["assumptions"],
                        "risks_json": [legacy_obj["risk"]],
                        "data_scope_json": {"date_range": [str(start), str(end)], "product_id": lpid, "entity": low_sku["product_name"], "records_analyzed": int(low_sku["orders"] or 0)},
                        "legacy_payload_json": legacy_obj,
                        "lineage_node_id": _dataset_lineage_node(cid, did, "output:recommendations_decisions"),
                    }
                )

    # ------------------------------------------------------------------
    # 6. CUSTOMER RETENTION COHORT SIGNAL (`customer:retention`)
    # ------------------------------------------------------------------
    if caps.get("has_customer", True):
        tot = evidence_base["kpi_cards"]
        cust_now = sales_total(conn, start, end, {}, info=info)
        total_c = int(cust_now.get("customers") or 0)
        ret_c = int(cust_now.get("returning_customers") or 0)
        new_c = int(cust_now.get("new_customers") or 0)
        if total_c >= 10:
            ret_share = ratio(ret_c, total_c) or 0.0
            prior_ret_share = None
            if has_prior:
                cust_prior = sales_total(conn, *prior, {}, info=info)
                prior_ret_share = ratio(cust_prior.get("returning_customers") or 0, cust_prior.get("customers") or 0)
            should_flag_cust = ret_share < 0.72 or (prior_ret_share is not None and ret_share < prior_ret_share)
            if should_flag_cust:
                rec_key = "customer:retention"
                conf = explainability.compute_confidence_score(
                    data_quality_score=dq_score,
                    evidence_completeness=0.65,
                    model_perf={"forecast": {"available": False}, "anomaly": {"available": False}},
                    sensitivity_spread=None,
                    day_span=day_span,
                    domain="customer",
                )
                xai_cust = explainability.explain_domain_attributions(
                    domain="customer",
                    title="Strengthen repeat purchase retention among recent buyers",
                    drivers=[
                        {"feature": "returning_customer_ratio", "label": "Returning Customer Share", "label_vi": "Tỷ trọng khách quay lại", "contribution_weight": (1.0 - ret_share) * 100, "current_value": round(ret_share * 100, 1), "reference_value": round((prior_ret_share or 0.65) * 100, 1), "direction": "negative", "unit": "%"},
                        {"feature": "new_acquisition_count", "label": "First-Time Period Buyers", "label_vi": "Khách mua lần đầu trong kỳ", "contribution_weight": 35.0, "current_value": new_c, "direction": "neutral", "unit": "customers"},
                    ],
                    local_summary=f"Of {total_c:,} active customers in [{start}..{end}], {ret_c:,} ({ret_share*100:.1f}%) are returning vs {new_c:,} new buyers.",
                    global_summary="Cohort SQL telemetry tracks first-order vs repeat purchase ratio; no supervised Churn ML classifier is trained in this version.",
                    non_shap_reason="Customer cohort analysis uses SQL transaction cohort aggregation (no supervised Churn/Propensity LightGBM model is integrated — zero fabricated churn probabilities).",
                    forecast_shap=None,
                )
                legacy_obj = dict(
                    id=rec_key,
                    title="Strengthen repeat purchase retention among recent buyers",
                    context=f"Returning customers represent {ret_share*100:.1f}% of {total_c:,} buyers in {start}..{end}.",
                    action="Launch post-purchase lifecycle follow-up (Day 14 / Day 30) targeting first-time buyers and measure repeat conversion.",
                    expected_impact=None,
                    assumptions=[
                        "Cohort retention is derived strictly from customer_id repeat transactions.",
                        "No Churn Prediction ML classifier is integrated; incremental LTV gain requires controlled CRM A/B holdout.",
                    ],
                    risk="Blanket retention discounts can train repeat buyers to wait for coupons.",
                    uncertainty="Cohort heuristic only — insufficient causal evidence for projected revenue lift without CRM holdout.",
                    priority="medium",
                    score=52,
                    evidence={"customers": total_c, "returning": ret_c, "new": new_c, "source": ["customers", "sales_transactions"]},
                )
                specs.append(
                    {
                        "rec_key": rec_key,
                        "title": legacy_obj["title"],
                        "category_code": "customer",
                        "category_label": CATEGORY_BY_CODE["customer"]["vi"],
                        "priority": "medium",
                        "score": 52,
                        "problem_statement": f"Returning customer ratio sits at {ret_share*100:.1f}% ({ret_c:,}/{total_c:,}), leaving repeat order velocity dependent on paid new acquisition.",
                        "recommended_action": legacy_obj["action"],
                        "goal": "Raise 30-day repeat purchase share without blanket margin-eroding discounts.",
                        "creator": "Customer Cohort Analyzer",
                        "owner": "CRM & Retention Owner",
                        "deadline": end + timedelta(days=21),
                        "resources_needed": "Automated post-purchase email/Zalo workflow + 10% holdout control group",
                        "tracking_kpi": "Returning Customer Ratio (%) & Repeat Order Conversion",
                        "success_criteria": "Lift returning cohort conversion +3pp vs randomized non-messaged holdout.",
                        "stop_criteria": "Stop incentives if cohort gross profit minus coupon cost turns negative.",
                        "confidence": conf,
                        "why_json": {
                            "triggers": [
                                {
                                    "metric": "Returning Customer Share",
                                    "current_value": round(ret_share * 100, 1),
                                    "comparison_value": round((prior_ret_share or 0.65) * 100, 1),
                                    "delta_pct": round((ret_share - (prior_ret_share or 0.65)) * 100, 1),
                                    "window": f"{start}..{end}",
                                    "source": "customers + sales_transactions",
                                    "detection_method": "First-purchase cohort SQL partition",
                                }
                            ],
                            "invalidation_conditions": ["B2B annual contract cadence naturally exhibits >90-day repurchase intervals."],
                        },
                        "model_performance_json": {"available": False, "status_label": "Chưa đủ dữ liệu đánh giá (No Churn ML Model Integrated)", "separation_disclosure": "Customer cohort rules do not run a supervised ML classifier; metrics remain unverified."},
                        "xai_json": xai_cust,
                        "evidence_json": evidence_base,
                        "expected_impact_json": {"available": False, "reason": "Insufficient evidence for dollar impact without supervised uplift / CRM holdout test.", "baseline_vs_scenario": []},
                        "alternatives_json": {
                            "options": [
                                {"option": "Option A (Value-Added Onboarding Guide)", "name": "Automated usage tips & care reminder (0% discount)", "effort": "Low", "risk_note": "Zero margin cost.", "selected": True},
                                {"option": "Option B (VIP Cross-Sell Bundle)", "name": "Test accessory bundle offer on Day 21", "effort": "Medium", "risk_note": "Requires stock availability sync.", "selected": False},
                            ],
                            "selection_rationale": "Zero-discount lifecycle messaging establishes causal baseline first.",
                        },
                        "action_plan_json": {"steps": ["Export single-order customer cohort from last 45 days.", "Run 90/10 split test on Day-14 retention touchpoint."]},
                        "assumptions_json": legacy_obj["assumptions"],
                        "risks_json": [legacy_obj["risk"]],
                        "data_scope_json": {"date_range": [str(start), str(end)], "records_analyzed": total_c},
                        "legacy_payload_json": legacy_obj,
                        "lineage_node_id": _dataset_lineage_node(cid, did, "output:recommendations_decisions"),
                    }
                )

    # ------------------------------------------------------------------
    # 7. OPERATIONS SLA & FULFILLMENT AVAILABILITY (`ops:availability`)
    # ------------------------------------------------------------------
    if caps.get("has_inventory", True):
        avail = availability(conn, start, end, {}, info=info)
        stockout_alerts = [r for r in candidates if r["metric"] == "stockout_risk"]
        if avail is not None and (avail < 0.985 or len(stockout_alerts) >= 1):
            rec_key = "ops:availability"
            conf = explainability.compute_confidence_score(
                data_quality_score=dq_score,
                evidence_completeness=0.80,
                model_perf=all_rev_perf,
                sensitivity_spread=None,
                day_span=day_span,
                domain="operations",
            )
            xai_ops = explainability.explain_domain_attributions(
                domain="operations",
                title="Tighten warehouse reorder triggers & multi-SKU buffer cadence",
                drivers=[
                    {"feature": "catalog_availability_pct", "label": "Period Physical Stock Availability (%)", "label_vi": "Tỷ lệ sẵn có tồn kho vật lý (%)", "contribution_weight": max(10.0, (1.0 - avail) * 1000), "current_value": round(avail * 100, 2), "reference_value": 98.0, "direction": "negative", "unit": "%"},
                    {"feature": "flagged_stockout_skus", "label": "SKUs Flagged at Lead-Time Risk", "label_vi": "Số SKU có nguy cơ đứt hàng", "contribution_weight": max(10.0, len(stockout_alerts) * 15.0), "current_value": len(stockout_alerts), "direction": "negative", "unit": "SKUs"},
                ],
                local_summary=f"Catalog stock availability averaged {avail*100:.2f}% in [{start}..{end}] with {len(stockout_alerts)} SKU lead-time alert(s).",
                global_summary="Operational readiness monitors catalog-wide SKU-day availability and multi-SKU reorder buffer breaches.",
                non_shap_reason="Operations SLA check relies on deterministic warehouse ledger ratios rather than a tree model.",
                forecast_shap=all_rev_xai,
            )
            legacy_obj = dict(
                id=rec_key,
                title="Standardize automated safety-stock reorder triggers",
                context=f"Physical SKU-day availability stands at {avail*100:.2f}% across {len(stockout_alerts)} flagged alert(s).",
                action="Calibrate ERP reorder points to cover trailing 28-day peak velocity × supplier lead-time + 3-day safety buffer.",
                expected_impact={"target_availability_pct": 98.5, "current_availability_pct": round(avail * 100, 2)},
                assumptions=["Assumes supplier lead times in catalog accurately reflect current transit SLA."],
                risk="Uniformly higher safety stock raises warehouse holding costs on slow-moving SKUs.",
                uncertainty="Operational SLA target; cash carrying impact depends on SKU ABC classification.",
                priority="medium",
                score=48,
                evidence={"availability": avail, "stockout_alerts": len(stockout_alerts), "source": ["inventory_daily", "products"]},
            )
            specs.append(
                {
                    "rec_key": rec_key,
                    "title": legacy_obj["title"],
                    "category_code": "operations",
                    "category_label": CATEGORY_BY_CODE["operations"]["vi"],
                    "priority": "medium",
                    "score": 48,
                    "problem_statement": f"Fulfillment SLA exposure observed: catalog availability {avail*100:.2f}% vs 98.5% operational target across {len(stockout_alerts)} SKU alert(s).",
                    "recommended_action": legacy_obj["action"],
                    "goal": "Achieve >=98.5% physical SKU-day stock availability on A-class revenue drivers.",
                    "creator": "Operations SLA Monitor",
                    "owner": "Operations & Warehouse Manager",
                    "deadline": end + timedelta(days=14),
                    "resources_needed": "Weekly ERP reorder-point sync across A/B SKU tiers",
                    "tracking_kpi": "Physical SKU-Day Availability (%) & Lead-Time Variance",
                    "success_criteria": "Zero A-class SKU stockouts for 30 consecutive operating days.",
                    "stop_criteria": "Exclude C-class long-tail SKUs with >60 days inventory cover.",
                    "confidence": conf,
                    "why_json": {
                        "triggers": [
                            {
                                "metric": "Inventory Availability Rate",
                                "current_value": round(avail * 100, 2),
                                "comparison_value": 98.5,
                                "delta_pct": round((avail - 0.985) * 100, 2),
                                "window": f"{start}..{end}",
                                "source": "inventory_daily / tenant_inventory_daily",
                                "detection_method": "Catalog physical SKU-day closing_stock > 0 ratio",
                            }
                        ],
                        "invalidation_conditions": ["Intentional end-of-life SKU clearance."],
                    },
                    "model_performance_json": all_rev_perf,
                    "xai_json": xai_ops,
                    "evidence_json": evidence_base,
                    "expected_impact_json": {"available": False, "reason": "Operational service-level uplift depends on SKU ABC tiering; run single-SKU Inventory Simulator for VND impact.", "baseline_vs_scenario": []},
                    "alternatives_json": {
                        "options": [
                            {"option": "Option A (ABC Tiered Buffer)", "name": "Apply +3d safety buffer to Top-20% revenue SKUs only", "effort": "Low", "risk_note": "Minimizes excess inventory carrying cost.", "selected": True},
                            {"option": "Option B (Catalog-Wide Flat Buffer)", "name": "Raise reorder point uniformly across all physical SKUs", "effort": "Low", "risk_note": "Ties up working capital on slow movers.", "selected": False},
                        ],
                        "selection_rationale": "ABC prioritization avoids overstocking slow SKUs while protecting core revenue.",
                    },
                    "action_plan_json": {"steps": ["Classify SKUs by trailing 90d revenue (ABC).", "Update safety_stock parameter in ERP & Scenario Simulator."]},
                    "assumptions_json": legacy_obj["assumptions"],
                    "risks_json": [legacy_obj["risk"]],
                    "data_scope_json": {"date_range": [str(start), str(end)], "records_analyzed": day_span},
                    "legacy_payload_json": legacy_obj,
                    "lineage_node_id": _dataset_lineage_node(cid, did, "output:recommendations_decisions"),
                }
            )

    # ------------------------------------------------------------------
    # 8. AI & DATA GOVERNANCE RISK (`risk:governance`)
    # ------------------------------------------------------------------
    fc_all = all_rev_perf.get("forecast") or {}
    wape_val = fc_all.get("wape")
    cov_val = fc_all.get("test_coverage")
    short_win = bool(fc_all.get("short_window_fallback"))
    unverified_anom = any(r.get("status") != "evaluated" for r in anom_quality)
    needs_gov = bool(
        dq_score < 92.0
        or short_win
        or (wape_val is not None and wape_val > 0.20)
        or (cov_val is not None and cov_val < 0.85)
        or unverified_anom
    )
    if needs_gov:
        rec_key = "risk:governance"
        issues_found = []
        if dq_score < 92.0:
            issues_found.append(f"dataset quality {dq_score:.1f}/100")
        if short_win:
            issues_found.append(f"short {day_span}d history (<201d LightGBM minimum)")
        if wape_val is not None and wape_val > 0.20:
            issues_found.append(f"holdout WAPE {wape_val:.1%} > 20%")
        if cov_val is not None and cov_val < 0.85:
            issues_found.append(f"interval coverage {cov_val:.0%} < 85%")
        if unverified_anom:
            issues_found.append("limited/unverified anomaly ground-truth labels")

        conf = explainability.compute_confidence_score(
            data_quality_score=dq_score,
            evidence_completeness=0.78,
            model_perf=all_rev_perf,
            sensitivity_spread=None,
            day_span=day_span,
            domain="risk_governance",
        )
        xai_gov = explainability.explain_domain_attributions(
            domain="risk_governance",
            title="Enforce Human-in-the-Loop guardrails & expand evaluation coverage",
            drivers=[
                {"feature": "data_quality_score", "label": "Dataset Quality Index (/100)", "label_vi": "Chỉ số chất lượng dữ liệu (/100)", "contribution_weight": max(5.0, 100 - dq_score), "current_value": round(dq_score, 1), "reference_value": 95.0, "direction": "negative" if dq_score < 92 else "positive", "unit": "pts"},
                {"feature": "forecast_wape", "label": "Holdout Forecast WAPE", "label_vi": "Sai số dự báo WAPE", "contribution_weight": (float(wape_val or 0.25) * 100), "current_value": round((wape_val or 0) * 100, 1) if wape_val is not None else None, "reference_value": 20.0, "direction": "negative" if (wape_val or 0) > 0.2 else "positive", "unit": "%"},
                {"feature": "calibration_coverage", "label": "90% Interval Holdout Coverage", "label_vi": "Độ bao phủ thực tế (90% danh nghĩa)", "contribution_weight": max(5.0, abs(0.90 - float(cov_val or 0.8)) * 100), "current_value": round((cov_val or 0) * 100, 1) if cov_val is not None else None, "reference_value": 90.0, "direction": "negative" if (cov_val or 1) < 0.85 else "positive", "unit": "%"},
            ],
            local_summary=f"Model/data telemetry flagged governance controls: {'; '.join(issues_found)}.",
            global_summary="Continuous governance audits holdout accuracy, calibration coverage, anomaly label verification, and data quality prior to autonomous action.",
            non_shap_reason="Governance compliance gating evaluates calibration & quality thresholds rather than tree splits.",
            forecast_shap=all_rev_xai,
        )
        legacy_obj = dict(
            id=rec_key,
            title="Require human sign-off & remediate model calibration / data gaps",
            context=f"Governance check surfaced: {', '.join(issues_found)}.",
            action="Enforce analyst dual-review on high-impact financial recommendations and record post-implementation outcomes.",
            expected_impact=None,
            assumptions=["Model governance prevents over-reliance on uncalibrated confidence or unverified anomaly detectors."],
            risk="Acting on unverified signals without post-implementation KPI tracking masks concept drift.",
            uncertainty="Governance control policy — impact measured via decision audit compliance & false-positive reduction.",
            priority="high" if (dq_score < 80 or (wape_val or 0) > 0.30) else "low",
            score=72 if (dq_score < 80 or (wape_val or 0) > 0.30) else 42,
            evidence={"issues": issues_found, "quality_score": dq_score, "anomaly_quality": anom_quality},
        )
        specs.append(
            {
                "rec_key": rec_key,
                "title": legacy_obj["title"],
                "category_code": "risk_governance",
                "category_label": CATEGORY_BY_CODE["risk_governance"]["vi"],
                "priority": legacy_obj["priority"],
                "score": legacy_obj["score"],
                "problem_statement": f"Audit & model telemetry detected governance constraints: {', '.join(issues_found)}.",
                "recommended_action": legacy_obj["action"],
                "goal": "Maintain tamper-evident HITL accountability and close post-implementation feedback loops.",
                "creator": "Model Governance & Compliance Guard",
                "owner": "Risk & BI Administrator",
                "deadline": end + timedelta(days=30),
                "resources_needed": "Monthly outcome review + incident label tagging in Audit",
                "tracking_kpi": "% Recommendations with Post-Impl Outcome Evaluation",
                "success_criteria": ">=80% of implemented recommendations evaluated with observed post-launch KPI within 30 days.",
                "stop_criteria": "Suspend automated recommendations if PSI > 0.25 until model retraining completes.",
                "confidence": conf,
                "why_json": {
                    "triggers": [
                        {
                            "metric": "Governance & Calibration Guard",
                            "current_value": ", ".join(issues_found),
                            "comparison_value": "WAPE <= 20%, Coverage >= 85%, Verified Labels, Quality >= 92",
                            "delta_pct": None,
                            "window": f"{start_bound}..{end}",
                            "source": "model_evaluations + dataset_quality_reports",
                            "detection_method": "Multi-axis governance rule check",
                        }
                    ],
                    "invalidation_conditions": ["Model retrained on 201+ clean days with calibrated coverage >= 90% and verified labels."],
                },
                "model_performance_json": all_rev_perf,
                "xai_json": xai_gov,
                "evidence_json": evidence_base,
                "expected_impact_json": {"available": False, "reason": "Governance risk mitigation reduces costly false-positive actions.", "baseline_vs_scenario": []},
                "alternatives_json": {
                    "options": [
                        {"option": "Option A (HITL Dual Sign-off + Outcome Logging)", "name": "Require analyst review & 30d post-impl check", "effort": "Low", "risk_note": "Full compliance & hash-chain trace.", "selected": True},
                        {"option": "Option B (Retrain with 201d+ Historical Backfill)", "name": "Import additional historical months & recalibrate", "effort": "Medium", "risk_note": "Requires historical ERP export.", "selected": False},
                    ],
                    "selection_rationale": "Enables safe enterprise use immediately while historical coverage is expanded.",
                },
                "action_plan_json": {"steps": ["Review open drift/quality alerts in Audit & Governance.", "Require Outcome Evaluation 14–30d after each Approved action."]},
                "assumptions_json": legacy_obj["assumptions"],
                "risks_json": [legacy_obj["risk"]],
                "data_scope_json": {"date_range": [str(start_bound), str(end)], "records_analyzed": day_span},
                "legacy_payload_json": legacy_obj,
                "lineage_node_id": _dataset_lineage_node(cid, did, "output:recommendations_decisions"),
            }
        )

    return specs


def _sync_model_evaluations_and_risks(
    conn: sa.Connection,
    info: dict[str, Any],
    bundle: dict[str, Any] | None,
    recs: list[dict[str, Any]],
) -> None:
    """Persist real model evaluations (metrics + PSI/Z-shift drift + 17-feature schema) & genuine rule-based risk alerts."""
    cid, did = info["company_id"], info["dataset_id"]
    caps = info.get("capabilities") or {}
    quality_row = _latest_quality_report(conn, cid, did)
    dq_score = quality_row["overall_score"] if quality_row else (96.0 if not is_partitioned(info) else (info.get("quality_score") or 90.0))

    try:
        dates, labels, matrices, _ = observed_series(conn, info)
    except Exception:
        dates, labels, matrices = [], [], {}

    split = (bundle or {}).get("split") or {}
    train_s = date.fromisoformat(split["train"][0]) if split.get("train") else (dates[0] if dates else None)
    train_e = date.fromisoformat(split["train"][1]) if split.get("train") else (dates[-1] if dates else None)

    feature_schema = [
        {"name": f, "label": explainability.FEATURE_LABELS[f]["en"], "dtype": "float64", "required": True}
        for f in FEATURES
    ]

    eval_records: list[dict[str, Any]] = []
    if bundle and "forecast" in bundle:
        for target in ("revenue", "orders", "demand"):
            if target not in bundle["forecast"]:
                continue
            perf = explainability.evaluate_model_performance(bundle=bundle, target=target, scope="all", horizon=30)
            fc = perf.get("forecast") or {}
            if not fc.get("available"):
                continue
            vals = matrices.get(target)[labels.index("all")] if ("all" in labels and target in matrices) else []
            drift = explainability.compute_series_drift(vals, dates) if len(dates) else {"available": False, "status": "insufficient_history", "drift_detected": False}
            eval_id = _det_id("meval", cid, did, f"forecast:{target}")
            eval_records.append(
                dict(
                    id=eval_id,
                    company_id=cid,
                    dataset_id=did,
                    model_name=f"Forecast:{target.title()} ({fc.get('selected_model', 'model')})",
                    model_version=str(bundle.get("version") or "local-model"),
                    task_type="time_series_regression",
                    training_dataset_ref=f"{did} (train window)",
                    eval_dataset_ref=f"{did} (holdout test)",
                    train_date_start=train_s,
                    train_date_end=train_e,
                    metrics_json=fc,
                    baseline_comparison_json={
                        "baseline_model": fc.get("baseline_model"),
                        "baseline_test_mae": fc.get("baseline_test_mae"),
                        "baseline_test_wape": fc.get("baseline_test_wape"),
                        "selected_model": fc.get("selected_model"),
                        "selected_test_mae": fc.get("mae"),
                    },
                    feature_schema_json=feature_schema,
                    drift_status_json=drift,
                    owner="ai-pipeline",
                    status=fc.get("status", "evaluated"),
                )
            )

    anom_signals = services.model_quality(info)["anomaly"]
    if anom_signals:
        eval_id = _det_id("meval", cid, did, "anomaly:hybrid")
        eval_records.append(
            dict(
                id=eval_id,
                company_id=cid,
                dataset_id=did,
                model_name="Anomaly Radar (Hybrid IsolationForest + Robust-Z)",
                model_version=str((bundle or {}).get("version") or "statistical-detector"),
                task_type="anomaly_detection",
                training_dataset_ref=f"{did} (70% chronological prefix)",
                eval_dataset_ref=f"{did} (15% test slice)",
                train_date_start=train_s,
                train_date_end=train_e,
                metrics_json={"per_metric": anom_signals},
                baseline_comparison_json={"methods": ["hybrid", "z_score", "robust_z", "iqr"]},
                feature_schema_json=[
                    {"name": "robust_z", "label": "56d Median/IQR Robust Z", "dtype": "float64", "required": True},
                    {"name": "z", "label": "Rolling Window Z-Score", "dtype": "float64", "required": True},
                    {"name": "relative_deviation", "label": "Relative % Deviation", "dtype": "float64", "required": True},
                ],
                drift_status_json={"available": False, "status": "rule_telemetry", "drift_detected": False},
                owner="ai-pipeline",
                status="evaluated" if any(s.get("status") == "evaluated" for s in anom_signals) else "limited",
            )
        )

    for rec in eval_records:
        existing = conn.scalar(sa.select(model_evaluations.c.id).where(model_evaluations.c.id == rec["id"]))
        if existing:
            conn.execute(model_evaluations.update().where(model_evaluations.c.id == rec["id"]).values(**{k: v for k, v in rec.items() if k != "id"}))
        else:
            conn.execute(model_evaluations.insert().values(**rec))

    # Build genuine rule-based Audit Risk & Compliance alerts
    risk_specs: list[dict[str, Any]] = []
    if dq_score < 90.0 or (quality_row and (quality_row["invalid_rows"] > 0 or quality_row["duplicate_records_count"] > 0)):
        sev = "critical" if dq_score < 70 else ("high" if dq_score < 85 else "medium")
        risk_specs.append(
            dict(
                risk_key="data_quality_issues",
                severity=sev,
                category="data_quality",
                title=f"Dataset quality alert ({dq_score:.1f}/100)",
                description=(
                    f"Uploaded dataset '{info['title']}' reported {quality_row['invalid_rows'] if quality_row else 0} invalid row(s), "
                    f"{quality_row['duplicate_records_count'] if quality_row else 0} duplicate(s), and {quality_row['missing_values_count'] if quality_row else 0} missing cell(s)."
                    if quality_row
                    else f"Data quality index is {dq_score:.1f}/100."
                ),
                evidence_json={"quality_score": dq_score, "invalid_rows": quality_row["invalid_rows"] if quality_row else 0},
                affected_entity_id=did,
                affected_entity_type="dataset",
                remediation="Inspect error rows in Data Sources Quality Report and confirm deduplication / schema cleanup.",
            )
        )

    for me in eval_records:
        ds_drift = me.get("drift_status_json") or {}
        if ds_drift.get("drift_detected"):
            sev = "high" if ds_drift.get("status") == "critical" else "medium"
            risk_specs.append(
                dict(
                    risk_key=f"drift:{me['id']}",
                    severity=sev,
                    category="data_drift",
                    title=f"Distribution drift detected on {me['model_name']}",
                    description=f"Recent 30d window shifted vs training baseline (PSI={ds_drift.get('psi')}, Z-shift={ds_drift.get('mean_z_shift')}).",
                    evidence_json=ds_drift,
                    affected_entity_id=me["id"],
                    affected_entity_type="model",
                    remediation="Review recent demand drivers and schedule model retraining on latest observations.",
                )
            )
        m_json = me.get("metrics_json") or {}
        wape = m_json.get("wape")
        cov = m_json.get("test_coverage")
        if m_json.get("short_window_fallback"):
            risk_specs.append(
                dict(
                    risk_key=f"short_window:{me['id']}",
                    severity="medium",
                    category="model_limitation",
                    title=f"Statistical fallback active on {me['model_name']} (<201d history)",
                    description="Dataset spans under 201 calendar days; causal baseline runs instead of LightGBM & TreeSHAP is unavailable.",
                    evidence_json={"target": m_json.get("target"), "selected_model": m_json.get("selected_model")},
                    affected_entity_id=me["id"],
                    affected_entity_type="model",
                    remediation="Upload >= 7 months of daily history to enable full LightGBM training and TreeSHAP explanations.",
                )
            )
        elif (wape is not None and wape > 0.25) or (cov is not None and cov < 0.85):
            risk_specs.append(
                dict(
                    risk_key=f"perf_degradation:{me['id']}",
                    severity="high" if (wape or 0) > 0.35 or (cov or 1) < 0.78 else "medium",
                    category="performance_degradation",
                    title=f"Model accuracy/calibration warning on {me['model_name']}",
                    description=f"Holdout WAPE={(wape or 0):.1%}, observed interval coverage={(cov or 0):.0%} (nominal 90%).",
                    evidence_json={"wape": wape, "test_coverage": cov, "mae": m_json.get("mae")},
                    affected_entity_id=me["id"],
                    affected_entity_type="model",
                    remediation="Add safety contingency buffer and review anomaly spikes impacting recent residuals.",
                )
            )

    missing_caps = [name for name, key in [("Cost / Profit", "has_cost_or_profit"), ("Inventory", "has_inventory"), ("Marketing Spend", "has_marketing")] if not caps.get(key, True)]
    if missing_caps:
        risk_specs.append(
            dict(
                risk_key="missing_optional_columns",
                severity="low",
                category="missing_features",
                title=f"Optional BI columns unmapped: {', '.join(missing_caps)}",
                description="Recommendations in unmapped domains are withheld rather than fabricated.",
                evidence_json={"missing_capabilities": missing_caps},
                affected_entity_id=did,
                affected_entity_type="dataset",
                remediation="Map Cost, Inventory, and Marketing Spend fields during ingestion to unlock full XAI coverage.",
            )
        )

    insuff_recs = [r for r in recs if r.get("confidence_level") == "Insufficient Evidence"]
    if insuff_recs:
        risk_specs.append(
            dict(
                risk_key="insufficient_evidence_decisions",
                severity="medium",
                category="evidence_insufficiency",
                title=f"{len(insuff_recs)} active recommendation(s) lack sufficient causal/impact evidence",
                description="These recommendations expose diagnostic evidence honestly and must not be auto-executed without A/B validation.",
                evidence_json={"rec_keys": [r["rec_key"] for r in insuff_recs]},
                affected_entity_id=insuff_recs[0]["id"],
                affected_entity_type="recommendation",
                remediation="Collect controlled holdout experiment metrics and log outcomes in Decision Evaluation.",
            )
        )

    for rs in risk_specs:
        rid = _det_id("risk", cid, did, rs["risk_key"])
        existing = conn.execute(sa.select(audit_risk_alerts).where(audit_risk_alerts.c.id == rid)).mappings().first()
        if existing:
            # Preserve manual acknowledged/resolved states
            if existing["status"] in {"acknowledged", "resolved"}:
                continue
            conn.execute(
                audit_risk_alerts.update()
                .where(audit_risk_alerts.c.id == rid)
                .values(
                    severity=rs["severity"],
                    title=rs["title"],
                    description=rs["description"],
                    evidence_json=rs["evidence_json"],
                    remediation=rs["remediation"],
                )
            )
        else:
            conn.execute(
                audit_risk_alerts.insert().values(
                    id=rid,
                    company_id=cid,
                    dataset_id=did,
                    risk_key=rs["risk_key"],
                    severity=rs["severity"],
                    category=rs["category"],
                    title=rs["title"],
                    description=rs["description"],
                    evidence_json=rs["evidence_json"],
                    affected_entity_id=rs["affected_entity_id"],
                    affected_entity_type=rs["affected_entity_type"],
                    remediation=rs["remediation"],
                    status="open",
                )
            )


def _needs_legacy_status_sync(conn: sa.Connection, company_id: str, did: str, existing_rows: dict[str, dict[str, Any]]) -> dict[str, str]:
    legacy_fb_rows = conn.execute(
        sa.select(audit.c.subject, audit.c.payload)
        .where(audit.c.company_id == company_id, audit.c.kind == "recommendation_feedback")
        .order_by(audit.c.id.asc())
    ).mappings().all()
    legacy_decision_map: dict[str, str] = {}
    for lr in legacy_fb_rows:
        pl = lr.get("payload") or {}
        if pl.get("dataset_id") == did and pl.get("decision"):
            legacy_decision_map[str(lr["subject"])] = str(pl["decision"])
    return legacy_decision_map


def ensure_governance_synced(
    engine: sa.Engine,
    company_id: str,
    dataset_id: str | None = None,
    actor: str = "system",
    *,
    force_resync: bool = False,
) -> dict[str, Any] | None:
    """Ensure active dataset recommendations, model evaluations, and risk alerts are persisted and synced."""
    with engine.connect() as rconn:
        info = _safe_dataset_info(rconn, company_id, dataset_id)
        if not info:
            return None
        did = info["dataset_id"]
        fast_rows = {
            r["rec_key"]: dict(r)
            for r in rconn.execute(
                sa.select(
                    xai_recommendations.c.id,
                    xai_recommendations.c.rec_key,
                    xai_recommendations.c.status,
                    xai_recommendations.c.model_performance_json,
                ).where(
                    xai_recommendations.c.company_id == company_id,
                    xai_recommendations.c.dataset_id == did,
                )
            ).mappings()
        }
        meval_count = int(
            rconn.scalar(
                sa.select(sa.func.count())
                .select_from(model_evaluations)
                .where(model_evaluations.c.company_id == company_id, model_evaluations.c.dataset_id == did)
            )
            or 0
        )

    bundle = services.artifact(info)
    if not force_resync and fast_rows and meval_count > 0:
        has_fc_perf = any((r.get("model_performance_json") or {}).get("forecast", {}).get("available") for r in fast_rows.values())
        if bundle is None or has_fc_perf or "forecast" not in (bundle or {}):
            # Sync any unapplied legacy feedback statuses quickly without re-running TreeSHAP/permutation sweeps
            with engine.connect() as rconn2:
                legacy_decision_map = _needs_legacy_status_sync(rconn2, company_id, did, fast_rows)
            pending_updates = [
                (r["id"], _decision_to_status_default(legacy_decision_map[rkey]))
                for rkey, r in fast_rows.items()
                if r["status"] == "pending"
                and rkey in legacy_decision_map
                and _decision_to_status_default(legacy_decision_map[rkey]) != "pending"
            ]
            if pending_updates:
                with engine.begin() as uconn:
                    for rec_id, st in pending_updates:
                        uconn.execute(
                            xai_recommendations.update()
                            .where(xai_recommendations.c.id == rec_id)
                            .values(status=st, is_new=False, updated_at=_utc_now())
                        )
            return info

    with engine.begin() as conn:
        _lock_db(conn)
        did = info["dataset_id"]

        # Re-read inside lock so concurrent requests don't double-compute
        existing_rows = {
            r["rec_key"]: dict(r)
            for r in conn.execute(
                sa.select(xai_recommendations).where(
                    xai_recommendations.c.company_id == company_id,
                    xai_recommendations.c.dataset_id == did,
                )
            ).mappings()
        }
        meval_locked = int(
            conn.scalar(
                sa.select(sa.func.count())
                .select_from(model_evaluations)
                .where(model_evaluations.c.company_id == company_id, model_evaluations.c.dataset_id == did)
            )
            or 0
        )
        if not force_resync and existing_rows and meval_locked > 0:
            has_fc_perf_locked = any((r.get("model_performance_json") or {}).get("forecast", {}).get("available") for r in existing_rows.values())
            if bundle is None or has_fc_perf_locked or "forecast" not in (bundle or {}):
                return info

        legacy_decision_map = _needs_legacy_status_sync(conn, company_id, did, existing_rows)

        specs = _build_candidate_specs(conn, info, bundle)
        persisted: list[dict[str, Any]] = []
        now = _utc_now()
        for sp in specs:
            rkey = sp["rec_key"]
            rec_id = _det_id("rec", company_id, did, rkey)
            existing = existing_rows.get(rkey)
            conf = sp["confidence"]

            if existing:
                keep_status = existing["status"]
                if keep_status == "pending" and rkey in legacy_decision_map:
                    keep_status = _decision_to_status_default(legacy_decision_map[rkey])
                conn.execute(
                    xai_recommendations.update()
                    .where(xai_recommendations.c.id == existing["id"])
                    .values(
                        title=sp["title"],
                        category_code=sp["category_code"],
                        category_label=sp["category_label"],
                        priority=sp["priority"],
                        status=keep_status,
                        problem_statement=sp["problem_statement"],
                        recommended_action=sp["recommended_action"],
                        goal=sp["goal"],
                        confidence_level=conf["level"],
                        confidence_score=conf["score"],
                        confidence_components_json=conf,
                        why_json=sp["why_json"],
                        model_performance_json=sp["model_performance_json"],
                        xai_json=sp["xai_json"],
                        evidence_json=sp["evidence_json"],
                        expected_impact_json=sp["expected_impact_json"],
                        alternatives_json=sp["alternatives_json"],
                        action_plan_json=sp["action_plan_json"],
                        assumptions_json=sp["assumptions_json"],
                        risks_json=sp["risks_json"],
                        data_scope_json=sp["data_scope_json"],
                        legacy_payload_json=sp["legacy_payload_json"],
                        lineage_node_id=sp["lineage_node_id"],
                        score=sp["score"],
                        updated_at=now,
                    )
                )
                persisted.append({**existing, **sp, "id": existing["id"], "status": keep_status, "confidence_level": conf["level"], "confidence_score": conf["score"]})
            else:
                init_status = _decision_to_status_default(legacy_decision_map.get(rkey))
                vals = dict(
                    id=rec_id,
                    rec_key=rkey,
                    company_id=company_id,
                    dataset_id=did,
                    title=sp["title"],
                    category_code=sp["category_code"],
                    category_label=sp["category_label"],
                    priority=sp["priority"],
                    status=init_status,
                    problem_statement=sp["problem_statement"],
                    recommended_action=sp["recommended_action"],
                    goal=sp["goal"],
                    creator=sp["creator"],
                    owner=sp["owner"],
                    deadline=sp["deadline"],
                    resources_needed=sp["resources_needed"],
                    tracking_kpi=sp["tracking_kpi"],
                    success_criteria=sp["success_criteria"],
                    stop_criteria=sp["stop_criteria"],
                    confidence_level=conf["level"],
                    confidence_score=conf["score"],
                    confidence_components_json=conf,
                    why_json=sp["why_json"],
                    model_performance_json=sp["model_performance_json"],
                    xai_json=sp["xai_json"],
                    evidence_json=sp["evidence_json"],
                    expected_impact_json=sp["expected_impact_json"],
                    alternatives_json=sp["alternatives_json"],
                    action_plan_json=sp["action_plan_json"],
                    assumptions_json=sp["assumptions_json"],
                    risks_json=sp["risks_json"],
                    data_scope_json=sp["data_scope_json"],
                    legacy_payload_json=sp["legacy_payload_json"],
                    lineage_node_id=sp["lineage_node_id"],
                    score=sp["score"],
                    is_new=True,
                )
                conn.execute(xai_recommendations.insert().values(**vals))
                append_audited_event(
                    conn,
                    company_id=company_id,
                    kind="recommendation_generated",
                    subject=rkey,
                    payload={
                        "recommendation_id": rec_id,
                        "rec_key": rkey,
                        "dataset_id": did,
                        "category": sp["category_code"],
                        "priority": sp["priority"],
                        "confidence_level": conf["level"],
                        "actor": actor,
                    },
                )
                persisted.append({**vals})

        _sync_model_evaluations_and_risks(conn, info, bundle, persisted)
    return info


def _serialize_rec_summary(row: dict[str, Any], outcome: dict[str, Any] | None = None) -> dict[str, Any]:
    leg = dict(row.get("legacy_payload_json") or {})
    conf = dict(row.get("confidence_components_json") or {})
    perf = dict(row.get("model_performance_json") or {})
    xai = dict(row.get("xai_json") or {})
    status = row["status"]
    raw_cscore = row.get("confidence_score")
    norm_cscore = round(float(raw_cscore) * 100.0, 1) if (raw_cscore is not None and float(raw_cscore) <= 1.0) else raw_cscore
    return {
        **leg,
        "id": row["rec_key"],  # Legacy ID contract preserved (`inventory:P001`, `marketing:facebook`, `sales:decline`, etc.)
        "record_id": row["id"],  # Primary DB UUID-hash ID (`rec-...`)
        "rec_key": row["rec_key"],
        "dataset_id": row["dataset_id"],
        "title": row["title"],
        "category_code": row["category_code"],
        "category_label": row["category_label"],
        "priority": row["priority"],
        "workflow_status": status,
        "decision": _status_to_legacy_decision(status),
        "is_new": bool(row.get("is_new", True)),
        "confidence_level": row["confidence_level"],
        "confidence_score": norm_cscore,
        "confidence_is_calibrated": bool(conf.get("is_calibrated", False)),
        "sufficient_evidence": row["confidence_level"] != "Insufficient Evidence",
        "shap_available": bool(xai.get("shap_available", False)),
        "model_performance_status": perf.get("status_label"),
        "owner": row.get("owner"),
        "deadline": _iso(row.get("deadline")),
        "tracking_kpi": row.get("tracking_kpi"),
        "outcome_status": (outcome or {}).get("evaluation_status", "not_evaluated"),
        "outcome": outcome,
        "lineage_node_id": row.get("lineage_node_id"),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def _partition_counts(items: list[dict[str, Any]], key: str, spec_list: list[tuple[str, str, str]]) -> list[dict[str, Any]]:
    counts = {code: 0 for code, _, _ in spec_list}
    for row in items:
        val = row.get(key)
        if val in counts:
            counts[val] += 1
    total = max(1, len(items))
    return [
        {
            "key": code,
            "label": en,
            "label_vi": vi,
            "count": counts[code],
            "share": round(counts[code] / total, 4) if items else 0.0,
        }
        for code, en, vi in spec_list
    ]


def get_recommendations_overview(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
    category: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    confidence: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    """Return Overview KPIs, 4 mandatory category/status/priority/confidence Donuts, and filterable recommendations."""
    info = ensure_governance_synced(engine, company_id, dataset_id)
    if not info:
        return {
            "empty_workspace": True,
            "company_id": company_id,
            "dataset_id": None,
            "kpis": {
                "total_recommendations": 0,
                "new_count": 0,
                "pending_review_count": 0,
                "approved_count": 0,
                "implemented_count": 0,
                "rejected_count": 0,
                "sufficient_evidence_pct": None,
                "post_impl_effective_pct": None,
                "evaluated_implemented_count": 0,
            },
            "charts": {
                "by_category": _partition_counts([], "category_code", CATEGORIES),
                "by_status": _partition_counts([], "workflow_status", WORKFLOW_STATUSES),
                "by_priority": _partition_counts([], "priority", PRIORITIES),
                "by_confidence": _partition_counts([], "confidence_level", CONFIDENCE_LEVELS),
            },
            "rows": [],
        }

    did = info["dataset_id"]
    with engine.connect() as conn:
        raw_rows = [
            dict(r)
            for r in conn.execute(
                sa.select(xai_recommendations)
                .where(xai_recommendations.c.company_id == company_id, xai_recommendations.c.dataset_id == did)
                .order_by(xai_recommendations.c.score.desc(), xai_recommendations.c.rec_key.asc())
            ).mappings()
        ]
        outcomes_raw = conn.execute(
            sa.select(recommendation_outcomes)
            .where(recommendation_outcomes.c.company_id == company_id, recommendation_outcomes.c.dataset_id == did)
            .order_by(recommendation_outcomes.c.evaluated_at.asc())
        ).mappings().all()

    latest_outcome: dict[str, dict[str, Any]] = {}
    for o in outcomes_raw:
        latest_outcome[o["recommendation_id"]] = {**dict(o), "evaluated_at": _iso(o.get("evaluated_at"))}

    all_items = [_serialize_rec_summary(r, latest_outcome.get(r["id"])) for r in raw_rows]

    # Strict KPI computation (NEVER conflating Implemented with Successful)
    total_n = len(all_items)
    new_n = sum(1 for r in all_items if r["is_new"] and r["workflow_status"] == "pending")
    pending_review_n = sum(1 for r in all_items if r["workflow_status"] in {"pending", "review_requested"})
    approved_n = sum(1 for r in all_items if r["workflow_status"] == "approved")
    implemented_n = sum(1 for r in all_items if r["workflow_status"] == "implemented")
    rejected_n = sum(1 for r in all_items if r["workflow_status"] == "rejected")
    suff_n = sum(1 for r in all_items if r["sufficient_evidence"])
    suff_pct = round((suff_n / total_n) * 100, 1) if total_n else None

    evaluated_impl = [
        r for r in all_items
        if r["workflow_status"] == "implemented" and r.get("outcome_status") in {"successful", "unsuccessful", "inconclusive"}
    ]
    successful_impl = [r for r in evaluated_impl if r.get("outcome_status") == "successful"]
    post_eff_pct = round((len(successful_impl) / len(evaluated_impl)) * 100, 1) if evaluated_impl else None

    # Filters
    filtered = all_items
    if category and category != "all":
        filtered = [r for r in filtered if r["category_code"] == category]
    if status and status != "all":
        if status == "accepted":
            filtered = [r for r in filtered if r["decision"] == "accepted"]
        else:
            filtered = [r for r in filtered if r["workflow_status"] == status]
    if priority and priority != "all":
        if priority == "critical_high":
            filtered = [r for r in filtered if r["priority"] in {"critical", "high"}]
        else:
            filtered = [r for r in filtered if r["priority"] == priority]
    if confidence and confidence != "all":
        filtered = [r for r in filtered if r["confidence_level"].lower() == confidence.lower()]
    if search and search.strip():
        q = search.strip().lower()
        filtered = [
            r for r in filtered
            if q in r["title"].lower() or q in r.get("context", "").lower() or q in r["action"].lower() or q in r["rec_key"].lower()
        ]

    return {
        "empty_workspace": False,
        "company_id": company_id,
        "dataset_id": did,
        "dataset_title": info["title"],
        "currency": info.get("currency", "VND"),
        "kpis": {
            "total_recommendations": total_n,
            "new_count": new_n,
            "pending_review_count": pending_review_n,
            "approved_count": approved_n,
            "implemented_count": implemented_n,
            "rejected_count": rejected_n,
            "sufficient_evidence_pct": suff_pct,
            "post_impl_effective_pct": post_eff_pct,
            "evaluated_implemented_count": len(evaluated_impl),
        },
        "charts": {
            "by_category": _partition_counts(all_items, "category_code", CATEGORIES),
            "by_status": _partition_counts(all_items, "workflow_status", WORKFLOW_STATUSES),
            "by_priority": _partition_counts(all_items, "priority", PRIORITIES),
            "by_confidence": _partition_counts(all_items, "confidence_level", CONFIDENCE_LEVELS),
        },
        "rows": filtered,
    }


def _find_rec_row(conn: sa.Connection, company_id: str, rec_identifier: str, dataset_id: str | None = None) -> dict[str, Any] | None:
    q = sa.select(xai_recommendations).where(
        xai_recommendations.c.company_id == company_id,
        sa.or_(xai_recommendations.c.id == rec_identifier, xai_recommendations.c.rec_key == rec_identifier),
    )
    if dataset_id:
        q = q.where(xai_recommendations.c.dataset_id == dataset_id)
    row = conn.execute(q.order_by(xai_recommendations.c.updated_at.desc()).limit(1)).mappings().first()
    return dict(row) if row else None


def get_recommendation_detail(
    engine: sa.Engine,
    *,
    company_id: str,
    rec_identifier: str,
    dataset_id: str | None = None,
) -> dict[str, Any]:
    """Return full 9-section (A–I) Recommendation Intelligence Detail with XAI, Evidence Charts, Outcomes & Action History."""
    info = ensure_governance_synced(engine, company_id, dataset_id)
    did = info["dataset_id"] if info else dataset_id
    with engine.connect() as conn:
        row = _find_rec_row(conn, company_id, rec_identifier, did)
        if not row:
            raise HTTPException(404, f"Recommendation '{rec_identifier}' not found in active company workspace.")

        actions = [
            {**dict(a), "occurred_at": _iso(a.get("occurred_at"))}
            for a in conn.execute(
                sa.select(recommendation_actions)
                .where(recommendation_actions.c.recommendation_id == row["id"])
                .order_by(recommendation_actions.c.occurred_at.desc(), recommendation_actions.c.id.desc())
            ).mappings()
        ]
        outcomes = [
            {**dict(o), "evaluated_at": _iso(o.get("evaluated_at"))}
            for o in conn.execute(
                sa.select(recommendation_outcomes)
                .where(recommendation_outcomes.c.recommendation_id == row["id"])
                .order_by(recommendation_outcomes.c.evaluated_at.desc())
            ).mappings()
        ]

    latest_outcome = outcomes[0] if outcomes else {"evaluation_status": "not_evaluated", "note": "Chưa đánh giá hậu triển khai"}
    return {
        "id": row["id"],
        "rec_key": row["rec_key"],
        "company_id": company_id,
        "dataset_id": row["dataset_id"],
        "section_a_summary": {
            "title": row["title"],
            "category_code": row["category_code"],
            "category_label": row["category_label"],
            "problem_statement": row["problem_statement"],
            "recommended_action": row["recommended_action"],
            "goal": row["goal"],
            "priority": row["priority"],
            "status": row["status"],
            "legacy_decision": _status_to_legacy_decision(row["status"]),
            "score": row["score"],
            "created_at": _iso(row.get("created_at")),
            "updated_at": _iso(row.get("updated_at")),
            "expires_at": _iso(row.get("expires_at")),
            "creator": row["creator"],
            "data_scope": row.get("data_scope_json") or {},
        },
        "section_b_why": row.get("why_json") or {},
        "section_c_evidence": row.get("evidence_json") or {},
        "section_d_xai": row.get("xai_json") or {},
        "section_e_model_and_confidence": {
            "model_performance": row.get("model_performance_json") or {},
            "recommendation_confidence": row.get("confidence_components_json") or {},
            "strict_separation_note": "Model Performance measures historical ML prediction error/calibration ONLY and is strictly separated from weighted Recommendation Confidence (is_calibrated=false).",
        },
        "section_f_g_impact": row.get("expected_impact_json") or {},
        "section_h_alternatives": row.get("alternatives_json") or {},
        "section_i_action_plan_and_workflow": {
            "owner": row.get("owner"),
            "deadline": _iso(row.get("deadline")),
            "resources_needed": row.get("resources_needed"),
            "tracking_kpi": row.get("tracking_kpi"),
            "success_criteria": row.get("success_criteria"),
            "stop_criteria": row.get("stop_criteria"),
            "execution_steps": (row.get("action_plan_json") or {}).get("steps", []),
            "assumptions": row.get("assumptions_json") or [],
            "risks": row.get("risks_json") or [],
            "action_history": actions,
            "latest_outcome": latest_outcome,
            "outcome_history": outcomes,
        },
        "lineage_node_id": row.get("lineage_node_id"),
        "trace_available": True,
    }


def apply_recommendation_action(
    engine: sa.Engine,
    *,
    company_id: str,
    rec_identifier: str,
    body: RecommendationActionRequest,
    identity: dict[str, Any],
    dataset_id: str | None = None,
) -> dict[str, Any]:
    """Execute governed human workflow transition + action plan update + immutable audit hash-chain."""
    info = ensure_governance_synced(engine, company_id, dataset_id, actor=identity["actor"])
    did = info["dataset_id"] if info else dataset_id

    with engine.begin() as conn:
        _lock_db(conn)
        row = _find_rec_row(conn, company_id, rec_identifier, did)
        if not row:
            raise HTTPException(404, f"Recommendation '{rec_identifier}' not found.")

        prev_status = row["status"]
        new_status = prev_status
        action = body.action

        if action == "approve":
            if prev_status == "implemented":
                raise HTTPException(409, "Cannot revert an already implemented recommendation back to approved.")
            new_status = "approved"
        elif action == "reject":
            if prev_status == "implemented":
                raise HTTPException(409, "Cannot reject an already implemented recommendation; record an outcome evaluation instead.")
            new_status = "rejected"
        elif action == "request_review":
            new_status = "review_requested"
        elif action == "mark_implemented":
            if prev_status not in {"approved", "implemented"}:
                raise HTTPException(422, "Approve the recommendation before marking it as implemented.")
            new_status = "implemented"

        update_vals: dict[str, Any] = {"status": new_status, "is_new": False, "updated_at": _utc_now()}
        for field in ("owner", "deadline", "resources_needed", "tracking_kpi", "success_criteria", "stop_criteria"):
            val = getattr(body, field)
            if val is not None:
                update_vals[field] = val

        conn.execute(xai_recommendations.update().where(xai_recommendations.c.id == row["id"]).values(**update_vals))

        actor = identity["actor"]
        actor_role = identity.get("role", "analyst")
        audit_kind = "recommendation_feedback" if action in {"approve", "reject"} else "recommendation_action"
        audit_payload: dict[str, Any] = {
            "dataset_id": row["dataset_id"],
            "recommendation_id": row["rec_key"],
            "record_id": row["id"],
            "action": action,
            "previous_status": prev_status,
            "new_status": new_status,
            "actor": actor,
            "actor_role": actor_role,
            "comment": body.comment,
            "recommendation": row.get("legacy_payload_json") or {},
        }
        if action in {"approve", "reject"}:
            audit_payload["decision"] = "accepted" if action == "approve" else "rejected"

        audit_event_id, entry_hash = append_audited_event(
            conn,
            company_id=company_id,
            kind=audit_kind,
            subject=row["rec_key"],
            payload=audit_payload,
        )
        conn.execute(
            recommendation_actions.insert().values(
                recommendation_id=row["id"],
                company_id=company_id,
                dataset_id=row["dataset_id"],
                action_type=action,
                previous_status=prev_status,
                new_status=new_status,
                actor=actor,
                actor_role=actor_role,
                comment=body.comment,
                details_json={
                    "owner": update_vals.get("owner", row.get("owner")),
                    "deadline": _iso(update_vals.get("deadline", row.get("deadline"))),
                    "tracking_kpi": update_vals.get("tracking_kpi", row.get("tracking_kpi")),
                },
                audit_event_id=audit_event_id,
            )
        )

    lineage_service.record_runtime_event(
        engine,
        company_id=company_id,
        pipeline_key="decision_intelligence:main",
        pipeline_name=f"Decision Intelligence Pipeline ({(info or {}).get('title', 'Workspace')})",
        pipeline_type="decision_intelligence",
        run_key=f"dec:{row['dataset_id']}",
        dataset_id=row["dataset_id"],
        actor=actor,
        event_type=f"Workflow Action ({action} -> {new_status})",
        step_order=13,
        status="completed",
        node_key="output:recommendations_decisions",
        input_summary=f"Rec {row['rec_key']} ({prev_status})",
        output_summary=f"Status={new_status} | Hash={entry_hash[:12]}",
    )
    return {
        "id": row["id"],
        "rec_key": row["rec_key"],
        "action": action,
        "previous_status": prev_status,
        "status": new_status,
        "legacy_decision": _status_to_legacy_decision(new_status),
        "audit_event_id": audit_event_id,
        "entry_hash": entry_hash,
    }


def record_recommendation_outcome(
    engine: sa.Engine,
    *,
    company_id: str,
    rec_identifier: str,
    body: RecommendationOutcomeRequest,
    identity: dict[str, Any],
    dataset_id: str | None = None,
) -> dict[str, Any]:
    """Record post-implementation KPI outcome separately from implementation state."""
    info = ensure_governance_synced(engine, company_id, dataset_id, actor=identity["actor"])
    did = info["dataset_id"] if info else dataset_id

    with engine.begin() as conn:
        _lock_db(conn)
        row = _find_rec_row(conn, company_id, rec_identifier, did)
        if not row:
            raise HTTPException(404, f"Recommendation '{rec_identifier}' not found.")

        obs_delta_pct = None
        if body.observed_value is not None and body.baseline_value is not None and abs(body.baseline_value) > 1e-9:
            obs_delta_pct = round(((body.observed_value - body.baseline_value) / abs(body.baseline_value)) * 100.0, 2)

        outcome_id = f"out-{uuid4().hex[:14]}"
        actor = identity["actor"]
        conn.execute(
            recommendation_outcomes.insert().values(
                id=outcome_id,
                recommendation_id=row["id"],
                company_id=company_id,
                dataset_id=row["dataset_id"],
                evaluation_status=body.evaluation_status,
                kpi_name=body.kpi_name,
                baseline_value=body.baseline_value,
                target_value=body.target_value,
                observed_value=body.observed_value,
                observed_delta_pct=obs_delta_pct,
                observation_window_days=body.observation_window_days,
                methodology=body.methodology,
                notes=body.notes,
                evidence_json={"rec_key": row["rec_key"], "workflow_status_at_eval": row["status"]},
                evaluated_by=actor,
            )
        )
        audit_event_id, entry_hash = append_audited_event(
            conn,
            company_id=company_id,
            kind="recommendation_outcome",
            subject=row["rec_key"],
            payload={
                "dataset_id": row["dataset_id"],
                "recommendation_id": row["rec_key"],
                "record_id": row["id"],
                "outcome_id": outcome_id,
                "evaluation_status": body.evaluation_status,
                "kpi_name": body.kpi_name,
                "baseline_value": body.baseline_value,
                "target_value": body.target_value,
                "observed_value": body.observed_value,
                "observed_delta_pct": obs_delta_pct,
                "actor": actor,
            },
        )
    return {
        "id": outcome_id,
        "recommendation_id": row["id"],
        "rec_key": row["rec_key"],
        "evaluation_status": body.evaluation_status,
        "observed_delta_pct": obs_delta_pct,
        "audit_event_id": audit_event_id,
        "entry_hash": entry_hash,
    }


def _classify_audit_kind(kind: str, payload: dict[str, Any]) -> str:
    k = (kind or "").lower()
    if k in {"dataset_loaded", "multimodal_uploaded"} or "upload" in k:
        return "data_upload"
    if k in {"data_source_registered", "connector_synced", "rag_ingested", "multimodal_approved", "multimodal_deleted", "rag_deleted", "dataset_deleted"}:
        return "data_processing"
    if k in {"query", "sql_query", "sql_blocked", "twin_simulation_run", "forecast_run"}:
        return "model_execution"
    if k == "recommendation_generated":
        return "recommendation_generated"
    if k == "recommendation_feedback":
        dec_val = str(payload.get("decision") or "").lower()
        return "recommendation_rejected" if dec_val == "rejected" else "recommendation_approved"
    if k == "scenario_feedback":
        dec_val = str(payload.get("decision") or "").lower()
        return "recommendation_rejected" if dec_val == "rejected" else "recommendation_approved"
    if k in {"company_created", "configuration_changed", "risk_resolved"}:
        return "configuration_changed"
    return "user_action"


def _compute_data_quality_partition(conn: sa.Connection, company_id: str, info: dict[str, Any] | None) -> dict[str, Any]:
    """Strictly mutually exclusive 4-slice quality breakdown: Valid / Invalid / Missing / Duplicate."""
    if not info:
        return {"total": 0, "slices": [{"key": k, "label": lbl, "count": 0, "share": 0.0} for k, lbl in [("valid", "Valid"), ("invalid", "Invalid"), ("missing", "Missing"), ("duplicate", "Duplicate")]], "source": "none"}
    did = info["dataset_id"]
    qr = _latest_quality_report(conn, company_id, did)
    if qr:
        total = max(0, int(qr["total_rows"] or 0))
        dup = min(total, int(qr["duplicate_records_count"] or 0))
        rem = max(0, total - dup)
        err_sum = dict(qr.get("error_summary_json") or {})
        missing_req = int(err_sum.get("missing_required") or 0)
        # Disjoint record/issue classification
        invalid_raw = min(rem, int(qr["invalid_rows"] or 0))
        missing_rows = min(invalid_raw, missing_req)
        invalid_type_only = max(0, invalid_raw - missing_rows)
        # If no missing_required rows flagged separately, cap optional missing cells into remaining clean margin only if column quality indicates nulls
        if missing_rows == 0 and int(qr["missing_values_count"] or 0) > 0 and rem > invalid_type_only:
            missing_rows = min(max(0, rem - invalid_type_only), int(qr["missing_values_count"] or 0))
        valid_clean = max(0, total - dup - invalid_type_only - missing_rows)
        denom = max(1, valid_clean + invalid_type_only + missing_rows + dup)
        return {
            "total": denom if total else 0,
            "overall_score": qr["overall_score"],
            "source": f"dataset_quality_reports ({did})",
            "slices": [
                {"key": "valid", "label": "Valid", "label_vi": "Hợp lệ", "count": valid_clean, "share": round(valid_clean / denom, 4) if total else 0.0},
                {"key": "invalid", "label": "Invalid", "label_vi": "Sai kiểu / Lỗi quy tắc", "count": invalid_type_only, "share": round(invalid_type_only / denom, 4) if total else 0.0},
                {"key": "missing", "label": "Missing", "label_vi": "Thiếu giá trị", "count": missing_rows, "share": round(missing_rows / denom, 4) if total else 0.0},
                {"key": "duplicate", "label": "Duplicate", "label_vi": "Trùng lặp", "count": dup, "share": round(dup / denom, 4) if total else 0.0},
            ],
        }

    # Validated legacy snapshot: sum audited row counts directly from SQL
    if not is_partitioned(info):
        verified_rows = int((info.get("counts") or {}).get("sales_transactions") or 0)
    else:
        verified_rows = int(conn.scalar(sa.select(sa.func.count()).select_from(tenant_transactions).where(tenant_transactions.c.company_id == company_id, tenant_transactions.c.dataset_id == did)) or 0)
    return {
        "total": verified_rows,
        "overall_score": 100.0 if verified_rows else 0.0,
        "source": f"Verified relational snapshot ({did})",
        "slices": [
            {"key": "valid", "label": "Valid", "label_vi": "Hợp lệ", "count": verified_rows, "share": 1.0 if verified_rows else 0.0},
            {"key": "invalid", "label": "Invalid", "label_vi": "Sai kiểu / Lỗi quy tắc", "count": 0, "share": 0.0},
            {"key": "missing", "label": "Missing", "label_vi": "Thiếu giá trị", "count": 0, "share": 0.0},
            {"key": "duplicate", "label": "Duplicate", "label_vi": "Trùng lặp", "count": 0, "share": 0.0},
        ],
    }


def _compute_model_performance_trend(conn: sa.Connection, company_id: str, info: dict[str, Any] | None) -> dict[str, Any]:
    """Build strictly separated Forecast Error/Accuracy Trend Series and Anomaly Evaluation Series."""
    if not info:
        return {"forecast_available": False, "forecast_series": [], "anomaly_available": False, "anomaly_series": []}
    bundle = services.artifact(info)
    forecast_points: list[dict[str, Any]] = []
    if bundle and "forecast" in bundle and "revenue" in bundle["forecast"]:
        rev_info = bundle["forecast"]["revenue"]
        for horizon_label, h in [("7d Horizon", 7), ("30d Horizon", 30)]:
            entry = (rev_info.get("series") or {}).get(("all", h))
            if not entry:
                continue
            rep = entry["report"]
            sel = rep["selected"]
            val_m = (rep.get("validation") or {}).get(sel) or {}
            test_m = (rep.get("test") or {}).get(sel) or {}
            sn_test = (rep.get("test") or {}).get("seasonal_naive") or {}
            val_range = (bundle.get("split") or {}).get("validation") or ["Validation", ""]
            test_range = (bundle.get("split") or {}).get("test") or ["Test", ""]
            forecast_points.append(
                {
                    "period": f"{horizon_label} Validation ({val_range[0][:7]})",
                    "horizon": h,
                    "split": "validation",
                    "selected_model": sel,
                    "wape_pct": round(float(val_m["wape"]) * 100, 2) if val_m.get("wape") is not None else None,
                    "mae": round(float(val_m.get("mae") or 0), 2),
                    "baseline_wape_pct": round(float((rep.get("validation") or {}).get("seasonal_naive", {}).get("wape") or 0) * 100, 2),
                    "coverage_pct": round(float(rep.get("test_coverage") or 0) * 100, 1),
                }
            )
            forecast_points.append(
                {
                    "period": f"{horizon_label} Holdout Test ({test_range[1][:7]})",
                    "horizon": h,
                    "split": "holdout_test",
                    "selected_model": sel,
                    "wape_pct": round(float(test_m["wape"]) * 100, 2) if test_m.get("wape") is not None else None,
                    "mae": round(float(test_m.get("mae") or 0), 2),
                    "baseline_wape_pct": round(float(sn_test.get("wape") or 0) * 100, 2) if sn_test.get("wape") is not None else None,
                    "coverage_pct": round(float(rep.get("test_coverage") or 0) * 100, 1),
                }
            )

    anom_signals = services.model_quality(info)["anomaly"]
    anomaly_points = [
        {
            "metric": s["metric"],
            "status": s["status"],
            "precision_pct": round(float(s["precision"]) * 100, 1) if (s.get("tp", 0) + s.get("fn", 0) > 0) else None,
            "recall_pct": round(float(s["recall"]) * 100, 1) if (s.get("tp", 0) + s.get("fn", 0) > 0) else None,
            "f1_pct": round(float(s["f1"]) * 100, 1) if (s.get("tp", 0) + s.get("fn", 0) > 0) else None,
        }
        for s in anom_signals
    ]
    return {
        "forecast_available": bool(forecast_points),
        "metric_family": "Forecast WAPE (%) vs Seasonal Naive Baseline (lower is better)",
        "forecast_series": forecast_points,
        "anomaly_available": any(p["f1_pct"] is not None for p in anomaly_points),
        "anomaly_series": anomaly_points,
    }


def get_audit_overview(engine: sa.Engine, *, company_id: str, dataset_id: str | None = None) -> dict[str, Any]:
    """Build complete Audit & Governance KPIs, all 6 mandatory charts, and cryptographic hash-chain status."""
    info = ensure_governance_synced(engine, company_id, dataset_id)
    with engine.connect() as conn:
        integrity = verify_audit_hash_chain(conn, company_id)
        events = [
            dict(r)
            for r in conn.execute(
                sa.select(audit).where(audit.c.company_id == company_id).order_by(audit.c.id.desc())
            ).mappings()
        ]
        recs_q = sa.select(xai_recommendations).where(xai_recommendations.c.company_id == company_id)
        if info:
            recs_q = recs_q.where(xai_recommendations.c.dataset_id == info["dataset_id"])
        recs = [dict(r) for r in conn.execute(recs_q).mappings()]
        outcomes = [
            dict(r)
            for r in conn.execute(
                sa.select(recommendation_outcomes).where(recommendation_outcomes.c.company_id == company_id)
            ).mappings()
        ]
        mevals = [
            dict(r)
            for r in conn.execute(
                sa.select(model_evaluations).where(model_evaluations.c.company_id == company_id)
            ).mappings()
        ]
        risks = [
            dict(r)
            for r in conn.execute(
                sa.select(audit_risk_alerts).where(audit_risk_alerts.c.company_id == company_id)
            ).mappings()
        ]
        dq_chart = _compute_data_quality_partition(conn, company_id, info)
        perf_trend = _compute_model_performance_trend(conn, company_id, info)

    # 1. Event distribution (mutually exclusive)
    bucket_counts = {k: 0 for k, _ in AUDIT_EVENT_BUCKETS}
    for ev in events:
        b = _classify_audit_kind(ev["kind"], ev.get("payload") or {})
        bucket_counts[b] = bucket_counts.get(b, 0) + 1
    ev_total = max(1, len(events))
    event_distribution = [
        {"key": k, "label": lbl, "count": bucket_counts[k], "share": round(bucket_counts[k] / ev_total, 4) if events else 0.0}
        for k, lbl in AUDIT_EVENT_BUCKETS
    ]

    # 2. Decision status donut (mutually exclusive over recommendations)
    decision_status = _partition_counts(recs, "status", WORKFLOW_STATUSES)

    # 5. Risk distribution donut
    risk_counts = {k: 0 for k, _, _ in PRIORITIES}
    for r in risks:
        if r["severity"] in risk_counts:
            risk_counts[r["severity"]] += 1
    r_tot = max(1, len(risks))
    risk_distribution = [
        {"key": k, "label": en, "label_vi": vi, "count": risk_counts[k], "share": round(risk_counts[k] / r_tot, 4) if risks else 0.0}
        for k, en, vi in PRIORITIES
    ]

    # 6. Recommendation Outcome Comparison Bar Chart
    latest_outcome: dict[str, str] = {}
    for o in outcomes:
        latest_outcome[o["recommendation_id"]] = o["evaluation_status"]
    approved_recs = sum(1 for r in recs if r["status"] in {"approved", "implemented"})
    impl_recs = sum(1 for r in recs if r["status"] == "implemented")
    succ_recs = sum(1 for r in recs if latest_outcome.get(r["id"]) == "successful")
    unsucc_recs = sum(1 for r in recs if latest_outcome.get(r["id"]) == "unsuccessful")
    not_eval_recs = sum(1 for r in recs if latest_outcome.get(r["id"], "not_evaluated") in {"not_evaluated", "inconclusive"})

    outcome_comparison = [
        {"stage": "Recommended", "stage_vi": "Đã đề xuất", "count": len(recs)},
        {"stage": "Approved", "stage_vi": "Đã duyệt", "count": approved_recs},
        {"stage": "Implemented", "stage_vi": "Đã triển khai", "count": impl_recs},
        {"stage": "Successful", "stage_vi": "Đánh giá: Thành công", "count": succ_recs},
        {"stage": "Unsuccessful", "stage_vi": "Đánh giá: Chưa đạt", "count": unsucc_recs},
        {"stage": "Not Evaluated", "stage_vi": "Chưa đánh giá hiệu quả", "count": not_eval_recs},
    ]

    model_alerts_count = sum(1 for r in risks if r["status"] == "open" and r["category"] in {"data_drift", "performance_degradation", "model_limitation"})
    dq_warnings_count = sum(1 for r in risks if r["status"] == "open" and r["category"] == "data_quality")
    insuff_count = sum(1 for r in recs if r["confidence_level"] == "Insufficient Evidence")
    failed_runs = sum(1 for ev in events if ev["kind"] in {"sql_blocked", "prompt_injection_blocked"})

    has_non_bootstrap_activity = any(ev.get("kind") != "company_created" for ev in events)

    return {
        "empty_workspace": info is None and not has_non_bootstrap_activity,
        "company_id": company_id,
        "dataset_id": info["dataset_id"] if info else None,
        "dataset_title": info["title"] if info else None,
        "kpis": {
            "total_ai_decisions": len(events),
            "total_model_runs": len(mevals) + sum(1 for ev in events if ev["kind"] in {"query", "twin_simulation_run"}),
            "recommendations_generated": len(recs),
            "approved_count": approved_recs,
            "rejected_count": sum(1 for r in recs if r["status"] == "rejected"),
            "implemented_count": impl_recs,
            "failed_or_blocked_runs": failed_runs,
            "data_quality_warnings": dq_warnings_count,
            "model_alerts": model_alerts_count,
            "insufficient_evidence_decisions": insuff_count,
        },
        "integrity": integrity,
        "charts": {
            "event_distribution": event_distribution,
            "decision_status": decision_status,
            "model_performance_trend": perf_trend,
            "data_quality": dq_chart,
            "risk_distribution": risk_distribution,
            "outcome_comparison": outcome_comparison,
        },
    }


def list_audit_events(
    engine: sa.Engine,
    *,
    company_id: str,
    kind: str | None = None,
    limit: int = 50,
    before: int | None = None,
) -> dict[str, Any]:
    with engine.connect() as conn:
        q = sa.select(audit).where(audit.c.company_id == company_id).order_by(audit.c.id.desc()).limit(limit + 1)
        if kind == "decisions":
            q = q.where(audit.c.kind.in_(["recommendation_feedback", "scenario_feedback", "recommendation_action", "recommendation_outcome"]))
        elif kind:
            q = q.where(audit.c.kind == kind)
        if before is not None:
            q = q.where(audit.c.id < before)
        raw = [dict(r) for r in conn.execute(q).mappings()]
        eids = [int(r["id"]) for r in raw[:limit]]
        hash_map: dict[int, dict[str, Any]] = {}
        if eids:
            for hr in conn.execute(sa.select(audit_hash_chain).where(audit_hash_chain.c.audit_event_id.in_(eids))).mappings():
                hash_map[int(hr["audit_event_id"])] = dict(hr)

    items = []
    for row in raw[:limit]:
        safe_payload = redact_secrets(row.get("payload") or {})
        hinfo = hash_map.get(int(row["id"]))
        items.append(
            {
                "id": int(row["id"]),
                "occurred_at": _iso(row.get("occurred_at")),
                "kind": row["kind"],
                "bucket": _classify_audit_kind(row["kind"], safe_payload if isinstance(safe_payload, dict) else {}),
                "subject": row["subject"],
                "actor": (safe_payload or {}).get("actor", "system") if isinstance(safe_payload, dict) else "system",
                "dataset_id": (safe_payload or {}).get("dataset_id") if isinstance(safe_payload, dict) else None,
                "payload": safe_payload,
                "hash_chain": (
                    {
                        "seq_no": int(hinfo["seq_no"]),
                        "entry_hash": hinfo["entry_hash"],
                        "prev_hash": hinfo["prev_hash"],
                    }
                    if hinfo
                    else None
                ),
            }
        )
    return {
        "rows": items,
        "next_before": items[-1]["id"] if len(raw) > limit and items else None,
    }


def get_decision_trace(engine: sa.Engine, *, company_id: str, rec_identifier: str, dataset_id: str | None = None) -> dict[str, Any]:
    """Assemble full 14-step End-to-End Decision Audit Trace + Knowledge Map Lineage link."""
    detail = get_recommendation_detail(engine, company_id=company_id, rec_identifier=rec_identifier, dataset_id=dataset_id)
    did = detail["dataset_id"]
    with engine.connect() as conn:
        info = _safe_dataset_info(conn, company_id, did)
        ds_row = conn.execute(sa.select(enterprise_datasets).where(enterprise_datasets.c.id == did, enterprise_datasets.c.company_id == company_id)).mappings().first()
        src_row = (
            conn.execute(sa.select(data_sources).where(data_sources.c.id == ds_row["data_source_id"])).mappings().first()
            if ds_row and ds_row.get("data_source_id")
            else None
        )
        qr = _latest_quality_report(conn, company_id, did)
        meval = conn.execute(
            sa.select(model_evaluations)
            .where(model_evaluations.c.company_id == company_id, model_evaluations.c.dataset_id == did)
            .order_by(model_evaluations.c.evaluated_at.desc())
            .limit(1)
        ).mappings().first()

    sum_a = detail["section_a_summary"]
    sec_d = detail["section_d_xai"]
    sec_e = detail["section_e_model_and_confidence"]
    sec_i = detail["section_i_action_plan_and_workflow"]
    actions = sec_i["action_history"]
    last_dec_act = next((a for a in actions if a["action_type"] in {"approve", "reject", "mark_implemented"}), actions[0] if actions else None)
    latest_out = sec_i["latest_outcome"]

    steps = [
        {"step": 1, "stage": "Data Source", "stage_vi": "Nguồn dữ liệu", "value": src_row["name"] if src_row else (info["kind"] if info else "Validated Business Snapshot"), "detail": f"Type: {src_row['source_type'] if src_row else 'snapshot'}"},
        {"step": 2, "stage": "Uploader / Initiator", "stage_vi": "Người upload / Khởi tạo", "value": ds_row["created_by"] if ds_row else "system", "detail": "Recorded dataset creator"},
        {"step": 3, "stage": "Ingestion Timestamp", "stage_vi": "Thời gian upload / Import", "value": _iso(ds_row.get("imported_at") or ds_row.get("created_at")) if ds_row else sum_a["created_at"], "detail": "UTC ISO-8601"},
        {"step": 4, "stage": "Cleaning & Validation", "stage_vi": "Bước làm sạch dữ liệu", "value": f"Quality {(qr['overall_score'] if qr else 100.0):.1f}/100", "detail": f"Valid: {qr['valid_rows'] if qr else (ds_row['valid_rows'] if ds_row else 'All')} | Invalid: {qr['invalid_rows'] if qr else 0} | Dup: {qr['duplicate_records_count'] if qr else 0}"},
        {"step": 5, "stage": "Dataset Version", "stage_vi": "Phiên bản bộ dữ liệu", "value": did, "detail": f"Span: {info['start']}..{info['end']}" if info else did},
        {"step": 6, "stage": "Model Version", "stage_vi": "Phiên bản mô hình AI", "value": str((sec_e["model_performance"] or {}).get("model_version") or (meval["model_version"] if meval else "Rule/Statistical Engine")), "detail": (meval["model_name"] if meval else "Domain Analyzer")},
        {"step": 7, "stage": "Input Features Used", "stage_vi": "Dữ liệu đầu vào & Đặc trưng", "value": f"{len(FEATURES)} causal temporal features + transactional SQL", "detail": f"Capabilities: {', '.join(k for k, v in ((info or {}).get('capabilities') or {}).items() if v and k.startswith('has_'))}"},
        {"step": 8, "stage": "Prediction & XAI", "stage_vi": "Dự đoán & Giải thích XAI", "value": f"TreeSHAP={'Available' if sec_d.get('shap_available') else 'Unavailable'} | Confidence={sec_e['recommendation_confidence'].get('level')}", "detail": (sec_d.get("local_explanation") or {}).get("summary", "")},
        {"step": 9, "stage": "Supporting Evidence", "stage_vi": "Bằng chứng dữ liệu", "value": f"{len((detail['section_b_why'] or {}).get('triggers', []))} statistical triggers + {len(sec_d.get('counterfactuals', []))} counterfactual sweeps", "detail": (detail["section_c_evidence"] or {}).get("data_timestamp", "")},
        {"step": 10, "stage": "Generated Recommendation", "stage_vi": "Khuyến nghị được tạo", "value": sum_a["title"], "detail": f"Category: {sum_a['category_label']} · Priority: {sum_a['priority'].upper()}"},
        {"step": 11, "stage": "Approver / Reviewer", "stage_vi": "Người duyệt / Xem xét", "value": last_dec_act["actor"] if last_dec_act else "Pending human review", "detail": f"Role: {last_dec_act['actor_role']}" if last_dec_act else "Awaiting operator"},
        {"step": 12, "stage": "Approval Timestamp", "stage_vi": "Thời gian quyết định", "value": last_dec_act["occurred_at"] if last_dec_act else "Pending", "detail": f"Action: {last_dec_act['action_type']}" if last_dec_act else "No human sign-off yet"},
        {"step": 13, "stage": "Execution & Owner", "stage_vi": "Kết quả thực thi", "value": f"Status={sum_a['status'].upper()} (Owner: {sec_i.get('owner') or 'Unassigned'})", "detail": f"KPI: {sec_i.get('tracking_kpi') or 'Not assigned'}"},
        {"step": 14, "stage": "Post-Impl Evaluation", "stage_vi": "Đánh giá hiệu quả thực tế", "value": latest_out.get("evaluation_status", "not_evaluated").upper(), "detail": f"KPI={latest_out.get('kpi_name')} Observed={latest_out.get('observed_value')}" if latest_out.get("observed_value") is not None else "Not yet evaluated post-implementation"},
    ]
    return {
        "recommendation_id": detail["id"],
        "rec_key": detail["rec_key"],
        "dataset_id": did,
        "status": sum_a["status"],
        "lineage_node_id": detail.get("lineage_node_id"),
        "knowledge_map_url": "/knowledge-map",
        "steps": steps,
        "action_history": actions,
        "outcome_history": sec_i["outcome_history"],
    }


def get_model_governance(engine: sa.Engine, *, company_id: str, dataset_id: str | None = None) -> dict[str, Any]:
    info = ensure_governance_synced(engine, company_id, dataset_id)
    if not info:
        return {"empty_workspace": True, "models": [], "drift_summary": [], "feature_schema": []}
    with engine.connect() as conn:
        rows = [
            {
                **dict(r),
                "train_date_start": _iso(r.get("train_date_start")),
                "train_date_end": _iso(r.get("train_date_end")),
                "evaluated_at": _iso(r.get("evaluated_at")),
            }
            for r in conn.execute(
                sa.select(model_evaluations)
                .where(model_evaluations.c.company_id == company_id, model_evaluations.c.dataset_id == info["dataset_id"])
                .order_by(model_evaluations.c.evaluated_at.desc())
            ).mappings()
        ]
    rows.sort(
        key=lambda r: (
            0 if r.get("task_type") == "time_series_regression" else 1,
            str(r.get("model_name") or ""),
        )
    )
    primary_schema = next(
        (r["feature_schema_json"] for r in rows if r.get("task_type") == "time_series_regression" and r.get("feature_schema_json")),
        rows[0]["feature_schema_json"] if rows else [],
    )
    return {
        "empty_workspace": False,
        "company_id": company_id,
        "dataset_id": info["dataset_id"],
        "models": rows,
        "feature_schema": primary_schema,
    }


def list_audit_risks(engine: sa.Engine, *, company_id: str, status: str | None = None) -> dict[str, Any]:
    ensure_governance_synced(engine, company_id, None)
    with engine.connect() as conn:
        q = sa.select(audit_risk_alerts).where(audit_risk_alerts.c.company_id == company_id).order_by(audit_risk_alerts.c.detected_at.desc())
        if status and status != "all":
            q = q.where(audit_risk_alerts.c.status == status)
        rows = [
            {**dict(r), "detected_at": _iso(r.get("detected_at")), "resolved_at": _iso(r.get("resolved_at"))}
            for r in conn.execute(q).mappings()
        ]
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    rows.sort(key=lambda r: (0 if r["status"] == "open" else 1, sev_order.get(r["severity"], 4)))
    return {"company_id": company_id, "items": rows}


def resolve_audit_risk(
    engine: sa.Engine,
    *,
    company_id: str,
    risk_id: str,
    body: RiskResolveRequest,
    identity: dict[str, Any],
) -> dict[str, Any]:
    with engine.begin() as conn:
        _lock_db(conn)
        existing = conn.execute(
            sa.select(audit_risk_alerts).where(
                audit_risk_alerts.c.id == risk_id,
                audit_risk_alerts.c.company_id == company_id,
            )
        ).mappings().first()
        if not existing:
            raise HTTPException(404, f"Risk alert '{risk_id}' not found in workspace.")
        now = _utc_now()
        conn.execute(
            audit_risk_alerts.update()
            .where(audit_risk_alerts.c.id == risk_id)
            .values(
                status=body.status,
                resolved_by=identity["actor"],
                resolution_note=body.note,
                resolved_at=(now if body.status == "resolved" else existing.get("resolved_at")),
            )
        )
        eid, h = append_audited_event(
            conn,
            company_id=company_id,
            kind="risk_resolved",
            subject=risk_id,
            payload={
                "risk_id": risk_id,
                "risk_key": existing["risk_key"],
                "new_status": body.status,
                "note": body.note,
                "actor": identity["actor"],
                "dataset_id": existing.get("dataset_id"),
            },
        )
    return {"id": risk_id, "status": body.status, "audit_event_id": eid, "entry_hash": h}


def export_audit_bundle(engine: sa.Engine, *, company_id: str, fmt: str = "csv", kind: str | None = None) -> tuple[bytes, str, str]:
    """Export secret-redacted & formula-injection-safe audit log bundle in CSV or JSON."""
    data = list_audit_events(engine, company_id=company_id, kind=kind, limit=500)
    rows = data["rows"]
    if fmt == "json":
        with engine.connect() as conn:
            integrity = verify_audit_hash_chain(conn, company_id)
        payload = {"exported_at": _utc_now().isoformat(), "company_id": company_id, "integrity": integrity, "events": rows}
        return json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8"), "application/json", f"audit_trail_{company_id}.json"

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "occurred_at", "kind", "bucket", "subject", "actor", "dataset_id", "seq_no", "entry_hash", "payload_json"])
    for r in rows:
        hc = r.get("hash_chain") or {}
        writer.writerow(
            [
                r["id"],
                csv_safe(r["occurred_at"]),
                csv_safe(r["kind"]),
                csv_safe(r["bucket"]),
                csv_safe(r["subject"]),
                csv_safe(r["actor"]),
                csv_safe(r["dataset_id"] or ""),
                hc.get("seq_no", ""),
                csv_safe(hc.get("entry_hash", "")),
                csv_safe(json.dumps(r["payload"], ensure_ascii=False, default=str)),
            ]
        )
    return buf.getvalue().encode("utf-8"), "text/csv; charset=utf-8", f"audit_trail_{company_id}.csv"


def sync_legacy_feedback_decision(
    conn: sa.Connection,
    *,
    company_id: str,
    dataset_id: str,
    rec_key: str,
    decision: str,
    actor: str,
    audit_event_id: int | None = None,
) -> None:
    """Keep persisted XAI workflow state aligned when decisions arrive via legacy /feedback routes."""
    row = _find_rec_row(conn, company_id, rec_key, dataset_id)
    if not row:
        return
    prev_status = row["status"]
    if prev_status == "implemented":
        return
    new_status = _decision_to_status_default(decision)
    if prev_status == new_status:
        return
    conn.execute(
        xai_recommendations.update()
        .where(xai_recommendations.c.id == row["id"])
        .values(status=new_status, is_new=False, updated_at=_utc_now())
    )
    conn.execute(
        recommendation_actions.insert().values(
            recommendation_id=row["id"],
            company_id=company_id,
            dataset_id=dataset_id,
            action_type=("approve" if decision == "accepted" else "reject"),
            previous_status=prev_status,
            new_status=new_status,
            actor=actor,
            actor_role="analyst",
            comment="Synchronized from decision feedback endpoint",
            details_json={"source": "legacy_feedback"},
            audit_event_id=audit_event_id,
        )
    )

