"""Real Explainable AI (XAI) computations: LightGBM Native TreeSHAP, Permutation Importance, Domain Drivers, Counterfactuals, and Model Performance vs Confidence separation."""
from __future__ import annotations

from datetime import date, timedelta
import math
from typing import Any

import numpy as np
import pandas as pd

from ai_service.features import FEATURES, lag_features
from ai_service.forecasting import LOOKBACK
from ai_service import root_cause, scenario
from backend.app.analytics import grouped, is_partitioned, marketing_summary, previous_period, ratio, sales_total
from backend.app.schemas import (
    ForecastRequest,
    InventoryParams,
    InventoryRequest,
    MarketingParams,
    MarketingRequest,
    PriceParams,
    PriceRequest,
)

FEATURE_LABELS: dict[str, dict[str, str]] = {
    "lag_1": {"en": "Previous Day (t-1)", "vi": "Giá trị hôm trước (t-1)"},
    "lag_7": {"en": "Same Weekday Last Week (t-7)", "vi": "Cùng thứ tuần trước (t-7)"},
    "lag_14": {"en": "Two Weeks Ago (t-14)", "vi": "Cách đây 2 tuần (t-14)"},
    "lag_28": {"en": "Four Weeks Ago (t-28)", "vi": "Cách đây 4 tuần (t-28)"},
    "mean_7": {"en": "7-Day Trailing Average", "vi": "Trung bình trượt 7 ngày"},
    "std_7": {"en": "7-Day Volatility (Std)", "vi": "Độ biến động 7 ngày (Std)"},
    "mean_14": {"en": "14-Day Trailing Average", "vi": "Trung bình trượt 14 ngày"},
    "std_14": {"en": "14-Day Volatility (Std)", "vi": "Độ biến động 14 ngày (Std)"},
    "mean_28": {"en": "28-Day Baseline Average", "vi": "Trung bình nền 28 ngày"},
    "std_28": {"en": "28-Day Volatility (Std)", "vi": "Độ biến động 28 ngày (Std)"},
    "growth_7": {"en": "7-Day Momentum ((t-1 - t-7)/t-7)", "vi": "Đà tăng trưởng 7 ngày"},
    "weekday": {"en": "Day of Week (0-6)", "vi": "Thứ trong tuần (0-6)"},
    "month": {"en": "Calendar Month (1-12)", "vi": "Tháng (1-12)"},
    "quarter": {"en": "Calendar Quarter (1-4)", "vi": "Quý (1-4)"},
    "weekend": {"en": "Weekend Flag (Sat/Sun)", "vi": "Cờ cuối tuần (T7/CN)"},
    "holiday": {"en": "Holiday Flag", "vi": "Cờ ngày lễ"},
    "scale": {"en": "Scope Magnitude (log1p scale)", "vi": "Quy mô phân khúc (log1p scale)"},
}

