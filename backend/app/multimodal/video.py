"""Video Processor for MP4, MOV, AVI with strict frame sampling & resolution caps + real CV/OCR inspection."""
from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import tempfile
from typing import Any

import cv2
import numpy as np

from backend.app.ingestion.storage import ObjectStorage
from backend.app.multimodal.ocr_and_extractors import (
    extract_business_entities_from_text,
    run_local_ocr_image_bytes,
)


HARD_MAX_FRAMES = int(os.getenv("MULTIMODAL_VIDEO_MAX_FRAMES_CAP", "20"))
MAX_FRAME_WIDTH = int(os.getenv("MULTIMODAL_VIDEO_MAX_WIDTH", "960"))


def process_video_bytes(
    blob: bytes,
    filename: str,
    ext: str,
    *,
    company_id: str,
    dataset_id: str,
    file_id: str,
    source_id: str,
    storage: ObjectStorage,
    sampling_interval_sec: float = 5.0,
    max_frames: int = 10,
    consent_external_ai: bool = False,
) -> dict[str, Any]:
    interval = max(1.0, min(60.0, float(sampling_interval_sec or 5.0)))
    target_cap = max(1, min(HARD_MAX_FRAMES, int(max_frames or 10)))
    tmp_path: str | None = None
    sampled_frames_meta: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    warnings: list[str] = []

    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tf:
            tf.write(blob)
            tmp_path = tf.name

        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return {
                "extraction_status": "failed",
                "metadata": {"format": ext, "warnings": ["OpenCV VideoCapture could not decode video stream."]},
                "extracted_records": [],
            }
        try:
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
            if fps <= 0 or fps > 240:
                fps = 24.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            fourcc_int = int(cap.get(cv2.CAP_PROP_FOURCC) or 0)
            codec = "".join(chr((fourcc_int >> 8 * i) & 0xFF) for i in range(4)).strip("\x00")
            duration_sec = round(total_frames / fps, 2) if total_frames > 0 and fps > 0 else 0.0

            # Compute sparse frame indices respecting sampling_interval_sec and max_frames cap
            stride = max(1, int(round(interval * fps)))
            candidate_indices: list[int] = []
            if total_frames > 0:
                idx = 0
                while idx < total_frames and len(candidate_indices) < target_cap:
                    candidate_indices.append(idx)
                    idx += stride
            else:
                candidate_indices = [0]

            prev_hist: np.ndarray | None = None
            ocr_checks_done = 0
            ocr_max_checks = min(target_cap, 6)

            for seq_num, frame_idx in enumerate(candidate_indices):
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ok, frame = cap.read()
                if not ok or frame is None:
                    continue

                fh, fw = frame.shape[:2]
                if fw > MAX_FRAME_WIDTH:
                    scale = MAX_FRAME_WIDTH / float(fw)
                    frame = cv2.resize(frame, (MAX_FRAME_WIDTH, max(1, int(fh * scale))), interpolation=cv2.INTER_AREA)

                ts_sec = round(frame_idx / fps, 2)
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                brightness = round(float(np.mean(gray)), 2)
                hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
                cv2.normalize(hist, hist)
                scene_delta = round(float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA)), 3) if prev_hist is not None else 0.0
                prev_hist = hist

                ok_enc, jpg_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
                frame_key = None
                ocr_text = ""
                ocr_engine = None
                if ok_enc:
                    frame_bytes = jpg_buf.tobytes()
                    frame_subkey = f"frame_{seq_num:03d}.jpg"
                    frame_key = f"companies/{company_id}/datasets/{dataset_id}/files/{file_id}/frames/{frame_subkey}"
                    storage.put_bytes(frame_key, frame_bytes, content_type="image/jpeg")

                    # Run real local OCR only on key sampled frames to save CPU/RAM
                    if ocr_checks_done < ocr_max_checks:
                        ocr_checks_done += 1
                        ocr_res = run_local_ocr_image_bytes(frame_bytes, consent_external_ai=consent_external_ai)
                        if ocr_res.text:
                            ocr_text = ocr_res.text
                            ocr_engine = ocr_res.engine

                frame_meta = {
                    "sequence": seq_num,
                    "frame_index": frame_idx,
                    "timestamp_sec": ts_sec,
                    "brightness": brightness,
                    "scene_change_score": scene_delta,
                    "storage_key": frame_key,
                    "frame_subkey": f"frame_{seq_num:03d}.jpg" if frame_key else None,
                    "ocr_text": ocr_text[:300] if ocr_text else "",
                }
                sampled_frames_meta.append(frame_meta)

                if ocr_text.strip():
                    ents = extract_business_entities_from_text(
                        ocr_text,
                        source_id=source_id,
                        modality="video",
                        extraction_method=f"video_keyframe_{ocr_engine or 'ocr'}",
                        source_location={
                            "file": filename,
                            "frame_index": frame_idx,
                            "timestamp_sec": ts_sec,
                            "frame_subkey": frame_meta["frame_subkey"],
                        },
                        base_confidence=0.74,
                    )
                    for e in ents:
                        e["needs_human_review"] = True
                        e["extracted_data"]["timestamp_sec"] = ts_sec
                        e["extracted_data"]["frame_subkey"] = frame_meta["frame_subkey"]
                    records.extend(ents)
        finally:
            cap.release()
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except OSError:
                pass

    # If sampled keyframes yielded visual/scene telemetry without signage text, emit genuine visual operational log
    if sampled_frames_meta and not records:
        records.append({
            "entity_type": "video_insight",
            "confidence_score": 0.62,
            "extraction_method": "opencv_keyframe_sampler",
            "source_location": {
                "file": filename,
                "duration_sec": duration_sec,
                "sampled_frames": len(sampled_frames_meta),
            },
            "raw_payload": {"sampled_frames": sampled_frames_meta},
            "extracted_data": {
                "title": f"Video Operational Analysis · {filename}",
                "summary": (
                    f"Sampled {len(sampled_frames_meta)} frames every {interval:.1f}s across {duration_sec:.1f}s "
                    f"({width}x{height} @ {fps:.1f}fps). Max scene delta: "
                    f"{max((f['scene_change_score'] for f in sampled_frames_meta), default=0.0):.3f}."
                ),
                "duration_sec": duration_sec,
                "sampled_frames_count": len(sampled_frames_meta),
                "ocr_signage_detected": False,
            },
            "needs_human_review": True,
            "transformation_history": [{
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "action": "video_bounded_frame_sampling",
                "sampling_interval_sec": interval,
                "max_frames_cap": target_cap,
            }],
        })

    warnings.append(
        "Privacy Notice: Video processing samples keyframes strictly for operational/signage telemetry. No customer identity or facial recognition was performed."
    )

    return {
        "extraction_status": "completed" if sampled_frames_meta else "partial",
        "metadata": {
            "format": ext,
            "width": width if sampled_frames_meta else 0,
            "height": height if sampled_frames_meta else 0,
            "fps": round(fps, 2) if sampled_frames_meta else 0.0,
            "total_frames": total_frames if sampled_frames_meta else 0,
            "duration_sec": duration_sec if sampled_frames_meta else 0.0,
            "codec": codec if sampled_frames_meta else None,
            "sampling_interval_sec": interval,
            "max_frames_cap": target_cap,
            "sampled_frames": sampled_frames_meta,
            "privacy_metadata": {
                "facial_recognition_performed": False,
                "biometric_identity_inferred": False,
                "consent_external_ai": consent_external_ai,
            },
            "warnings": warnings,
        },
        "extracted_records": records,
    }

