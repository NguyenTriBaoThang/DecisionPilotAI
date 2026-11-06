"""Produce reproducible charts, forecast summaries and retrospective scenario checks."""
import argparse
import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import sqlalchemy as sa

from ai_service.anomaly import detect, event_labels
from ai_service.features import anomaly_frame, observed_series
from ai_service.forecasting import metrics, predict
from ai_service.scenario import budget_response,demand_at_price
from backend.app.analytics import dataset_info
from backend.app.db import ARTIFACTS, inventory, make_engine, marketing, products, read_connection, sales

COLORS = ["#3959E7","#0D8C82","#C46F30"]


def scenario_backtest(conn, info, dates, labels, matrices, bundle):
    """Conditional replay using later observed inputs. No incremental outcome claims."""
    first_test = int(len(dates)*.85)
    sales_rows = pd.read_sql(sa.select(sales.c.date,sales.c.revenue,sales.c.quantity).where(sales.c.product_id=="P001"),conn)
    sales_rows.date = pd.to_datetime(sales_rows.date)
    days = pd.to_datetime(dates)
    sku = matrices["demand"][labels.index("sku:P001")]
    df = sales_rows.groupby("date")[["revenue","quantity"]].sum().reindex(days,fill_value=0)
    product = conn.execute(sa.select(products).where(products.c.product_id=="P001")).mappings().one()
    c = marketing.c
    market = pd.read_sql(sa.select(c.date,sa.func.sum(c.spend).label("spend"),
        sa.func.sum(c.attributed_revenue).label("revenue")).where(c.channel=="Facebook Ads").group_by(c.date),conn)
    market.date = pd.to_datetime(market.date)
    market = market.set_index("date").reindex(days).fillna(0)
    stock = pd.read_sql(sa.select(inventory).where(inventory.c.product_id=="P003").order_by(inventory.c.date),conn)
    actual_price,base_price,scenario_price = [],[],[]
    actual_market,base_market,scenario_market = [],[],[]
    actual_stock,projected_stock = [],[]
    demand_model = bundle["forecast"]["demand"]
    model_name = demand_model["series"][("sku:P001",7)]["selected"]
    stock_model = demand_model["series"][("sku:P003",7)]["selected"]
    stock_series = matrices["demand"][labels.index("sku:P003")]
    for i in range(first_test,len(dates)-6,7):
        past,week = df.iloc[i-28:i].sum(),df.iloc[i:i+7].sum()
        forecast = predict(demand_model["model"],np.array([demand_model["scales"]["sku:P001"]]),
                           sku[None,:i],dates[i],7)[model_name][0]
        if week.quantity and past.quantity and past.revenue:
            price_before,price_now = past.revenue/past.quantity,week.revenue/week.quantity
            actual_price.append(float(week.quantity))
            base_price.append(float(forecast.sum()))
            scenario_price.append(float(demand_at_price(forecast.sum(),price_before,price_now,product["elasticity"])))
        last,now = market.iloc[i-28:i].sum(),market.iloc[i:i+7].sum()
        if last.spend:
            actual_market.append(float(now.revenue))
            base_market.append(float(last.revenue/4))
            scenario_market.append(float(last.revenue/4*budget_response(now.spend/(last.spend/4),.65)))
        stock_forecast = predict(demand_model["model"],np.array([demand_model["scales"]["sku:P003"]]),
                                 stock_series[None,:i],dates[i],7)[stock_model][0]
        ledger = stock.iloc[i:i+7]
        balance = float(ledger.iloc[0].opening_stock)
        depletes = False
        for amount,received in zip(stock_forecast,ledger.received_qty):
            balance = max(0,balance+received-amount)
            depletes |= balance <= 0
        actual_stock.append(bool((ledger.closing_stock==0).any()))
        projected_stock.append(bool(depletes))
    return {
        "price_replay":dict(baseline=metrics(actual_price,base_price),scenario=metrics(actual_price,scenario_price),
                            target="weekly observed P001 units",model=model_name),
        "marketing_replay":dict(baseline=metrics(actual_market,base_market),scenario=metrics(actual_market,scenario_market),
                                target="weekly Facebook Ads attributed revenue"),
        "inventory_replay":dict(target="P003 closing stock depletion",weeks=len(actual_stock),observed_depletion_weeks=sum(actual_stock),
                                predicted_depletion_weeks=sum(projected_stock),
                                matches=sum(a==b for a,b in zip(actual_stock,projected_stock))),
        "limitations":"Holdout seven-day conditional replay. Uses realized weekly prices, budgets and receipts as inputs. "
                      "Interventions were not randomized. Inventory accuracy is uninformative when few weeks deplete.",
        "dataset_id":info["dataset_id"],
    }


