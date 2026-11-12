"""Evidence linked scenario choices and idempotent audited decisions."""
from dataclasses import dataclass
from datetime import date, timedelta
from uuid import uuid4

import sqlalchemy as sa
from fastapi import HTTPException

from backend.app import services
from backend.app.analytics import dataset_info
from backend.app.db import inv_cases, inv_predictions, products, sales, marketing
from backend.app.governance.hash_chain import append_audited_event
from backend.app.investigation.evidence import Evidence
from backend.app.investigation.scoring import calibration_factor
from backend.app.schemas import MarketingRequest, MarketingParams, PriceRequest, PriceParams


@dataclass(frozen=True)
class Option:
    key: str
    title_vi: str
    metric: str
    scope: dict
    predicted_delta_pct: float
    calibrated_delta_pct: float
    horizon_days: int
    simulation: dict
    evidence: list[Evidence]


def _evidence(agent, claim, numbers, simulation, info):
    return Evidence(f"ev-{agent}-simulation", agent, claim, numbers, "model",
        "services.simulate; scenario estimate using the active dataset and listed parameters",
        {"tables": ["sales_transactions", "products"], "start": info.get("start"),
         "end": info.get("end"), "rows": info.get("counts", {}).get("sales_transactions", 0)},
        None, simulation.get("evidence", {}).get("xai"),
        None if simulation.get("evidence", {}).get("xai") else "Simulator không trả SHAP cho phương án này.")


def build_options(conn, info: dict, summary: dict) -> list[Option]:
    if summary.get("sufficiency", {}).get("level") == "refused":
        return []
    causes = [c for c in summary.get("causes", []) if c["key"] not in {"demand", "other"}]
    primary = max(causes, key=lambda c: abs(c["delta_daily"]), default=None)
    channel = primary["key"].split(":", 1)[1] if primary and primary["key"].startswith("marketing:") else None
    sku = conn.execute(sa.select(products.c.product_id).order_by(products.c.list_price.desc()).limit(2)).scalars().all()
    if not sku:
        raise HTTPException(422, "Không có sản phẩm để mô phỏng phương án giá.")
    metric = "gross_profit" if channel else "revenue"
    factor = calibration_factor(conn, info['company_id'], 'revenue_drop')
    hold = {"result_type": "scenario estimate", "baseline": {"revenue": 0, "profit": 0}, "alternatives": [], "recommended": {"revenue_delta": 0, "profit_delta": 0}, "evidence": {"method": "exact", "assumptions": ["Giữ nguyên, mức thay đổi bằng 0%."]}}
    options = [Option("hold", "Giữ nguyên", metric, {}, 0.0, 0.0, 14, hold,
                      [_evidence("strategist", "Mức thay đổi so với giữ nguyên là 0%.", {"delta_pct": 0}, hold, info)])]
    if channel:
        request = MarketingRequest(type="marketing", objective="profit", horizon=14,
                                   parameters=MarketingParams(channel=channel, changes=[-0.3]))
        key = f"marketing:{channel}:-0.3"
        scope = {"channel": channel}
    else:
        request = PriceRequest(type="price", objective="profit", horizon=7,
                               parameters=PriceParams(product=sku[0], discounts=[0.1]))
        key = f"price:{sku[0]}:0.1"
        scope = {"product": sku[0]}
    result = services.simulate(conn, info, request)
    alternate = result["alternatives"][0]
    base = result["baseline"]
    denom = float(base.get("profit" if channel else "revenue") or 1)
    delta = float(alternate.get("profit_delta" if channel else "revenue_delta", 0)) / denom
    options.append(Option(key, "Điều chỉnh theo nguyên nhân chính", metric, scope, delta, delta*factor, 14, result,
                          [_evidence("strategist", "Dự báo mô phỏng có điều kiện.", {"delta_pct": delta}, result, info)]))
    request2 = PriceRequest(type="price", objective="profit", horizon=7,
                            parameters=PriceParams(product=sku[min(1, len(sku)-1)], discounts=[0.05]))
    result2 = services.simulate(conn, info, request2)
    alternate2 = result2["alternatives"][0]
    denom2 = float(result2["baseline"].get("revenue") or 1)
    delta2 = float(alternate2.get("revenue_delta", 0)) / denom2
    key2 = f"price:{sku[min(1, len(sku)-1)]}:0.05"
    options.append(Option(key2, "Giảm giá nhẹ cho sản phẩm chủ lực", "revenue", {"product": sku[min(1, len(sku)-1)]}, delta2, delta2*factor, 14, result2,
                          [_evidence("strategist", "Dự báo mô phỏng có điều kiện.", {"delta_pct": delta2}, result2, info)]))
    try:
        quality = services.model_quality(info)
        replay = quality.get("scenario_replay") or {}
        wape = replay.get("wape")
        if wape is not None and wape > .30:
            options = [Option(**{**o.__dict__, "evidence": o.evidence + [Evidence("ev-strategist-wape", "strategist", "Sai số backtest vượt ngưỡng.", {"wape": float(wape)}, "exact", "services.model_quality(info)", {"tables": ["scenario_backtest.json"], "start": None, "end": None, "rows": 0}, None, None, "Không đủ chất lượng mô hình để dùng SHAP.")]}) for o in options]
    except Exception:
        pass
    return options


