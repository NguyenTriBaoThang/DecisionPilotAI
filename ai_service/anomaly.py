"""Date-local statistical flags, a learned detector, and physical stock checks."""
from datetime import timedelta

import numpy as np
import pandas as pd
import sqlalchemy as sa
from sklearn.ensemble import IsolationForest
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support

from backend.app.db import inventory, products

DIRECTIONS = {
    "revenue": "low", "margin": "low", "units": "both", "facebook_spend": "high",
    "facebook_roas": "low", "facebook_conversion": "low", "marketing_spend": "high",
    "marketing_roas": "low", "marketing_conversion": "low",
}
ACTIONS = {
    "revenue": "Review product, region and customer contributions before changing offers.",
    "margin": "Review realized price and direct cost by product before extending discounts.",
    "units": "Check sales mix, promotions and stock availability before adjusting orders.",
    "spend": "Review delivery and attributed order volume before reallocating budget.",
    "roas": "Compare spend with attributed revenue and validate attribution by channel.",
    "conversion": "Review lead quality and order attribution in the affected channel.",
    "stockout_risk": "Review incoming stock and compare reorder quantities in Scenario Simulator.",
}


def signals(values, metric):
    # The seven-day exclusion reduces contamination from an ongoing event.
    recent = values.shift(7).rolling(56,min_periods=28)
    median = recent.median()
    q1,q3 = recent.quantile(.25),recent.quantile(.75)
    floor = median.abs()*.03 + 1e-8
    spread = (q3-q1).clip(lower=floor)
    delta = values-median
    robust = delta / (spread/1.349)
    z = (values-recent.mean())/recent.std().clip(lower=floor)
    relative = delta / median.abs().replace(0,np.nan)
    lower,upper = values < q1-1.5*spread,values > q3+1.5*spread
    direction = DIRECTIONS[metric]
    mask = (delta < 0 if direction == "low" else delta > 0 if direction == "high" else delta.notna())
    return pd.DataFrame(dict(actual=values,baseline=median,robust=robust,z=z,relative=relative,
                             iqr=(lower if direction=="low" else upper if direction=="high" else lower|upper),
                             direction=mask))


def detect(metric, series, model):
    work = signals(series,metric)
    valid = work[["robust","z"]].dropna()
    scores = pd.Series(index=work.index, dtype=float)
    if model is not None and len(valid):
        scores.loc[valid.index] = model.decision_function(valid.to_numpy())
    if metric.endswith("roas") or metric.endswith("conversion"):
        min_deviation, threshold, ml_threshold = .35, 1.25, .90
    elif metric == "margin":
        min_deviation, threshold, ml_threshold = .09, 2.5, 1.85
    else:
        min_deviation, threshold, ml_threshold = .20, 2.5, 1.65
    work["isolation_score"] = scores
    work["flag"] = (work.direction & (work.relative.abs() >= min_deviation)
                    & ((work.robust.abs() >= threshold)
                       | ((scores < 0) & (work.robust.abs() >= ml_threshold))))
    # Daily noise can hide sustained contractions. Compare complete weeks only;
    # the reference ends before the monitored week and uses no future values.
    work["sustained_flag"] = False
    if metric == "revenue":
        weekly = series.rolling(7, min_periods=7).mean()
        reference = weekly.shift(7).rolling(56, min_periods=28)
        baseline = reference.median()
        spread = (reference.quantile(.75)-reference.quantile(.25)).clip(lower=baseline.abs()*.03+1e-8)/1.349
        work["sustained_flag"] = (weekly < baseline*.85) & ((baseline-weekly)/spread >= 2.5)
        work["flag"] |= work.sustained_flag
    return work


def classification(y, predicted):
    tn,fp,fn,tp = confusion_matrix(y,predicted,labels=[False,True]).ravel()
    precision,recall,f1,_ = precision_recall_fscore_support(y,predicted,average="binary",zero_division=0)
    return dict(precision=float(precision),recall=float(recall),f1=float(f1),
                false_positive_rate=float(fp/(fp+tn)) if fp+tn else None,
                tp=int(tp),fp=int(fp),fn=int(fn),tn=int(tn))


def event_labels(index, events, metric):
    labels = pd.Series(False,index=index)
    for event in events:
        if event["metric"] == metric:
            labels.loc[event["start"]:event["end"]] = True
    return labels