def make_charts(out, dates, matrices, frame, bundle, example, scenario, info):
    plots = out/"figures"
    plots.mkdir(parents=True,exist_ok=True)
    plt.rcParams.update({"figure.dpi":150,"axes.spines.top":False,"axes.spines.right":False,
                         "axes.titleweight":"bold","font.size":9,"grid.alpha":.22})

    def finish(name,title,ylabel):
        plt.title(title,loc="left")
        plt.ylabel(ylabel)
        plt.grid(axis="y")
        plt.tight_layout()
        plt.savefig(plots/f"{name}.png",bbox_inches="tight")
        plt.close()

    plt.figure(figsize=(7,3.3))
    plt.hist(frame.revenue/1e6,bins=32,color=COLORS[0])
    finish("01_revenue_distribution","Distribution of daily revenue","Days · X-axis in million VND")
    plt.figure(figsize=(8,3.4))
    plt.plot(frame.index,frame.revenue/1e6,color=COLORS[0],alpha=.35,label="Daily")
    plt.plot(frame.index,frame.revenue.rolling(28).mean()/1e6,color=COLORS[1],label="28-day average")
    plt.legend(frameon=False)
    finish("02_sales_trend","Daily revenue and rolling trend","Million VND")
    plt.figure(figsize=(8,3.3))
    plt.plot(dates,matrices["demand"][1],color=COLORS[0],alpha=.5)
    finish("03_product_demand","SmartDesk Mini observed units","Units sold")
    plt.figure(figsize=(7,3.3))
    weekday = frame.groupby(frame.index.dayofweek).revenue.mean()
    plt.bar(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],weekday/1e6,color=COLORS[0])
    finish("04_seasonality","Mean revenue by day of week","Million VND")
    plt.figure(figsize=(8,3.5))
    tested = detect("revenue",frame.revenue,bundle["anomaly"]["revenue"]).loc[bundle["report"]["split"]["test"][0]:]
    flags = tested.loc[tested.flag]
    injected = event_labels(tested.index,info["injected_events"],"revenue")
    plt.plot(tested.index,tested.actual/1e6,color=COLORS[0],label="Observed")
    plt.plot(tested.index,tested.baseline/1e6,color=COLORS[1],label="Historical baseline")
    plt.scatter(flags.index,flags.actual/1e6,color=COLORS[2],s=12,label="Detector flag",zorder=3)
    plt.fill_between(tested.index,0,1,where=injected.to_numpy(),transform=plt.gca().get_xaxis_transform(),
                     color=COLORS[2],alpha=.10,label="Injected period")
    plt.legend(ncol=2,frameon=False)
    finish("05_anomaly_detection","Revenue anomaly holdout results","Million VND")
    plt.figure(figsize=(7,3.3))
    scores = example["report"]["test"]
    plt.bar([m.replace("_"," ") for m in scores],[100*m["wape"] for m in scores.values()],color=COLORS)
    finish("06_forecast_comparison","Business revenue model comparison · 30 days","Holdout WAPE (%)")
    plt.figure(figsize=(8,3.5))
    plt.plot(example["dates"],example["actual"]/1e6,label="Observed",color=COLORS[0])
    plt.plot(example["dates"],example["predicted"]/1e6,label="Forecast",color=COLORS[1])
    plt.legend(frameon=False)
    finish("07_actual_vs_forecast","Latest held-out 30-day origin · business revenue","Million VND")
    plt.figure(figsize=(8,3.3))
    plt.bar(example["dates"],(example["predicted"]-example["actual"])/1e6,color=COLORS[0])
    plt.axhline(0,color="#444",linewidth=.8)
    finish("08_forecast_residuals","Revenue forecast residuals · prediction minus actual","Million VND")
    plt.figure(figsize=(7,3.4))
    drivers = list(reversed(bundle["forecast"]["revenue"]["drivers"]))
    plt.barh([name for name,_ in drivers],[gain for _,gain in drivers],color=COLORS[1])
    plt.xlabel("Split gain")
    finish("09_feature_importance","LightGBM global feature importance · revenue","Feature")
    plt.figure(figsize=(7,3.3))
    for item,color in zip(scenario["sensitivity"][:3],COLORS):
        points = item["alternatives"]
        plt.plot([p["elasticity"] for p in points],[p["result"]["profit"]/1e6 for p in points],
                 marker="o",label=item["name"],color=color)
    plt.legend(frameon=False)
    plt.xlabel("Assumed elasticity")
    finish("10_scenario_sensitivity","SmartDesk Mini contribution profit under price assumptions","Million VND")


