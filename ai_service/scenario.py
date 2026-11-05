"""Counterfactual calculators with explicit assumptions and no autonomous business writes."""
from datetime import date, timedelta
from math import ceil

import sqlalchemy as sa
from fastapi import HTTPException

from backend.app.analytics import marketing_summary, ratio
from backend.app.db import marketing, products, sales


def product_row(conn, product):
    row = conn.execute(sa.select(products).where(products.c.product_id==product)).mappings().one_or_none()
    if not row:
        raise HTTPException(422,"Choose a product from the current catalog.")
    return row


def demand_at_price(base_demand, base_price, new_price, elasticity):
    return base_demand*max(0,1+elasticity*(new_price/base_price-1))


def budget_response(ratio, exponent):
    return ratio**exponent


def financial_row(name, demand, sold, price, cost, extra, *, risk=None, **evidence):
    revenue = round(sold*price)
    gp = revenue-round(sold*cost)
    return dict(name=name, demand=round(demand,2), fulfilled=round(sold,2), revenue=revenue,
                gross_profit=gp, profit=gp-extra, margin=ratio(gp,revenue), risk=risk, **evidence)


def price_scenario(conn, info, request, forecast):
    p = request.parameters
    product = product_row(conn,p.product)
    dates = date.fromisoformat(info["end"])
    c = sales.c
    sales_90 = conn.execute(sa.select(sa.func.sum(c.revenue),sa.func.sum(c.quantity),sa.func.sum(c.total_cost))
        .where(c.product_id == p.product, c.date.between(dates-timedelta(days=89),dates))).one()
    if not sales_90[1] or not sales_90[0]:
        raise HTTPException(422,"Recent positive realized prices are required to simulate this SKU.")
    base_price = float(sales_90[0]/sales_90[1])
    unit_cost = float(product["unit_cost"])
    base_demand = sum(x["value"] for x in forecast["prediction"])
    stock = product["current_stock"]
    elasticity = p.elasticity if p.elasticity is not None else product["elasticity"]

    def row(name, price, e, extra):
        demand = demand_at_price(base_demand,base_price,price,e)
        sold = min(demand,stock) if stock is not None else demand
        shortage = max(0,demand-sold)
        return financial_row(name,demand,sold,price,unit_cost,extra,
                             risk=round(shortage,2) if stock is not None else None,
                             unit_price=round(price), additional_cost=extra)

    base = row("Current realized price",base_price,elasticity,0)
    alternatives,sensitivity = [],[]
    for discount in p.discounts:
        name = f"{discount:.0%} list discount" if discount*100==int(discount*100) else f"{discount*100:g}% list discount"
        price = product["list_price"]*(1-discount)
        alternatives.append(row(name,price,elasticity,p.additional_cost))
        sensitivity.append(dict(name=name, alternatives=[
            dict(elasticity=round(e,3),result=row(name,price,e,p.additional_cost)) for e in
            (max(-5,elasticity-.30),elasticity,min(0,elasticity+.30))]))
    return base,alternatives,sensitivity,[f"Elasticity {elasticity:g}; {('operator assumption' if p.elasticity is not None else 'catalog assumption')}.",
        "Demand response is linear in percentage change relative to the past 90-day weighted realized price.",
        "Physical fulfillment is capped at current stock; no future receipts assumed.",
        "Profit is direct gross profit less incremental cost. Business overhead and returns are outside scope.",
        "Use sensitivity results to assess how elasticity changes the decision."],dict(product=p.product,forecast=forecast["model_version"],
                                                                                          stock_on_hand=stock)


def marketing_scenario(conn, info, request):
    p = request.parameters
    end = date.fromisoformat(info["end"])
    start = max(date.fromisoformat(info["start"]),end-timedelta(days=27))
    totals,_ = marketing_summary(conn,start,end,p.channel)
    if totals["spend"] <= 0:
        raise HTTPException(422,"The selected channel has no recent spend.")
    c,m = sales.c,marketing.c
    gp = conn.scalar(sa.select(sa.func.coalesce(sa.func.sum(c.gross_profit),0)).select_from(
        sales.join(marketing,sa.and_(c.campaign_id==m.campaign_id,c.date==m.date)))
        .where(c.date.between(start,end),m.channel==p.channel))
    scale = request.horizon/((end-start).days+1)

    def row(name, change, exponent):
        uplift = budget_response(1+change,exponent)
        spend = round(totals["spend"]*scale*(1+change))
        revenue = round(totals["attributed_revenue"]*scale*uplift)
        profit = round(float(gp)*scale*uplift)
        orders = round(totals["orders"]*scale*uplift,2)
        return dict(name=name,demand=orders,fulfilled=orders,leads=round(totals["leads"]*scale*uplift,2),
                    revenue=revenue,gross_profit=profit,profit=profit-spend,margin=ratio(profit,revenue),risk=None,
                    spend=spend,roas=ratio(revenue,spend))
    base = row("Current spend",0,p.response_exponent)
    alternatives = [row(f"{change:+.0%} budget",change,p.response_exponent) for change in p.changes]
    sensitivity = [dict(name=alternative["name"],alternatives=[
        dict(exponent=round(exponent,3),result=row(alternative["name"],change,exponent))
        for exponent in (max(.2,p.response_exponent-.15),p.response_exponent,min(.95,p.response_exponent+.15))])
        for change,alternative in zip(p.changes,alternatives)]
    return base,alternatives,sensitivity,[f"Attributed funnel response scales by budget ratio raised to {p.response_exponent:g}.",
        "The response exponent is an assumption. Attribution is not an incrementality experiment.",
        "Baseline is the latest 28 observed days prorated to the selected horizon.",
        "Contribution profit deducts campaign spend from attributed gross profit."],dict(channel=p.channel,
            historical_range=[str(start),str(end)],historical=totals)


