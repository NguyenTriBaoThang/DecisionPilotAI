"""Exercise the running frontend proxy and API using the bundled demo scenario."""
import argparse

import httpx


def smoke(base):
    with httpx.Client(base_url=base, timeout=30, trust_env=False) as client:
        def call(method,path,payload=None):
            response = client.request(method,path,json=payload)
            response.raise_for_status()
            return response

        for path in ("/","/ask","/anomalies","/forecast","/scenarios","/recommendations"):
            response = call("GET",path)
            assert "DecisionPilot AI" in response.text and 'id="root"' in response.text
        assert call("GET","/api/health").json()["model_ready"]
        assert "/simulate" in call("GET","/api/openapi.json").json()["paths"]
        dataset = call("GET","/api/dataset").json()
        assert dataset["counts"]["sales_transactions"]==50_000
        assert call("GET","/api/kpi/summary").json()["changes"]["revenue"]<0
        alerts = call("GET","/api/anomalies").json()["rows"]
        assert any(row["metric"]=="facebook_spend" for row in alerts)
        analysis = call("POST","/api/query",{"question":"Why did revenue decrease this month?"}).json()
        assert analysis["evidence"]["delta"]<0
        assert len(call("POST","/api/forecast",{"target":"demand","product":"P001","horizon":30}).json()["prediction"])==30
        simulation = call("POST","/api/simulate",{"type":"price","parameters":{"product":"P001","discounts":[0,.05,.1]}}).json()
        assert len(simulation["alternatives"])==3
        recommendation = call("GET","/api/recommendations").json()["rows"][0]
        reviewed = call("POST","/api/recommendations/feedback",{"recommendation_id":recommendation["id"],
            "dataset_id":dataset["dataset_id"],"decision":"accepted"}).json()
        assert any(row["id"]==reviewed["id"] for row in call("GET","/api/audit?kind=recommendation_feedback").json()["rows"])
    print("HTTP smoke passed: 6 frontend routes, API proxy and full decision workflow.")


if __name__=="__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base",nargs="?",default="http://127.0.0.1:5173")
    smoke(parser.parse_args().base)
