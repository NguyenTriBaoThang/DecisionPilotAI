"""Causal recursive forecasts with rolling-origin baseline comparisons and calibrated bands."""
import math
from datetime import timedelta

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

from ai_service.features import FEATURES, lag_features

MODELS = ("seasonal_naive","moving_average","lightgbm")
TARGETS = ("revenue","orders","demand")
HORIZONS = (7,30)
LOOKBACK = 28
NOMINAL = .90


def metrics(actual, predicted):
    actual, predicted = np.asarray(actual), np.asarray(predicted)
    error = predicted-actual
    nonzero = actual != 0
    total = np.abs(actual).sum()
    return dict(mae=float(np.abs(error).mean()), rmse=float(np.sqrt(np.square(error).mean())),
                wape=float(np.abs(error).sum()/total) if total else None,
                mape=float(np.abs(error[nonzero]/actual[nonzero]).mean()) if nonzero.any() else None,
                bias=float(error.mean()), observations=int(error.size))


def predict(model, scale, history, start, steps):
    if history.shape[1] < LOOKBACK:
        raise ValueError("At least 28 observed days are required.")
    window = np.asarray(history[:, -LOOKBACK:], dtype=float)
    predictions = {name: [] for name in MODELS}
    for lead in range(steps):
        predictions["seasonal_naive"].append(history[:, -7+lead%7])
        predictions["moving_average"].append(history[:, -14:].mean(axis=1))
        x = lag_features(window, start+timedelta(days=lead), scale)
        point = np.maximum(0, model.booster_.predict(x, num_threads=1)*scale)
        predictions["lightgbm"].append(point)
        window = np.column_stack((window[:,1:],point))
    return {name: np.asarray(rows).T for name,rows in predictions.items()}


def evaluate_origins(matrix, dates, model, scale, start, stop, horizon):
    stride = 7 if horizon == 7 else 14
    origins = list(range(start,stop-horizon+1,stride))
    if origins and origins[-1] != stop-horizon:
        origins.append(stop-horizon)
    if not origins:
        raise ValueError("Validation and test must each include at least 30 days. Use at least 201 historical days.")
    ys = np.stack([matrix[:,o:o+horizon] for o in origins],axis=1)
    predicted = [predict(model,scale,matrix[:,:o],dates[o],horizon) for o in origins]
    return ys, {name: np.stack([p[name] for p in predicted], axis=1) for name in MODELS}, origins


def calibrate(residuals):
    samples = np.sort(residuals.ravel())
    rank = min(len(samples), math.ceil((len(samples)+1)*NOMINAL))
    return float(samples[rank-1])


def train_forecasts(dates, labels, matrices, holidays):
    train_end, validation_end = int(len(dates)*.70), int(len(dates)*.85)
    bundle, evaluation, examples = {}, [], {}
    for target,matrix in matrices.items():
        scale = np.maximum(matrix[:,:train_end].mean(axis=1),1)
        positions = range(LOOKBACK,train_end)
        x = np.concatenate([lag_features(matrix[:,i-LOOKBACK:i],dates[i],scale,holidays.get(dates[i])) for i in positions])
        y = (matrix[:,LOOKBACK:train_end]/scale[:,None]).T.ravel()
        model = LGBMRegressor(n_estimators=125, learning_rate=.045, num_leaves=23, min_child_samples=28,
                              random_state=42, verbosity=-1, n_jobs=2)
        model.fit(pd.DataFrame(x,columns=list(FEATURES)), y)
        drivers = sorted(zip(FEATURES, map(int,model.booster_.feature_importance("gain"))),
                         key=lambda entry: -entry[1])[:6]
        series = {}
        for horizon in HORIZONS:
            val_y,val_p,_ = evaluate_origins(matrix,dates,model,scale,train_end,validation_end,horizon)
            test_y,test_p,origins = evaluate_origins(matrix,dates,model,scale,validation_end,len(dates),horizon)
            for j,label in enumerate(labels):
                v = {name:metrics(val_y[j],data[j]) for name,data in val_p.items()}
                t = {name:metrics(test_y[j],data[j]) for name,data in test_p.items()}
                baseline = min(MODELS[:2],key=lambda name:v[name]["mae"])
                chosen = "lightgbm" if v["lightgbm"]["mae"] < .98*v[baseline]["mae"] else baseline
                residuals = np.abs(val_y[j]-val_p[chosen][j])
                radii = [(7,calibrate(residuals[:,:7]))]
                if horizon == 30:
                    radii.append((30,calibrate(residuals[:,7:])))
                width = np.array([next(r for cutoff,r in radii if step <= cutoff) for step in range(1,horizon+1)])
                coverage = float((np.abs(test_y[j]-test_p[chosen][j]) <= width).mean())
                report = dict(target=target,scope=label,horizon=horizon,selected=chosen,validation=v,test=t,
                              nominal_coverage=NOMINAL, test_coverage=coverage, validation_residual_count=int(residuals.size),
                              test_origins=len(origins))
                series[(label,horizon)] = {"selected":chosen,"radii":radii,"report":report}
                evaluation.append(report)
                if horizon == 30 and label in {"all","sku:P001"}:
                    examples[(target,label)] = dict(dates=dates[origins[-1]:origins[-1]+horizon],actual=test_y[j,-1],
                                                       predicted=test_p[chosen][j,-1],report=report)
        bundle[target] = dict(model=model,scales=dict(zip(labels,map(float,scale))),series=series,drivers=drivers)
    split = dict(train=[str(dates[0]),str(dates[train_end-1])],
                 validation=[str(dates[train_end]),str(dates[validation_end-1])],
                 test=[str(dates[validation_end]),str(dates[-1])])
    return bundle,evaluation,split,examples


def serve_forecast(bundle, target, scope, horizon, values, dates):
    info = bundle[target]
    entry = info["series"].get((scope,horizon))
    if not entry:
        raise ValueError("This scope and horizon are unavailable in the trained artifact.")
    start = dates[-1]+timedelta(days=1)
    model_name = entry["selected"]
    rows = predict(info["model"],np.array([info["scales"][scope]]),np.array([values]),start,horizon)[model_name][0]
    prediction = []
    for step,point in enumerate(rows,1):
        radius = next(r for cutoff,r in entry["radii"] if step <= cutoff)
        prediction.append(dict(date=str(start+timedelta(days=step-1)), value=float(point),
                               lower=max(0,float(point-radius)), upper=float(point+radius)))
    drivers = (dict(info["drivers"]) if model_name == "lightgbm" else
               {"method":"Repeats the last seven days" if model_name == "seasonal_naive" else "Mean of the last 14 days"})
    return dict(prediction=prediction,history=[dict(date=str(d),value=float(v)) for d,v in zip(dates[-45:],values[-45:])],
                metrics=entry["report"],drivers=drivers,
                interval_method="90% nominal empirical absolute-error bands, calibrated on validation by lead bucket. See observed test coverage; shifts and overlapping origins limit calibration.")
