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


def predict(model, scale, history, start, steps, holidays=None):
    if history.shape[1] < LOOKBACK:
        raise ValueError("At least 28 observed days are required.")
    window = np.asarray(history[:, -LOOKBACK:], dtype=float)
    predictions = {name: [] for name in MODELS}
    for lead in range(steps):
        predictions["seasonal_naive"].append(history[:, -7+lead%7])
        predictions["moving_average"].append(history[:, -14:].mean(axis=1))
        day = start+timedelta(days=lead)
        x = lag_features(window, day, scale, (holidays or {}).get(day))
        point = np.maximum(0, model.booster_.predict(x, num_threads=1)*scale)
        predictions["lightgbm"].append(point)
        window = np.column_stack((window[:,1:],point))
    return {name: np.asarray(rows).T for name,rows in predictions.items()}


def evaluate_origins(matrix, dates, model, scale, start, stop, horizon, holidays=None):
    stride = 7 if horizon == 7 else 14
    origins = list(range(start,stop-horizon+1,stride))
    if origins and origins[-1] != stop-horizon:
        origins.append(stop-horizon)
    if not origins:
        raise ValueError("Validation and test must each include at least 30 days. Use at least 201 historical days.")
    ys = np.stack([matrix[:,o:o+horizon] for o in origins],axis=1)
    predicted = [predict(model,scale,matrix[:,:o],dates[o],horizon,holidays) for o in origins]
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
            independent = validation_end-train_end >= 2*horizon
            selection_end = (train_end+validation_end)//2 if independent else validation_end
            val_y,val_p,_ = evaluate_origins(matrix,dates,model,scale,train_end,selection_end,horizon,holidays)
            cal_y,cal_p,cal_origins = evaluate_origins(matrix,dates,model,scale,
                selection_end if independent else train_end,validation_end,horizon,holidays)
            test_y,test_p,origins = evaluate_origins(matrix,dates,model,scale,validation_end,len(dates),horizon,holidays)
            for j,label in enumerate(labels):
                v = {name:metrics(val_y[j],data[j]) for name,data in val_p.items()}
                t = {name:metrics(test_y[j],data[j]) for name,data in test_p.items()}
                baseline = min(MODELS[:2],key=lambda name:v[name]["mae"])
                chosen = "lightgbm" if v["lightgbm"]["mae"] < .98*v[baseline]["mae"] else baseline
                residuals = np.abs(cal_y[j]-cal_p[chosen][j])
                radii = [(7,calibrate(residuals[:,:7]))]
                if horizon == 30:
                    radii.append((30,calibrate(residuals[:,7:])))
                width = np.array([next(r for cutoff,r in radii if step <= cutoff) for step in range(1,horizon+1)])
                coverage = float((np.abs(test_y[j]-test_p[chosen][j]) <= width).mean())
                report = dict(target=target,scope=label,horizon=horizon,selected=chosen,validation=v,test=t,
                              nominal_coverage=NOMINAL, test_coverage=coverage, validation_residual_count=int(residuals.size),
                              test_origins=len(origins), calibration_independent=independent,
                              calibration_origins=len(cal_origins),
                              selection_range=[str(dates[train_end]),str(dates[selection_end-1])],
                              calibration_range=[str(dates[selection_end if independent else train_end]),str(dates[validation_end-1])])
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


