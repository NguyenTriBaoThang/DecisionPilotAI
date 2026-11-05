"""Normalize snapshots, validate cross-table invariants and atomically load the database."""
import argparse
import csv
import hashlib
import json
from collections import Counter
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from io import BytesIO, TextIOWrapper
from pathlib import Path
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile, ZipFile

import sqlalchemy as sa
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from backend.app.db import DATA_TABLES, audit, datasets, make_engine

LIMIT_BYTES = 40 * 1024 * 1024
NAMES = [table.name for table in DATA_TABLES]


def normalize(table, rows):
    clean = []
    for n, row in enumerate(rows, 2):
        if set(row) != set(table.c.keys()):
            raise ValueError(f"{table.name}: columns must match the data dictionary.")
        result = {}
        try:
            for column in table.c:
                raw = row[column.name]
                if raw is None or raw == "":
                    if not column.nullable:
                        raise ValueError(f"missing {column.name}")
                    value = None
                elif isinstance(column.type, sa.Boolean):
                    value = str(raw).strip().lower()
                    if value not in {"true", "false", "1", "0"}:
                        raise ValueError(f"invalid boolean {column.name}")
                    value = value in {"true", "1"}
                elif isinstance(column.type, sa.Date):
                    value = raw.date() if isinstance(raw, datetime) else date.fromisoformat(str(raw).strip())
                elif isinstance(column.type, sa.Integer):
                    parsed = Decimal(str(raw))
                    limit = 10**16 if isinstance(column.type,sa.BigInteger) else 2**31
                    if not parsed.is_finite() or parsed != parsed.to_integral_value() or abs(parsed) >= limit:
                        raise ValueError(f"invalid integer {column.name}")
                    value = int(parsed)
                elif isinstance(column.type, sa.Numeric):
                    parsed = Decimal(str(raw))
                    if not parsed.is_finite() or abs(parsed) >= 100 or parsed != parsed.quantize(Decimal("0.0001")):
                        raise ValueError(f"invalid decimal {column.name}")
                    value = float(parsed)
                else:
                    value = " ".join(str(raw).split())
                    if not value or len(value) > column.type.length or "\x00" in value:
                        raise ValueError(f"invalid label {column.name}")
                result[column.name] = value
        except (TypeError, ValueError, InvalidOperation) as exc:
            raise ValueError(f"{table.name} row {n}: {exc}") from exc
        clean.append(result)
    return clean


def validate(data):
    indexes = {}
    for table in DATA_TABLES:
        keys = table.primary_key.columns.keys()
        index = {tuple(row[k] for k in keys): row for row in data[table.name]}
        if len(index) != len(data[table.name]):
            raise ValueError(f"{table.name}: duplicate primary key")
        indexes[table.name] = index
    days = sorted(row["date"] for row in data["calendar_events"])
    if not days or len(days) > 3660 or not data["sales_transactions"] or not data["products"]:
        raise ValueError("A snapshot requires products, transactions and 1–3,660 calendar days.")
    if (days[-1] - days[0]).days + 1 != len(days):
        raise ValueError("Calendar dates must be contiguous.")
    for row in data["calendar_events"]:
        day = row["date"]
        if (row["day_of_week"], row["month"], row["quarter"], row["is_weekend"]) != (
            day.weekday(), day.month, (day.month - 1)//3 + 1, day.weekday() >= 5
        ):
            raise ValueError(f"Invalid calendar flags on {day}.")
    customers = {row["customer_id"]: row for row in data["customers"]}
    products = {row["product_id"]: row for row in data["products"]}
    for p in products.values():
        inv_fields = [p["lead_time_days"], p["reorder_point"], p["current_stock"]]
        bad_stock = (any(x is None or x < 0 for x in inv_fields) or p["lead_time_days"] == 0
                     if p["is_physical"] else any(x is not None for x in inv_fields))
        if bad_stock or p["list_price"] <= 0 or p["unit_cost"] < 0 or not -5 <= p["elasticity"] <= 0:
            raise ValueError(f"Invalid product parameters for {p['product_id']}.")
    campaign_index = indexes["marketing_campaigns"]
    sales_units, attributed, campaign_orders, ltv, counts = (Counter() for _ in range(5))
    latest = {}
    for row in data["sales_transactions"]:
        pid, cid, day = (row[k] for k in ("product_id", "customer_id", "date"))
        campaign = row["campaign_id"]
        if (pid not in products or cid not in customers or not days[0] <= day <= days[-1]
                or day < customers[cid]["signup_date"] or (campaign and (campaign, day) not in campaign_index)):
            raise ValueError(f"Invalid sale reference for {row['transaction_id']}.")
        qty, price, unit_cost = (row[k] for k in ("quantity", "unit_price", "unit_cost"))
        bps = int(round(row["discount_pct"]*10000))
        expected = (qty*price*(10000-bps)+5000)//10000
        if (qty < 1 or price < 1 or unit_cost < 0 or not 0 <= bps <= 10000
                or row["revenue"] != expected or row["total_cost"] != qty*unit_cost
                or row["gross_profit"] != expected - qty*unit_cost):
            raise ValueError(f"Invalid sale formula or inputs for {row['transaction_id']}.")
        if products[pid]["is_physical"]:
            sales_units[(day, pid)] += qty
        if campaign:
            attributed[(campaign, day)] += row["revenue"]
            campaign_orders[(campaign, day)] += 1
        ltv[cid] += row["revenue"]
        counts[cid] += 1
        latest[cid] = max(latest.get(cid, day), day)
    for key, row in campaign_index.items():
        if (not days[0] <= row["date"] <= days[-1] or row["orders"] != campaign_orders[key]
                or row["attributed_revenue"] != attributed[key] or row["spend"] < 0
                or not row["impressions"] >= row["clicks"] >= row["leads"] >= row["orders"] >= 0):
            raise ValueError(f"Invalid campaign reconciliation for {key}.")
    for cid, row in customers.items():
        if (row["lifetime_value"] != ltv[cid] or row["last_purchase_date"] != latest.get(cid)
                or row["is_returning"] != (counts[cid] > 1)):
            raise ValueError(f"Invalid customer lifetime value, recency or repeat flag for {cid}.")
    ledger = indexes["inventory_daily"]
    for (day, pid), row in ledger.items():
        if pid not in products or not products[pid]["is_physical"] or not days[0] <= day <= days[-1]:
            raise ValueError("Inventory must reference a physical product and a valid date.")
        opening, received, sold, closing = (row[k] for k in ("opening_stock","received_qty","sold_qty","closing_stock"))
        previous = ledger.get((day-timedelta(days=1), pid))
        if (min(opening, received, sold, closing) < 0 or sold != sales_units[(day, pid)]
                or opening+received-sold != closing or row["stockout_flag"] != (closing == 0)
                or (previous and opening != previous["closing_stock"])):
            raise ValueError(f"Invalid inventory movement for {(day, pid)}.")
    for pid, product in products.items():
        if product["is_physical"]:
            if any((day, pid) not in ledger for day in days) or ledger[(days[-1], pid)]["closing_stock"] != product["current_stock"]:
                raise ValueError(f"Missing inventory dates or invalid current stock for {pid}.")
    return {"status": "passed", "counts": {name: len(rows) for name, rows in data.items()},
            "start": days[0].isoformat(), "end": days[-1].isoformat(),
            "checks": ["primary keys", "foreign keys", "calendar", "sales formulas", "inventory continuity",
                       "marketing attribution", "customer reconciliation"]}


def snapshot_metadata(data, manifest):
    quality = validate(data)
    digest = hashlib.sha256()
    for name in NAMES:
        digest.update(name.encode())
        for row in data[name]:
            digest.update(json.dumps(row, default=str, sort_keys=True).encode())
    return {**manifest, **quality, "dataset_id": digest.hexdigest()[:24]}


def export_bundle(path, data, manifest):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    for table in DATA_TABLES:
        with (path/f"{table.name}.csv").open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=table.c.keys())
            writer.writeheader()
            writer.writerows(data[table.name])
    (path/"metadata.json").write_text(json.dumps(snapshot_metadata(data, manifest), indent=2)+"\n", encoding="utf-8")