def decide(engine, case_id: str, option_key: str, actor: str, today: date) -> dict:
    with engine.begin() as conn:
        case = conn.execute(sa.select(inv_cases).where(inv_cases.c.id == case_id)).mappings().first()
        if case is None:
            raise HTTPException(404, "Không tìm thấy vụ việc.")
        prior = conn.execute(sa.select(inv_predictions).where(inv_predictions.c.case_id == case_id)).mappings().first()
        if prior:
            if prior["option_key"] != option_key:
                raise HTTPException(409, "Vụ việc đã có quyết định khác.")
            return dict(prior)
        summary = case["summary"] or {}
        info = dataset_info(conn, case["company_id"], case["dataset_id"])
        options = build_options(conn, info, summary)
        chosen = next((o for o in options if o.key == option_key), None)
        if chosen is None:
            raise HTTPException(422, "Phương án không hợp lệ hoặc chưa có đủ bằng chứng.")
        window_start = today - timedelta(days=27)
        measure = sales.c.gross_profit if chosen.metric == 'gross_profit' else sales.c.revenue
        base_query = sa.select(sa.func.sum(measure)).where(sales.c.date.between(window_start, today))
        if chosen.scope.get('product'):
            base_query = base_query.where(sales.c.product_id == chosen.scope['product'])
        if chosen.scope.get('region'):
            base_query = base_query.where(sales.c.region == chosen.scope['region'])
        if chosen.scope.get('channel'):
            base_query = base_query.select_from(sales.join(marketing, sa.and_(sales.c.campaign_id == marketing.c.campaign_id,
                sales.c.date == marketing.c.date))).where(marketing.c.channel == chosen.scope['channel'])
        baseline = float(conn.scalar(base_query) or 0) / 28
        if baseline <= 0:
            raise HTTPException(422, 'Không đủ doanh thu nền để theo dõi phương án này.')
        row = {"id": "pred-" + uuid4().hex, "case_id": case_id, "option_key": option_key,
               "metric": chosen.metric, "scope": chosen.scope, "baseline_daily": baseline,
               "predicted_delta_pct": chosen.predicted_delta_pct, "calibrated_delta_pct": chosen.calibrated_delta_pct,
               "start_date": today, "horizon_days": chosen.horizon_days, "status": "tracking", "seeded": False}
        conn.execute(inv_predictions.insert().values(**row))
        append_audited_event(conn, company_id=case["company_id"], kind="investigation_decision", subject=case_id,
                             payload={"option_key": option_key, "actor": actor, "prediction_id": row["id"]})
        conn.execute(inv_cases.update().where(inv_cases.c.id == case_id).values(status="tracking"))
        return row
