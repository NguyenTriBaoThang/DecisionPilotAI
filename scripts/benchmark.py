"""Measure the offline conversational route against an independent CSV reference."""
import argparse
import csv
import json
import math
import os
import time
from collections import defaultdict
from datetime import date,timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.db import ROOT
from backend.app.main import app

CHARTS = {"rank":"bar","trend":"line","explain":"bar","forecast":"line","marketing":"bar"}


class Reference:
    def __init__(self, directory):
        self.tables = {}
        for name in ("sales_transactions","products","customers","inventory_daily","marketing_campaigns"):
            with (directory/f"{name}.csv").open(encoding="utf-8") as stream:
                self.tables[name] = list(csv.DictReader(stream))
        self.sales = self.tables["sales_transactions"]
        self.products = {r["product_id"]:r for r in self.tables["products"]}
        self.first = {}
        for r in sorted(self.sales,key=lambda row:(row["date"],row["transaction_id"])):
            self.first.setdefault(r["customer_id"],r)
        self.metadata = json.loads((directory/"metadata.json").read_text(encoding="utf-8"))

    def dates(self, period, extras):
        latest = date.fromisoformat(self.metadata["end"])
        if period=="custom":
            return extras["start"],extras["end"]
        if period=="last_month":
            last = latest.replace(day=1)-timedelta(days=1)
            return str(last.replace(day=1)),str(last)
        if period=="all":
            start = self.metadata["start"]
        elif period=="this_month":
            start = str(latest.replace(day=1))
        else:
            start = str(latest-timedelta(days=int(period.split("_")[1])-1))
        return start,str(latest)

    def rows(self, start, end, filters):
        return [r for r in self.sales if start<=r["date"]<=end
                and ("region" not in filters or r["region"]==filters["region"])
                and ("product" not in filters or r["product_id"]==filters["product"])
                and ("category" not in filters or self.products[r["product_id"]]["category"]==filters["category"])
                and ("channel" not in filters or r["sales_channel"]==filters["channel"])]

    def kpi(self, rows, start, end, metric, filters):
        sums = {k:sum(int(r[k]) for r in rows) for k in ("revenue","gross_profit","quantity")}
        distinct = {r["customer_id"] for r in rows}
        new = sum(self.first[c]["date"]>=start for c in distinct)
        values = {**sums,"orders":len(rows),"customers":len(distinct),"units":sums["quantity"],
                  "new_customers":new,"returning_customers":len(distinct)-new,
                  "aov":sums["revenue"]/len(rows) if rows else None,
                  "margin":sums["gross_profit"]/sums["revenue"] if sums["revenue"] else None}
        if metric=="inventory_availability":
            ledger = [r for r in self.tables["inventory_daily"] if start<=r["date"]<=end
                      and ("product" not in filters or r["product_id"]==filters["product"])
                      and ("category" not in filters or self.products[r["product_id"]]["category"]==filters["category"])]
            return sum(int(r["closing_stock"])>0 for r in ledger)/len(ledger) if ledger else None
        return values[metric]

    def campaign(self, start, end, channel):
        campaigns = [r for r in self.tables["marketing_campaigns"] if start<=r["date"]<=end
                     and (not channel or channel==r["channel"])]
        values = {k:sum(int(r[k]) for r in campaigns) for k in ("spend","orders","leads","attributed_revenue")}
        keys = {(r["campaign_id"],r["date"]) for r in campaigns}
        acquisitions = sum((r["campaign_id"],r["date"]) in keys for r in self.first.values())
        return {**values,"roas":values["attributed_revenue"]/values["spend"] if values["spend"] else None,
                "conversion":values["orders"]/values["leads"] if values["leads"] else None,
                "cac":values["spend"]/acquisitions if acquisitions else None}


def same(actual,expected):
    return math.isclose(actual,expected,rel_tol=1e-10,abs_tol=1e-9) if isinstance(actual,(int,float)) and isinstance(expected,(int,float)) else actual==expected


