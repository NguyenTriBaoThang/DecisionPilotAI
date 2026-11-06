"""Application services for analytics, models and the decision workflow."""
from datetime import date, timedelta
from functools import lru_cache
import json

import joblib
import sqlalchemy as sa
from fastapi import HTTPException

from ai_service import anomaly, forecasting, root_cause, scenario
from ai_service.features import anomaly_frame, observed_series
from backend.app.analytics import (FORMULAS, availability, bounds, grouped, marketing_summary,
                                   options, previous_period, ratio, sales_total, trend)
from backend.app.db import ARTIFACTS, inventory, products
from backend.app.schemas import ForecastRequest, InventoryParams, InventoryRequest, MarketingParams, MarketingRequest


@lru_cache(maxsize=4)
def _read_artifact(path, modified):
    return joblib.load(path)


def artifact(info):
    path = ARTIFACTS / f"{info['dataset_id']}.joblib"
    if not path.is_file():
        return None
    result = _read_artifact(path, path.stat().st_mtime_ns)
    return result if result.get("dataset_id") == info["dataset_id"] else None


def checked_filters(conn, dimensions):
    available = options(conn)
    allowed = dict(product={p["product_id"] for p in available["products"]},category=set(available["categories"]),
                   region=set(available["regions"]),channel=set(available["channels"]),segment=set(available["segments"]))
    for key,value in dimensions.items():
        if value not in allowed[key]:
            raise HTTPException(422,f"Unknown {key}. Choose a value from the dataset filter options.")
    return dimensions


def dashboard(conn, info, filters):
    start,end = bounds(info,filters.start,filters.end)
    dims = checked_filters(conn,filters.dimensions())
    prior = previous_period(start,end)
    comparison = prior[0] >= date.fromisoformat(info["start"])
    total = sales_total(conn,start,end,dims)
    previous = sales_total(conn,*prior,dims) if comparison else {}
    market,channels = marketing_summary(conn,start,end) if not dims else (None,[])
    total["inventory_availability"] = availability(conn,start,end,dims) if not (dims.keys()-{"category","product"}) else None
    if market:
        total.update({key:market[key] for key in ("spend","roas","cac","conversion")})
        if comparison:
            previous_marketing,_ = marketing_summary(conn,*prior)
            previous.update({key:previous_marketing[key] for key in ("spend","roas","cac","conversion")})
    changes = {key:ratio(value-previous[key],abs(previous[key])) for key,value in total.items()
               if value is not None and previous.get(key) is not None}
    return dict(summary=total,previous=previous,changes=changes,range=[str(start),str(end)],
                previous_range=[str(d) for d in prior] if comparison else None, filters=dims,grain=filters.grain,
                trend=trend(conn,start,end,dims,filters.grain),products=grouped(conn,start,end,dims,"product",8),
                categories=grouped(conn,start,end,dims,"category"),regions=grouped(conn,start,end,dims,"region"),
                sales_channels=grouped(conn,start,end,dims,"channel"),marketing_channels=channels,
                definitions=FORMULAS,market_scope="Business-wide date range" if not dims else "Unavailable for filtered sales scope",
                sources=["sales_transactions","products","customers","marketing_campaigns","inventory_daily"])


