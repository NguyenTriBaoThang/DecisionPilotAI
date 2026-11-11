"""Grounded Decision Intelligence Advisor (RAG + SQL + Scenario Evidence) & Report Exporter."""
from __future__ import annotations

import csv
from datetime import datetime, timezone
import io
import json
import logging
import os
import re
from typing import Any

from fastapi import HTTPException
import httpx
import sqlalchemy as sa

from backend.app import services
from backend.app.analytics import dataset_info
from backend.app.db import twin_scenario_variables, twin_scenarios, twin_simulation_results, twin_simulation_runs
from backend.app.lineage import service as lineage_service
from backend.app.rag.retrieval import hybrid_search
from backend.app.simulator.engine import get_run_detail, get_scenario_detail

log = logging.getLogger(__name__)


def _csv_safe(val: Any) -> Any:
    if isinstance(val, str) and val.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + val
    return val


def _fmt_num(val: float | None, unit: str, currency: str) -> str:
    if val is None:
        return "Unavailable"
    if unit == "%":
        return f"{val:.2f}%"
    if unit == "x":
        return f"{val:.2f}x"
    if unit == currency or unit in {"VND", "USD", "EUR", "GBP"}:
        sym = "$" if unit == "USD" else ("€" if unit == "EUR" else ("£" if unit == "GBP" else "₫"))
        if unit == "VND" and abs(val) >= 1000:
            return f"{sym}{val:,.0f}"
        return f"{sym}{val:,.2f}"
    return f"{val:,.2f}" if abs(val) < 1000 else f"{val:,.0f}"


def _try_llm_synthesize(
    *,
    language: str,
    scenario: dict[str, Any],
    run: dict[str, Any],
    metrics: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    risks: list[str],
    limitations: list[str],
    custom_focus: str | None,
) -> dict[str, str] | None:
    provider = os.getenv("LLM_PROVIDER", "none").strip().lower()
    if provider not in {"openai", "gemini"}:
        return None
    if provider == "openai" and not os.getenv("OPENAI_API_KEY", "").strip():
        return None
    if provider == "gemini" and not os.getenv("GEMINI_API_KEY", "").strip():
        return None

    lang_name = "Vietnamese" if language == "vi" else "English"
    valid_cits = {c["citation_id"] for c in citations}
    prompt_payload = {
        "scenario_name": scenario["name"],
        "scenario_type": scenario["scenario_type"],
        "objective": scenario["objective"],
        "horizon_days": scenario["horizon_days"],
        "custom_focus": custom_focus,
        "supporting_metrics": [
            {
                "metric_name": m["metric_name"],
                "label": m["label"],
                "baseline_value": m["baseline_value"],
                "scenario_value": m["scenario_value"],
                "abs_difference": m["abs_difference"],
                "pct_difference": m["pct_difference"],
                "unit": m["unit"],
            }
            for m in metrics
        ],
        "risks": risks,
        "limitations": limitations,
        "citations": [
            {"id": c["citation_id"], "file": c["source_file"], "snippet": c["snippet"]}
            for c in citations
        ],
    }
    sys_msg = (
        f"You are DecisionPilot AI Senior Simulation Advisor. Respond in {lang_name} as valid JSON with keys "
        "'recommendation' and 'summary'.\n"
        "STRICT RULES:\n"
        "1. NEVER invent numbers, percentages, or confidence intervals outside 'supporting_metrics' or 'risks'.\n"
        "2. NEVER claim randomized causal proof; state clearly that projections are conditional model/sensitivity estimates.\n"
        "3. Only reference citation IDs present in 'citations' like [C1].\n"
    )
    user_msg = json.dumps(prompt_payload, ensure_ascii=False, default=str)

    try:
        if provider == "openai":
            resp = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
                json={
                    "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": sys_msg},
                        {"role": "user", "content": user_msg},
                    ],
                },
                timeout=12.0,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
        else:
            model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            resp = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                json={
                    "system_instruction": {"parts": [{"text": sys_msg}]},
                    "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
                    "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
                },
                timeout=12.0,
            )
            resp.raise_for_status()
            raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

        parsed = json.loads(raw)
        rec_txt = str(parsed.get("recommendation") or "").strip()
        sum_txt = str(parsed.get("summary") or "").strip()
        if not rec_txt:
            return None

        def _strip_fake_cits(txt: str) -> str:
            return re.sub(r"\[C(\d+)\]", lambda m: f"[C{m.group(1)}]" if f"C{m.group(1)}" in valid_cits else "", txt).strip()

        return {
            "recommendation": _strip_fake_cits(rec_txt),
            "summary": _strip_fake_cits(sum_txt),
            "mode": f"llm_grounded:{provider}",
        }
    except Exception as exc:
        log.warning("Digital Twin LLM recommendation fell back to deterministic mode (%s).", type(exc).__name__)
        return None


