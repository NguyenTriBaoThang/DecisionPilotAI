"""Real local OCR (Windows WinRT / Tesseract), opt-in Vision/Text AI, and structured business entity extraction."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from io import BytesIO
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any

import httpx
from PIL import Image, ImageOps

from backend.app.ingestion.quality import parse_flexible_date, parse_numeric_money

log = logging.getLogger(__name__)
WINRT_SCRIPT = Path(__file__).resolve().with_name("_winrt_ocr.ps1")


@dataclass
class OcrResult:
    text: str
    lines: list[str]
    engine: str
    language: str | None = None
    confidence: float | None = None
    warnings: list[str] = field(default_factory=list)


def _normalize_image_for_ocr(image_bytes: bytes) -> bytes:
    with Image.open(BytesIO(image_bytes)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        # Upscale small raster captures so OCR recognizes small invoice/receipt numerals reliably
        if max(w, h) < 1100 and max(w, h) > 0:
            scale = min(3.0, 1200.0 / max(w, h))
            new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        out = BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()


def _run_winrt_ocr(png_bytes: bytes) -> OcrResult | None:
    if sys.platform != "win32" or not WINRT_SCRIPT.is_file():
        return None
    ps = shutil.which("powershell") or shutil.which("pwsh")
    if not ps:
        return None
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
            tf.write(png_bytes)
            tmp_path = tf.name
        proc = subprocess.run(
            [ps, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(WINRT_SCRIPT), "-ImagePath", tmp_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=25,
            check=False,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return None
        payload = json.loads(proc.stdout.strip())
        if payload.get("error"):
            return OcrResult(text="", lines=[], engine="windows_winrt_ocr", warnings=[str(payload["error"])], confidence=0.0)
        raw_lines = [str(item.get("text", "")).strip() for item in (payload.get("lines") or []) if str(item.get("text", "")).strip()]
        raw_text = "\n".join(raw_lines) if raw_lines else str(payload.get("text") or "").strip()
        # Honest confidence heuristic calibrated below 0.90 for OCR
        alnum_chars = sum(c.isalnum() for c in raw_text)
        conf = round(min(0.89, 0.55 + min(0.34, alnum_chars / 220.0)), 3) if raw_text else 0.0
        return OcrResult(
            text=raw_text,
            lines=raw_lines,
            engine="windows_winrt_ocr",
            language=payload.get("language"),
            confidence=conf,
        )
    except Exception as exc:
        log.debug("WinRT OCR attempt failed: %s", exc)
        return None
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except OSError:
                pass


def _run_tesseract_ocr(png_bytes: bytes) -> OcrResult | None:
    tess = shutil.which("tesseract")
    if not tess:
        return None
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
            tf.write(png_bytes)
            tmp_path = tf.name
        proc = subprocess.run(
            [tess, tmp_path, "stdout", "--psm", "6"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=25,
            check=False,
        )
        if proc.returncode != 0:
            return None
        lines = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip()]
        text = "\n".join(lines)
        alnum_chars = sum(c.isalnum() for c in text)
        conf = round(min(0.88, 0.55 + min(0.33, alnum_chars / 220.0)), 3) if text else 0.0
        return OcrResult(text=text, lines=lines, engine="tesseract_ocr", confidence=conf)
    except Exception as exc:
        log.debug("Tesseract OCR attempt failed: %s", exc)
        return None
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except OSError:
                pass


def _run_opt_in_vision_ai(png_bytes: bytes) -> OcrResult | None:
    """Strictly opt-in external vision OCR when user explicitly accepts external AI transmission AND server key exists."""
    import base64

    gem_key = os.getenv("GEMINI_API_KEY", "").strip()
    oai_key = os.getenv("OPENAI_API_KEY", "").strip()
    b64 = base64.b64encode(png_bytes).decode("ascii")
    prompt = (
        "Transcribe all visible text, tables, invoice/receipt line items, dates, SKUs, quantities, totals, cost, customer and region cleanly line by line. "
        "Return JSON with fields: text (string), lines (array of strings)."
    )
    if gem_key:
        try:
            model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            res = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": gem_key},
                json={
                    "contents": [{
                        "role": "user",
                        "parts": [
                            {"text": prompt},
                            {"inlineData": {"mimeType": "image/png", "data": b64}},
                        ],
                    }],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
                timeout=15.0,
            )
            res.raise_for_status()
            body = json.loads(res.json()["candidates"][0]["content"]["parts"][0]["text"])
            lines = [str(x).strip() for x in (body.get("lines") or []) if str(x).strip()]
            text = str(body.get("text") or "\n".join(lines)).strip()
            return OcrResult(text=text, lines=lines or text.splitlines(), engine="gemini_vision", confidence=0.88 if text else 0.0)
        except Exception as exc:
            log.warning("Opt-in Gemini vision fallback failed (%s)", type(exc).__name__)
    if oai_key:
        try:
            model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
            res = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {oai_key}"},
                json={
                    "model": model,
                    "response_format": {"type": "json_object"},
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                        ],
                    }],
                },
                timeout=15.0,
            )
            res.raise_for_status()
            body = json.loads(res.json()["choices"][0]["message"]["content"])
            lines = [str(x).strip() for x in (body.get("lines") or []) if str(x).strip()]
            text = str(body.get("text") or "\n".join(lines)).strip()
            return OcrResult(text=text, lines=lines or text.splitlines(), engine="openai_vision", confidence=0.88 if text else 0.0)
        except Exception as exc:
            log.warning("Opt-in OpenAI vision fallback failed (%s)", type(exc).__name__)
    return None


def run_local_ocr_image_bytes(image_bytes: bytes, *, consent_external_ai: bool = False) -> OcrResult:
    """Run real local OCR (WinRT on Windows / Tesseract if installed) with strictly opt-in external vision fallback."""
    try:
        png_bytes = _normalize_image_for_ocr(image_bytes)
    except Exception as exc:
        return OcrResult(text="", lines=[], engine="ocr_decode_failed", confidence=0.0, warnings=[f"Image decode failed: {type(exc).__name__}"])

    if consent_external_ai:
        ai_res = _run_opt_in_vision_ai(png_bytes)
        if ai_res and ai_res.text:
            return ai_res

    winrt = _run_winrt_ocr(png_bytes)
    if winrt is not None:
        return winrt

    tess = _run_tesseract_ocr(png_bytes)
    if tess is not None:
        return tess

    return OcrResult(
        text="",
        lines=[],
        engine="ocr_engine_unavailable",
        confidence=0.0,
        warnings=["No local OCR engine (Windows WinRT or Tesseract) available in runtime; manual transcription required."],
    )


# ---------------------------------------------------------------------------
# Business Entity & Financial Extraction from Real Text / OCR Output
# ---------------------------------------------------------------------------

DATE_CANDIDATE_RX = re.compile(
    r"\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b",
    re.I,
)
DOC_ID_RX = re.compile(r"\b(?:invoice|receipt|bill|order|inv|po|so)[\s#:No.-]*([A-Z0-9][A-Z0-9_-]{1,32})\b", re.I)
AMOUNT_LABEL_RX = re.compile(
    r"(grand\s*total|total\s*revenue|net\s*sales|revenue|total\s*amount|total\s*due|subtotal|total|sales|"
    r"total\s*cost|cogs|cost|expense|gross\s*profit|profit|marketing\s*spend|ad\s*spend)"
    r"\s*[:=\-]?\s*([\$₫€£]?\s*\d[\d,\.\sOo]*\s*(?:VND|USD|EUR|GBP|đ|k|m)?)",
    re.I,
)
LINE_ITEM_RX = re.compile(
    r"(?:product|item|sku)?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\s._/-]{2,60?}?)\s*"
    r"(?:x|\*|qty\s*[:=]?\s*)\s*(\d+)\b"
    r"(?:\s*(?:@|unit\s*price)?\s*([\$₫€£]?\s*\d[\d,\.Oo]*))?"
    r"(?:\s*(?:=|\-|:)?\s*([\$₫€£]?\s*\d[\d,\.Oo]*))?",
    re.I,
)
LABELED_ATTR_RX = re.compile(
    r"^\s*(product|sku|category|customer|client|buyer|region|market|city|branch|channel|sales\s*channel|date|invoice\s*date|transaction\s*date)\s*[:=\-]\s*(.+?)\s*$",
    re.I | re.M,
)


def _repair_ocr_numeric(raw_val: str, repairs: list[dict[str, Any]]) -> str:
    """Repair common WinRT O->0 confusion in decimal monetary suffixes while recording every transformation."""
    fixed = re.sub(r"(?<=\d[\.,])[Oo]+(?=\b|\s|$)", lambda m: "0" * len(m.group(0)), raw_val)
    fixed = re.sub(r"(?<=[\$₫€£])\s+", "", fixed)
    # Fix WinRT spacing inside commas like '$1 ,250.00' -> '$1,250.00'
    fixed = re.sub(r"(\d)\s+,", r"\1,", fixed)
    fixed = re.sub(r",\s+(\d)", r",\1", fixed)
    if fixed != raw_val:
        repairs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": "ocr_numeric_repair",
            "raw": raw_val,
            "repaired": fixed,
        })
    return fixed


def _extract_first_date(text: str, repairs: list[dict[str, Any]]) -> str | None:
    for match in DATE_CANDIDATE_RX.finditer(text):
        token = match.group(0).strip()
        d, _ = parse_flexible_date(token)
        if d:
            if d.isoformat() != token:
                repairs.append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "action": "date_normalized",
                    "raw": token,
                    "normalized": d.isoformat(),
                })
            return d.isoformat()
    return None


def _detect_currency(text: str, explicit_tokens: list[str]) -> str:
    joined = " ".join(explicit_tokens) + " " + text
    if "₫" in joined or re.search(r"\bVND\b", joined, re.I):
        return "VND"
    if "€" in joined or re.search(r"\bEUR\b", joined, re.I):
        return "EUR"
    if "£" in joined or re.search(r"\bGBP\b", joined, re.I):
        return "GBP"
    if "$" in joined or re.search(r"\bUSD\b", joined, re.I):
        return "USD"
    return "USD"


def extract_business_entities_from_text(
    text: str,
    *,
    source_id: str,
    modality: str,
    extraction_method: str,
    source_location: dict[str, Any],
    base_confidence: float | None = None,
    fallback_date: date | None = None,
) -> list[dict[str, Any]]:
    """Convert raw extracted text/OCR into structured candidate records with provenance & uncertainty."""
    cleaned = (text or "").strip()
    if not cleaned:
        return []

    repairs: list[dict[str, Any]] = []
    # Also normalize spaces around decimals/commas from OCR lines
    pre_cleaned = re.sub(r"([\$₫€£])\s*(\d+)\s*,\s*(\d+)", r"\1\2,\3", cleaned)
    if pre_cleaned != cleaned:
        repairs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": "ocr_spacing_repair",
            "note": "Collapsed spaces adjacent to currency symbols/separators.",
        })

    found_date = _extract_first_date(pre_cleaned, repairs)
    doc_match = DOC_ID_RX.search(pre_cleaned)
    doc_ref = doc_match.group(1) if doc_match else None

    attrs: dict[str, str] = {}
    for m in LABELED_ATTR_RX.finditer(pre_cleaned):
        key = m.group(1).lower().replace(" ", "_")
        val = m.group(2).strip()
        if val:
            attrs[key] = val

    totals: dict[str, float] = {}
    currency_tokens: list[str] = []
    for m in AMOUNT_LABEL_RX.finditer(pre_cleaned):
        lbl = " ".join(m.group(1).lower().split())
        raw_amt = m.group(2).strip()
        currency_tokens.append(raw_amt)
        fixed_amt = _repair_ocr_numeric(raw_amt, repairs)
        val, cur = parse_numeric_money(fixed_amt)
        if val is not None and val >= 0:
            if cur:
                currency_tokens.append(cur)
            if "cost" in lbl or "cogs" in lbl or "expense" in lbl:
                totals.setdefault("cost", float(val))
            elif "profit" in lbl:
                totals.setdefault("profit", float(val))
            elif "spend" in lbl:
                totals.setdefault("marketing_spend", float(val))
            else:
                # Prefer grand total / total revenue over subtotal
                if "grand" in lbl or "revenue" in lbl or "sales" in lbl or "total" not in totals:
                    totals["revenue"] = float(val)
                elif "total" in lbl:
                    totals.setdefault("revenue", float(val))

    currency = _detect_currency(pre_cleaned, currency_tokens)
    product_val = attrs.get("product") or attrs.get("sku")
    category_val = attrs.get("category") or "Multimodal Extracted"
    customer_val = attrs.get("customer") or attrs.get("client") or attrs.get("buyer")
    region_val = attrs.get("region") or attrs.get("market") or attrs.get("city") or attrs.get("branch")
    channel_val = attrs.get("channel") or attrs.get("sales_channel")

    line_records: list[dict[str, Any]] = []
    for line in pre_cleaned.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        lm = LINE_ITEM_RX.search(line_str)
        if lm:
            raw_item_name = lm.group(1).strip(" :-|")
            qty = int(lm.group(2))
            p_raw = lm.group(3)
            t_raw = lm.group(4)
            # Avoid matching lines that are purely "date: 2026-01-01" or "invoice #1042"
            if len(raw_item_name) >= 2 and not re.search(r"^(?:invoice|date|total|subtotal|tax)\b", raw_item_name, re.I):
                unit_p, _ = parse_numeric_money(_repair_ocr_numeric(p_raw, repairs)) if p_raw else (None, None)
                line_rev, _ = parse_numeric_money(_repair_ocr_numeric(t_raw, repairs)) if t_raw else (None, None)
                if line_rev is None and unit_p is not None:
                    line_rev = round(unit_p * qty, 2)
                if line_rev is None and len(line_records) == 0 and "revenue" in totals:
                    line_rev = totals["revenue"]
                if line_rev is not None or qty > 0:
                    line_records.append({
                        "raw_line": line_str,
                        "product": raw_item_name[:140],
                        "quantity": qty,
                        "unit_price": unit_p,
                        "revenue": line_rev,
                    })

    method_conf = base_confidence if base_confidence is not None else (0.88 if "ocr" not in extraction_method else 0.79)
    candidates: list[dict[str, Any]] = []

    if len(line_records) >= 1 and any(lr.get("revenue") is not None for lr in line_records):
        for idx, lr in enumerate(line_records):
            if lr.get("revenue") is None:
                continue
            rec_date = found_date or (fallback_date.isoformat() if fallback_date else None)
            score = round(min(0.95, method_conf if rec_date else max(0.45, method_conf - 0.18)), 3)
            candidates.append({
                "entity_type": "invoice" if doc_ref else "transaction",
                "confidence_score": score,
                "extraction_method": extraction_method,
                "source_location": {**source_location, "line_item_index": idx + 1, "document_ref": doc_ref},
                "raw_payload": {"raw_line": lr["raw_line"], "text_excerpt": pre_cleaned[:800]},
                "extracted_data": {
                    "date": rec_date,
                    "order_id": doc_ref,
                    "product": lr["product"],
                    "category": category_val,
                    "quantity": lr["quantity"],
                    "revenue": lr["revenue"],
                    "cost": totals.get("cost") if len(line_records) == 1 else None,
                    "profit": totals.get("profit") if len(line_records) == 1 else None,
                    "customer": customer_val or ("Walk-in / Document" if doc_ref else None),
                    "region": region_val or "General",
                    "channel": channel_val or "Direct",
                    "marketing_spend": totals.get("marketing_spend") if len(line_records) == 1 else None,
                    "currency": currency,
                    "title": f"{doc_ref or 'Document'} - {lr['product']}",
                    "summary": lr["raw_line"],
                },
                "transformation_history": list(repairs),
            })
        return candidates

    if "revenue" in totals or "profit" in totals or "cost" in totals or "marketing_spend" in totals:
        rev_val = totals.get("revenue")
        cost_val = totals.get("cost")
        prof_val = totals.get("profit")
        if rev_val is not None and cost_val is not None and prof_val is None:
            prof_val = round(rev_val - cost_val, 2)
        rec_date = found_date or (fallback_date.isoformat() if fallback_date else None)
        has_core = rev_val is not None and rec_date is not None
        score = round(min(0.94, method_conf if has_core else max(0.45, method_conf - 0.18)), 3)
        qty_m = re.search(r"\b(?:qty|quantity|units)\s*[:=\-]?\s*(\d+)\b", pre_cleaned, re.I)
        qty_val = int(qty_m.group(1)) if qty_m else 1
        candidates.append({
            "entity_type": "invoice" if doc_ref else "financial_metric",
            "confidence_score": score,
            "extraction_method": extraction_method,
            "source_location": {**source_location, "document_ref": doc_ref},
            "raw_payload": {"text_excerpt": pre_cleaned[:1200]},
            "extracted_data": {
                "date": rec_date,
                "order_id": doc_ref,
                "product": product_val or (f"Invoice {doc_ref}" if doc_ref else "Reported Revenue Item"),
                "category": category_val,
                "quantity": qty_val,
                "revenue": rev_val,
                "cost": cost_val,
                "profit": prof_val,
                "customer": customer_val or "Extracted Counterparty",
                "region": region_val or "General",
                "channel": channel_val or "Direct",
                "marketing_spend": totals.get("marketing_spend"),
                "currency": currency,
                "title": f"{doc_ref or 'Financial Extraction'}",
                "summary": pre_cleaned[:320],
            },
            "transformation_history": list(repairs),
        })
        return candidates

    # Narrative / qualitative insight fallback (honest non-numeric extraction)
    excerpt = " ".join(pre_cleaned.split())[:600]
    candidates.append({
        "entity_type": f"{modality}_insight",
        "confidence_score": round(min(0.88, max(0.40, method_conf - 0.08)), 3),
        "extraction_method": extraction_method,
        "source_location": source_location,
        "raw_payload": {"text_excerpt": pre_cleaned[:1200]},
        "extracted_data": {
            "date": found_date,
            "product": product_val,
            "category": category_val,
            "customer": customer_val,
            "region": region_val,
            "channel": channel_val,
            "title": attrs.get("title") or excerpt[:90] or f"Extracted {modality} content",
            "summary": excerpt,
            "keywords": re.findall(r"\b[A-Za-z0-9_-]{4,}\b", excerpt)[:10],
        },
        "transformation_history": list(repairs),
    })
    return candidates

