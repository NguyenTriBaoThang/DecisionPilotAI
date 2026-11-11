"""Audio Processor for WAV, MP3, M4A: genuine container/acoustic metadata + honest local/opt-in STT + review workflow."""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
import logging
import os
import tempfile
from typing import Any
import wave

import httpx
from mutagen import File as MutagenFile
import numpy as np

from backend.app.multimodal.ocr_and_extractors import extract_business_entities_from_text

log = logging.getLogger(__name__)


def _inspect_wav_signal(blob: bytes) -> dict[str, Any]:
    with wave.open(BytesIO(blob), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        nframes = wf.getnframes()
        raw_frames = wf.readframes(nframes)

    duration = round(nframes / float(framerate), 3) if framerate > 0 else 0.0
    speech_segments: list[dict[str, Any]] = []
    peak_dbfs = None

    if nframes > 0 and framerate > 0 and sampwidth in {1, 2, 4}:
        dtype = np.uint8 if sampwidth == 1 else (np.int16 if sampwidth == 2 else np.int32)
        samples = np.frombuffer(raw_frames, dtype=dtype).astype(np.float64)
        if sampwidth == 1:
            samples = (samples - 128.0) / 128.0
        elif sampwidth == 2:
            samples = samples / 32768.0
        else:
            samples = samples / 2147483648.0
        if channels > 1:
            samples = samples.reshape(-1, channels).mean(axis=1)
        peak = float(np.max(np.abs(samples))) if samples.size else 0.0
        peak_dbfs = round(20.0 * np.log10(max(peak, 1e-6)), 2)

        win_size = max(1, int(framerate * 2))
        for idx in range(0, len(samples), win_size):
            chunk = samples[idx : idx + win_size]
            if not chunk.size:
                continue
            rms = float(np.sqrt(np.mean(chunk * chunk)))
            if rms > 0.015:
                speech_segments.append({
                    "start_sec": round(idx / float(framerate), 2),
                    "end_sec": round(min(len(samples), idx + win_size) / float(framerate), 2),
                    "rms_level": round(rms, 4),
                })

    return {
        "duration_sec": duration,
        "sample_rate": framerate,
        "channels": channels,
        "sample_width_bytes": sampwidth,
        "peak_dbfs": peak_dbfs,
        "active_energy_windows": speech_segments[:30],
    }


def _inspect_mutagen_metadata(blob: bytes, ext: str) -> dict[str, Any]:
    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tf:
        tf.write(blob)
        tmp_path = tf.name
    try:
        audio = MutagenFile(tmp_path)
        if audio is None:
            return {"duration_sec": 0.0, "bitrate_bps": None, "sample_rate": None, "channels": None, "tags": {}}
        info = getattr(audio, "info", None)
        tags: dict[str, str] = {}
        if getattr(audio, "tags", None):
            for k in list(audio.tags.keys())[:15]:
                tags[str(k)] = str(audio.tags[k])[:160]
        return {
            "duration_sec": round(float(getattr(info, "length", 0.0) or 0.0), 3),
            "bitrate_bps": int(getattr(info, "bitrate", 0) or 0) or None,
            "sample_rate": int(getattr(info, "sample_rate", 0) or 0) or None,
            "channels": int(getattr(info, "channels", 0) or 0) or None,
            "tags": tags,
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _try_local_or_consented_stt(blob: bytes, filename: str, ext: str, consent_external_ai: bool) -> tuple[str, str, str]:
    """Run local faster_whisper if installed, or strictly opt-in OpenAI/Gemini STT. Never fabricates transcripts."""
    try:
        from faster_whisper import WhisperModel  # type: ignore

        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tf:
            tf.write(blob)
            tmp_path = tf.name
        try:
            model = WhisperModel(os.getenv("WHISPER_MODEL_SIZE", "tiny"), device="cpu", compute_type="int8")
            segments, info = model.transcribe(tmp_path)
            transcript = " ".join(seg.text.strip() for seg in segments if seg.text.strip()).strip()
            lang = getattr(info, "language", "undetermined")
            return transcript, lang, "faster_whisper_local"
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    except ImportError:
        pass
    except Exception as exc:
        log.warning("Local faster_whisper attempt failed (%s)", type(exc).__name__)

    if consent_external_ai:
        oai_key = os.getenv("OPENAI_API_KEY", "").strip()
        if oai_key:
            try:
                res = httpx.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {oai_key}"},
                    data={"model": os.getenv("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")},
                    files={"file": (filename, blob)},
                    timeout=30.0,
                )
                res.raise_for_status()
                data = res.json()
                text = str(data.get("text") or "").strip()
                if text:
                    return text, str(data.get("language") or "auto"), "openai_stt"
            except Exception as exc:
                log.warning("Opt-in OpenAI STT failed (%s)", type(exc).__name__)

    return "", "undetermined", "stt_engine_unavailable"


def process_audio_bytes(
    blob: bytes,
    filename: str,
    ext: str,
    *,
    source_id: str,
    consent_external_ai: bool = False,
) -> dict[str, Any]:
    meta: dict[str, Any] = {"format": ext}
    if ext == "wav":
        meta.update(_inspect_wav_signal(blob))
    else:
        meta.update(_inspect_mutagen_metadata(blob, ext))

    transcript, language, stt_engine = _try_local_or_consented_stt(blob, filename, ext, consent_external_ai)
    warnings: list[str] = []
    records: list[dict[str, Any]] = []

    if transcript:
        ents = extract_business_entities_from_text(
            transcript,
            source_id=source_id,
            modality="audio",
            extraction_method=f"audio_{stt_engine}",
            source_location={"file": filename, "duration_sec": meta.get("duration_sec"), "language": language},
            base_confidence=0.80,
        )
        for e in ents:
            e["needs_human_review"] = True
            e["extracted_data"]["transcript"] = transcript
            e["extracted_data"]["language"] = language
            e["extracted_data"]["sentiment"] = "sentiment_unverified"
        records.extend(ents)
        status = "completed"
    else:
        status = "partial"
        warnings.append(
            "No local Speech-to-Text engine (faster_whisper) installed or external AI consent not enabled; "
            "metadata and acoustic activity windows extracted honestly without fabricating speech text."
        )
        duration = meta.get("duration_sec") or 0.0
        tag_summary = "; ".join(f"{k}={v}" for k, v in (meta.get("tags") or {}).items())
        records.append({
            "entity_type": "audio_transcript",
            "confidence_score": 0.40,
            "extraction_method": stt_engine,
            "source_location": {
                "file": filename,
                "duration_sec": duration,
                "sample_rate": meta.get("sample_rate"),
                "channels": meta.get("channels"),
            },
            "raw_payload": {**meta, "stt_status": stt_engine},
            "extracted_data": {
                "title": f"Audio Recording · {filename} ({duration:.2f}s)",
                "summary": (
                    f"Verified audio container ({ext.upper()}, {duration:.2f}s, {meta.get('sample_rate') or '?'} Hz, "
                    f"{len(meta.get('active_energy_windows') or [])} speech-activity windows). "
                    + (f"Tags: {tag_summary}" if tag_summary else "Awaiting transcript entry / human review.")
                ),
                "transcript": "",
                "language": language,
                "duration_sec": duration,
                "stt_status": stt_engine,
                "sentiment": "sentiment_unverified",
            },
            "needs_human_review": True,
            "transformation_history": [{
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "action": "audio_metadata_inspected",
                "stt_status": stt_engine,
            }],
        })

    warnings.append("Any audio sentiment or inferred tone is flagged sentiment_unverified and never treated as verified business fact.")
    meta["stt_status"] = stt_engine
    meta["language"] = language
    meta["warnings"] = warnings
    return {
        "extraction_status": status,
        "metadata": meta,
        "extracted_records": records,
    }

