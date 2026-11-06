"""Train, evaluate, and publish versioned DecisionPilot artifacts for one data snapshot."""
import argparse
import json
import os
from pathlib import Path
from uuid import uuid4

import joblib

from ai_service.anomaly import classification, event_labels, fit_detectors, inventory_risk
from ai_service.features import anomaly_frame, business_features, observed_series
from ai_service.forecasting import train_forecasts
from backend.app.analytics import dataset_info
from backend.app.db import ARTIFACTS, make_engine, read_connection

VERSION = "dp-1.1"


def train(engine, out, build_features=True):
    with read_connection(engine) as conn:
        manifest = dataset_info(conn)
        dates, labels, matrices, holidays = observed_series(conn,manifest)
        frame = anomaly_frame(conn,manifest)
        if build_features:
            feature_frames = business_features(conn,manifest)
        risk_dates = {str(row.date) for row in inventory_risk(conn, dates[int(len(dates)*.85)],dates[-1])
                      if row.product_id == "P001"}
    if len(dates) < 201:
        raise ValueError("At least 201 contiguous days are needed for 30-day validation and test.")
    forecast, forecasts, split, examples = train_forecasts(dates,labels,matrices,holidays)
    detectors, anomalies = fit_detectors(frame,manifest)
    if manifest["kind"] == "synthetic":
        test = frame.iloc[int(len(frame)*.85):]
        truth = event_labels(test.index,manifest["injected_events"],"stockout_risk")
        anomalies["stockout_risk"] = {"business_rule": classification(truth,[str(day.date()) in risk_dates for day in test.index])}
    report = dict(dataset_id=manifest["dataset_id"],version=VERSION,split=split,forecast=forecasts,anomaly=anomalies,
                  notes=["Validation-only choice requires LightGBM to beat the best baseline MAE by more than 2%.",
                         "Anomaly labels describe injected periods and were used solely for scoring.",
                         "Coverage is an empirical holdout result, subject to distribution shifts."])
    bundle = dict(dataset_id=manifest["dataset_id"],version=VERSION,forecast=forecast,anomaly=detectors,report=report)
    out = Path(out)
    out.mkdir(parents=True,exist_ok=True)
    temporary = out/f".{uuid4().hex}.joblib"
    joblib.dump(bundle,temporary,compress=3)
    os.replace(temporary,out/f"{manifest['dataset_id']}.joblib")
    (out/"evaluation.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    if build_features:
        for name, df in zip(("daily_features","customer_rfm","inventory_features"),feature_frames):
            df.to_csv(out/f"{name}.csv.gz",index=(name=="daily_features"),compression={"method":"gzip","mtime":0})
    return report,frame,examples


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--out",type=Path,default=ARTIFACTS)
    cli.add_argument("--skip-features",action="store_true")
    args = cli.parse_args()
    report,_,_ = train(make_engine(),args.out,not args.skip_features)
    print(json.dumps({"dataset_id":report["dataset_id"],"version":report["version"],"split":report["split"],
                      "evaluated_forecast_variants":len(report["forecast"])},indent=2))