def write_summary(out, report, replay, info):
    selection = [r for r in report["forecast"] if r["horizon"]==30 and
                 (r["scope"]=="all" or r["scope"]=="sku:P001" and r["target"]=="demand")]
    md = ["# DecisionPilot AI model evaluation","",
          f"Dataset `{info['dataset_id']}` · synthetic retail and services · model bundle `{report['version']}`","",
          "## Chronological split",""]
    md += [f"- {name.capitalize()} {bounds[0]} to {bounds[1]}" for name,bounds in report["split"].items()]
    md += ["","## Selected 30-day forecasts","","| Target | Scope | Selected model | Test MAE | Test WAPE | Test interval coverage |",
           "|---|---|---|---:|---:|---:|"]
    for row in selection:
        test = row["test"][row["selected"]]
        md.append(f"| {row['target']} | {row['scope']} | {row['selected']} | {test['mae']:,.2f} | {test['wape']:.2%} | {row['test_coverage']:.2%} |")
    md += ["","LightGBM is selected per target, scope and horizon only when validation MAE beats the better baseline by more than 2%. "
           "Reported test outcomes can favor a different model. Bands have 90% nominal coverage. "
           "Selection and interval calibration use separate chronological validation segments when enough history exists; "
           "per-series reports disclose the actual ranges and independence status. "
           "Point errors and interval coverage can degrade on abrupt shifts, and rolling test origins overlap.",
           "","## Labeled anomaly test","","| Signal | Method | Precision | Recall | F1 | False-positive rate |","|---|---|---:|---:|---:|---:|"]
    for name in ("revenue","margin","facebook_spend","facebook_roas","facebook_conversion","stockout_risk"):
        methods = report["anomaly"][name]
        method = "hybrid" if "hybrid" in methods else "business_rule"
        score = methods[method]
        md.append(f"| {name} | {method} | {score['precision']:.2%} | {score['recall']:.2%} | {score['f1']:.2%} | {score['false_positive_rate']:.2%} |")
    md += ["","Injection labels identify periods where generator rules changed. A flagged day outside those labels may still be a real deviation in synthetic history. "
           "Signals with no positive labels are provided in JSON and cannot establish recall performance.","",
           "## Conditional scenario replay","",
           "| Replay target | Baseline WAPE | Scenario WAPE |","|---|---:|---:|"]
    for name in ("price_replay","marketing_replay"):
        row = replay[name]
        md.append(f"| {row['target']} | {row['baseline']['wape']:.2%} | {row['scenario']['wape']:.2%} |")
    md += ["",replay["limitations"],"","See evaluation.json, forecast_metrics.csv, scenario_backtest.json and figures/ for evidence."]
    (out/"MODEL_EVALUATION.md").write_text("\n".join(md)+"\n",encoding="utf-8")


def build(out):
    from backend.app.services import simulate
    from backend.app.schemas import PriceParams, PriceRequest
    with read_connection(make_engine()) as conn:
        info = dataset_info(conn)
        bundle = joblib.load(out/f"{info['dataset_id']}.joblib")
        dates,labels,matrices,_ = observed_series(conn,info)
        frame = anomaly_frame(conn,info)
        replay = scenario_backtest(conn,info,dates,labels,matrices,bundle)
        scenario = simulate(conn,info,PriceRequest(type="price",parameters=PriceParams(product="P001")))
    report = bundle["report"]
    revenue = bundle["forecast"]["revenue"]
    forecast_report = revenue["series"][("all",30)]["report"]
    example = dict(dates=dates[-30:],actual=matrices["revenue"][0,-30:],
                   predicted=predict(revenue["model"],np.array([revenue["scales"]["all"]]),
                       matrices["revenue"][:1,:-30],dates[-30],30)[forecast_report["selected"]][0],report=forecast_report)
    flat = [dict(target=r["target"],scope=r["scope"],horizon=r["horizon"],selected=r["selected"],model=model,
                 split=split,coverage=r["test_coverage"] if split=="test" and r["selected"]==model else None,**values)
            for r in report["forecast"] for split in ("validation","test") for model,values in r[split].items()]
    pd.DataFrame(flat).to_csv(out/"forecast_metrics.csv",index=False)
    (out/"scenario_backtest.json").write_text(json.dumps(replay,indent=2)+"\n",encoding="utf-8")
    write_summary(out,report,replay,info)
    make_charts(out,dates,matrices,frame,bundle,example,scenario,info)
    print(f"Wrote evaluation summary and figures in {out}")


if __name__=="__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out",type=Path,default=ARTIFACTS)
    build(parser.parse_args().out)