def read_directory(path):
    path = Path(path)
    data = {}
    for table in DATA_TABLES:
        with (path/f"{table.name}.csv").open(encoding="utf-8-sig", newline="") as stream:
            data[table.name] = normalize(table, csv.DictReader(stream))
    return data, json.loads((path/"metadata.json").read_text(encoding="utf-8"))


def read_upload(blob, filename):
    if len(blob) > LIMIT_BYTES:
        raise ValueError("Upload exceeds 40 MiB.")
    try:
        with ZipFile(BytesIO(blob)) as archive:
            if sum(item.file_size for item in archive.infolist()) > LIMIT_BYTES:
                raise ValueError("Uncompressed upload exceeds 40 MiB.")
            if len(archive.infolist()) != len(set(archive.namelist())):
                raise ValueError("Duplicate archive entries are unsupported.")
            if filename.lower().endswith(".zip"):
                return {table.name: normalize(table, csv.DictReader(TextIOWrapper(
                    archive.open(f"{table.name}.csv"), encoding="utf-8-sig"))) for table in DATA_TABLES}
        if filename.lower().endswith(".xlsx"):
            book = load_workbook(BytesIO(blob), read_only=True, data_only=True, keep_links=False)
            try:
                data = {}
                for table in DATA_TABLES:
                    rows = book[table.name].values
                    columns = next(rows, ())
                    if len(columns) != len(table.c) or set(columns) != set(table.c.keys()):
                        raise ValueError(f"{table.name}: invalid sheet header.")
                    # Some Excel writers omit trailing empty cells in read-only mode.
                    def excel_rows():
                        for values in rows:
                            if len(values) > len(columns) and any(v is not None for v in values[len(columns):]):
                                raise ValueError(f"{table.name}: unexpected extra columns.")
                            padded = tuple(values) + (None,) * max(0,len(columns)-len(values))
                            yield dict(zip(columns,padded))
                    data[table.name] = normalize(table,excel_rows())
                return data
            finally:
                book.close()
    except (KeyError, BadZipFile, UnicodeError, csv.Error, OSError, ParseError, InvalidFileException) as exc:
        raise ValueError("Invalid snapshot. Supply all six named tables as CSV ZIP or XLSX.") from exc
    raise ValueError("Supported inputs are CSV ZIP and XLSX.")


class SnapshotConflict(ValueError):
    pass


def load_snapshot(engine, data, manifest, *, expected_id=None):
    info = snapshot_metadata(data, manifest)
    with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            conn.exec_driver_sql("SELECT pg_advisory_xact_lock(177480102)")
        else:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
        current = conn.scalar(sa.select(datasets.c.payload))
        if current and expected_id is None:
            if current["kind"] == info["kind"] and current["dataset_id"] == info["dataset_id"]:
                return current
            raise SnapshotConflict("Database already contains a different dataset.")
        if expected_id is not None and expected_id != (current["dataset_id"] if current else "empty"):
            raise SnapshotConflict("Dataset changed. Reload metadata before retrying.")
        for table in reversed(DATA_TABLES):
            conn.execute(table.delete())
        for table in DATA_TABLES:
            rows = data[table.name]
            for start in range(0, len(rows), 1000):
                conn.execute(table.insert(), rows[start:start+1000])
        conn.execute(datasets.delete())
        conn.execute(datasets.insert().values(id=1, payload=info))
        conn.execute(audit.insert().values(kind="dataset_loaded", subject=info["dataset_id"],
                                           payload={k: info[k] for k in ("kind","counts","start","end")}))
    return info


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("action", choices=["validate", "load"])
    cli.add_argument("directory", nargs="?", default="data/synthetic")
    cli.add_argument("--report", default="artifacts/data_quality.json")
    args = cli.parse_args()
    data, manifest = read_directory(args.directory)
    info = load_snapshot(make_engine(), data, manifest) if args.action == "load" else snapshot_metadata(data, manifest)
    report = Path(args.report)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(info, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({k: info[k] for k in ("status", "counts", "start", "end", "dataset_id")}, indent=2))
