"""Cryptographic SHA-256 Audit Hash-Chain, Secret Redaction & CSV Formula-Injection Protection."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
import re
from typing import Any

import sqlalchemy as sa

from backend.app.db import audit, audit_hash_chain

GENESIS_HASH = "0" * 64
SECRET_KEY_RX = re.compile(
    r"(password|passwd|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|credential|access[_-]?key|bearer|encrypted_secrets)",
    re.IGNORECASE,
)
SECRET_VALUE_PATTERNS = (
    re.compile(r"(Bearer\s+)[A-Za-z0-9._\-=]{8,}", re.IGNORECASE),
    re.compile(r"\b(sk-[A-Za-z0-9_\-]{12,}|AIza[0-9A-Za-z\-_]{16,})\b"),
    re.compile(r"((?:postgresql|postgres|mysql|mssql|sqlite)(?:\+[a-z0-9_]+)?://[^:/@\s]+:)([^@\s]+)(@)", re.IGNORECASE),
)


def csv_safe(value: Any) -> Any:
    """Prevent CSV / Excel formula injection on string cells."""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


def _normalize_json_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return value if value == value and abs(value) != float("inf") else None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        if isinstance(value, datetime) and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _normalize_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_normalize_json_value(v) for v in value]
    return str(value)


def redact_secrets(value: Any) -> Any:
    """Recursively redact secret keys, bearer tokens, API keys, and DSN passwords."""
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            ks = str(k)
            if SECRET_KEY_RX.search(ks):
                out[ks] = "***REDACTED***"
            else:
                out[ks] = redact_secrets(v)
        return out
    if isinstance(value, list):
        return [redact_secrets(v) for v in value]
    if isinstance(value, tuple):
        return [redact_secrets(v) for v in value]
    if isinstance(value, str):
        text = value
        text = SECRET_VALUE_PATTERNS[0].sub(r"\1***REDACTED***", text)
        text = SECRET_VALUE_PATTERNS[1].sub("***REDACTED***", text)
        text = SECRET_VALUE_PATTERNS[2].sub(r"\1***REDACTED***\3", text)
        return text
    return _normalize_json_value(value)


def canonical_json(obj: Any) -> str:
    return json.dumps(_normalize_json_value(obj), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_entry_hash(
    *,
    company_id: str,
    audit_event_id: int,
    kind: str,
    subject: str,
    payload_sha256: str,
    prev_hash: str,
) -> str:
    body = f"{company_id}|{audit_event_id}|{kind}|{subject}|{payload_sha256}|{prev_hash}"
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def append_audited_event(
    conn: sa.Connection,
    *,
    company_id: str,
    kind: str,
    subject: str,
    payload: dict[str, Any],
) -> tuple[int, str]:
    """Insert a secret-redacted row into audit_events and append a tamper-evident link in audit_hash_chain."""
    safe_payload = redact_secrets(_normalize_json_value(payload))
    if not isinstance(safe_payload, dict):
        safe_payload = {"value": safe_payload}
    subject_str = str(subject)[:100]
    kind_str = str(kind)[:100]

    res = conn.execute(
        audit.insert().values(
            company_id=company_id,
            kind=kind_str,
            subject=subject_str,
            payload=safe_payload,
        )
    )
    event_id = int(res.inserted_primary_key[0])

    prev_hash = (
        conn.scalar(
            sa.select(audit_hash_chain.c.entry_hash)
            .where(audit_hash_chain.c.company_id == company_id)
            .order_by(audit_hash_chain.c.seq_no.desc())
            .limit(1)
        )
        or GENESIS_HASH
    )
    payload_hash = hashlib.sha256(canonical_json(safe_payload).encode("utf-8")).hexdigest()
    entry_hash = compute_entry_hash(
        company_id=company_id,
        audit_event_id=event_id,
        kind=kind_str,
        subject=subject_str,
        payload_sha256=payload_hash,
        prev_hash=prev_hash,
    )
    conn.execute(
        audit_hash_chain.insert().values(
            audit_event_id=event_id,
            company_id=company_id,
            prev_hash=prev_hash,
            payload_sha256=payload_hash,
            entry_hash=entry_hash,
        )
    )
    return event_id, entry_hash


def verify_audit_hash_chain(conn: sa.Connection, company_id: str) -> dict[str, Any]:
    """Verify hash-chain continuity and payload SHA-256 alignment for a tenant."""
    chain_rows = conn.execute(
        sa.select(audit_hash_chain)
        .where(audit_hash_chain.c.company_id == company_id)
        .order_by(audit_hash_chain.c.seq_no.asc())
    ).mappings().all()

    event_ids = [int(r["audit_event_id"]) for r in chain_rows]
    events_by_id: dict[int, dict[str, Any]] = {}
    if event_ids:
        for er in conn.execute(sa.select(audit).where(audit.c.id.in_(event_ids))).mappings():
            events_by_id[int(er["id"])] = dict(er)

    total_company_events = (
        conn.scalar(
            sa.select(sa.func.count()).select_from(audit).where(audit.c.company_id == company_id)
        )
        or 0
    )

    broken_links: list[dict[str, Any]] = []
    payload_mismatches: list[dict[str, Any]] = []
    expected_prev = GENESIS_HASH
    latest_hash: str | None = None
    latest_seq_no: int | None = None

    for row in chain_rows:
        seq = int(row["seq_no"])
        eid = int(row["audit_event_id"])
        prev_h = str(row["prev_hash"])
        stored_payload_h = str(row["payload_sha256"])
        stored_entry_h = str(row["entry_hash"])

        if prev_h != expected_prev:
            broken_links.append(
                {
                    "seq_no": seq,
                    "audit_event_id": eid,
                    "expected_prev_hash": expected_prev,
                    "actual_prev_hash": prev_h,
                }
            )

        ev = events_by_id.get(eid)
        if not ev or ev["company_id"] != company_id:
            payload_mismatches.append(
                {"seq_no": seq, "audit_event_id": eid, "reason": "Missing or tenant-mismatched audit_events record"}
            )
        else:
            recomputed_payload_h = hashlib.sha256(canonical_json(ev["payload"]).encode("utf-8")).hexdigest()
            recomputed_entry_h = compute_entry_hash(
                company_id=company_id,
                audit_event_id=eid,
                kind=str(ev["kind"]),
                subject=str(ev["subject"]),
                payload_sha256=recomputed_payload_h,
                prev_hash=prev_h,
            )
            if recomputed_payload_h != stored_payload_h or recomputed_entry_h != stored_entry_h:
                payload_mismatches.append(
                    {
                        "seq_no": seq,
                        "audit_event_id": eid,
                        "reason": "Payload or entry SHA-256 mismatch detected",
                    }
                )

        expected_prev = stored_entry_h
        latest_hash = stored_entry_h
        latest_seq_no = seq

    pre_chain_events = max(0, int(total_company_events) - len(chain_rows))
    is_valid = len(broken_links) == 0 and len(payload_mismatches) == 0

    return {
        "company_id": company_id,
        "chain_valid": is_valid,
        "chained_events": len(chain_rows),
        "pre_chain_events": pre_chain_events,
        "total_audit_events": int(total_company_events),
        "broken_links": broken_links,
        "payload_mismatches": payload_mismatches,
        "latest_seq_no": latest_seq_no,
        "latest_hash": latest_hash,
        "append_only_protection": True,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }

