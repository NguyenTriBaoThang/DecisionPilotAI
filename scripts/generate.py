"""Generate a reconciled retail and service history with dated test events."""
import argparse
import math
from collections import Counter
from datetime import date, timedelta

import numpy as np

from scripts.pipeline import export_bundle, validate

CHANNELS = ("Facebook Ads", "Google Ads", "TikTok Ads", "Email")
REGIONS = ("HCMC", "Hanoi", "Da Nang", "Can Tho")
SEGMENTS = ("Returning", "Individual", "Corporate", "Price-sensitive")
CATEGORIES = ("Office Equipment", "Home/Office", "Electronics", "SaaS Service", "Business Service", "Accessories")
ANCHORS = (
    ("SmartDesk Mini", 2_490_000, 1_650_000, -1.1),
    ("AirPure S", 1_890_000, 1_180_000, -1.4),
    ("FocusCam Pro", 3_290_000, 2_250_000, -0.8),
    ("WorkHub License", 299_000, 75_000, -0.6),
    ("CarePlus Support", 1_200_000, 420_000, -0.4),
)


def generate(months=24, transactions=50_000, sku_count=50, customer_count=10_000, seed=42,
             end=date(2026, 9, 30)):
    if not 6 <= months <= 60 or not 1 <= transactions <= 500_000 or sku_count < 6 or customer_count < 8:
        raise ValueError("Use 6–60 months, 1–500,000 transactions, at least 6 SKU and 8 customers.")
    rng = np.random.default_rng(seed)
    # Roll back whole calendar months from the month following the cutoff.
    first_month = end.year * 12 + end.month - months
    start = date(first_month // 12, first_month % 12 + 1, 1)
    day_count = (end - start).days + 1
    days = [start + timedelta(days=i) for i in range(day_count)]
    shock_start = end - timedelta(days=27)
    early_shock = end - timedelta(days=70)
    interruption = early_shock - timedelta(days=10)
    restore_supply = early_shock + timedelta(days=28)
    calendar = []
    traffic = []
    for i, day in enumerate(days):
        holiday = {(1, 1): "New Year", (4, 30): "Reunification Day", (5, 1): "Labour Day",
                   (9, 2): "National Day", (12, 25): "Year-end shopping"}.get((day.month, day.day))
        promotion = (day.month == day.day and day.month >= 6) or day >= end - timedelta(days=3)
        weekday = day.weekday()
        calendar.append(dict(date=day, day_of_week=weekday, month=day.month, quarter=(day.month - 1)//3+1,
                             is_weekend=weekday >= 5, is_holiday=bool(holiday), event_name=holiday,
                             promotion_flag=promotion))
        traffic.append((0.90 + .36*i/day_count) * (1 + .16*math.cos((day.month-12)*math.pi/6))
                       * (1.2 if weekday >= 5 else .96) * (1.24 if holiday else 1)
                       * (1.16 if promotion else 1) * (.59 if day >= shock_start else 1)
                       * (.75 if early_shock <= day < early_shock + timedelta(days=6) else 1)
                       * rng.lognormal(0, .08))
    daily_counts = rng.multinomial(transactions, np.array(traffic) / sum(traffic))
    products = []
    for i in range(sku_count):
        category = CATEGORIES[i % len(CATEGORIES)]
        physical = category not in {"SaaS Service", "Business Service"}
        if i < len(ANCHORS):
            name, price, cost, elasticity = ANCHORS[i]
        else:
            family = ("Desk", "Air", "Focus", "WorkHub", "CarePlus", "Link")[i % len(CATEGORIES)]
            name = f"{family} Series {i+1:02d}"
            price = int(rng.integers(20, 360))*10_000
            cost = int(round(price * rng.uniform(.35, .78)))
            elasticity = round(float(rng.uniform(-1.7, -.35)), 2)
        products.append(dict(product_id=f"P{i+1:03d}", product_name=name, category=category,
                             brand=("Pilot Essentials" if i < 5 else "Pilot Select"), list_price=price,
                             unit_cost=cost, elasticity=elasticity, supplier="Local Supply" if physical else "In-house",
                             is_physical=physical, lead_time_days=(14 if i == 0 else 7 + i % 8) if physical else None,
                             reorder_point=(32 if i == 0 else 10 + i % 13) if physical else None,
                             current_stock=0 if physical else None))
    customers = [dict(customer_id=f"C{i+1:06d}", customer_segment=SEGMENTS[i%4],
                      region=REGIONS[i % 23 % 4], signup_date=start-timedelta(days=int(rng.integers(1, 500))),
                      acquisition_channel=CHANNELS[i%len(CHANNELS)] if i%5 else "Organic",
                      is_returning=False, lifetime_value=0, last_purchase_date=None)
                 for i in range(customer_count)]
    segment_pools = [np.arange(j, customer_count, len(SEGMENTS)) for j in range(len(SEGMENTS))]
    stock = np.array([90 if p["is_physical"] else 0 for p in products])
    physical_mask = np.array([p["is_physical"] for p in products])
    popularity = np.r_[np.array([8, 7, 5, 8, 3]), rng.uniform(.55, 2.4, sku_count - 5)]
    rows, campaigns, ledger = [], [], []
    purchases = Counter()
    for i, (day, count, event) in enumerate(zip(days, daily_counts, calendar)):
        affected = day >= shock_start
        opening = stock.copy()
        received = np.zeros(sku_count, dtype=int)
        for j, p in enumerate(products):
            smartdesk_pause = j == 0 and day >= end - timedelta(days=11)
            focuscam_pause = j == 2 and interruption <= day < restore_supply
            if p["is_physical"] and not (smartdesk_pause or focuscam_pause):
                if (i + j) % 7 == 0 or stock[j] < p["reorder_point"]:
                    received[j] = max(0, int(100 + 5*popularity[j] - stock[j]))
        stock += received
        sold = np.zeros(sku_count, dtype=int)
        day_campaigns = {}
        for k, channel in enumerate(CHANNELS):
            spend = int((3_200_000, 3_800_000, 1_850_000, 400_000)[k] * (1.12 + i/day_count*.13)
                        * rng.uniform(.87, 1.13) * (1.85 if affected and k == 0 else 1))
            day_campaigns[k] = dict(campaign_id=f"M{k+1}-{day:%Y%m}", date=day, channel=channel,
                                    campaign_name=f"{channel} {day:%b %Y}", spend=spend,
                                    impressions=spend//55, clicks=spend//1900, leads=0, orders=0,
                                    attributed_revenue=0)
        promo = event["promotion_flag"]
        for _ in range(count):
            segment = int(rng.choice(4, p=[.20,.40,.18,.22] if affected else [.44,.24,.16,.16]))
            customer = customers[int(rng.choice(segment_pools[segment]))]
            region = customer["region"]
            weights = popularity.copy()
            if affected and region == "HCMC":
                weights[1:3] *= .26
            weights[1] *= 1 + .25*math.sin(day.month*math.pi/6)
            if promo:
                weights *= 1 + .09*np.array([-p["elasticity"] for p in products])
            weights[physical_mask & (stock <= 0)] = 0
            j = int(rng.choice(sku_count, p=weights/weights.sum()))
            product = products[j]
            qty = int(rng.choice([1, 2, 3], p=[.85, .125, .025]))
            if physical_mask[j]:
                qty = min(qty, int(stock[j]))
                stock[j] -= qty
                sold[j] += qty
            discount_bps = (1000 if promo else 0) + (500 if segment == 3 else 0)
            unit_price, unit_cost = product["list_price"], product["unit_cost"]
            revenue = (qty*unit_price*(10_000-discount_bps) + 5000)//10_000
            channel = str(rng.choice(["Online", "Retail", "B2B"], p=[.62, .27, .11]))
            source = int(rng.choice(5, p=[.055,.25,.16,.105,.43] if affected else [.25,.22,.12,.08,.33]))
            camp = day_campaigns[source] if source < 4 and channel == "Online" else None
            if camp:
                camp["orders"] += 1
                camp["attributed_revenue"] += revenue
            customer["lifetime_value"] += revenue
            customer["last_purchase_date"] = day
            purchases[customer["customer_id"]] += 1
            rows.append(dict(transaction_id=f"T{len(rows)+1:07d}", date=day, customer_id=customer["customer_id"],
                             product_id=product["product_id"], quantity=qty, unit_price=unit_price,
                             discount_pct=discount_bps/10_000, revenue=revenue, unit_cost=unit_cost,
                             total_cost=qty*unit_cost, gross_profit=revenue-qty*unit_cost, region=region,
                             sales_channel=channel, campaign_id=camp["campaign_id"] if camp else None))
        for k, camp in day_campaigns.items():
            camp["leads"] = camp["orders"] + int(rng.integers(7, 20)) + (24 if affected and k == 0 else 0)
            camp["clicks"] = max(camp["clicks"], camp["leads"])
            camp["impressions"] = max(camp["impressions"], camp["clicks"])
            campaigns.append(camp)
        for j in np.flatnonzero(physical_mask):
            ledger.append(dict(date=day, product_id=products[j]["product_id"], opening_stock=int(opening[j]),
                               received_qty=int(received[j]), sold_qty=int(sold[j]), closing_stock=int(stock[j]),
                               stockout_flag=bool(stock[j] == 0)))
    for customer in customers:
        customer["is_returning"] = purchases[customer["customer_id"]] > 1
    for j in np.flatnonzero(physical_mask):
        products[j]["current_stock"] = int(stock[j])

    def injected(metric, start, stop, rule):
        return dict(metric=metric, start=start.isoformat(), end=stop.isoformat(), rule=rule)

    manifest = dict(
        kind="synthetic", title="Synthetic retail & services demo", seed=seed, currency="VND", timezone="Asia/Ho_Chi_Minh",
        injected_events=[
            injected("revenue", early_shock, early_shock+timedelta(days=5), "Demand traffic × 0.75"),
            injected("revenue", shock_start, end, "Demand traffic × 0.59; HCMC SKU weights × 0.26; returning segment share 44% → 20%"),
            injected("facebook_spend", shock_start, end, "Spend × 1.85"),
            injected("facebook_roas", shock_start, end, "Online Facebook attribution probability 25% → 5.5%; spend × 1.85"),
            injected("facebook_conversion", shock_start, end, "Additional nonconverting leads and reduced attribution"),
            injected("stockout_event", interruption, restore_supply-timedelta(days=1), "Suspend FocusCam Pro replenishment for a historical supply interruption"),
            injected("stockout_risk", end-timedelta(days=11), end, "Suspend SmartDesk Mini replenishment"),
            injected("margin", end-timedelta(days=3), end, "Four promotional days with extra 10 percentage points of discounts"),
        ])
    return dict(calendar_events=calendar, products=products, customers=customers, marketing_campaigns=campaigns,
                sales_transactions=rows, inventory_daily=ledger), manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, default=24)
    parser.add_argument("--transactions", type=int, default=50_000)
    parser.add_argument("--sku-count", type=int, default=50)
    parser.add_argument("--customer-count", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--end", type=date.fromisoformat, default=date(2026, 9, 30))
    parser.add_argument("--output", default="data/synthetic")
    args = vars(parser.parse_args())
    output = args.pop("output")
    data, manifest = generate(**args)
    validate(data)
    export_bundle(output, data, manifest)
