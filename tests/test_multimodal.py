"""Comprehensive real-execution tests for Multimodal Ingestion, OCR, Media Caps, HITL Gate, Live Connectors, Security & Shredding."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
import math
import threading
import wave

from alembic import command
from alembic.config import Config
import cv2
from docx import Document as DocxDocument
from fastapi.testclient import TestClient
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
import pymupdf
import pytest
import sqlalchemy as sa

from backend.app.db import ROOT, data_sources, make_engine
from backend.app.ingestion.storage import LocalObjectStorage
from backend.app.main import create_app
from backend.app.multimodal.security import EICAR_SIGNATURE, decrypt_secrets


@pytest.fixture()
def mm_env(tmp_path, monkeypatch):
    db_path = tmp_path / "mm_test.sqlite"
    db_url = f"sqlite:///{db_path}"
    store_dir = tmp_path / "obj_store"
    art_dir = tmp_path / "artifacts"
    art_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("LLM_PROVIDER", "none")
    monkeypatch.setenv("INGESTION_STORAGE_DIR", str(store_dir))
    monkeypatch.setenv("INGESTION_SIGNING_SECRET", "test-mm-signing-secret-key")
    monkeypatch.setenv("CONNECTOR_ALLOW_PRIVATE_NETWORK", "false")
    monkeypatch.delenv("INGESTION_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("WORKSPACE_ACCESS_TOKENS", raising=False)
    monkeypatch.setattr("backend.app.db.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.services.ARTIFACTS", art_dir)
    monkeypatch.setattr("backend.app.ingestion.service.ARTIFACTS", art_dir)
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    engine = make_engine(db_url)
    storage = LocalObjectStorage(store_dir)
    yield engine, storage, art_dir, store_dir
    engine.dispose()


def _make_png_invoice(lines: list[str], *, width: int = 1100, height: int = 560) -> bytes:
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=30)
    y = 28
    for line in lines:
        draw.text((32, y), line, fill="black", font=font)
        y += 48
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_mixed_pdf() -> bytes:
    """Create a genuine 2-page PDF: Page 1 has selectable text, Page 2 is an image-only scanned page."""
    doc = pymupdf.open()
    p1 = doc.new_page(width=612, height=792)
    p1.insert_text(
        (50, 72),
        (
            "Quarterly Sales Report\n"
            "Invoice #INV-9001\n"
            "Date: 2026-07-15\n"
            "Product: NeuralEdge Gateway\n"
            "Customer: Delta Enterprises\n"
            "Region: Hanoi\n"
            "Channel: B2B\n"
            "Quantity: 3\n"
            "Grand Total: $1,500.00\n"
            "Cost: $900.00\n"
        ),
        fontsize=14,
    )
    p2 = doc.new_page(width=800, height=450)
    scan_png = _make_png_invoice(
        [
            "SCANNED RECEIPT #SCAN-402",
            "Date: 2026-07-16",
            "Product: OpticSensor Mini",
            "Grand Total: $420.00",
        ],
        width=900,
        height=320,
    )
    p2.insert_image(pymupdf.Rect(30, 40, 760, 320), stream=scan_png)
    return doc.tobytes()


def _make_docx_with_table() -> bytes:
    doc = DocxDocument()
    doc.add_paragraph("Executive Retail Briefing - Region: Da Nang - Date: 2026-07-18")
    tbl = doc.add_table(rows=2, cols=6)
    headers = ["Date", "Product", "Category", "Quantity", "Revenue", "Cost"]
    row1 = ["2026-07-18", "VisionGate Cam", "Security", "4", "$1,200.00", "$700.00"]
    for idx, h in enumerate(headers):
        tbl.cell(0, idx).text = h
        tbl.cell(1, idx).text = row1[idx]
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_pptx_with_table() -> bytes:
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = "APAC Channel Expansion Brief"
    shape = slide.shapes.add_table(2, 4, 500_000, 1_800_000, 7_500_000, 1_500_000)
    t = shape.table
    for idx, col in enumerate(["Date", "Product", "Quantity", "Revenue"]):
        t.cell(0, idx).text = col
    for idx, val in enumerate(["2026-07-20", "EdgeRouter X1", "5", "$850.00"]):
        t.cell(1, idx).text = val
    slide.notes_slide.notes_text_frame.text = "Channel expansion verified by regional lead."
    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _make_avi_video(tmp_path, *, seconds: int = 8, fps: int = 10) -> bytes:
    path = tmp_path / "sample_ops.avi"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (320, 180))
    assert writer.isOpened()
    try:
        total = seconds * fps
        for i in range(total):
            frame = np.full((180, 320, 3), 245, dtype=np.uint8)
            color = (20 + (i * 2) % 180, 80, 190 - (i % 120))
            cv2.rectangle(frame, (20, 30), (140 + (i % 100), 140), color, -1)
            writer.write(frame)
    finally:
        writer.release()
    return path.read_bytes()


def _make_wav_audio(*, sample_rate: int = 16000, duration_sec: float = 3.0) -> bytes:
    buf = BytesIO()
    total_samples = int(sample_rate * duration_sec)
    frames = bytearray()
    for n in range(total_samples):
        t = n / float(sample_rate)
        # First 1.6s strong 440Hz signal; remaining time near silence
        amp = 14000.0 if t < 1.6 else 20.0
        sample = int(amp * math.sin(2.0 * math.pi * 440.0 * t))
        frames += sample.to_bytes(2, byteorder="little", signed=True)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(frames))
    return buf.getvalue()


def test_multimodal_xml_and_documents_pdf_docx_pptx_txt(mm_env):
    engine, storage, _, _ = mm_env
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "MultiDoc Corp"}).json()
        cid = comp["id"]
        hdr = {"X-Company-ID": cid}

        xml_payload = (
            b'<?xml version="1.0" encoding="utf-8"?>'
            b"<transactions>"
            b"<record><OrderDate>2026-07-01</OrderDate><Product>SmartHub XML</Product><Category>IoT</Category>"
            b"<Quantity>2</Quantity><Revenue>450.00</Revenue><Cost>200.00</Cost><Customer>Apex Co</Customer>"
            b"<Region>HCMC</Region><Channel>Online</Channel></record>"
            b"<record><OrderDate>2026-07-08</OrderDate><Product>SmartHub XML</Product><Category>IoT</Category>"
            b"<Quantity>3</Quantity><Revenue>675.00</Revenue><Cost>300.00</Cost><Customer>Beta Co</Customer>"
            b"<Region>Hanoi</Region><Channel>B2B</Channel></record>"
            b"<record><OrderDate>2026-07-12</OrderDate><Product>SensorGrid</Product><Category>IoT</Category>"
            b"<Quantity>1</Quantity><Revenue>325.00</Revenue><Cost>125.00</Cost><Customer>Gamma Co</Customer>"
            b"<Region>HCMC</Region><Channel>Retail</Channel></record>"
            b"</transactions>"
        )
        pdf_payload = _make_mixed_pdf()
        docx_payload = _make_docx_with_table()
        pptx_payload = _make_pptx_with_table()
        txt_payload = (
            "Date | Product | Category | Quantity | Revenue | Cost\n"
            "2026-07-22 | CloudGateway | Networking | 2 | $600.00 | $310.00\n"
        ).encode("utf-8")

        up = http.post(
            "/api/v1/multimodal/upload",
            headers=hdr,
            data={"dataset_name": "July Docs & XML Batch", "privacy_notice_accepted": "true"},
            files=[
                ("files", ("orders.xml", xml_payload, "application/xml")),
                ("files", ("q3_mixed.pdf", pdf_payload, "application/pdf")),
                ("files", ("briefing.docx", docx_payload, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
                ("files", ("slides.pptx", pptx_payload, "application/vnd.openxmlformats-officedocument.presentationml.presentation")),
                ("files", ("notes.txt", txt_payload, "text/plain")),
            ],
        )
        assert up.status_code == 202
        body = up.json()
        assert len(body["files"]) == 5
        assert len(body["jobs"]) == 5

        http.app.state.multimodal_job_queue.wait_all(timeout=35.0)

        # Before human confirmation, BI remains unpopulated (503 empty company workspace)
        assert http.get("/kpi/summary", headers=hdr).status_code == 503

        files_by_fmt = {
            f["file_format"]: f for f in http.get("/api/v1/files", headers=hdr).json()["items"]
        }
        assert set(files_by_fmt.keys()) == {"xml", "pdf", "docx", "pptx", "txt"}
        for fmt, fobj in files_by_fmt.items():
            assert fobj["processing_status"] == "awaiting_approval", f"{fmt} status={fobj['processing_status']}"

        pdf_meta = files_by_fmt["pdf"]["source_metadata"]
        assert pdf_meta["page_count"] == 2
        if "windows_winrt_ocr" in (pdf_meta.get("ocr_engines") or []):
            assert 2 in pdf_meta["scanned_ocr_pages"]

        pptx_exts = http.get(f"/api/v1/files/{files_by_fmt['pptx']['id']}/extractions", headers=hdr).json()["items"]
        assert any(rec["source_location"].get("slide") == 1 for rec in pptx_exts)

        docx_exts = http.get(f"/api/v1/files/{files_by_fmt['docx']['id']}/extractions", headers=hdr).json()["items"]
        assert any(rec["effective_data"].get("product") == "VisionGate Cam" for rec in docx_exts)

        # Approve XML + DOCX + PPTX + PDF (use approve_below_threshold where OCR lines sit < 0.8)
        for fmt in ("xml", "docx", "pptx", "pdf", "txt"):
            fid = files_by_fmt[fmt]["id"]
            res = http.post(
                f"/api/v1/files/{fid}/approve-import",
                headers=hdr,
                json={"confirmed": True, "approve_below_threshold": True, "activate": True, "currency": "USD"},
            )
            assert res.status_code == 200, f"approve failed for {fmt}: {res.text}"

        ds_info = http.get("/dataset", headers=hdr).json()
        kpi = http.get("/kpi/summary", headers=hdr, params={"start": ds_info["start"], "end": ds_info["end"]}).json()
        # XML (1450) + DOCX (1200) + PPTX (850) + TXT (600) + PDF (>= 1500) -> >= $5,600 verified revenue
        assert kpi["summary"]["revenue"] >= 5600.0
        assert "tenant_multimodal_insights" in kpi["sources"]
        assert len(kpi["multimodal_insights"]) >= 1


def test_image_ocr_and_mandatory_hitl_edit_gate(mm_env):
    engine, storage, _, _ = mm_env
    with TestClient(create_app(engine, storage=storage)) as http:
        comp = http.post("/api/v1/companies", json={"name": "InvoiceOCR Co"}).json()
        cid = comp["id"]
        hdr = {"X-Company-ID": cid}

        invoice_png = _make_png_invoice(
            [
                "INVOICE #INV-7788",
                "Date: 2026-08-15",
                "Product: QuantumPOS Pro",
                "Customer: Horizon Mart",
                "Region: HCMC",
                "Channel: Retail",
                "Quantity: 2",
                "Grand Total: $1,250.00",
                "Cost: $700.00",
            ]
        )
        up = http.post(
            "/api/v1/multimodal/upload",
            headers=hdr,
            data={"confidence_threshold": "0.92", "privacy_notice_accepted": "true"},
            files=[("files", ("invoice_7788.png", invoice_png, "image/png"))],
        )
        assert up.status_code == 202
        fid = up.json()["files"][0]["id"]
        http.app.state.multimodal_job_queue.wait_all(timeout=35.0)

        ext_bundle = http.get(f"/api/v1/files/{fid}/extractions", headers=hdr).json()
        assert ext_bundle["count"] >= 1
        rec = ext_bundle["items"][0]
        # Honest OCR engine below 0.92 threshold flags record for review
        assert rec["below_threshold"] is True
        assert rec["needs_human_review"] is True

        # BI MUST remain empty before confirmation
        assert http.get("/kpi/summary", headers=hdr).status_code == 503

        # Guardrail 1: confirmed=False blocked 422
        assert http.post(f"/api/v1/files/{fid}/approve-import", headers=hdr, json={"confirmed": False}).status_code == 422
        # Guardrail 2: below-threshold record cannot be imported silently without edit or override
        assert (
            http.post(
                f"/api/v1/files/{fid}/approve-import",
                headers=hdr,
                json={"confirmed": True, "approve_below_threshold": False},
            ).status_code
            == 422
        )

        # Human inspects OCR provenance and corrects amount + date explicitly
        patched = http.patch(
            f"/api/v1/extractions/{rec['id']}",
            headers=hdr,
            json={
                "corrected_data": {
                    "date": "2026-08-15",
                    "product": "QuantumPOS Pro",
                    "revenue": 1300.0,
                    "cost": 700.0,
                    "quantity": 2,
                    "customer": "Horizon Mart",
                    "region": "HCMC",
                    "channel": "Retail",
                    "title": "Invoice #INV-7788 · QuantumPOS Pro",
                },
                "validation_status": "edited",
            },
        )
        assert patched.status_code == 200
        p_body = patched.json()
        assert p_body["validation_status"] == "edited"
        assert p_body["effective_data"]["revenue"] == 1300.0
        assert any(h.get("action") == "human_correction" for h in p_body["transformation_history"])

        # Now human confirms import into BI
        imp = http.post(
            f"/api/v1/files/{fid}/approve-import",
            headers=hdr,
            json={"confirmed": True, "activate": True, "currency": "USD"},
        )
        assert imp.status_code == 200
        assert imp.json()["promoted_financial_rows"] == 1
        assert imp.json()["promoted_insights"] == 1

        ds_info = http.get("/dataset", headers=hdr).json()
        kpi = http.get("/kpi/summary", headers=hdr, params={"start": ds_info["start"], "end": ds_info["end"]}).json()
        assert kpi["summary"]["revenue"] == pytest.approx(1300.0)
        assert kpi["summary"]["gross_profit"] == pytest.approx(600.0)

        ask_mm = http.post("/query", headers=hdr, json={"question": "Summarize uploaded invoice documents"})
        assert ask_mm.status_code == 200
        assert "tenant_multimodal_insights" in ask_mm.json()["trace"]["sources"]
        assert "QuantumPOS" in ask_mm.json()["answer"]


def test_video_caps_audio_honest_stt_and_signed_urls(mm_env, tmp_path, monkeypatch):
    engine, storage, _, _ = mm_env
    with TestClient(create_app(engine, storage=storage)) as setup_http:
        comp_a = setup_http.post("/api/v1/companies", json={"name": "Alpha Media Co"}).json()["id"]

    tok_a = "mm-admin-a" + "0" * 24
    tokens = json.dumps({
        tok_a: {"role": "admin", "actor": "alpha-admin", "company_ids": [comp_a], "default_company_id": comp_a},
    })
    monkeypatch.setenv("WORKSPACE_ACCESS_TOKENS", tokens)
    hdr_a = {"Authorization": f"Bearer {tok_a}", "X-Company-ID": comp_a}

    with TestClient(create_app(engine, storage=storage)) as http:
        avi_bytes = _make_avi_video(tmp_path, seconds=8, fps=10)
        wav_bytes = _make_wav_audio(duration_sec=3.0)

        up = http.post(
            "/api/v1/multimodal/upload",
            headers=hdr_a,
            data={"max_frames": "3", "sampling_interval_sec": "2", "privacy_notice_accepted": "true"},
            files=[
                ("files", ("store_cam.avi", avi_bytes, "video/x-msvideo")),
                ("files", ("briefing.wav", wav_bytes, "audio/wav")),
            ],
        )
        assert up.status_code == 202
        http.app.state.multimodal_job_queue.wait_all(timeout=30.0)

        items = {f["modality"]: f for f in http.get("/api/v1/files", headers=hdr_a).json()["items"]}
        v_file = items["video"]
        a_file = items["audio"]

        frames = v_file["source_metadata"]["sampled_frames"]
        assert 1 <= len(frames) <= 3  # Bounded frame cap respected
        assert v_file["source_metadata"]["privacy_metadata"]["facial_recognition_performed"] is False

        # Signed media URL works cleanly in <img src> WITHOUT Authorization header
        signed_url = frames[0]["signed_url"]
        assert http.get(signed_url).status_code == 200
        # Tampered token rejected with 401
        assert http.get(signed_url[:-4] + "0000").status_code == 401
        # Traversal subkey rejected with 422
        assert http.get(f"/api/v1/files/{v_file['id']}/content?subkey=../raw&token=abc").status_code == 422

        # Audio metadata genuine + honest partial STT status
        assert a_file["source_metadata"]["duration_sec"] == pytest.approx(3.0, abs=0.05)
        assert len(a_file["source_metadata"]["active_energy_windows"]) >= 1
        assert a_file["source_metadata"]["stt_status"] == "stt_engine_unavailable"
        assert a_file["extraction_status"] == "partial"

        a_exts = http.get(f"/api/v1/files/{a_file['id']}/extractions", headers=hdr_a).json()["items"]
        assert a_exts[0]["effective_data"]["transcript"] == ""
        assert a_exts[0]["effective_data"]["sentiment"] == "sentiment_unverified"

        # Human supplies manual transcript and approves both video + audio insights
        http.patch(
            f"/api/v1/extractions/{a_exts[0]['id']}",
            headers=hdr_a,
            json={"corrected_data": {"transcript": "Confirmed Q3 promo shift for online channel."}},
        )
        assert (
            http.post(
                f"/api/v1/files/{v_file['id']}/approve-import",
                headers=hdr_a,
                json={"confirmed": True, "approve_below_threshold": True},
            ).status_code
            == 200
        )
        assert (
            http.post(
                f"/api/v1/files/{a_file['id']}/approve-import",
                headers=hdr_a,
                json={"confirmed": True},
            ).status_code
            == 200
        )
        insights = http.get("/api/v1/insights", headers=hdr_a).json()["items"]
        assert {i["modality"] for i in insights} >= {"video", "audio"}


def test_security_spoofing_xxe_ssrf_and_fernet_encryption(mm_env):
    engine, storage, _, _ = mm_env
    with TestClient(create_app(engine, storage=storage)) as http:
        hdr = {"X-Company-ID": "comp-default"}

        # Reject executable / EICAR / spoofed signatures / XXE
        assert http.post("/api/v1/multimodal/upload", headers=hdr, files=[("files", ("fake.png", b"MZ\x90\x00exe", "image/png"))]).status_code == 422
        assert http.post("/api/v1/multimodal/upload", headers=hdr, files=[("files", ("virus.txt", EICAR_SIGNATURE, "text/plain"))]).status_code == 422
        assert http.post("/api/v1/multimodal/upload", headers=hdr, files=[("files", ("fake.mp4", b"not-an-mp4-atom", "video/mp4"))]).status_code == 422
        assert http.post("/api/v1/multimodal/upload", headers=hdr, files=[("files", ("empty.pdf", b"", "application/pdf"))]).status_code == 422
        xxe_xml = b'<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r>'
        assert http.post("/api/v1/multimodal/upload", headers=hdr, files=[("files", ("xxe.xml", xxe_xml, "application/xml"))]).status_code == 422

        # Fernet encryption of secrets at rest
        created = http.post(
            "/api/v1/data-sources",
            headers=hdr,
            json={
                "name": "Secure REST ERP",
                "source_type": "rest_api",
                "config": {"base_url": "https://api.example.com/v1/orders", "api_token": "super-secret-token-99"},
            },
        )
        assert created.status_code == 201
        src = created.json()
        assert src["config"]["api_token"] == "***redacted***"
        assert src["has_encrypted_secrets"] is True

        with engine.connect() as conn:
            row = conn.execute(sa.select(data_sources).where(data_sources.c.id == src["id"])).mappings().one()
            raw_enc = row["encrypted_secrets_json"] or ""
            assert "super-secret-token-99" not in raw_enc
            assert raw_enc.startswith("gAAAA")
            assert decrypt_secrets(raw_enc)["api_token"] == "super-secret-token-99"

        # SSRF protection on live probe
        for bad_url in ("http://127.0.0.1:8080/orders", "http://169.254.169.254/latest/meta-data"):
            probe = http.post(
                "/api/v1/data-sources/test",
                headers=hdr,
                json={"source_type": "rest_api", "config": {"base_url": bad_url}, "live_probe": True},
            ).json()
            assert probe["ok"] is False
            assert probe["status"] == "blocked_url"


def test_live_rest_connector_discovery_and_incremental_sync(mm_env, monkeypatch):
    engine, storage, _, _ = mm_env
    store_records = [
        {"updated_at": "2026-09-01T10:00:00Z", "date": "2026-09-01", "product": "RestSku A", "quantity": 2, "revenue": 400.0},
        {"updated_at": "2026-09-02T12:00:00Z", "date": "2026-09-02", "product": "RestSku B", "quantity": 1, "revenue": 250.0},
    ]

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            if self.headers.get("Authorization") != "Bearer live-rest-secret":
                self.send_response(401)
                self.end_headers()
                return
            body = json.dumps({"records": store_records}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):  # noqa: A002
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("CONNECTOR_ALLOW_PRIVATE_NETWORK", "true")

    try:
        with TestClient(create_app(engine, storage=storage)) as http:
            comp = http.post("/api/v1/companies", json={"name": "SyncCorp"}).json()
            hdr = {"X-Company-ID": comp["id"]}

            src = http.post(
                "/api/v1/data-sources",
                headers=hdr,
                json={
                    "name": "Local ERP REST",
                    "source_type": "rest_api",
                    "config": {
                        "base_url": f"http://127.0.0.1:{port}/orders",
                        "auth_type": "bearer",
                        "api_token": "live-rest-secret",
                        "watermark_column": "updated_at",
                    },
                },
            ).json()
            sid = src["id"]

            probe = http.post(f"/api/v1/data-sources/{sid}/test", headers=hdr).json()
            assert probe["ok"] is True
            assert probe["status"] == "connected"
            assert probe["sample_records"] == 2

            disc = http.post(f"/api/v1/data-sources/{sid}/discover", headers=hdr).json()
            assert disc["sample_count"] == 2
            assert {c["column_name"] for c in disc["columns"]} >= {"updated_at", "product", "revenue"}

            s1 = http.post(f"/api/v1/data-sources/{sid}/sync", headers=hdr, json={}).json()
            assert s1["sync_mode"] == "full_initial"
            assert s1["records_fetched"] == 2
            assert s1["watermark_after"] == "2026-09-02T12:00:00Z"

            store_records.append(
                {"updated_at": "2026-09-03T09:30:00Z", "date": "2026-09-03", "product": "RestSku C", "quantity": 3, "revenue": 900.0}
            )
            s2 = http.post(f"/api/v1/data-sources/{sid}/sync", headers=hdr, json={}).json()
            assert s2["sync_mode"] == "incremental"
            assert s2["records_fetched"] == 1
            assert s2["watermark_after"] == "2026-09-03T09:30:00Z"

            logs = http.get(f"/api/v1/data-sources/{sid}/sync-logs", headers=hdr).json()["items"]
            assert len(logs) == 2
            assert all(lg["status"] == "completed" for lg in logs)
    finally:
        server.shutdown()
        server.server_close()


def test_job_retry_tenant_isolation_rbac_and_permanent_shred(mm_env, monkeypatch):
    engine, storage, _, _ = mm_env
    with TestClient(create_app(engine, storage=storage)) as setup_http:
        comp_a = setup_http.post("/api/v1/companies", json={"name": "Alpha Security Co"}).json()["id"]
        comp_b = setup_http.post("/api/v1/companies", json={"name": "Beta Security Co"}).json()["id"]

    tok_admin_a = "mm-admin-a" + "0" * 24
    tok_analyst_a = "mm-analy-a" + "0" * 24
    tok_viewer_a = "mm-viewr-a" + "0" * 24
    tok_admin_b = "mm-admin-b" + "0" * 24
    tokens = json.dumps({
        tok_admin_a: {"role": "admin", "actor": "alpha-admin", "company_ids": [comp_a], "default_company_id": comp_a},
        tok_analyst_a: {"role": "analyst", "actor": "alpha-analyst", "company_ids": [comp_a], "default_company_id": comp_a},
        tok_viewer_a: {"role": "viewer", "actor": "alpha-viewer", "company_ids": [comp_a], "default_company_id": comp_a},
        tok_admin_b: {"role": "admin", "actor": "beta-admin", "company_ids": [comp_b], "default_company_id": comp_b},
    })
    monkeypatch.setenv("WORKSPACE_ACCESS_TOKENS", tokens)

    h_admin_a = {"Authorization": f"Bearer {tok_admin_a}", "X-Company-ID": comp_a}
    h_analyst_a = {"Authorization": f"Bearer {tok_analyst_a}", "X-Company-ID": comp_a}
    h_viewer_a = {"Authorization": f"Bearer {tok_viewer_a}", "X-Company-ID": comp_a}
    h_admin_b = {"Authorization": f"Bearer {tok_admin_b}", "X-Company-ID": comp_b}

    with TestClient(create_app(engine, storage=storage)) as http:
        # 1. Viewer RBAC denied on write endpoints
        assert (
            http.post(
                "/api/v1/multimodal/upload",
                headers=h_viewer_a,
                files=[("files", ("v.txt", b"Date: 2026-08-01\nRevenue: $100", "text/plain"))],
            ).status_code
            == 403
        )

        # 2. Failed job + retry recovery
        corrupt_pdf = b"%PDF-1.4\nthis-is-corrupted-body-that-fails-pymupdf"
        up = http.post(
            "/api/v1/multimodal/upload",
            headers=h_analyst_a,
            files=[("files", ("broken.pdf", corrupt_pdf, "application/pdf"))],
        )
        assert up.status_code == 202
        fid = up.json()["files"][0]["id"]
        jid = up.json()["jobs"][0]["id"]
        http.app.state.multimodal_job_queue.wait_all(timeout=20.0)

        job_state = http.get(f"/api/v1/jobs/{jid}", headers=h_admin_a).json()
        assert job_state["status"] == "failed"

        # Repair stored PDF object and retry job
        doc = pymupdf.open()
        page = doc.new_page()
        page.insert_text((50, 72), "Date: 2026-08-19\nProduct: RecoveredItem\nGrand Total: $500.00", fontsize=14)
        with engine.connect() as conn:
            from backend.app.db import multimodal_files

            skey = conn.scalar(sa.select(multimodal_files.c.storage_key).where(multimodal_files.c.id == fid))
        storage.put_bytes(skey, doc.tobytes(), content_type="application/pdf")

        retried = http.post(f"/api/v1/jobs/{jid}/retry", headers=h_analyst_a)
        assert retried.status_code == 200
        http.app.state.multimodal_job_queue.wait_all(timeout=20.0)
        assert http.get(f"/api/v1/jobs/{jid}", headers=h_admin_a).json()["status"] == "completed"
        exts = http.get(f"/api/v1/files/{fid}/extractions", headers=h_admin_a).json()["items"]
        assert len(exts) >= 1

        # 3. Cross-tenant isolation (Comp B cannot view/patch/approve/delete Comp A artifacts)
        assert http.get(f"/api/v1/files/{fid}", headers=h_admin_b).status_code == 403
        assert http.get(f"/api/v1/files/{fid}/extractions", headers=h_admin_b).status_code == 403
        assert http.patch(f"/api/v1/extractions/{exts[0]['id']}", headers=h_admin_b, json={"corrected_data": {"x": 1}}).status_code == 403
        assert http.post(f"/api/v1/files/{fid}/approve-import", headers=h_admin_b, json={"confirmed": True}).status_code == 403
        assert http.post(f"/api/v1/jobs/{jid}/retry", headers=h_admin_b).status_code == 403
        assert http.delete(f"/api/v1/files/{fid}", headers=h_admin_b).status_code == 403

        # 4. Analyst cannot shred files, Admin can permanently shred DB + storage
        assert http.delete(f"/api/v1/files/{fid}", headers=h_analyst_a).status_code == 403
        shred = http.delete(f"/api/v1/files/{fid}", headers=h_admin_a)
        assert shred.status_code == 200
        assert shred.json()["deleted"] is True
        assert shred.json()["removed_storage_objects"] >= 1
        assert http.get(f"/api/v1/files/{fid}", headers=h_admin_a).status_code == 404
        assert not storage.exists(skey)