def forecast(conn, info, request):
    bundle = artifact(info)
    if not bundle:
        raise HTTPException(503,"Forecast artifact unavailable for this dataset. Train it before requesting predictions.")
    dates,labels,matrices,_ = observed_series(conn,info)
    scope = "sku:"+request.product if request.product else "category:"+request.category if request.category else "all"
    if scope not in labels:
        raise HTTPException(422,"Choose a product or category from the current dataset.")
    result = forecasting.serve_forecast(bundle["forecast"],request.target,scope,request.horizon,
                                       matrices[request.target][labels.index(scope)],dates)
    flags = sa.select(sa.func.count()).select_from(inventory.join(products)).where(
        inventory.c.stockout_flag.is_(True),inventory.c.date >= dates[-1]-timedelta(days=29))
    if request.product:
        flags = flags.where(inventory.c.product_id==request.product)
    if request.category:
        flags = flags.where(products.c.category==request.category)
    stockouts = conn.scalar(flags)
    result.update(target=request.target,scope=scope,horizon=request.horizon,
                  data_as_of=str(dates[-1]),model_version=bundle["version"],dataset_id=info["dataset_id"],
                  result_type="model forecast",total=sum(row["value"] for row in result["prediction"]),
                  recent_stockout_sku_days=stockouts,stockout_note=(
                      f"{stockouts} physical SKU-days ended with zero stock in the recent 30 days. Forecast is based on observed sales, which can understate unconstrained demand."
                      if stockouts else "Forecast uses observed sales. Unobserved lost demand is outside the target."))
    report = result["metrics"]
    warnings = []
    if report["test_coverage"] < report.get("nominal_coverage", .90):
        warnings.append("Observed holdout coverage is below the nominal interval target. Allow extra contingency when planning.")
    if (report["test"][report["selected"]].get("wape") or 0) > .30:
        warnings.append("Holdout WAPE exceeds 30%; this forecast needs additional review before operational use.")
    if not report.get("calibration_independent", False):
        warnings.append("Model selection and interval calibration share validation data in this artifact.")
    warnings.append("Daily intervals do not establish a confidence interval for the forecast total.")
    result["warnings"] = warnings
    return result


def model_quality(info):
    bundle = artifact(info)
    report = bundle.get("report", {}) if bundle else {}
    signals = []
    for metric, methods in report.get("anomaly", {}).items():
        score = methods.get("hybrid", methods.get("business_rule", {}))
        labeled = score.get("tp", 0)+score.get("fn", 0) > 0
        signals.append({"metric": metric, **score,
                        "status": "unverified" if not labeled else "limited" if score.get("f1", 0)<.70 else "evaluated"})
    replay = None
    path = ARTIFACTS / "scenario_backtest.json"
    if path.is_file():
        try:
            candidate = json.loads(path.read_text(encoding="utf-8"))
            if candidate.get("dataset_id") == info["dataset_id"]:
                replay = candidate
        except (ValueError, OSError):
            pass
    return {"dataset_id": info["dataset_id"], "dataset_kind": info["kind"],
            "model_version": bundle["version"] if bundle else None, "anomaly": signals,
            "scenario_replay": replay,
            "limitations": ["Synthetic evaluations do not establish accuracy on a real business.",
                            "Anomaly scores describe historical tests, not probabilities that an individual alert is correct.",
                            "Scenario effects are conditional assumptions; randomized trials are needed for causal claims."]}


def alerts(conn, info, start=None, end=None):
    start,end = bounds(info,start,end)
    data = anomaly_frame(conn,info)
    bundle = artifact(info)
    rows = anomaly.alert_list(conn,data,bundle["anomaly"] if bundle else {},start,end)
    return rows


def alert_detail(conn,info,alert):
    start,end = date.fromisoformat(alert["start"]),date.fromisoformat(alert["end"])
    prior = previous_period(start,end)
    if alert["metric"] in {"revenue","margin","units"} and prior[0]>=date.fromisoformat(info["start"]):
        alert["contributing_factors"] = root_cause.decompose(conn,(start,end),prior,{},
            "gross_profit" if alert["metric"]=="margin" else "revenue" if alert["metric"]=="revenue" else "units")
    return alert


def simulate(conn,info,request):
    if request.type == "marketing":
        values = scenario.marketing_scenario(conn,info,request)
    else:
        f = forecast(conn,info,ForecastRequest(target="demand",product=request.parameters.product,horizon=request.horizon))
        values = (scenario.price_scenario(conn,info,request,f) if request.type == "price" else
                  scenario.inventory_scenario(conn,request,f))
    result = scenario.compare(request.type,request.objective,*values)
    result["evidence"]["parameters"] = request.model_dump(mode="json")
    if request.type != "marketing":
        result["evidence"]["model_version"] = f["model_version"]
        result["evidence"]["forecast_metrics"] = f["metrics"]
        result["assumptions"].extend(f["warnings"])
    result["assumptions"].append("Scenario estimates are conditional, not verified causal effects. Validate with a controlled trial before acting.")
    if request.type == "marketing":
        replay = model_quality(info)["scenario_replay"]
        score = (replay or {}).get("marketing_replay", {})
        baseline, simulated = score.get("baseline", {}).get("wape"), score.get("scenario", {}).get("wape")
        if baseline is not None and simulated is not None and simulated > baseline:
            result["assumptions"].append(f"Historical marketing replay underperformed its baseline (WAPE {simulated:.1%} versus {baseline:.1%}). Treat this as exploratory sensitivity analysis.")
    return result