def inventory_scenario(conn, request, forecast):
    p = request.parameters
    product = product_row(conn,p.product)
    if not product["is_physical"]:
        raise HTTPException(422,"Inventory scenarios apply to physical products.")
    stock, lead = product["current_stock"],product["lead_time_days"]
    safety = p.safety_stock if p.safety_stock is not None else product["reorder_point"]
    predicted = forecast["prediction"]
    need = [r["value"] for r in predicted]
    arrival = lead+1
    opening_on_arrival = float(stock)
    for day,wanted in enumerate(need[:lead],1):
        opening_on_arrival = max(0, opening_on_arrival+(p.incoming_stock if day == p.arrival_day else 0)-wanted)
    later_receipt = p.incoming_stock if arrival <= p.arrival_day <= request.horizon else 0
    proposed = max(0,int(ceil(sum(need[lead:])+safety-opening_on_arrival-later_receipt))) if arrival <= request.horizon else 0
    quantities = p.order_quantities or list(dict.fromkeys([proposed,round(proposed*1.2)]))

    def row(quantity, path):
        balance,fulfilled,first_short = float(stock),0.,None
        for day,wanted in enumerate(path,1):
            balance += (p.incoming_stock if day==p.arrival_day else 0) + (quantity if day==arrival else 0)
            sold = min(wanted,balance)
            if sold+1e-9 < wanted and first_short is None:
                first_short = day
            balance -= sold
            fulfilled += sold
        return financial_row(f"Reorder {quantity} units" if quantity else "No new purchase order",
            sum(path),fulfilled,product["list_price"],product["unit_cost"],0,
            risk=round(max(0,sum(path)-fulfilled),2),closing_stock=round(balance,2),
            safety_stock_gap=round(max(0,safety-balance),2),first_stockout_day=first_short,
            order_quantity=quantity,purchase_commitment=quantity*product["unit_cost"])

    sensitivity = [dict(name=f"Reorder {q} units",alternatives=[
        dict(demand_path=case,result=row(q,[r[key] for r in predicted])) for case,key in
        (("lower daily band","lower"),("point forecast","value"),("upper daily band","upper"))])
        for q in quantities]
    return row(0,need),[row(q,need) for q in quantities],sensitivity,[
        f"New replenishment is available after {lead} full days. Safety stock target is {safety} units.",
        "Unfulfilled demand is lost on that day. Purchase commitment is separate from cost of units sold.",
        "The upper/lower daily bands are stress paths, not cumulative-demand probabilities.",
        "Lost-sales demand may be understated when recent sales were inventory constrained."],dict(product=p.product,
        stock_on_hand=stock,lead_time_days=lead,suggested_reorder_quantity=proposed)


def compare(kind, objective, base, alternatives, sensitivity, assumptions, evidence):
    candidates = [base,*alternatives]
    if objective == "stockout" and all(row["risk"] is None for row in candidates):
        raise HTTPException(422,"This scenario has no physical inventory risk.")
    profit_scale = max(1,abs(base["profit"]),abs(base["gross_profit"]))
    demand_scale = max(1,base["demand"])

    def value(row):
        if objective in {"profit","revenue"}:
            return (row[objective],-(row["risk"] or 0),-row.get("purchase_commitment",0))
        if objective == "stockout":
            return (-(row["risk"] or 0),-row.get("safety_stock_gap",0),-row.get("purchase_commitment",0),row["profit"])
        score = (row["profit"]-base["profit"])/profit_scale - .5*(row["risk"] or 0)/demand_scale
        return (score,-row.get("purchase_commitment",0))
    selected = max(candidates,key=value)
    if objective == "balanced":
        assumptions.append("Balanced score = profit change / baseline profit scale − 0.5 × lost units / baseline demand.")
    for row in candidates:
        row["profit_delta"] = row["profit"]-base["profit"]
        row["revenue_delta"] = row["revenue"]-base["revenue"]
    return dict(type=kind,objective=objective,baseline=base,alternatives=alternatives,recommended=selected,
                sensitivity=sensitivity,assumptions=assumptions,evidence=evidence,result_type="scenario estimate")
