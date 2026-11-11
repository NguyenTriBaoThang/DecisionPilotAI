"""Comprehensive integration and edge-case tests for Multi-Tenant Enterprise Data Ingestion."""
from __future__ import annotations

from datetime import date, timedelta
from io import BytesIO
import json
import struct
from zipfile import ZipFile

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from openpyxl import Workbook
import pytest
import sqlalchemy as sa

from backend.app.db import ARTIFACTS, ROOT, make_engine, tenant_transactions
from backend.app.ingestion.storage import LocalObjectStorage
from backend.app.main import create_app


def _make_biff8_xls(sheet_name: str, rows: list[list]) -> bytes:
    """Create a genuine binary Excel 97-2003 BIFF8 .xls compound file readable by xlrd."""
    def rec(rec_id: int, data: bytes) -> bytes:
        return struct.pack("<HH", rec_id, len(data)) + data

    def label_cell(r: int, c: int, s: str) -> bytes:
        b = s.encode("latin-1", errors="replace")
        return rec(0x0204, struct.pack("<HHHHB", r, c, 0, len(b), 0) + b)

    def num_cell(r: int, c: int, v: float, xf: int = 0) -> bytes:
        return rec(0x0203, struct.pack("<HHHd", r, c, xf, float(v)))

    g = bytearray()
    g += rec(0x0809, struct.pack("<HHHHHH", 0x0600, 0x0005, 0x0DBB, 0x07CC, 0, 0))
    g += rec(0x0042, struct.pack("<H", 1252))
    g += rec(0x0022, struct.pack("<H", 0))
    fmt = b"yyyy-mm-dd"
    g += rec(0x041E, struct.pack("<HHB", 164, len(fmt), 0) + fmt)
    g += rec(0x00E0, struct.pack("<HHHHHHII", 0, 0, 0x0001, 0, 0, 0, 0, 0))
    g += rec(0x00E0, struct.pack("<HHHHHHII", 0, 164, 0x0001, 0, 0x0400, 0, 0, 0))
    bs_pos = len(g)
    sname_b = sheet_name.encode("latin-1", errors="replace")
    g += rec(0x0085, struct.pack("<IBBBB", 0, 0, 0, len(sname_b), 0) + sname_b)
    g += rec(0x000A, b"")

    sheet_offset = len(g)
    struct.pack_into("<I", g, bs_pos + 4, sheet_offset)

    w = bytearray()
    w += rec(0x0809, struct.pack("<HHHHHH", 0x0600, 0x0010, 0x0DBB, 0x07CC, 0, 0))
    w += rec(0x0200, struct.pack("<IIIIH", 0, len(rows), 0, max((len(r) for r in rows), default=1), 0))
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            if isinstance(val, tuple) and val[0] == "date_serial":
                w += num_cell(r_idx, c_idx, val[1], xf=1)
            elif isinstance(val, (int, float)):
                w += num_cell(r_idx, c_idx, val, xf=0)
            else:
                w += label_cell(r_idx, c_idx, str(val))
    w += rec(0x000A, b"")

    stream = bytes(g) + bytes(w)
    if len(stream) < 4096:
        stream += b"\x00" * (4096 - len(stream))
    stream = stream.ljust(((len(stream) + 511) // 512) * 512, b"\x00")
    n_stream_sec = len(stream) // 512
    dir_sec_idx = n_stream_sec
    fat_sec_idx = n_stream_sec + 1

    hdr = bytearray(512)
    hdr[0:8] = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    struct.pack_into("<HHHHHH", hdr, 24, 0x003E, 0x0003, 0xFFFE, 9, 6, 0)
    struct.pack_into("<IIIIII", hdr, 44, 1, dir_sec_idx, 0, 4096, 0xFFFFFFFE, 0)
    struct.pack_into("<II", hdr, 68, 0xFFFFFFFE, 0)
    struct.pack_into("<I", hdr, 76, fat_sec_idx)
    for i in range(1, 109):
        struct.pack_into("<I", hdr, 76 + i * 4, 0xFFFFFFFF)

    def dir_entry(name: str, obj_type: int, start_sec: int, size: int, child_id: int = 0xFFFFFFFF) -> bytes:
        ent = bytearray(128)
        nb = name.encode("utf-16-le") + b"\x00\x00"
        ent[0 : len(nb)] = nb
        struct.pack_into("<HBB", ent, 64, len(nb), obj_type, 1)
        struct.pack_into("<III", ent, 68, 0xFFFFFFFF, 0xFFFFFFFF, child_id)
        struct.pack_into("<II", ent, 116, start_sec, size)
        return bytes(ent)

    dir_sec = bytearray(512)
    dir_sec[0:128] = dir_entry("Root Entry", 5, 0xFFFFFFFE, 0, child_id=1)
    dir_sec[128:256] = dir_entry("Workbook", 2, 0, len(stream))

    fat_sec = bytearray(512)
    for i in range(n_stream_sec):
        struct.pack_into("<I", fat_sec, i * 4, (i + 1) if i + 1 < n_stream_sec else 0xFFFFFFFE)
    struct.pack_into("<I", fat_sec, dir_sec_idx * 4, 0xFFFFFFFE)
    struct.pack_into("<I", fat_sec, fat_sec_idx * 4, 0xFFFFFFFD)
    for i in range(fat_sec_idx + 1, 128):
        struct.pack_into("<I", fat_sec, i * 4, 0xFFFFFFFF)

    return bytes(hdr) + stream + bytes(dir_sec) + bytes(fat_sec)


def _make_xlsx(sheets: dict[str, list[list]]) -> bytes:
    book = Workbook(write_only=True)
    for title, rows in sheets.items():
        ws = book.create_sheet(title)
        for row in rows:
            ws.append(row)
    buf = BytesIO()
    book.save(buf)
    return buf.getvalue()


@pytest.fixture()
def isolated_env(tmp_path, monkeypatch):
    db_path = tmp_path / "ingestion_test.sqlite"
    db_url = f"sqlite:///{db_path}"
    store_dir = tmp_path / "obj_store"
    art_dir = tmp_path / "artifacts"
    art_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("LLM_PROVIDER", "none")
    monkeypatch.setenv("INGESTION_STORAGE_DIR", str(store_dir))
    monkeypatch.setattr("backend.app.db.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.services.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.ingestion.service.ARTIFACTS", art_dir)
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    engine = make_engine(db_url)
    storage = LocalObjectStorage(store_dir)
    yield engine, storage, art_dir
    engine.dispose()


def _sales_csv(days: int = 35, start_date: date = date(2026, 5, 1)) -> bytes:
    lines = ["Order Date,SKU Item,Line Category,Qty Sold,Net Sales,COGS,Client,City,Channel Name,Ad Budget,Stock On Hand"]
    for d in range(days):
        cur = (start_date + timedelta(days=d)).isoformat()
        qty_a = 10 + (d % 5)
        rev_a = qty_a * 120.0
        cogs_a = qty_a * 65.0
        stock_a = max(2, 80 - d * 2)
        lines.append(
            f'{cur},CloudCam Pro,Hardware,{qty_a},"${rev_a:,.2f}","${cogs_a:,.2f}",Acme Corp,HCMC,Online,$45.00,{stock_a}'
        )
        qty_b = 5 + (d % 3)
        rev_b = qty_b * 200.0
        cogs_b = qty_b * 110.0
        lines.append(
            f'{cur},SensorHub X2,IoT,{qty_b},"${rev_b:,.2f}","${cogs_b:,.2f}",Beta Ltd,Hanoi,B2B,$30.00,{40 + (d % 7)}'
        )
    return "\n".join(lines).encode("utf-8")


def test_full_csv_ingestion_workflow_and_bi_analytics(isolated_env):
    engine, storage, art_dir = isolated_env
    with TestClient(create_app(engine, storage=storage)) as http:
        # Create isolated tenant company
        comp = http.post("/api/v1/companies", json={"name": "RetailAlpha Co"}).json()
        cid = comp["id"]
        hdr = {"X-Company-ID": cid}

        # Before import, analytics endpoints report 503 empty company workspace
        assert http.get("/dataset", headers=hdr).status_code == 503

        # 1. Upload CSV
        up = http.post(
            "/api/v1/datasets/upload",
            headers=hdr,
            files={"file": ("alpha_q2.csv", _sales_csv(days=35), "text/csv")},
            data={"dataset_name": "Alpha Q2 Sales"},
        )
        assert up.status_code == 200
        payload = up.json()
        ds_id = payload["dataset"]["id"]
        assert payload["dataset"]["status"] == "uploaded"
        assert payload["preview"]["total_rows"] == 70
        sugg = payload["mapping_suggestions"]["suggested_mapping"]
        assert sugg["Order Date"] == "date"
        assert sugg["Net Sales"] == "revenue"
        assert sugg["SKU Item"] == "product"
        assert sugg["Ad Budget"] == "marketing_spend"
        assert sugg["Stock On Hand"] == "inventory"

        # Confirm import fails cleanly before mapping confirmation & explicit user confirmation
        assert http.post(f"/api/v1/datasets/{ds_id}/import", headers=hdr, json={"confirmed": False}).status_code == 422
        assert http.post(f"/api/v1/datasets/{ds_id}/import", headers=hdr, json={"confirmed": True}).status_code == 422

        # 2. Preview endpoint
        prev = http.post(f"/api/v1/datasets/{ds_id}/preview", headers=hdr, json={"limit": 10})
        assert prev.status_code == 200
        assert len(prev.json()["rows"]) == 10

        # 3. Confirm mapping (+ save reusable template)
        m_resp = http.post(
            f"/api/v1/datasets/{ds_id}/mapping",
            headers=hdr,
            json={
                "mappings": {**sugg, "CustomNote": "custom:notes"} if "CustomNote" in sugg else sugg,
                "currency": "USD",
                "confirmed": True,
                "save_template": True,
                "template_name": "Alpha POS Format",
            },
        )
        assert m_resp.status_code == 200
        assert m_resp.json()["saved_template"]["name"] == "Alpha POS Format"

        # 4. Validate data quality
        val = http.post(f"/api/v1/datasets/{ds_id}/validate", headers=hdr, json={})
        assert val.status_code == 200
        qrep = val.json()["quality_report"]
        assert qrep["overall_score"] >= 95.0
        assert qrep["total_rows"] == 70
        assert qrep["valid_rows"] == 70
        assert qrep["detected_currency"] == "USD"

        # Analytics STILL unavailable before explicit import confirmation!
        assert http.get("/kpi/summary", headers=hdr).status_code == 503

        # 5. Confirmed import
        imp = http.post(
            f"/api/v1/datasets/{ds_id}/import",
            headers=hdr,
            json={"confirmed": True, "activate": True, "currency": "USD"},
        )
        assert imp.status_code == 200
        assert imp.json()["imported_counts"]["sales_transactions"] == 70
        assert imp.json()["model_ready"] is True
        assert (art_dir / f"tenant_{cid}__{ds_id}.joblib").is_file()

        # 6. Full BI platform works directly against uploaded dataset
        ds_info = http.get("/dataset", headers=hdr).json()
        assert ds_info["dataset_id"] == ds_id
        assert ds_info["currency"] == "USD"

        kpi = http.get(
            "/kpi/summary",
            headers=hdr,
            params={"start": ds_info["start"], "end": ds_info["end"]},
        ).json()
        assert kpi["currency"] == "USD"
        assert kpi["summary"]["orders"] == 70
        assert kpi["summary"]["revenue"] > 0
        assert kpi["summary"]["gross_profit"] > 0
        assert kpi["summary"]["roas"] is not None
        assert len(kpi["products"]) == 2

        ask = http.post("/query", headers=hdr, json={"question": "Which product generated the highest profit?"})
        assert ask.status_code == 200
        assert ("USD" in ask.json()["answer"] or "$" in ask.json()["answer"])

        anoms = http.get("/anomalies", headers=hdr)
        assert anoms.status_code == 200

        fc = http.post("/forecast", headers=hdr, json={"target": "revenue", "horizon": 7})
        assert fc.status_code == 200
        assert len(fc.json()["prediction"]) == 7
        assert fc.json()["warnings"]  # short-window (<201d) transparent disclosure

        sim = http.post(
            "/simulate",
            headers=hdr,
            json={"type": "price", "horizon": 30, "parameters": {"product": "CloudCam_Pro", "discounts": [0, 0.05, 0.1]}},
        )
        assert sim.status_code == 200
        assert len(sim.json()["alternatives"]) == 3

        recs = http.get("/recommendations", headers=hdr)
        assert recs.status_code == 200

        hist = http.get(f"/api/v1/datasets/{ds_id}/history", headers=hdr).json()["items"]
        assert {h["stage"] for h in hist} >= {"upload", "mapping", "validation", "import"}


def test_xlsx_multisheet_xls_binary_and_json_variants(isolated_env):
    engine, storage, _ = isolated_env
    with TestClient(create_app(engine, storage=storage)) as http:
        hdr = {"X-Company-ID": "comp-default"}

        # Multi-sheet XLSX: sheet 1 is metadata/summary, sheet 2 is business orders
        xlsx_blob = _make_xlsx(
            {
                "Cover": [["Report Title", "Fiscal 2026"]],
                "Transactions": [
                    ["Ngay giao dich", "Ten san pham", "So luong", "Doanh thu", "Gia von"],
                    ["2026-08-01", "Ban thong minh", 2, 5000000, 3000000],
                    ["2026-08-02", "Ghe cong thai hoc", 1, 3500000, 2100000],
                ],
            }
        )
        up_x = http.post(
            "/api/v1/datasets/upload",
            headers=hdr,
            files={"file": ("multi.xlsx", xlsx_blob, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        ).json()
        x_id = up_x["dataset"]["id"]
        assert up_x["preview"]["sheets"] == ["Cover", "Transactions"]

        prev_orders = http.post(
            f"/api/v1/datasets/{x_id}/preview",
            headers=hdr,
            json={"sheet_name": "Transactions", "limit": 20},
        ).json()
        assert prev_orders["total_rows"] == 2
        m = prev_orders["mapping_suggestions"]["suggested_mapping"]
        # Vietnamese header aliases auto-detected
        assert m["Ngay giao dich"] == "date"
        assert m["Ten san pham"] == "product"
        assert m["So luong"] == "quantity"
        assert m["Doanh thu"] == "revenue"
        assert m["Gia von"] == "cost"

        http.post(
            f"/api/v1/datasets/{x_id}/mapping",
            headers=hdr,
            json={"mappings": m, "sheet_name": "Transactions", "currency": "VND", "confirmed": True},
        )
        imp_x = http.post(
            f"/api/v1/datasets/{x_id}/import",
            headers=hdr,
            json={"confirmed": True, "sheet_name": "Transactions", "activate": False},
        )
        assert imp_x.status_code == 200
        assert imp_x.json()["imported_counts"]["sales_transactions"] == 2

        # Binary BIFF8 .xls upload with XL_CELL_DATE
        xls_blob = _make_biff8_xls(
            "Ledger",
            [
                ["Date", "Product", "Revenue", "Cost"],
                [("date_serial", 46204), "LegacyDesk", 1200.5, 700.0],
                [("date_serial", 46205), "LegacyChair", 850.0, 400.0],
            ],
        )
        up_xls = http.post(
            "/api/v1/datasets/upload",
            headers=hdr,
            files={"file": ("legacy97.xls", xls_blob, "application/vnd.ms-excel")},
        )
        assert up_xls.status_code == 200
        xls_json = up_xls.json()
        assert xls_json["dataset"]["file_format"] == "xls"
        assert xls_json["preview"]["rows"][0]["Date"] == "2026-07-01"

        # JSON object envelope & nested flattening
        envelope = {
            "records": [
                {"date": "2026-09-01", "product": {"name": "API Gateway"}, "revenue": 420.0, "region": "HCMC"},
                {"date": "2026-09-02", "product": {"name": "API Gateway"}, "revenue": 580.0, "region": "Hanoi"},
            ]
        }
        up_j = http.post(
            "/api/v1/datasets/upload",
            headers=hdr,
            files={"file": ("api_export.json", json.dumps(envelope).encode("utf-8"), "application/json")},
        )
        assert up_j.status_code == 200
        j_sugg = up_j.json()["mapping_suggestions"]["suggested_mapping"]
        assert "product.name" in j_sugg
        j_sugg["product.name"] = "product"
        j_id = up_j.json()["dataset"]["id"]
        http.post(f"/api/v1/datasets/{j_id}/mapping", headers=hdr, json={"mappings": j_sugg, "confirmed": True})
        assert http.post(f"/api/v1/datasets/{j_id}/import", headers=hdr, json={"confirmed": True, "activate": False}).status_code == 200

        # NDJSON format
        ndjson = b'{"date":"2026-09-03","product":"NDItem","revenue":150}\n{"date":"2026-09-04","product":"NDItem","revenue":250}\n'
        up_nd = http.post(
            "/api/v1/datasets/upload",
            headers=hdr,
            files={"file": ("stream.json", ndjson, "application/json")},
        )
        assert up_nd.status_code == 200
        assert up_nd.json()["preview"]["total_rows"] == 2


def test_file_security_empty_and_malformed_uploads_rejected(isolated_env, monkeypatch):
    engine, storage, _ = isolated_env
    with TestClient(create_app(engine, storage=storage)) as http:
        # Unsupported file format
        assert http.post("/api/v1/datasets/upload", files={"file": ("notes.txt", b"hello", "text/plain")}).status_code == 422
        # Corrupted / spoofed .xlsx magic bytes
        assert http.post("/api/v1/datasets/upload", files={"file": ("fake.xlsx", b"MZ\x90\x00not_zip", "application/octet-stream")}).status_code == 422
        # Corrupted / spoofed .xls magic bytes
        assert http.post("/api/v1/datasets/upload", files={"file": ("fake.xls", b"plain text", "application/octet-stream")}).status_code == 422
        # Empty 0-byte CSV and header-only 0-row CSV
        assert http.post("/api/v1/datasets/upload", files={"file": ("empty.csv", b"", "text/csv")}).status_code == 422
        assert http.post("/api/v1/datasets/upload", files={"file": ("headers_only.csv", b"date,product,revenue\n", "text/csv")}).status_code == 422

        # XXE XML directive inside .xlsx zip rejected
        xxe_zip = BytesIO()
        with ZipFile(xxe_zip, "w") as zf:
            zf.writestr("xl/workbook.xml", '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><workbook/>')
        assert http.post("/api/v1/datasets/upload", files={"file": ("xxe.xlsx", xxe_zip.getvalue(), "application/octet-stream")}).status_code == 422

        # Oversized upload rejected cleanly with 413
        monkeypatch.setattr("backend.app.ingestion.router.MAX_FILE_BYTES", 64)
        monkeypatch.setattr("backend.app.ingestion.parsers.MAX_FILE_BYTES", 64)
        assert http.post("/api/v1/datasets/upload", files={"file": ("big.csv", b"date,revenue\n" + b"2026-01-01,100\n" * 10, "text/csv")}).status_code == 413


def test_data_quality_detection_duplicates_policies_and_error_reports(isolated_env):
    engine, storage, _ = isolated_env
    messy_csv = "\n".join([
        "Date,Product,Revenue,Cost,Profit,Notes",
        "2026-06-01,Widget A,\"₫2.500.000\",1500000,1000000,Clean row 1",
        "02/06/2026,Widget A,\"₫1.200.000\",700000,500000,Inconsistent slash date format",
        "2026-06-01,Widget A,\"₫2.500.000\",1500000,1000000,Clean row 1",  # exact duplicate of row 2
        "2026-02-31,Widget B,500000,300000,200000,=SUM(A1:A2)",          # invalid date + formula payload in raw value
        "2026-06-03,Widget B,bad_num,100000,0,Bad numeric revenue",       # invalid numeric
        "2026-06-04,Widget C,-100,50,-150,Negative credit row",           # negative revenue flagged
        ",Widget D,300000,150000,150000,Missing date row",                # missing required date
        "2026-06-05,Widget E,1000000,400000,900000,Mismatched profit check",  # profit != rev - cost accuracy warning
    ]).encode("utf-8")

    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "Quality Corp"}).json()
        cid = comp["id"]
        hdr = {"X-Company-ID": cid}

        up = http.post("/api/v1/datasets/upload", headers=hdr, files={"file": ("messy.csv", messy_csv, "text/csv")}).json()
        ds_id = up["dataset"]["id"]
        sugg = up["mapping_suggestions"]["suggested_mapping"]

        # Unmapped required field blocked
        bad_map = {k: ("__ignore__" if v == "revenue" else v) for k, v in sugg.items()}
        assert http.post(f"/api/v1/datasets/{ds_id}/mapping", headers=hdr, json={"mappings": bad_map, "confirmed": True}).status_code == 422

        # Save complete confirmed mapping
        assert http.post(f"/api/v1/datasets/{ds_id}/mapping", headers=hdr, json={"mappings": sugg, "confirmed": True}).status_code == 200

        # Validate: detects missing values, invalid dates/numbers, duplicates, mixed date formats, profit mismatch
        val = http.post(f"/api/v1/datasets/{ds_id}/validate", headers=hdr, json={"duplicate_policy": "deduplicate"}).json()
        q = val["quality_report"]
        assert q["total_rows"] == 8
        assert q["invalid_rows"] == 4
        assert q["valid_rows"] == 4
        assert q["duplicate_records"] >= 1
        assert q["inconsistent_date_formats"]
        assert q["cleaning_summary"]["deduplicated_rows"] == 1
        assert q["cleaning_summary"]["skipped_invalid_rows"] == 4
        assert q["cleaning_summary"]["importable_rows"] == 3
        assert q["detected_currency"] == "VND"
        assert set(q["dimensions"].keys()) == {"completeness", "validity", "consistency", "uniqueness", "accuracy"}

        # Download CSV and JSON error reports & verify formula injection protection
        err_csv = http.get(f"/api/v1/datasets/{ds_id}/error-report?format=csv", headers=hdr)
        assert err_csv.status_code == 200
        assert "invalid_date" in err_csv.text
        assert "duplicate_record" in err_csv.text
        assert "profit_mismatch" in err_csv.text

        err_json = http.get(f"/api/v1/datasets/{ds_id}/error-report?format=json", headers=hdr)
        assert err_json.status_code == 200
        assert len(err_json.json()["issues"]) >= 5

        # fail_on_error policy rejects import cleanly
        fail_imp = http.post(
            f"/api/v1/datasets/{ds_id}/import",
            headers=hdr,
            json={"confirmed": True, "invalid_row_policy": "fail_on_error", "duplicate_policy": "deduplicate"},
        )
        assert fail_imp.status_code == 422

        # Explicit skip_invalid + deduplicate imports cleanly after confirmation
        ok_imp = http.post(
            f"/api/v1/datasets/{ds_id}/import",
            headers=hdr,
            json={"confirmed": True, "invalid_row_policy": "skip_invalid", "duplicate_policy": "deduplicate"},
        )
        assert ok_imp.status_code == 200
        assert ok_imp.json()["imported_counts"]["sales_transactions"] == 3


def test_atomic_rollback_on_mid_import_failure(isolated_env, monkeypatch):
    engine, storage, _ = isolated_env
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "Rollback Safe Co"}).json()
        cid = comp["id"]
        hdr = {"X-Company-ID": cid}

        # Import initial good dataset 1 so company has an active dataset
        up1 = http.post("/api/v1/datasets/upload", headers=hdr, files={"file": ("good1.csv", _sales_csv(days=10), "text/csv")}).json()
        ds1 = up1["dataset"]["id"]
        http.post(f"/api/v1/datasets/{ds1}/mapping", headers=hdr, json={"mappings": up1["mapping_suggestions"]["suggested_mapping"], "confirmed": True})
        assert http.post(f"/api/v1/datasets/{ds1}/import", headers=hdr, json={"confirmed": True}).status_code == 200

        # Upload dataset 2
        up2 = http.post("/api/v1/datasets/upload", headers=hdr, files={"file": ("good2.csv", _sales_csv(days=10, start_date=date(2026, 7, 1)), "text/csv")}).json()
        ds2 = up2["dataset"]["id"]
        http.post(f"/api/v1/datasets/{ds2}/mapping", headers=hdr, json={"mappings": up2["mapping_suggestions"]["suggested_mapping"], "confirmed": True})

        # Simulate database failure mid-import
        def boom(*args, **kwargs):
            raise RuntimeError("Simulated mid-import storage fault")

        monkeypatch.setattr("backend.app.ingestion.service._insert_partitioned_rows", boom)
        res = http.post(f"/api/v1/datasets/{ds2}/import", headers=hdr, json={"confirmed": True})
        assert res.status_code == 500

        # Verify atomic rollback: zero rows leaked into ds2, active dataset remains ds1, status='failed' logged
        with engine.connect() as conn:
            ds2_rows = conn.scalar(
                sa.select(sa.func.count()).select_from(tenant_transactions).where(
                    tenant_transactions.c.company_id == cid, tenant_transactions.c.dataset_id == ds2
                )
            )
            assert ds2_rows == 0
        assert http.get("/dataset", headers=hdr).json()["dataset_id"] == ds1
        ds2_detail = http.get(f"/api/v1/datasets/{ds2}", headers=hdr).json()
        assert ds2_detail["status"] == "failed"
        hist = http.get(f"/api/v1/datasets/{ds2}/history", headers=hdr).json()["items"]
        assert any(h["stage"] == "import" and h["status"] == "failed" and "Simulated mid-import" in (h["error_message"] or "") for h in hist)