def fit_detectors(frame, manifest):
    train_end, test_start = int(len(frame)*.70), int(len(frame)*.85)
    models, report = {}, {}
    for metric in DIRECTIONS:
        stats = signals(frame[metric],metric)
        x = stats[["robust","z"]].iloc[:train_end].dropna().to_numpy()
        model = IsolationForest(n_estimators=120,contamination=.065,random_state=42,n_jobs=1).fit(x) if len(x) >= 28 else None
        models[metric] = model
        if manifest["kind"] == "synthetic":
            work = detect(metric,frame[metric],model).iloc[test_start:]
            labels = event_labels(work.index,manifest.get("injected_events", []),metric)
            report[metric] = {name:classification(labels, flags.fillna(False)) for name,flags in {
                "hybrid":work.flag, "z_score":work.direction & (work.z.abs() >= 3),
                "robust_z":work.direction & (work.robust.abs() >= 3),
                "iqr":work.direction & work.iqr}.items()}
    return models,report


def inventory_risk(conn, start, end):
    ledger, p = inventory.c, products.c
    start_read = start - timedelta(days=28)
    q = sa.select(inventory, p.product_name, p.lead_time_days).select_from(inventory.join(products)).where(
        ledger.date.between(start_read,end)).order_by(ledger.date)
    frame = pd.read_sql(q,conn)
    if frame.empty:
        return []
    frame["rate"] = frame.groupby("product_id").sold_qty.transform(lambda x: x.shift().rolling(28,min_periods=7).mean())
    frame["required"] = frame.rate * frame.lead_time_days
    flags = (frame.date >= start) & (frame.required > 0) & (frame.closing_stock < frame.required)
    return list(frame.loc[flags].itertuples(index=False))


def severity(relative, strength):
    score = min(100,round(54*min(abs(relative or 0),1) + 46*min(abs(strength)/5,1)))
    return score, ("critical" if score >= 77 else "high" if score >= 52 else "medium")


def alert_list(conn, frame, models, start, end):
    alerts = []
    for metric in DIRECTIONS:
        work = detect(metric,frame[metric],models.get(metric))
        flagged = work.loc[str(start):str(end)]
        flagged = flagged[flagged.flag]
        streaks = flagged.index.to_series().diff().dt.days.ne(1).cumsum()
        for _, batch in flagged.groupby(streaks):
            actual, baseline = float(batch.actual.mean()),float(batch.baseline.mean())
            relative = (actual-baseline)/abs(baseline) if baseline else None
            score,level = severity(relative,float(batch.robust.abs().max()))
            if metric.endswith("spend"):
                action = ACTIONS["spend"]
            elif metric.endswith("roas"):
                action = ACTIONS["roas"]
            elif metric.endswith("conversion"):
                action = ACTIONS["conversion"]
            else:
                action = ACTIONS[metric]
            history = work.loc[batch.index[0]-pd.Timedelta(days=7):batch.index[-1]]
            alerts.append(dict(id=f"{metric}:{batch.index[0].date()}", metric=metric, start=str(batch.index[0].date()),
                end=str(batch.index[-1].date()), actual=actual, baseline=baseline, deviation=relative, severity=level,
                score=score, action=action, scope="Facebook Ads" if metric.startswith("facebook_") else "Business-wide",
                evidence=dict(daily_points=len(batch), baseline_method="56-day trailing median with seven-day exclusion",
                    isolation_forest_signals=int((batch.isolation_score < 0).sum()),
                    sustained_week_signals=int(batch.sustained_flag.sum())),
                chart=[dict(date=str(index.date()),actual=float(row.actual),baseline=float(row.baseline) if pd.notna(row.baseline) else None)
                       for index,row in history.iterrows() if pd.notna(row.actual)]))
    latest = {}
    for row in inventory_risk(conn,start,end):
        latest[row.product_id] = row
    for pid,row in latest.items():
        relative = (row.closing_stock-row.required)/row.required
        score,level = severity(relative,4.5 if row.stockout_flag else 3.5)
        alerts.append(dict(id=f"stockout_risk:{pid}:{row.date}",metric="stockout_risk",start=str(row.date),
                           end=str(row.date),actual=row.closing_stock,baseline=row.required,deviation=relative,
                           severity=level,score=score,action=ACTIONS["stockout_risk"],scope=row.product_name,
                           product_id=pid, evidence=dict(lead_time_days=row.lead_time_days,
                               previous_28d_daily_sales=row.rate, close_stockout=row.stockout_flag),
                           chart=[dict(date=str(row.date), actual=row.closing_stock,baseline=row.required)]))
    return sorted(alerts,key=lambda row:(-row["score"],-int(row["end"].replace("-","")),row["id"]))