def train_adaptive_forecasts(dates, labels, matrices, holidays):
    """Train full LGBM pipeline on >=201d datasets, or honest causal statistical baseline on shorter uploaded datasets."""
    if len(dates) >= 201:
        return train_forecasts(dates, labels, matrices, holidays)
    if len(dates) < 7:
        raise ValueError("At least 7 historical calendar days are required for forecasting.")

    bundle, evaluation, examples = {}, [], {}
    val_len = max(2, min(30, len(dates) // 3))
    val_start = len(dates) - val_len
    for target, matrix in matrices.items():
        series = {}
        for j, label in enumerate(labels):
            vec = matrix[j]
            for horizon in HORIZONS:
                step_origins = list(range(max(7, val_start - horizon), len(dates) - min(horizon, val_len) + 1, max(1, min(7, val_len // 2))))
                if not step_origins:
                    step_origins = [max(3, len(dates) - max(2, len(dates) // 3))]
                eff_h = min(horizon, max(1, len(dates) - step_origins[-1]))
                preds_sn, preds_ma, actuals = [], [], []
                for o in step_origins:
                    hist = vec[:o]
                    if len(hist) < 2:
                        continue
                    sn_row = np.array([hist[-7 + (k % 7)] if len(hist) >= 7 else hist.mean() for k in range(eff_h)])
                    win = min(14, len(hist))
                    ma_row = np.full(eff_h, float(hist[-win:].mean()))
                    preds_sn.append(sn_row)
                    preds_ma.append(ma_row)
                    actuals.append(vec[o:o + eff_h])
                if actuals:
                    y_arr = np.asarray(actuals)
                    sn_arr = np.asarray(preds_sn)
                    ma_arr = np.asarray(preds_ma)
                    m_sn = metrics(y_arr, sn_arr)
                    m_ma = metrics(y_arr, ma_arr)
                    chosen = "seasonal_naive" if (len(dates) >= 14 and m_sn["mae"] <= m_ma["mae"]) else "moving_average"
                    chosen_arr = sn_arr if chosen == "seasonal_naive" else ma_arr
                    res = np.abs(y_arr - chosen_arr)
                    rad = float(calibrate(res))
                    cov = float((res <= rad).mean())
                    val_scores = {"seasonal_naive": m_sn, "moving_average": m_ma}
                else:
                    chosen = "moving_average"
                    rad = float(np.std(vec) * 1.64) if len(vec) else 0.0
                    cov = 0.0
                    m_empty = dict(mae=0.0, rmse=0.0, wape=None, mape=None, bias=0.0, observations=0)
                    val_scores = {"seasonal_naive": m_empty, "moving_average": m_empty}
                radii = [(horizon, rad)]
                report = dict(
                    target=target,
                    scope=label,
                    horizon=horizon,
                    selected=chosen,
                    validation=val_scores,
                    test=val_scores,
                    nominal_coverage=NOMINAL,
                    test_coverage=cov,
                    validation_residual_count=max(1, len(actuals) * eff_h),
                    test_origins=max(1, len(actuals)),
                    calibration_independent=False,
                    calibration_origins=max(1, len(actuals)),
                    short_window_fallback=True,
                    selection_range=[str(dates[0]), str(dates[-1])],
                    calibration_range=[str(dates[val_start]), str(dates[-1])],
                )
                series[(label, horizon)] = {"selected": chosen, "radii": radii, "report": report}
                evaluation.append(report)
        bundle[target] = dict(model=None, scales={label: 1.0 for label in labels}, series=series, drivers=[])
    split = dict(
        train=[str(dates[0]), str(dates[max(0, val_start - 1)])],
        validation=[str(dates[val_start]), str(dates[-1])],
        test=[str(dates[val_start]), str(dates[-1])],
    )
    return bundle, evaluation, split, examples


def serve_forecast(bundle, target, scope, horizon, values, dates):
    info = bundle[target]
    entry = info["series"].get((scope,horizon))
    if not entry:
        raise ValueError("This scope and horizon are unavailable in the trained artifact.")
    start = dates[-1]+timedelta(days=1)
    model_name = entry["selected"]
    arr = np.asarray(values, dtype=float)
    if info["model"] is None or model_name != "lightgbm" and len(arr) < LOOKBACK:
        win = min(14, len(arr))
        if model_name == "seasonal_naive" and len(arr) >= 7:
            rows = np.array([arr[-7 + (lead % 7)] for lead in range(horizon)], dtype=float)
        else:
            rows = np.full(horizon, float(arr[-win:].mean()) if win else 0.0, dtype=float)
    else:
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