def test_minimal_partial_dataset_and_large_scale_and_switch_delete(isolated_env):
    engine, storage, art_dir = isolated_env
    # Minimal schema CSV: only Date, Product, Revenue over 14 days (no Cost/Profit, Marketing, Inventory, Customer, Region)
    minimal_lines = ["day,item_name,turnover"]
    for i in range(14):
        minimal_lines.append(f"{(date(2026, 9, 1) + timedelta(days=i)).isoformat()},MinimalSKU,{(100 + i * 5):.2f}")
    minimal_csv = "\n".join(minimal_lines).encode("utf-8")

    # Large CSV: 10,000 rows over 20 days
    large_lines = ["date,product,revenue"]
    for i in range(10_000):
        d = (date(2026, 8, 1) + timedelta(days=i % 20)).isoformat()
        large_lines.append(f"{d},BulkItem_{i % 25},{10 + (i % 40):.2f}")
    large_csv = "\n".join(large_lines).encode("utf-8")

    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "MultiDS Corp"}).json()
        cid = comp["id"]
        hdr = {"X-Company-ID": cid}

        # Import minimal CSV
        up_m = http.post("/api/v1/datasets/upload", headers=hdr, files={"file": ("minimal.csv", minimal_csv, "text/csv")}).json()
        m_id = up_m["dataset"]["id"]
        http.post(
            f"/api/v1/datasets/{m_id}/mapping",
            headers=hdr,
            json={"mappings": up_m["mapping_suggestions"]["suggested_mapping"], "confirmed": True, "save_template": True},
        )
        imp_m = http.post(f"/api/v1/datasets/{m_id}/import", headers=hdr, json={"confirmed": True}).json()
        assert imp_m["model_ready"] is True

        # Partial capabilities propagate gracefully (no fake zero profit or fake stock)
        kpi_m = http.get("/kpi/summary", headers=hdr).json()
        assert kpi_m["summary"]["revenue"] > 0
        assert kpi_m["summary"]["gross_profit"] is None
        assert kpi_m["summary"]["roas"] is None
        assert kpi_m["summary"]["inventory_availability"] is None
        assert http.post("/forecast", headers=hdr, json={"target": "revenue", "horizon": 7}).status_code == 200
        assert http.post("/simulate", headers=hdr, json={"type": "price", "parameters": {"product": "MinimalSKU"}}).status_code == 200

        # Upload & import 10,000-row dataset & reuse saved template signature
        up_l = http.post("/api/v1/datasets/upload", headers=hdr, files={"file": ("large.csv", large_csv, "text/csv")}).json()
        l_id = up_l["dataset"]["id"]
        assert up_l["dataset"]["row_count"] == 10_000
        assert http.post(f"/api/v1/datasets/{l_id}/mapping", headers=hdr, json={"mappings": up_l["mapping_suggestions"]["suggested_mapping"], "confirmed": True}).status_code == 200
        imp_l = http.post(f"/api/v1/datasets/{l_id}/import", headers=hdr, json={"confirmed": True, "activate": True}).json()
        assert imp_l["imported_counts"]["sales_transactions"] == 10_000
        assert http.get("/kpi/summary", headers=hdr).json()["summary"]["orders"] == 10_000

        # Switch back to minimal dataset -> dashboard flips cleanly
        assert http.post(f"/api/v1/datasets/{m_id}/activate", headers=hdr).status_code == 200
        assert http.get("/dataset", headers=hdr).json()["dataset_id"] == m_id
        assert http.get("/kpi/summary", headers=hdr).json()["summary"]["orders"] == 14

        # Delete large dataset -> removes DB records, storage prefix, and .joblib artifact
        del_resp = http.delete(f"/api/v1/datasets/{l_id}", headers=hdr).json()
        assert del_resp["deleted"] is True
        assert del_resp["removed_storage_objects"] >= 3
        assert not (art_dir / f"tenant_{cid}__{l_id}.joblib").exists()
        assert http.get(f"/api/v1/datasets/{l_id}", headers=hdr).status_code == 404