CAUSAL_DISCLAIMER = (
    "Feature importance and SHAP values explain predictive contributions inside the trained observational model. "
    "They measure historical pattern reliance, NOT causal proof. Confirm intervention causality via controlled A/B tests or phased rollouts."
)
CONFIDENCE_FORMULA_DESC = (
    "0.30 × Data Quality + 0.25 × Evidence Completeness + 0.25 × Model Validation + 0.20 × Scenario Stability"
)


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def explain_forecast_model(
    *,
    bundle: dict[str, Any] | None,
    target: str,
    scope: str,
    values: np.ndarray | list[float],
    dates: list[date],
    holidays: dict[date, bool] | None = None,
    horizon: int = 30,
    recent_window: int = 60,
) -> dict[str, Any]:
    """Compute real LightGBM gain/split + holdout permutation importance + native TreeSHAP (pred_contrib=True)."""
    if not bundle or "forecast" not in bundle or target not in bundle["forecast"]:
        return {
            "available": False,
            "method": "none",
            "target": target,
            "scope": scope,
            "shap_available": False,
            "shap_unavailable_reason": "No trained forecast model artifact is available for this dataset.",
            "feature_importance": {"available": False, "gain": [], "split": [], "permutation": []},
            "shap": {"available": False, "reason": "No trained forecast artifact."},
            "causal_disclaimer": CAUSAL_DISCLAIMER,
        }

    target_info = bundle["forecast"][target]
    model = target_info.get("model")
    scales = target_info.get("scales") or {}
    entry = (target_info.get("series") or {}).get((scope, horizon)) or (target_info.get("series") or {}).get((scope, 7))
    selected_model = entry.get("selected") if entry else "unknown"

    arr = np.asarray(values, dtype=float)
    n = len(arr)

    if model is None or scope not in scales or n < LOOKBACK + 5:
        fallback_reason = (
            "Dataset spans fewer than 201 days or insufficient history (<33 days); forecast uses a causal statistical baseline "
            f"('{selected_model}') without a tree model for TreeSHAP."
        )
        mean_recent = float(arr[-min(14, max(1, n)):].mean()) if n else 0.0
        mean_week = float(arr[-min(7, max(1, n)):].mean()) if n else 0.0
        return {
            "available": True,
            "method": f"statistical_baseline:{selected_model}",
            "target": target,
            "scope": scope,
            "selected_model": selected_model,
            "shap_available": False,
            "shap_unavailable_reason": fallback_reason,
            "alternative_explanation": (
                f"Statistical baseline ({selected_model}): recent 7-day average is {mean_week:,.2f} vs "
                f"14-day average {mean_recent:,.2f} across {n} observed days."
            ),
            "feature_importance": {
                "available": False,
                "reason": "Trained LightGBM regressor is not active on short windows (<201 days).",
                "gain": [],
                "split": [],
                "permutation": [],
            },
            "shap": {"available": False, "reason": fallback_reason},
            "local_explanation": {
                "summary": (
                    f"Latest prediction origin ({dates[-1]}) projects {selected_model} using recent observed values "
                    f"(7d mean={mean_week:,.2f}, 14d mean={mean_recent:,.2f})."
                ),
                "factors": [
                    {"factor": "7-Day Mean Level", "value": round(mean_week, 4), "direction": "neutral"},
                    {"factor": "14-Day Mean Level", "value": round(mean_recent, 4), "direction": "neutral"},
                    {"factor": "Observed Calendar Days", "value": int(n), "direction": "neutral"},
                ],
            },
            "global_explanation": {
                "summary": (
                    f"Global model is '{selected_model}' trained with rolling-origin backtesting across {n} days."
                ),
                "top_drivers": [],
            },
            "causal_disclaimer": CAUSAL_DISCLAIMER,
        }

    scale = float(scales[scope])
    booster = model.booster_
    raw_gain = np.asarray(booster.feature_importance(importance_type="gain"), dtype=float)
    raw_split = np.asarray(booster.feature_importance(importance_type="split"), dtype=float)
    gain_total = max(1e-9, float(raw_gain.sum()))
    split_total = max(1e-9, float(raw_split.sum()))

    gain_rows = sorted(
        [
            {
                "feature": feat,
                "label": FEATURE_LABELS[feat]["en"],
                "label_vi": FEATURE_LABELS[feat]["vi"],
                "importance": round(float(g), 2),
                "normalized_pct": round(float(g / gain_total) * 100.0, 2),
                "gain": round(float(g), 2),
                "gain_share": round(float(g / gain_total), 4),
                "split": int(sp),
                "split_share": round(float(sp / split_total), 4),
            }
            for feat, g, sp in zip(FEATURES, raw_gain, raw_split)
        ],
        key=lambda r: (-r["gain"], r["feature"]),
    )
    split_rows = sorted(
        [
            {
                **r,
                "importance": r["split"],
                "normalized_pct": round(float(r["split_share"]) * 100.0, 2),
            }
            for r in gain_rows
        ],
        key=lambda r: (-r["split"], r["feature"]),
    )

    # Build recent causal feature rows up to latest history point + 1-step ahead forecast origin
    scale_vec = np.array([scale], dtype=float)
    start_pos = max(LOOKBACK, n - max(30, recent_window))
    x_rows = []
    y_actual = []
    sample_dates = []
    for idx in range(start_pos, n):
        day = dates[idx]
        hol = (holidays or {}).get(day)
        row_x = lag_features(arr[idx - LOOKBACK : idx][None, :], day, scale_vec, hol)[0]
        x_rows.append(row_x)
        y_actual.append(float(arr[idx]))
        sample_dates.append(str(day))

    forecast_day = dates[-1] + timedelta(days=1)
    x_origin = lag_features(arr[-LOOKBACK:][None, :], forecast_day, scale_vec, (holidays or {}).get(forecast_day))[0]
    x_all = np.vstack([*x_rows, x_origin]) if x_rows else x_origin[None, :]
    x_df = pd.DataFrame(x_all, columns=list(FEATURES))

    # Deterministic out-of-sample permutation importance on recent actual slice
    perm_rows = []
    if len(x_rows) >= 10:
        x_eval_df = pd.DataFrame(np.asarray(x_rows), columns=list(FEATURES))
        y_eval = np.asarray(y_actual, dtype=float)
        base_preds = np.maximum(0.0, booster.predict(x_eval_df, num_threads=1) * scale)
        base_mae = float(np.abs(base_preds - y_eval).mean())
        rng = np.random.default_rng(42)
        raw_perm = []
        for col in FEATURES:
            deltas = []
            for _ in range(4):
                perm_df = x_eval_df.copy()
                perm_df[col] = rng.permutation(perm_df[col].to_numpy())
                p_preds = np.maximum(0.0, booster.predict(perm_df, num_threads=1) * scale)
                deltas.append(float(np.abs(p_preds - y_eval).mean()) - base_mae)
            mean_delta = float(np.mean(deltas))
            raw_perm.append((col, max(0.0, mean_delta), mean_delta))
        perm_pos_sum = max(1e-9, sum(p[1] for p in raw_perm))
        perm_rows = sorted(
            [
                {
                    "feature": col,
                    "label": FEATURE_LABELS[col]["en"],
                    "label_vi": FEATURE_LABELS[col]["vi"],
                    "importance": round(raw_d, 4),
                    "normalized_pct": round((pos_d / perm_pos_sum) * 100.0, 2),
                    "mae_increase": round(raw_d, 4),
                    "importance_share": round(pos_d / perm_pos_sum, 4),
                    "baseline_mae": round(base_mae, 4),
                }
                for col, pos_d, raw_d in raw_perm
            ],
            key=lambda r: (-r["mae_increase"], r["feature"]),
        )

    # Real Native TreeSHAP via LightGBM pred_contrib=True (last column is expected base value E[f(X)])
    contrib_raw = np.asarray(booster.predict(x_df, pred_contrib=True, num_threads=1), dtype=float)
    contrib_natural = contrib_raw * scale
    pred_origin_raw = float(booster.predict(x_df.iloc[[-1]], num_threads=1)[0])
    pred_origin_natural = pred_origin_raw * scale
    origin_phi = contrib_natural[-1, :-1]
    origin_base = float(contrib_natural[-1, -1])
    sum_phi = float(origin_phi.sum())
    additivity_error = abs((origin_base + sum_phi) - pred_origin_natural)

    # Local Waterfall (for 1-step ahead forecast origin)
    origin_features = x_origin.tolist()
    sorted_idx = sorted(range(len(FEATURES)), key=lambda i: -abs(float(origin_phi[i])))
    waterfall = []
    running = origin_base
    for idx in sorted_idx[:10]:
        phi_val = float(origin_phi[idx])
        feat = FEATURES[idx]
        running += phi_val
        waterfall.append(
            {
                "feature": feat,
                "label": FEATURE_LABELS[feat]["en"],
                "label_vi": FEATURE_LABELS[feat]["vi"],
                "feature_value": round(float(origin_features[idx]), 4),
                "shap_value": round(phi_val, 4),
                "abs_shap": round(abs(phi_val), 4),
                "direction": "positive" if phi_val >= 0 else "negative",
                "cumulative_value": round(running, 4),
                "cumulative_after": round(running, 4),
            }
        )
    if len(sorted_idx) > 10:
        rest_sum = sum(float(origin_phi[idx]) for idx in sorted_idx[10:])
        running += rest_sum
        waterfall.append(
            {
                "feature": "other_features",
                "label": f"Remaining {len(sorted_idx) - 10} Features",
                "label_vi": f"{len(sorted_idx) - 10} đặc trưng còn lại",
                "feature_value": None,
                "shap_value": round(rest_sum, 4),
                "abs_shap": round(abs(rest_sum), 4),
                "direction": "positive" if rest_sum >= 0 else "negative",
                "cumulative_value": round(running, 4),
                "cumulative_after": round(running, 4),
            }
        )

    # Global SHAP summary across recent window
    phi_hist = contrib_natural[:-1, :-1] if len(contrib_natural) > 1 else contrib_natural[:, :-1]
    x_hist = x_all[:-1] if len(x_all) > 1 else x_all
    dates_hist = sample_dates if sample_dates else [str(forecast_day)]
    mean_abs_shap = np.abs(phi_hist).mean(axis=0)
    mean_signed_shap = phi_hist.mean(axis=0)
    abs_total = max(1e-9, float(mean_abs_shap.sum()))

    bar_summary = sorted(
        [
            {
                "feature": feat,
                "label": FEATURE_LABELS[feat]["en"],
                "label_vi": FEATURE_LABELS[feat]["vi"],
                "mean_abs_shap": round(float(m_abs), 4),
                "mean_shap": round(float(m_sig), 4),
                "mean_signed_shap": round(float(m_sig), 4),
                "direction": "positive" if m_sig >= 0 else "negative",
                "shap_share": round(float(m_abs / abs_total), 4),
                "beeswarm_points": [],
            }
            for feat, m_abs, m_sig in zip(FEATURES, mean_abs_shap, mean_signed_shap)
        ],
        key=lambda r: (-r["mean_abs_shap"], r["feature"]),
    )

    # Beeswarm sample points (top 6 features, <= 24 evenly spaced days)
    top6_features = [r["feature"] for r in bar_summary[:6]]
    sample_step = max(1, len(dates_hist) // 24)
    sampled_indices = list(range(0, len(dates_hist), sample_step))[:24]
    beeswarm = []
    beeswarm_by_feat: dict[str, list[dict[str, Any]]] = {}
    for feat in top6_features:
        f_idx = FEATURES.index(feat)
        col_vals = x_hist[:, f_idx]
        c_min, c_max = float(col_vals.min()), float(col_vals.max())
        c_rng = (c_max - c_min) if (c_max > c_min) else 1.0
        points = [
            {
                "date": dates_hist[i],
                "shap_value": round(float(phi_hist[i, f_idx]), 4),
                "feature_value": round(float(x_hist[i, f_idx]), 4),
                "normalized_value": round(float((x_hist[i, f_idx] - c_min) / c_rng), 3),
            }
            for i in sampled_indices
        ]
        beeswarm_by_feat[feat] = points
        beeswarm.append(
            {
                "feature": feat,
                "label": FEATURE_LABELS[feat]["en"],
                "label_vi": FEATURE_LABELS[feat]["vi"],
                "mean_abs_shap": round(float(mean_abs_shap[f_idx]), 4),
                "points": points,
            }
        )
    for item in bar_summary:
        item["beeswarm_points"] = beeswarm_by_feat.get(item["feature"], [])

    # Dependence plots for top 3 features
    dependence = []
    top3_features = [r["feature"] for r in bar_summary[:3]]
    for rank, feat in enumerate(top3_features):
        f_idx = FEATURES.index(feat)
        color_feat = top3_features[1 if rank == 0 else 0] if len(top3_features) > 1 else feat
        c_idx = FEATURES.index(color_feat)
        pts = [
            {
                "date": dates_hist[i],
                "feature_value": round(float(x_hist[i, f_idx]), 4),
                "x": round(float(x_hist[i, f_idx]), 4),
                "shap_value": round(float(phi_hist[i, f_idx]), 4),
                "color_value": round(float(x_hist[i, c_idx]), 4),
            }
            for i in range(len(dates_hist))
        ]
        dependence.append(
            {
                "feature": feat,
                "label": FEATURE_LABELS[feat]["en"],
                "label_vi": FEATURE_LABELS[feat]["vi"],
                "interaction_feature": color_feat,
                "interaction_label": FEATURE_LABELS[color_feat]["en"],
                "points": pts,
            }
        )

    top_pos = [w for w in waterfall if w["shap_value"] > 0][:2]
    top_neg = [w for w in waterfall if w["shap_value"] < 0][:2]
    pos_txt = ", ".join(f"{w['label']} (+{w['shap_value']:,.1f})" for w in top_pos) or "none"
    neg_txt = ", ".join(f"{w['label']} ({w['shap_value']:,.1f})" for w in top_neg) or "none"

    return {
        "available": True,
        "method": "lightgbm_native_treeshap",
        "target": target,
        "scope": scope,
        "selected_model": selected_model,
        "model_in_bundle": "LGBMRegressor",
        "shap_available": True,
        "shap_unavailable_reason": None if selected_model == "lightgbm" else (
            f"Note: Selected horizon point model for '{scope}' fell back to {selected_model} based on 2% validation gate; "
            "TreeSHAP below explains the trained LightGBM regressor fitted on the full dataset for reference."
        ),
        "feature_importance": {
            "available": True,
            "method": "LightGBM gain/split + out-of-sample permutation MAE delta",
            "eval_observations": len(x_rows),
            "gain": gain_rows[:12],
            "split": split_rows[:12],
            "permutation": perm_rows[:12],
        },
        "shap": {
            "available": True,
            "method": "lightgbm_pred_contrib_exact_treeshap",
            "target": target,
            "scope": scope,
            "engine": "LightGBM Native TreeSHAP (booster_.predict(pred_contrib=True))",
            "sample_count": len(dates_hist),
            "origin_date": str(forecast_day),
            "base_value": round(origin_base, 4),
            "predicted_value": round(max(0.0, pred_origin_natural), 4),
            "raw_model_output": round(pred_origin_natural, 4),
            "shap_sum": round(sum_phi, 4),
            "additivity_error": round(additivity_error, 6),
            "waterfall": waterfall,
            "waterfall_local": waterfall,
            "bar_summary": bar_summary[:12],
            "global_summary": bar_summary[:12],
            "beeswarm": beeswarm,
            "dependence": dependence,
        },
        "local_explanation": {
            "summary": (
                f"For forecast origin {forecast_day} ({scope}, {target}), LightGBM starts at baseline E[f(X)] = {origin_base:,.2f} "
                f"and shifts to {pred_origin_natural:,.2f}. Upward drivers: {pos_txt}. Downward drivers: {neg_txt}."
            ),
            "origin_date": str(forecast_day),
            "base_value": round(origin_base, 4),
            "predicted_value": round(pred_origin_natural, 4),
        },
        "global_explanation": {
            "summary": (
                f"Across the latest {len(dates_hist)} observations for '{scope}', top global TreeSHAP drivers are "
                + ", ".join(f"{r['label']} ({r['shap_share']*100:.1f}%)" for r in bar_summary[:3])
                + "."
            ),
            "top_drivers": bar_summary[:5],
        },
        "causal_disclaimer": CAUSAL_DISCLAIMER,
    }


def explain_domain_attributions(
    *,
    domain: str,
    title: str,
    drivers: list[dict[str, Any]],
    local_summary: str,
    global_summary: str,
    non_shap_reason: str,
    forecast_shap: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build honest XAI structure for non-tree domain models (inventory, marketing, root-cause decomposition), optionally paired with forecast TreeSHAP."""
    total_abs = max(1e-9, sum(abs(float(d.get("contribution_weight") or d.get("importance") or 0)) for d in drivers))
    normalized_drivers = []
    for d in drivers:
        w = float(d.get("contribution_weight") or d.get("importance") or 0)
        share_f = abs(w) / total_abs
        normalized_drivers.append(
            {
                "feature": str(d.get("feature") or d.get("name")),
                "label": str(d.get("label") or d.get("name")),
                "label_vi": str(d.get("label_vi") or d.get("label") or d.get("name")),
                "importance": round(abs(w), 4),
                "normalized_pct": round(share_f * 100.0, 2),
                "share": round(share_f, 4),
                "direction": d.get("direction", "positive" if w >= 0 else "negative"),
                "current_value": d.get("current_value"),
                "reference_value": d.get("reference_value"),
                "unit": d.get("unit", ""),
            }
        )
    normalized_drivers.sort(key=lambda r: -r["share"])

    has_nested_shap = bool(forecast_shap and forecast_shap.get("shap_available"))
    return {
        "available": True,
        "method": f"domain_quantitative_attribution:{domain}",
        "domain": domain,
        "shap_available": has_nested_shap,
        "shap_unavailable_reason": (
            forecast_shap.get("shap_unavailable_reason")
            if forecast_shap
            else non_shap_reason
        ),
        "primary_model_shap_note": non_shap_reason,
        "feature_importance": {
            "available": True,
            "method": "Deterministic domain factor sensitivity & variance share",
            "domain_drivers": normalized_drivers,
            "gain": forecast_shap["feature_importance"]["gain"] if (forecast_shap and forecast_shap["feature_importance"].get("available")) else [],
            "split": forecast_shap["feature_importance"].get("split", []) if (forecast_shap and forecast_shap["feature_importance"].get("available")) else [],
            "permutation": forecast_shap["feature_importance"]["permutation"] if (forecast_shap and forecast_shap["feature_importance"].get("available")) else [],
            "forecast_model_gain": forecast_shap["feature_importance"]["gain"] if (forecast_shap and forecast_shap["feature_importance"].get("available")) else [],
        },
        "shap": (
            {
                **forecast_shap["shap"],
                "context_note": f"TreeSHAP reflects the underlying LightGBM demand/revenue forecaster driving '{title}'. {non_shap_reason}",
            }
            if has_nested_shap and forecast_shap
            else {"available": False, "reason": non_shap_reason}
        ),
        "forecast_shap": forecast_shap["shap"] if (has_nested_shap and forecast_shap) else None,
        "local_explanation": {
            "summary": local_summary,
            "factors": normalized_drivers[:6],
        },
        "global_explanation": {
            "summary": global_summary,
            "top_drivers": normalized_drivers[:5],
        },
        "causal_disclaimer": CAUSAL_DISCLAIMER,
    }


def compute_counterfactuals(
    conn,
    info: dict[str, Any],
    *,
    kind: str,
    product_id: str | None = None,
    channel: str | None = None,
    forecast_payload: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Compute real parameter-sweep counterfactuals via ai_service.scenario — never hardcoded or LLM-invented."""
    results: list[dict[str, Any]] = []
    caps = info.get("capabilities") or {}

    if kind == "inventory" and product_id and caps.get("has_inventory", True) and forecast_payload:
        try:
            req = InventoryRequest(type="inventory", objective="stockout", horizon=30, parameters=InventoryParams(product=product_id))
            _, _, _, _, ev = scenario.inventory_scenario(conn, req, forecast_payload, info=info)
            proposed = int(ev.get("suggested_reorder_quantity") or 0)
            if proposed <= 0:
                return results
            for qty_mult, label_en in [(0.0, "Zero New Order (Baseline)"), (0.5, "Half Suggested Replenishment"), (1.0, "Suggested Replenishment"), (1.25, "+25% Buffer Replenishment")]:
                target_q = int(round(proposed * qty_mult))
                req_q = InventoryRequest(type="inventory", objective="stockout", horizon=30, parameters=InventoryParams(product=product_id, order_quantities=[target_q]))
                b_q, a_q, _, _, _ = scenario.inventory_scenario(conn, req_q, forecast_payload, info=info)
                row = b_q if qty_mult == 0.0 else a_q[0]
                cond = f"Set Purchase Order = {target_q} units (arrive after lead time {ev.get('lead_time_days', 7)}d)" if target_q > 0 else "Keep Purchase Order = 0 units"
                profit_d = row["profit"] - b_q["profit"]
                rev_d = row["revenue"] - b_q["revenue"]
                results.append(
                    {
                        "id": f"cf_inv_{int(qty_mult*100)}",
                        "parameter": "order_quantity",
                        "variable": "order_quantity",
                        "scenario_label": cond,
                        "condition": cond,
                        "target_value": target_q,
                        "current_value": 0,
                        "predicted_fulfilled_units": row["fulfilled"],
                        "predicted_unfulfilled_units": row["risk"],
                        "unfulfilled_risk": row["risk"],
                        "predicted_revenue": row["revenue"],
                        "predicted_profit": row["profit"],
                        "profit_delta": profit_d,
                        "delta_profit": profit_d,
                        "revenue_delta": rev_d,
                        "purchase_commitment": row.get("purchase_commitment", 0),
                        "arrival_date": ev.get("arrival_date"),
                        "is_recommended": qty_mult == 1.0,
                        "label": label_en,
                    }
                )
        except Exception:
            pass
        return results

    if kind == "marketing" and channel and caps.get("has_marketing", True):
        try:
            req = MarketingRequest(
                type="marketing",
                objective="profit",
                horizon=30,
                parameters=MarketingParams(channel=channel, changes=[-0.30, -0.15, 0.15, 0.30], response_exponent=0.65),
            )
            base, alts, rec, _, _ = scenario.marketing_scenario(conn, info, req)
            for row, ch in zip(alts, [-0.30, -0.15, 0.15, 0.30]):
                cond = f"Shift {channel} monthly budget by {ch:+.0%} (at response α=0.65)"
                profit_d = row["profit"] - base["profit"]
                rev_d = row["revenue"] - base["revenue"]
                results.append(
                    {
                        "id": f"cf_mkt_{int(ch*100)}",
                        "parameter": "budget_change_pct",
                        "variable": "budget_change_pct",
                        "scenario_label": cond,
                        "condition": cond,
                        "current_value": base.get("spend"),
                        "target_value": row.get("spend"),
                        "predicted_revenue": row["revenue"],
                        "predicted_profit": row["profit"],
                        "profit_delta": profit_d,
                        "delta_profit": profit_d,
                        "revenue_delta": rev_d,
                        "delta_revenue": rev_d,
                        "projected_roas": row.get("roas"),
                        "is_recommended": bool(rec and row.get("name") == rec.get("name")),
                    }
                )
        except Exception:
            pass
        return results

    if kind in {"price", "revenue_growth", "cost_optimization"} and product_id and forecast_payload:
        try:
            req = PriceRequest(
                type="price",
                objective="profit",
                horizon=30,
                parameters=PriceParams(product=product_id, discounts=[0.0, 0.05, 0.10, 0.15]),
            )
            base, alts, rec, _, _ = scenario.price_scenario(conn, info, req, forecast_payload)
            for row, d in zip(alts, [0.0, 0.05, 0.10, 0.15]):
                cond = f"Adjust {product_id} price to {d:.0%} list discount"
                profit_d = row["profit"] - base["profit"]
                rev_d = row["revenue"] - base["revenue"]
                results.append(
                    {
                        "id": f"cf_price_{int(d*100)}",
                        "parameter": "list_discount",
                        "variable": "list_discount",
                        "scenario_label": cond,
                        "condition": cond,
                        "current_value": base.get("unit_price"),
                        "target_value": row.get("unit_price"),
                        "predicted_demand": row["demand"],
                        "predicted_revenue": row["revenue"],
                        "predicted_profit": row["profit"],
                        "profit_delta": profit_d,
                        "delta_profit": profit_d,
                        "revenue_delta": rev_d,
                        "delta_revenue": rev_d,
                        "unfulfilled_risk": row.get("risk"),
                        "is_recommended": bool(rec and row.get("name") == rec.get("name")),
                    }
                )
        except Exception:
            pass
    return results


def evaluate_model_performance(
    *,
    bundle: dict[str, Any] | None,
    target: str = "revenue",
    scope: str = "all",
    horizon: int = 30,
    anomaly_metric: str | None = None,
    anomaly_quality: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Strictly separate measured historical ML model performance from recommendation confidence."""
    forecast_metrics: dict[str, Any] = {"available": False, "status": "Chưa đủ dữ liệu đánh giá"}
    if bundle and "forecast" in bundle and target in bundle["forecast"]:
        t_info = bundle["forecast"][target]
        entry = (t_info.get("series") or {}).get((scope, horizon)) or (t_info.get("series") or {}).get(("all", horizon)) or (t_info.get("series") or {}).get(("all", 7))
        if entry and entry.get("report"):
            rep = entry["report"]
            sel = rep["selected"]
            test_m = (rep.get("test") or {}).get(sel) or {}
            val_m = (rep.get("validation") or {}).get(sel) or {}

            # Compute honest holdout R2 when validation/test examples match (all / P001)
            r2_val = None
            ex = (bundle.get("examples") or {}).get((target, rep["scope"]))
            if ex and ex.get("actual") is not None and ex.get("predicted") is not None:
                y_true = np.asarray(ex["actual"], dtype=float)
                y_pred = np.asarray(ex["predicted"], dtype=float)
                denom = float(np.sum((y_true - y_true.mean()) ** 2)) if len(y_true) > 1 else 0.0
                if denom > 1e-9:
                    r2_val = round(1.0 - float(np.sum((y_true - y_pred) ** 2)) / denom, 4)

            baseline_name = min(
                [m for m in ("seasonal_naive", "moving_average") if m in (rep.get("test") or {})],
                key=lambda m: (rep["test"][m].get("mae") or 1e18),
                default=None,
            )
            forecast_metrics = {
                "available": True,
                "status": "short_window_fallback" if rep.get("short_window_fallback") else "evaluated",
                "task_type": "forecasting_regression",
                "selected_model": sel,
                "model_version": (bundle or {}).get("version"),
                "scope": rep["scope"],
                "target": target,
                "horizon": rep["horizon"],
                "mae": round(float(test_m.get("mae") or 0.0), 4),
                "rmse": round(float(test_m.get("rmse") or 0.0), 4),
                "wape": _safe_float(test_m.get("wape")),
                "mape": _safe_float(test_m.get("mape")),
                "bias": round(float(test_m.get("bias") or 0.0), 4),
                "r2": r2_val,
                "r2_pseudo": r2_val,
                "observations": int(test_m.get("observations") or 0),
                "test_coverage": round(float(rep.get("test_coverage") or 0.0), 4),
                "nominal_coverage": float(rep.get("nominal_coverage") or 0.90),
                "calibration_independent": bool(rep.get("calibration_independent", False)),
                "validation_mae": round(float(val_m.get("mae") or 0.0), 4),
                "validation_wape": _safe_float(val_m.get("wape")),
                "baseline_model": baseline_name,
                "baseline_test_mae": round(float(rep["test"][baseline_name]["mae"]), 4) if baseline_name else None,
                "baseline_test_wape": _safe_float(rep["test"][baseline_name].get("wape")) if baseline_name else None,
                "short_window_fallback": bool(rep.get("short_window_fallback", False)),
                "split_ranges": bundle.get("split"),
            }

    anomaly_metrics: dict[str, Any] = {"available": False, "status": "Chưa đủ dữ liệu đánh giá"}
    if anomaly_quality:
        matched = None
        if anomaly_metric:
            matched = next((r for r in anomaly_quality if r.get("metric") == anomaly_metric), None)
        if matched is None:
            matched = anomaly_quality[0]
        labeled_pos = int(matched.get("tp", 0)) + int(matched.get("fn", 0))
        anom_reason = (
            None
            if labeled_pos > 0
            else "No ground-truth anomaly labels exist in this uploaded company dataset; classification precision/recall remain unverified."
        )
        anomaly_metrics = {
            "available": True,
            "task_type": "anomaly_classification",
            "metric": matched.get("metric"),
            "status": matched.get("status", "unverified"),
            "labeled_positives": labeled_pos,
            "precision": round(float(matched.get("precision", 0.0)), 4) if labeled_pos > 0 else None,
            "recall": round(float(matched.get("recall", 0.0)), 4) if labeled_pos > 0 else None,
            "f1": round(float(matched.get("f1", 0.0)), 4) if labeled_pos > 0 else None,
            "false_positive_rate": _safe_float(matched.get("false_positive_rate")),
            "confusion_matrix": {
                "tp": int(matched.get("tp", 0)),
                "fp": int(matched.get("fp", 0)),
                "fn": int(matched.get("fn", 0)),
                "tn": int(matched.get("tn", 0)),
            },
            "reason": anom_reason,
            "note": anom_reason,
        }

    available_any = forecast_metrics.get("available", False) or anomaly_metrics.get("available", False)
    return {
        "available": available_any,
        "status_label": (
            "Evaluated on chronological holdout split"
            if forecast_metrics.get("available")
            else ("Chưa đủ dữ liệu đánh giá" if not available_any else "Anomaly telemetry only")
        ),
        "model_version": (bundle or {}).get("version"),
        "forecast": forecast_metrics,
        "anomaly": anomaly_metrics,
        "separation_disclosure": (
            "Model Performance metrics (WAPE/MAE/RMSE/Coverage or Precision/Recall/F1) evaluate historical test predictions ONLY. "
            "They are kept strictly separate from Recommendation Confidence."
        ),
    }


def compute_confidence_score(
    *,
    data_quality_score: float | None,
    evidence_completeness: float,
    model_perf: dict[str, Any],
    sensitivity_spread: float | None,
    insufficient_evidence_flag: bool = False,
    day_span: int = 0,
    domain: str = "general",
) -> dict[str, Any]:
    """Compute transparent 4-factor Recommendation Confidence separated from Model Accuracy."""
    dq = max(0.0, min(1.0, (float(data_quality_score) / 100.0) if data_quality_score is not None else 0.50))
    ev = max(0.0, min(1.0, float(evidence_completeness)))

    # Derive model validation score strictly from real test metrics (never hardcoded!)
    fc = model_perf.get("forecast") or {}
    anom = model_perf.get("anomaly") or {}
    mv = 0.25
    mv_reason = "No evaluated ML holdout validation present"
    if domain in {"customer", "operations", "risk_governance"}:
        if fc.get("available") and not fc.get("short_window_fallback"):
            wape = fc.get("wape")
            cov = fc.get("test_coverage") or 0.0
            mv = max(0.25, min(0.85, (1.0 - min(0.7, float(wape or 0.3))) * 0.7 + min(1.0, cov / 0.9) * 0.3 - 0.15))
            mv_reason = f"Heuristic cohort/rule backed by forecast WAPE={wape:.1%}" if wape is not None else "Heuristic cohort rule"
        else:
            mv = 0.40
            mv_reason = "Rule-based heuristic without dedicated supervised ML classifier"
    elif anom.get("available") and anom.get("labeled_positives", 0) > 0 and domain == "marketing":
        f1_val = float(anom.get("f1") or 0.0)
        mv = max(0.15, min(0.95, 0.55 * f1_val + (0.35 if fc.get("available") else 0.15)))
        mv_reason = f"Anomaly F1={f1_val:.2f} (plus iso-elastic curve prior)"
    elif fc.get("available"):
        wape = fc.get("wape")
        cov = float(fc.get("test_coverage") or 0.0)
        wape_score = max(0.0, 1.0 - min(1.0, float(wape if wape is not None else 0.40)))
        cov_score = max(0.0, 1.0 - abs(0.90 - cov) * 2.0)
        mv = max(0.10, min(1.0, 0.65 * wape_score + 0.35 * cov_score))
        if fc.get("short_window_fallback"):
            mv = min(mv, 0.55)
            mv_reason = f"Short-window statistical baseline (<201d), WAPE={(wape or 0):.1%}, coverage={cov:.0%}"
        else:
            mv_reason = f"Holdout WAPE={(wape or 0):.1%}, coverage={cov:.0%}"

    # Stability under sensitivity variation (0 = high variance -> low stability, <=0.15 -> high)
    if sensitivity_spread is not None:
        st = max(0.20, min(1.0, 1.0 - min(0.80, abs(float(sensitivity_spread)))))
    elif insufficient_evidence_flag:
        st = 0.30
    else:
        st = 0.60

    composite = round(0.30 * dq + 0.25 * ev + 0.25 * mv + 0.20 * st, 4)

    if insufficient_evidence_flag or day_span < 7 or ev < 0.35:
        level = "Insufficient Evidence"
        level_vi = "Chưa đủ bằng chứng"
    elif composite >= 0.78 and mv >= 0.55 and ev >= 0.75:
        level = "High"
        level_vi = "Cao"
    elif composite >= 0.55:
        level = "Medium"
        level_vi = "Trung bình"
    else:
        level = "Low"
        level_vi = "Thấp"

    component_items = [
        {"key": "data_quality", "label": "Data Quality", "label_vi": "Chất lượng dữ liệu", "weight": 0.30, "score": round(dq, 4), "detail": f"{dq*100:.1f}/100 validated dataset quality"},
        {"key": "evidence_completeness", "label": "Evidence Completeness", "label_vi": "Độ đầy đủ bằng chứng", "weight": 0.25, "score": round(ev, 4), "detail": f"{ev*100:.0f}% domain data & comparative windows present"},
        {"key": "model_validation", "label": "Model Validation", "label_vi": "Kiểm chứng mô hình", "weight": 0.25, "score": round(mv, 4), "detail": mv_reason},
        {"key": "uncertainty_stability", "label": "Sensitivity Stability", "label_vi": "Độ ổn định trước biến động", "weight": 0.20, "score": round(st, 4), "detail": "Band variance across sensitivity bounds" if sensitivity_spread is not None else "Heuristic prior stability"},
    ]

    return {
        "level": level,
        "level_vi": level_vi,
        "score": round(composite * 100.0, 1),
        "score_0_1": composite,
        "score_pct": round(composite * 100.0, 1),
        "formula": CONFIDENCE_FORMULA_DESC,
        "thresholds": {
            "High": ">= 78/100 with verified validation & >= 75/100 evidence completeness",
            "Medium": "55 – 77/100",
            "Low": "< 55/100",
            "Insufficient Evidence": "Insufficient sample size (<7d), missing core metrics, or unquantifiable impact",
        },
        "is_calibrated": False,
        "calibration_note": (
            "Weighted multi-criteria confidence index (is_calibrated=false). "
            "It reflects evidence & stability readiness rather than an empirical probability of financial outcome."
        ),
        "components": {
            "data_quality_0_100": round(dq * 100.0, 1),
            "evidence_completeness_0_100": round(ev * 100.0, 1),
            "model_validation_0_100": round(mv * 100.0, 1),
            "sensitivity_stability_0_100": round(st * 100.0, 1),
        },
        "component_items": component_items,
        "limitations": [
            "Index is a deterministic unweighted heuristic composite (is_calibrated=false), NOT a calibrated posterior probability.",
        ],
    }


def compute_series_drift(values: np.ndarray | list[float], dates: list[date], recent_days: int = 30) -> dict[str, Any]:
    """Compute real Population Stability Index (PSI) and Mean Z-Shift between training baseline (first 70%) and latest window."""
    arr = np.asarray(values, dtype=float)
    n = len(arr)
    if n < 30:
        return {
            "available": False,
            "status": "insufficient_history",
            "reason": f"At least 30 daily points needed for distribution drift comparison (observed {n}d).",
            "psi": None,
            "mean_z_shift": None,
            "drift_detected": False,
        }
    ref_end = max(14, int(n * 0.70))
    cur_start = max(ref_end, n - min(recent_days, max(7, n - ref_end)))
    ref = arr[:ref_end]
    cur = arr[cur_start:]
    if len(cur) < 5 or len(ref) < 10:
        return {
            "available": False,
            "status": "insufficient_history",
            "reason": "Too few post-training observations for drift check.",
            "psi": None,
            "mean_z_shift": None,
            "drift_detected": False,
        }

    ref_mean, ref_std = float(ref.mean()), max(1e-6, float(ref.std()))
    cur_mean, cur_std = float(cur.mean()), float(cur.std())
    z_shift = (cur_mean - ref_mean) / ref_std

    # 8-quantile PSI with Laplace epsilon
    edges = np.quantile(ref, np.linspace(0, 1, 9))
    edges[0] = -np.inf
    edges[-1] = np.inf
    # Deduplicate edges if series has many repeated values (e.g. zeros)
    unique_edges = np.unique(edges)
    psi_val = 0.0
    if len(unique_edges) >= 3:
        ref_cnt, _ = np.histogram(ref, bins=unique_edges)
        cur_cnt, _ = np.histogram(cur, bins=unique_edges)
        ref_pct = np.clip(ref_cnt / max(1, len(ref)), 1e-4, 1.0)
        cur_pct = np.clip(cur_cnt / max(1, len(cur)), 1e-4, 1.0)
        psi_val = float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))

    severity = "critical" if psi_val >= 0.25 or abs(z_shift) >= 2.5 else ("warning" if psi_val >= 0.10 or abs(z_shift) >= 1.5 else "normal")
    return {
        "available": True,
        "status": severity,
        "drift_detected": severity != "normal",
        "psi": round(psi_val, 4),
        "mean_z_shift": round(z_shift, 4),
        "reference_window": [str(dates[0]), str(dates[ref_end - 1])],
        "current_window": [str(dates[cur_start]), str(dates[-1])],
        "reference_mean": round(ref_mean, 2),
        "reference_std": round(ref_std, 2),
        "current_mean": round(cur_mean, 2),
        "current_std": round(cur_std, 2),
    }