def numeric_check(reference,result, action,metric,period,extras,dimension,ascending):
    if action=="unsupported":
        return result["evidence"]=={}
    start,end = reference.dates(period,extras)
    data = result["evidence"]
    rows = reference.rows(start,end,extras)
    value = reference.kpi(rows,start,end,metric,extras) if metric not in {"roas","spend","cac","conversion"} else None
    if action=="kpi":
        return same(data[metric],value)
    if action=="trend":
        return same(sum(r[metric] for r in data["rows"]),value)
    if action=="rank":
        grouped = defaultdict(list)
        for r in rows:
            product = reference.products[r["product_id"]]
            name = {"product":product["product_name"],"category":product["category"],
                    "channel":r["sales_channel"],"region":r["region"]}[dimension]
            grouped[name].append(r)
        expected = sorted(((name,reference.kpi(group,start,end,metric,extras)) for name,group in grouped.items()),
                          key=lambda pair:(pair[1] if ascending else -pair[1],pair[0]))[:10]
        return [(r["name"],r[metric]) for r in data["rows"]]==expected
    if action=="explain":
        pstart,pend = data["prior"]
        before = reference.kpi(reference.rows(pstart,pend,extras),pstart,pend,metric,extras)
        return same(data["actual"],value) and same(data["baseline"],before) and all(
            same(sum(r["delta"] for r in group),value-before) for group in data["contributions"].values())
    if action=="marketing":
        correct = same(data["total"][metric],reference.campaign(start,end,extras.get("marketing_channel"))[metric])
        for row in data["rows"]:
            correct = correct and same(row[metric],reference.campaign(start,end,row["name"])[metric])
            if extras.get("compare_previous"):
                previous = reference.campaign(*data["prior"],row["name"])[metric]
                correct = correct and same(row["previous"],previous) and same(row["change"],row[metric]-previous)
        return correct
    if action=="forecast":
        pred = data["prediction"]
        next_day = str(date.fromisoformat(reference.metadata["end"])+timedelta(days=1))
        # Future ground truth is unavailable. Validate arithmetic, cutoff, horizon and interval ordering.
        return (len(pred)==extras["horizon"] and pred[0]["date"]==next_day and data["target"]==extras["forecast_target"]
                and same(sum(r["value"] for r in pred),data["total"])
                and all(0<=r["lower"]<=r["value"]<=r["upper"] for r in pred))
    return all(start <= r["start"] <= r["end"] <= end for r in data["rows"])


def benchmark(client, directory=ROOT/"data/synthetic"):
    reference = Reference(directory)
    cases = json.loads((ROOT/"tests/benchmark_cases.json").read_text(encoding="utf-8"))
    results = []
    for case in cases:
        question,action,metric,period,*optional = case
        extras,dimension,ascending = (optional+[{},None,False][len(optional):])
        before = time.perf_counter()
        response = client.post("/query",json={"question":question})
        milliseconds = round((time.perf_counter()-before)*1000,1)
        item = dict(question=question,status=response.status_code,ms=milliseconds,execution=response.is_success)
        if response.is_success:
            result = response.json()
            intent = result["intent"]
            filters = intent["filters"]
            item["intent"] = (intent["action"]==action and intent["metric"]==metric and intent["period"]==period
                              and (dimension is None or intent["dimension"]==dimension) and intent["ascending"]==ascending)
            expected_dims = {k:extras.get(k) for k in ("product","category","region","channel","segment","start","end","grain")}
            expected_dims["grain"] = expected_dims["grain"] or "daily"
            item["filters"] = all(filters[k]==v for k,v in expected_dims.items()) and all(
                intent[key]==extras[key] for key in ("marketing_channel","compare_previous","forecast_target","horizon") if key in extras)
            item["chart"] = (result["chart"] or {}).get("type")==CHARTS.get(action)
            item["numerical"] = item["intent"] and numeric_check(reference,result,action,metric,period,extras,dimension,ascending)
            item["grounded"] = (item["numerical"] and item["filters"] and bool(result["answer"])
                and (not result["trace"].get("sources") if action=="unsupported" else bool(result["trace"].get("sources")))
                and (action!="explain" or "do not establish causality" in result["answer"]))
        else:
            item.update(intent=False,filters=False,chart=False,numerical=False,grounded=False)
        if response.is_success and not all(item[key] for key in ("intent", "filters", "chart", "numerical", "grounded")):
            item["diagnostic"] = {"expected": case[1:], "observed_intent": result["intent"], "evidence": result["evidence"]}
        results.append(item)
    scores = {name:sum(row[name] for row in results)/len(results)
              for name in ("intent","execution","numerical","filters","chart","grounded")}
    times = sorted(r["ms"] for r in results)
    return dict(dataset_id=reference.metadata["dataset_id"],cases=len(results),scores=scores,median_ms=times[len(times)//2],p95_ms=times[math.ceil(.95*len(times))-1],
                scope="46 curated English/Vietnamese and refusal cases; synthetic CSV reference; local rules; forecast consistency only",
                results=results)


if __name__=="__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out",type=Path,default=ROOT/"artifacts/query_benchmark.json")
    args = parser.parse_args()
    os.environ["LLM_PROVIDER"]="none"
    with TestClient(app) as client:
        report = benchmark(client)
    args.out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k!="results"},indent=2))
    for row in report["results"]:
        missing = [k for k in report["scores"] if not row[k]]
        if missing:
            print(row["question"],missing)