def test_strict_multi_tenant_isolation_rbac_and_connectors(isolated_env, monkeypatch):
    engine, storage, _ = isolated_env
    # Provision Company Alpha and Company Beta in platform mode first
    with TestClient(create_app(engine, storage=storage)) as setup_http:
        alpha = setup_http.post("/api/v1/companies", json={"name": "Alpha Inc"}).json()["id"]
        beta = setup_http.post("/api/v1/companies", json={"name": "Beta LLC"}).json()["id"]

    tokens = {
        "a-admin" * 6: {"actor": "alpha-admin", "role": "admin", "company_ids": [alpha], "default_company_id": alpha},
        "a-analys" + "0" * 24: {"actor": "alpha-analyst", "role": "analyst", "company_ids": [alpha], "default_company_id": alpha},
        "a-viewer" + "0" * 24: {"actor": "alpha-viewer", "role": "viewer", "company_ids": [alpha], "default_company_id": alpha},
        "b-admin" * 6: {"actor": "beta-admin", "role": "admin", "company_ids": [beta], "default_company_id": beta},
    }
    monkeypatch.setenv("WORKSPACE_ACCESS_TOKENS", json.dumps(tokens))

    h_a_admin = {"Authorization": f"Bearer {'a-admin' * 6}", "X-Company-ID": alpha}
    h_a_analyst = {"Authorization": f"Bearer a-analys{'0' * 24}", "X-Company-ID": alpha}
    h_a_viewer = {"Authorization": f"Bearer a-viewer{'0' * 24}", "X-Company-ID": alpha}
    h_b_admin = {"Authorization": f"Bearer {'b-admin' * 6}", "X-Company-ID": beta}

    with TestClient(create_app(engine, storage=storage)) as http:
        # Viewer cannot upload or mutate
        assert http.post("/api/v1/datasets/upload", headers=h_a_viewer, files={"file": ("a.csv", _sales_csv(days=10), "text/csv")}).status_code == 403
        # Alpha analyst uploads, saves template, confirms & imports
        up = http.post("/api/v1/datasets/upload", headers=h_a_analyst, files={"file": ("alpha.csv", _sales_csv(days=10), "text/csv")}).json()
        a_ds_id = up["dataset"]["id"]
        http.post(
            f"/api/v1/datasets/{a_ds_id}/mapping",
            headers=h_a_analyst,
            json={"mappings": up["mapping_suggestions"]["suggested_mapping"], "confirmed": True, "save_template": True, "template_name": "Alpha Tpl"},
        )
        assert http.post(f"/api/v1/datasets/{a_ds_id}/validate", headers=h_a_analyst, json={}).status_code == 200
        assert http.post(f"/api/v1/datasets/{a_ds_id}/import", headers=h_a_analyst, json={"confirmed": True}).status_code == 200

        # Analyst cannot delete dataset or create companies (admin only)
        assert http.delete(f"/api/v1/datasets/{a_ds_id}", headers=h_a_analyst).status_code == 403
        assert http.post("/api/v1/companies", headers=h_a_analyst, json={"name": "Rogue Co"}).status_code == 403

        # Alpha user cannot pass X-Company-ID: beta
        assert http.get("/api/v1/datasets", headers={**h_a_admin, "X-Company-ID": beta}).status_code == 403
        # Beta admin sees zero Alpha datasets and cannot touch Alpha dataset ID across all endpoints
        assert http.get("/api/v1/datasets", headers=h_b_admin).json()["items"] == []
        assert http.get(f"/api/v1/datasets/{a_ds_id}", headers=h_b_admin).status_code == 403
        assert http.post(f"/api/v1/datasets/{a_ds_id}/preview", headers=h_b_admin, json={}).status_code == 403
        assert http.post(f"/api/v1/datasets/{a_ds_id}/mapping", headers=h_b_admin, json={"mappings": {}, "confirmed": False}).status_code == 403
        assert http.post(f"/api/v1/datasets/{a_ds_id}/validate", headers=h_b_admin, json={}).status_code == 403
        assert http.post(f"/api/v1/datasets/{a_ds_id}/import", headers=h_b_admin, json={"confirmed": True}).status_code == 403
        assert http.get(f"/api/v1/datasets/{a_ds_id}/quality", headers=h_b_admin).status_code == 403
        assert http.get(f"/api/v1/datasets/{a_ds_id}/error-report", headers=h_b_admin).status_code == 403
        assert http.get(f"/api/v1/datasets/{a_ds_id}/history", headers=h_b_admin).status_code == 403
        assert http.post(f"/api/v1/datasets/{a_ds_id}/activate", headers=h_b_admin).status_code == 403
        assert http.delete(f"/api/v1/datasets/{a_ds_id}", headers=h_b_admin).status_code == 403
        assert http.get("/kpi/summary", headers={**h_b_admin, "X-Dataset-ID": a_ds_id}).status_code == 403
        beta_audit = http.get("/audit", headers=h_b_admin).json()["rows"]
        assert all(ev.get("company_id") == beta for ev in beta_audit)
        assert not any(ev.get("kind") in {"query", "dataset_loaded", "recommendation_feedback", "scenario_feedback"} for ev in beta_audit)

        # Connectors registry & password redaction on data sources
        connectors = http.get("/api/v1/connectors", headers=h_b_admin).json()["items"]
        assert {c["connector_type"] for c in connectors} == {"file_upload", "postgresql", "sql_server", "mysql", "rest_api", "erp_crm_pos"}
        ds_create = http.post(
            "/api/v1/data-sources",
            headers=h_b_admin,
            json={
                "name": "Warehouse PG",
                "source_type": "postgresql",
                "config": {
                    "host": "db.beta.internal",
                    "port": 5432,
                    "database": "erp",
                    "table_or_view": "fct_orders",
                    "username": "bi_ro",
                    "password": "super-secret-password",
                },
            },
        )
        assert ds_create.status_code == 201
        assert ds_create.json()["config"]["password"] == "***redacted***"
        assert http.post(
            "/api/v1/data-sources/test",
            headers=h_b_admin,
            json={"source_type": "file_upload", "config": {}},
        ).json()["status"] == "ready"
        assert http.post(
            "/api/v1/data-sources/test",
            headers=h_b_admin,
            json={"source_type": "rest_api", "config": {"base_url": "https://api.example.com/v1/sales"}},
        ).json()["status"] == "adapter_configured"
        assert http.post(
            "/api/v1/data-sources/test",
            headers=h_b_admin,
            json={"source_type": "rest_api", "config": {"base_url": "ftp://invalid"}},
        ).json()["status"] == "invalid_config"