def generate_run_recommendation(
    engine: sa.Engine,
    *,
    company_id: str,
    run_id: str,
    role: str = "viewer",
    language: str = "en",
    custom_focus: str | None = None,
) -> dict[str, Any]:
    """Generate an evidence-grounded decision recommendation referencing real simulation numbers, RAG policies, and limitations."""
    run = get_run_detail(engine, company_id=company_id, run_id=run_id)
    if run["status"] != "completed":
        raise HTTPException(
            422,
            f"Recommendations require a completed simulation run (current status: '{run['status']}').",
        )

    scen = get_scenario_detail(engine, company_id=company_id, scenario_id=run["scenario_id"])
    results = run.get("results") or []
    res_map = {r["metric_name"]: r for r in results}

    with engine.connect() as conn:
        try:
            info = dataset_info(conn, company_id=company_id, dataset_id=run.get("dataset_id"))
        except HTTPException:
            info = None

        rag_query = " ".join(
            part
            for part in [
                scen["name"],
                scen["scenario_type"].replace("_", " "),
                scen["objective"],
                custom_focus or "",
                "margin discount lead time inventory stockout budget policy SLA",
            ]
            if part
        )
        rag_hits, rag_trace = hybrid_search(
            conn,
            query=rag_query,
            company_id=company_id,
            role=role,
            dataset_id=run.get("dataset_id"),
            top_k=4,
            min_score=0.05,
        )
        alerts_preview: list[dict[str, Any]] = []
        model_quality: dict[str, Any] | None = None
        if info:
            try:
                alerts_preview = services.alerts(conn, info, None, None)[:4]
            except Exception:
                alerts_preview = []
            try:
                model_quality = services.model_quality(info)
            except Exception:
                model_quality = None

    currency = (run.get("output_references") or {}).get("currency") or (info or {}).get("currency", "VND")
    rev = res_map.get("revenue_forecast")
    prof = res_map.get("profit_forecast")
    margin = res_map.get("gross_margin_pct")
    stockout = res_map.get("inventory_risk_units")
    closing = res_map.get("closing_inventory_units")
    mkt_spend = res_map.get("marketing_spend")
    ful = res_map.get("operational_fulfillment_pct")

    supporting_metrics = [
        {
            "metric_name": r["metric_name"],
            "label": r["label"],
            "domain": r["domain"],
            "baseline_value": r["baseline_value"],
            "scenario_value": r["scenario_value"],
            "abs_difference": r["abs_difference"],
            "pct_difference": r["pct_difference"],
            "unit": r["unit"],
            "uncertainty_available": bool((r.get("uncertainty_metadata") or {}).get("is_available")),
        }
        for r in results
        if r["baseline_value"] is not None or r["scenario_value"] is not None
    ]

    risks: list[str] = list(run.get("warnings") or [])
    if stockout and stockout.get("scenario_value") and float(stockout["scenario_value"]) > 0:
        risks.append(
            f"Supply / fulfillment bottleneck: projected {float(stockout['scenario_value']):,.1f} unfulfilled demand unit(s) "
            f"(fulfillment rate {ful.get('scenario_value') if ful else 'N/A'}%)."
        )
    if prof and prof.get("pct_difference") is not None and float(prof["pct_difference"]) < 0:
        risks.append(
            f"Profitability dilution: projected contribution profit decreases by {float(prof['pct_difference']):.2f}% "
            f"({_fmt_num(prof.get('abs_difference'), prof['unit'], currency)})."
        )
    if margin and margin.get("pct_difference") is not None and float(margin["pct_difference"]) < -1.0:
        risks.append(
            f"Margin compression: Gross margin shifts from {margin.get('baseline_value')}% to {margin.get('scenario_value')}%."
        )
    for a in alerts_preview[:2]:
        risks.append(f"Observed workspace anomaly ({a['severity'].upper()}): {a['metric']} on {a['scope']} — {a['action']}.")
    if not risks:
        risks.append("No acute threshold breaches detected in simulated variables; monitor actual post-launch conversion & lead times.")

    assumptions: list[str] = list(run.get("assumptions") or [])
    limitations: list[str] = [
        "Forecasts and what-if sensitivities represent conditional projections, NOT proven randomized causal effects.",
        "Customer Churn / Propensity Classification ML model is NOT integrated; customer impact relies on sensitivity heuristics only.",
        "Multi-scenario ranking uses discrete heuristic objective scoring rather than a continuous multi-constraint MILP optimizer.",
    ]
    missing_metrics = [r["label"] for r in results if r["scenario_value"] is None]
    if missing_metrics:
        limitations.append(f"Missing metrics due to unmapped dataset fields: {', '.join(missing_metrics)}.")
    if (run.get("data_readiness") or {}).get("days_observed", 0) < 201:
        limitations.append("Historical window <201 days triggered short-window statistical baseline instead of full 28-lag LightGBM regression.")
    if not rag_hits:
        limitations.append("Zero matching internal policy/SOP documents were indexed in RAG for qualitative compliance cross-check.")

    is_vi = language == "vi"
    rev_str = _fmt_num(rev.get("scenario_value"), rev["unit"], currency) if rev else "N/A"
    rev_pct = f"{rev['pct_difference']:+.2f}%" if rev and rev.get("pct_difference") is not None else "N/A"
    prof_str = _fmt_num(prof.get("scenario_value"), prof["unit"], currency) if prof else "Unavailable"
    prof_pct = f"{prof['pct_difference']:+.2f}%" if prof and prof.get("pct_difference") is not None else "N/A"
    risk_units = float(stockout["scenario_value"]) if (stockout and stockout.get("scenario_value") is not None) else 0.0

    cit_tags = " ".join(f"[{c['citation_id']}]" for c in rag_hits[:2])

    # Action posture derived strictly from real metric deltas & risks
    if risk_units > 0 and (prof is None or (prof.get("abs_difference") or 0) <= 0):
        action_verdict_en = f"Hold or mitigate stock risk before deploying '{scen['name']}'"
        action_verdict_vi = f"Tạm hoãn / bổ sung tồn kho trước khi triển khai '{scen['name']}'"
    elif risk_units > 0:
        action_verdict_en = f"Conditional pilot with replenishment buffer for '{scen['name']}'"
        action_verdict_vi = f"Thử nghiệm có điều kiện kèm bổ sung tồn kho cho '{scen['name']}'"
    elif prof and prof.get("abs_difference") is not None and float(prof["abs_difference"]) > 0:
        action_verdict_en = f"Prioritize controlled rollout of '{scen['name']}' under margin guardrails"
        action_verdict_vi = f"Ưu tiên triển khai có kiểm soát kịch bản '{scen['name']}' theo ngưỡng biên lợi nhuận"
    else:
        action_verdict_en = f"Review trade-offs on '{scen['name']}' against baseline metrics before approval"
        action_verdict_vi = f"Rà soát đánh đổi của '{scen['name']}' so với Baseline trước khi phê duyệt"

    det_rec = (
        f"{action_verdict_vi}: Doanh thu dự kiến {rev_str} ({rev_pct} vs baseline), lợi nhuận {prof_str} ({prof_pct}), rủi ro thiếu hàng {risk_units:,.0f} đv."
        + (f" Tài liệu tham chiếu: {cit_tags}." if cit_tags else "")
        if is_vi
        else f"{action_verdict_en}: Projected revenue {rev_str} ({rev_pct} vs baseline), contribution profit {prof_str} ({prof_pct}), stockout risk {risk_units:,.0f} units."
        + (f" Policy references: {cit_tags}." if cit_tags else "")
    )
    det_sum = (
        (
            f"Phân tích kịch bản **{scen['name']}** (`{scen['scenario_type']}`, khung {scen['horizon_days']} ngày, mục tiêu `{scen['objective']}`). "
            f"Kết quả được tính toán từ dữ liệu thực tế SQL và chuỗi LightGBM/baseline, không tự suy diễn chỉ số thiếu."
        )
        if is_vi
        else (
            f"Evaluated **{scen['name']}** (`{scen['scenario_type']}`, {scen['horizon_days']}-day horizon, objective `{scen['objective']}`). "
            f"Outputs reflect verified SQL baseline data and LightGBM / counterfactual parametric models with explicit uncertainty disclosure."
        )
    )

    llm_out = _try_llm_synthesize(
        language=language,
        scenario=scen,
        run=run,
        metrics=supporting_metrics,
        citations=rag_hits,
        risks=risks,
        limitations=limitations,
        custom_focus=custom_focus,
    )

    recommendation_payload = {
        "run_id": run_id,
        "scenario_id": scen["id"],
        "scenario_name": scen["name"],
        "scenario_type": scen["scenario_type"],
        "language": language,
        "synthesis_mode": llm_out["mode"] if llm_out else "deterministic_grounded",
        "recommendation": llm_out["recommendation"] if llm_out else det_rec,
        "summary": llm_out["summary"] if llm_out and llm_out.get("summary") else det_sum,
        "supporting_metrics": supporting_metrics,
        "supporting_data": {
            "dataset_id": run.get("dataset_id"),
            "dataset_title": (info or {}).get("title"),
            "currency": currency,
            "data_readiness": run.get("data_readiness"),
            "observed_alerts_count": len(alerts_preview),
            "observed_alerts": [
                {"id": a["id"], "metric": a["metric"], "severity": a["severity"], "scope": a["scope"]}
                for a in alerts_preview
            ],
            "closing_stock_units": closing.get("scenario_value") if closing else None,
            "marketing_spend": mkt_spend.get("scenario_value") if mkt_spend else None,
        },
        "related_models": [
            m for m in (scen.get("models") or [])
        ] + ([{"id": "model_quality", "metrics": model_quality}] if model_quality else []),
        "risks": list(dict.fromkeys(risks)),
        "assumptions": list(dict.fromkeys(assumptions)),
        "limitations": limitations,
        "citations": [
            {
                "citation_id": c["citation_id"],
                "document_id": c["document_id"],
                "source_file": c["source_file"],
                "section": c.get("section"),
                "page_number": c.get("page_number"),
                "snippet": c["snippet"],
                "rerank_score": c.get("rerank_score"),
            }
            for c in rag_hits
        ],
        "rag_trace": {
            "rewritten_query": rag_trace.rewritten_query,
            "returned_hits": rag_trace.returned_hits,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    with engine.begin() as conn:
        conn.execute(
            twin_simulation_runs.update()
            .where(twin_simulation_runs.c.id == run_id, twin_simulation_runs.c.company_id == company_id)
            .values(recommendation_json=recommendation_payload)
        )

    lineage_service.record_runtime_event(
        engine,
        company_id=company_id,
        pipeline_key="decision_intelligence:main",
        pipeline_name="Decision Intelligence Pipeline",
        pipeline_type="decision_intelligence",
        run_key=f"dec:{run.get('dataset_id') or company_id}",
        dataset_id=run.get("dataset_id"),
        actor="twin_advisor",
        event_type=f"Twin Recommendation Synthesized ({scen['scenario_type']})",
        step_order=13,
        status="completed",
        node_key="output:recommendations_decisions",
        input_summary=f"Run {run_id}",
        output_summary=f"{len(rag_hits)} RAG citation(s), {len(supporting_metrics)} metrics",
    )

    return recommendation_payload


def export_run_report(
    engine: sa.Engine,
    *,
    company_id: str,
    run_id: str,
    fmt: str = "json",
) -> tuple[bytes, str, str]:
    """Export complete simulation run trace, variables, metrics, uncertainty & recommendations as CSV or JSON."""
    run = get_run_detail(engine, company_id=company_id, run_id=run_id)
    scen = get_scenario_detail(engine, company_id=company_id, scenario_id=run["scenario_id"])

    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "scenario_name",
            "metric_name",
            "domain",
            "label",
            "baseline_value",
            "scenario_value",
            "abs_difference",
            "pct_difference",
            "unit",
            "uncertainty_available",
            "interval_lower",
            "interval_upper",
            "model_name",
            "model_version",
            "data_source",
            "formula",
            "timestamp",
        ])
        for r in run.get("results") or []:
            unc = r.get("uncertainty_metadata") or {}
            ev = r.get("evidence_references") or {}
            writer.writerow([
                _csv_safe(scen.get("name")),
                _csv_safe(r.get("metric_name")),
                _csv_safe(r.get("domain")),
                _csv_safe(r.get("label")),
                r.get("baseline_value"),
                r.get("scenario_value"),
                r.get("abs_difference"),
                r.get("pct_difference"),
                _csv_safe(r.get("unit")),
                bool(unc.get("is_available")),
                unc.get("interval_lower"),
                unc.get("interval_upper"),
                _csv_safe(ev.get("model_name")),
                _csv_safe(ev.get("model_version")),
                _csv_safe(ev.get("data_source")),
                _csv_safe(ev.get("formula")),
                _csv_safe(ev.get("timestamp")),
            ])
        return (
            buf.getvalue().encode("utf-8"),
            "text/csv; charset=utf-8",
            f"digital-twin-run-{run_id}.csv",
        )

    report = {
        "report_type": "decisionpilot_digital_twin_simulation",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "company_id": company_id,
        "scenario": {
            "id": scen["id"],
            "name": scen["name"],
            "scenario_type": scen["scenario_type"],
            "objective": scen["objective"],
            "horizon_days": scen["horizon_days"],
            "is_baseline": scen["is_baseline"],
            "constraints": scen["constraints"],
            "variables": scen["variables"],
        },
        "simulation_run": {
            "id": run["id"],
            "status": run["status"],
            "started_at": run["started_at"],
            "completed_at": run["completed_at"],
            "duration_ms": run["duration_ms"],
            "model_versions": run["model_versions"],
            "data_readiness": run["data_readiness"],
            "warnings": run["warnings"],
            "assumptions": run["assumptions"],
            "results": run["results"],
            "events": run["events"],
            "recommendation": run["recommendation"],
        },
        "disclaimer": (
            "Metrics marked unavailable or null reflect unmapped columns or unintegrated models. "
            "Forecasts and what-if sensitivities are not proven randomized causal experiments."
        ),
    }
    return (
        json.dumps(report, indent=2, ensure_ascii=False, default=str).encode("utf-8"),
        "application/json",
        f"digital-twin-run-{run_id}.json",
    )
