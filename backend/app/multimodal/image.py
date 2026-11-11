"""Image Processor for JPG, JPEG, PNG, WEBP using Pillow + OpenCV layout detection + real OCR."""
from __future__ import annotations

from io import BytesIO
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageOps

from backend.app.multimodal.ocr_and_extractors import (
    extract_business_entities_from_text,
    run_local_ocr_image_bytes,
)

Image.MAX_IMAGE_PIXELS = 40_000_000


def _analyze_visual_layout(blob: bytes) -> dict[str, Any]:
    arr = np.frombuffer(blob, dtype=np.uint8)
    mat = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if mat is None:
        return {"table_grid_detected": False, "horizontal_lines": 0, "vertical_lines": 0, "edge_density": 0.0}
    gray = cv2.cvtColor(mat, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    edges = cv2.Canny(gray, 60, 160)
    edge_density = float(np.count_nonzero(edges)) / float(max(1, h * w))

    # Detect structured horizontal and vertical rules common in tables, forms, and inventory sheets
    thresh = cv2.adaptiveThreshold(~gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 15, -2)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(12, w // 12), 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(12, h // 12)))
    h_lines_mat = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
    v_lines_mat = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, v_kernel)
    h_cnt, _ = cv2.findContours(h_lines_mat, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    v_cnt, _ = cv2.findContours(v_lines_mat, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    return {
        "horizontal_lines": len(h_cnt),
        "vertical_lines": len(v_cnt),
        "table_grid_detected": len(h_cnt) >= 2 and len(v_cnt) >= 1,
        "edge_density": round(edge_density, 4),
    }


def _classify_image(ocr_text: str, layout: dict[str, Any]) -> str:
    low = (ocr_text or "").lower()
    if any(k in low for k in ("invoice", "receipt", "grand total", "subtotal", "tax", "bill to", "qty")):
        return "invoice_or_receipt"
    if any(k in low for k in ("inventory", "stock", "warehouse", "sku", "bin", "count")):
        return "inventory_sheet"
    if layout.get("table_grid_detected"):
        return "table_or_form"
    if ocr_text.strip():
        return "chart_or_document_capture"
    return "visual_scene_or_product"


def process_image_bytes(
    blob: bytes,
    filename: str,
    ext: str,
    *,
    source_id: str,
    consent_external_ai: bool = False,
) -> dict[str, Any]:
    with Image.open(BytesIO(blob)) as raw_img:
        raw_img.verify()
    with Image.open(BytesIO(blob)) as img:
        img = ImageOps.exif_transpose(img)
        width, height = img.size
        color_mode = img.mode
        img_format = img.format or ext.upper()

    layout = _analyze_visual_layout(blob)
    ocr = run_local_ocr_image_bytes(blob, consent_external_ai=consent_external_ai)
    scene_class = _classify_image(ocr.text, layout)

    location = {
        "file": filename,
        "image_width": width,
        "image_height": height,
        "layout_class": scene_class,
        "table_grid_detected": layout["table_grid_detected"],
    }

    records: list[dict[str, Any]] = []
    if ocr.text.strip():
        records = extract_business_entities_from_text(
            ocr.text,
            source_id=source_id,
            modality="image",
            extraction_method=f"image_{ocr.engine}",
            source_location=location,
            base_confidence=ocr.confidence,
        )
        for rec in records:
            rec["needs_human_review"] = True
            rec.setdefault("extracted_data", {})
            rec["extracted_data"]["ocr_text"] = ocr.text
            rec["extracted_data"]["layout_class"] = scene_class
    else:
        # Honest fallback when image contains no recognized text (product photo without labels, blurry image)
        records.append({
            "entity_type": "visual_insight",
            "confidence_score": 0.35,
            "extraction_method": f"image_opencv_{ocr.engine}",
            "source_location": location,
            "raw_payload": {"layout": layout, "warnings": ocr.warnings},
            "extracted_data": {
                "title": f"Visual image capture ({width}x{height} {img_format})",
                "summary": (
                    f"Image ({width}x{height}, mode={color_mode}, class={scene_class}) analyzed locally; "
                    "no readable text detected via OCR. Enter structured annotations manually before approving."
                ),
                "layout_class": scene_class,
                "ocr_text": "",
            },
            "needs_human_review": True,
            "transformation_history": [],
        })

    warnings = list(ocr.warnings)
    warnings.append("Image/OCR extractions require human verification before entering financial BI metrics.")

    return {
        "extraction_status": "completed" if ocr.text.strip() else "partial",
        "metadata": {
            "format": img_format.lower(),
            "width": width,
            "height": height,
            "color_mode": color_mode,
            "ocr_engine": ocr.engine,
            "ocr_language": ocr.language,
            "ocr_lines_count": len(ocr.lines),
            "ocr_text_preview": ocr.text[:400],
            "layout_analysis": layout,
            "classification": scene_class,
            "warnings": warnings,
        },
        "extracted_records": records,
    }