def recommendations(conn,info):
    end = date.fromisoformat(info["end"])
    start = max(end.replace(day=1),date.fromisoformat(info["start"]))
    candidates = alerts(conn,info,start,end)
    result = []
    stock = next((r for r in candidates if r["metric"]=="stockout_risk" and r["end"]==str(end)),None)
    if stock:
        projection = None
        if artifact(info):
            projection = simulate(conn,info,InventoryRequest(type="inventory",parameters=InventoryParams(product=stock["product_id"])))
        selected = projection["recommended"] if projection else None
        before = projection["baseline"] if projection else None
        result.append(dict(id=f"inventory:{stock['product_id']}",title=f"Review replenishment for {stock['scope']}",
            context="Current stock is below estimated lead-time sales.",action=(
                f"Review {selected['name'].lower()} and verify receipt timing." if selected else stock["action"]),
            expected_impact=({"estimated_units_recovered": round(before["risk"]-selected["risk"],2),
                              "purchase_commitment": selected["purchase_commitment"]} if selected else None),
            assumptions=projection["assumptions"] if projection else ["Uses trailing sales and catalog lead time."],
            risk="Observed sales can be constrained by stock, and late receipts may leave unmet demand.",
            uncertainty="Scenario estimate from forecast and assumed receipt dates." if selected else "Insufficient evidence",
            priority=stock["severity"],score=stock["score"],evidence={"alert":stock,"source":["inventory_daily","sales_transactions"]}))
    market = next((r for r in candidates if r["metric"]=="facebook_roas"),None)
    if market:
        projection = simulate(conn,info,MarketingRequest(type="marketing",objective="profit",
            parameters=MarketingParams(channel="Facebook Ads")))
        choice = projection["recommended"]
        result.append(dict(id="marketing:facebook",title="Review Facebook Ads allocation",
            context="Attributed return is below the recent baseline.",
            action=f"Evaluate {choice['name'].lower()} in a controlled trial with a conversion holdout.",
            expected_impact={"contribution_profit_delta_vnd":choice["profit_delta"],"attributed_revenue_delta_vnd":choice["revenue_delta"]},
            assumptions=projection["assumptions"],risk="Attribution can overstate incremental revenue.",
            uncertainty="Conditional estimate under the selected response exponent.",
            priority=market["severity"],score=market["score"],evidence={"alert":market,"scenario":projection["evidence"]}))
    prior = previous_period(start,end,True)
    if prior[0] >= date.fromisoformat(info["start"]):
        analysis = root_cause.decompose(conn,(start,end),prior,{})
        if analysis["delta"] < 0:
            driver = min(analysis["contributions"]["product"],key=lambda row:row["delta"])
            result.append(dict(id="sales:decline",title="Investigate the largest product contribution",
                context="Recorded revenue declined compared with the prior calendar period.",
                action=f"Review stock, realized prices and traffic for {driver['name']} before changing pricing.",
                expected_impact=None,assumptions=["Contribution is computed separately for each dimension."],
                risk="Changing price without testing can reduce margin.",uncertainty="Insufficient evidence for an incremental impact estimate.",
                priority="high",score=65,evidence={"driver":driver,"revenue_delta":analysis["delta"],
                                                   "current":analysis["current"],"prior":analysis["prior"],"source":["sales_transactions","products"]}))
    quality = {row["metric"]: row for row in model_quality(info)["anomaly"]}
    for row in result:
        metric = row["evidence"].get("alert", {}).get("metric")
        measured = quality.get(metric)
        if measured and measured["status"] != "evaluated":
            row["assumptions"].append("The underlying alert has limited or unverified historical detection performance. Independently verify the source data before acting.")
            row["uncertainty"] += " Underlying alert performance is limited or unverified."
    return sorted(result,key=lambda row:(-row["score"],row["id"]))
