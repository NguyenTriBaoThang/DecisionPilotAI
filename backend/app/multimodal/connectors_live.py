"""Live database & REST API connector discovery, connection probing, and incremental sync with encrypted credentials."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import logging
import re
import socket
from typing import Any
from uuid import uuid4

import httpx
import psycopg
import sqlalchemy as sa

from backend.app.db import audit, connector_sync_logs, data_sources, enterprise_datasets
from backend.app.ingestion.connectors import get_connector
from backend.app.ingestion.mapper import suggest_column_mapping
from backend.app.ingestion.parsers import IngestionValidationError, parse_uploaded_dataset
from backend.app.ingestion.storage import ObjectStorage
from backend.app.multimodal.security import decrypt_secrets, validate_outbound_url

log = logging.getLogger(__name__)
SQL_IDENT_RX = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _valid_sql_ident(name: str, label: str = "identifier") -> str:
    cleaned = (name or "").strip()
    if not SQL_IDENT_RX.match(cleaned):
        raise IngestionValidationError(f"Invalid SQL {label} '{cleaned}'. Only alphanumeric and underscore characters are permitted.")
    return cleaned


def _extract_by_path(payload: Any, path: str | None) -> list[dict[str, Any]]:
    cur = payload
    if path:
        for segment in path.strip().split("."):
            if isinstance(cur, dict) and segment in cur:
                cur = cur[segment]
            else:
                return []
    if isinstance(cur, dict):
        for key in ("records", "items", "data", "rows", "results", "orders", "transactions"):
            if isinstance(cur.get(key), list):
                cur = cur[key]
                break
    if isinstance(cur, list):
        return [item for item in cur if isinstance(item, dict)]
    if isinstance(cur, dict):
        return [cur]
    return []


def _auth_headers(config: dict[str, Any], secrets: dict[str, Any]) -> dict[str, str]:
    merged = {**config, **secrets}
    token = str(merged.get("api_token") or merged.get("client_secret") or merged.get("password") or "").strip()
    if not token or token == "***redacted***":
        return {}
    mode = str(merged.get("auth_type") or "bearer").lower()
    if mode == "none":
        return {}
    if mode == "api_key":
        return {"X-API-Key": token}
    return {"Authorization": f"Bearer {token}"}


def _infer_col_types(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keys: list[str] = []
    seen: set[str] = set()
    for r in records:
        for k in r.keys():
            ks = str(k)
            if ks not in seen:
                seen.add(ks)
                keys.append(ks)
    schema: list[dict[str, Any]] = []
    for k in keys:
        vals = [r.get(k) for r in records if r.get(k) not in (None, "")]
        dtype = "string"
        if vals:
            if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals):
                dtype = "number"
            elif all(isinstance(v, bool) for v in vals):
                dtype = "boolean"
            elif any(re.match(r"^\d{4}-\d{2}-\d{2}", str(v)) for v in vals[:3]):
                dtype = "date_or_timestamp"
        schema.append({"column_name": k, "data_type": dtype, "sample": vals[0] if vals else None})
    return schema


def test_live_connection(
    source_type: str,
    config: dict[str, Any],
    *,
    secrets: dict[str, Any] | None = None,
    timeout: float = 5.0,
    http_client: httpx.Client | None = None,
) -> dict[str, Any]:
    connector = get_connector(source_type)
    errors = connector.validate_config(config)
    if errors:
        return {"ok": False, "status": "invalid_config", "errors": errors}
    if source_type == "file_upload":
        return {"ok": True, "status": "ready", "message": "Multimodal file upload pipeline active."}

    merged = {**config, **(secrets or {})}
    if source_type == "rest_api":
        try:
            url = validate_outbound_url(str(merged.get("base_url", "")))
        except IngestionValidationError as exc:
            return {"ok": False, "status": "blocked_url", "message": str(exc)}
        headers = _auth_headers(config, secrets or {})
        try:
            if http_client is not None:
                res = http_client.get(url, headers=headers, timeout=timeout)
            else:
                with httpx.Client(timeout=timeout, follow_redirects=False) as client:
                    res = client.get(url, headers=headers)
            res.raise_for_status()
            payload = res.json()
            records = _extract_by_path(payload, merged.get("records_path"))
            return {
                "ok": True,
                "status": "connected",
                "status_code": res.status_code,
                "sample_records": len(records),
                "message": f"REST endpoint responded HTTP {res.status_code} ({len(records)} sample records discovered).",
            }
        except Exception as exc:
            return {"ok": False, "status": "connection_failed", "message": f"REST endpoint check failed: {type(exc).__name__}: {exc}"}

    if source_type == "postgresql":
        host = str(merged.get("host", "")).strip()
        port = int(merged.get("port") or 5432)
        db = str(merged.get("database", "")).strip()
        user = str(merged.get("username", "")).strip()
        pwd = str(merged.get("password", "") or "")
        if pwd == "***redacted***":
            return {"ok": False, "status": "credentials_required", "message": "Provide active read-only password to run live database probe."}
        try:
            with psycopg.connect(
                host=host,
                port=port,
                dbname=db,
                user=user,
                password=pwd,
                connect_timeout=int(max(1, timeout)),
                options="-c default_transaction_read_only=on",
            ) as pg_conn:
                with pg_conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            return {"ok": True, "status": "connected", "message": f"PostgreSQL read-only connection to {host}:{port}/{db} verified."}
        except Exception as exc:
            return {"ok": False, "status": "connection_failed", "message": f"PostgreSQL connection failed: {exc}"}

    if source_type in {"mysql", "sql_server"}:
        host = str(merged.get("host", "")).strip()
        port = int(merged.get("port") or (3306 if source_type == "mysql" else 1433))
        driver_pkg = "pymysql" if source_type == "mysql" else "pyodbc"
        has_driver = False
        try:
            __import__(driver_pkg)
            has_driver = True
        except ImportError:
            has_driver = False
        if not has_driver:
            return {
                "ok": False,
                "status": "driver_missing",
                "message": f"{connector.capability.display_name} requires optional Python driver '{driver_pkg}' in runtime.",
            }
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return {"ok": True, "status": "tcp_reachable", "message": f"TCP endpoint {host}:{port} reachable ({driver_pkg} available)."}
        except OSError as exc:
            return {"ok": False, "status": "connection_failed", "message": f"Network connection to {host}:{port} failed: {exc}"}

    return connector.test_connection(config)


def discover_source_schema(
    source_row: dict[str, Any],
    *,
    timeout: float = 10.0,
    http_client: httpx.Client | None = None,
) -> dict[str, Any]:
    cfg = dict(source_row.get("config_json") or {})
    secrets = decrypt_secrets(source_row.get("encrypted_secrets_json"))
    stype = source_row["source_type"]

    if stype == "rest_api":
        url = validate_outbound_url(str(cfg.get("base_url", "")))
        headers = _auth_headers(cfg, secrets)
        if http_client is not None:
            res = http_client.get(url, headers=headers, timeout=timeout)
        else:
            with httpx.Client(timeout=timeout, follow_redirects=False) as client:
                res = client.get(url, headers=headers)
        res.raise_for_status()
        records = _extract_by_path(res.json(), cfg.get("records_path"))
        return {
            "source_id": source_row["id"],
            "source_type": stype,
            "columns": _infer_col_types(records),
            "sample_count": len(records),
            "sample_rows": records[:5],
        }

    if stype == "postgresql":
        schema_name = _valid_sql_ident(str(cfg.get("schema") or "public"), "schema")
        table_name = _valid_sql_ident(str(cfg.get("table_or_view") or ""), "table")
        pwd = str(secrets.get("password") or "")
        with psycopg.connect(
            host=str(cfg.get("host")),
            port=int(cfg.get("port") or 5432),
            dbname=str(cfg.get("database")),
            user=str(cfg.get("username")),
            password=pwd,
            connect_timeout=int(timeout),
            options="-c default_transaction_read_only=on",
        ) as pg_conn:
            with pg_conn.cursor() as cur:
                cur.execute(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_schema = %s AND table_name = %s ORDER BY ordinal_position",
                    (schema_name, table_name),
                )
                cols = [{"column_name": r[0], "data_type": r[1], "sample": None} for r in cur.fetchall()]
                cur.execute(f'SELECT * FROM "{schema_name}"."{table_name}" LIMIT 5')
                col_names = [desc[0] for desc in cur.description] if cur.description else []
                sample_rows = [dict(zip(col_names, row)) for row in cur.fetchall()]
        return {
            "source_id": source_row["id"],
            "source_type": stype,
            "schema": schema_name,
            "table_or_view": table_name,
            "columns": cols,
            "sample_count": len(sample_rows),
            "sample_rows": sample_rows,
        }

    raise IngestionValidationError(f"Live schema discovery is not enabled in this runtime for source type '{stype}'.")


def sync_source_incremental(
    engine: sa.Engine,
    storage: ObjectStorage,
    *,
    company_id: str,
    source_id: str,
    dataset_name: str | None = None,
    watermark_column: str | None = None,
    actor: str = "workspace-user",
    timeout: float = 15.0,
    http_client: httpx.Client | None = None,
) -> dict[str, Any]:
    with engine.connect() as conn:
        src = conn.execute(sa.select(data_sources).where(data_sources.c.id == source_id)).mappings().first()
        if src is None:
            raise LookupError("Data source not found.")
        if src["company_id"] != company_id:
            raise PermissionError("Cross-tenant data source access denied.")
        src_dict = dict(src)

    cfg = dict(src_dict.get("config_json") or {})
    secrets = decrypt_secrets(src_dict.get("encrypted_secrets_json"))
    stype = src_dict["source_type"]
    wm_before = src_dict.get("sync_watermark")
    wm_col = (watermark_column or cfg.get("watermark_column") or "").strip() or None
    records: list[dict[str, Any]] = []

    try:
        if stype == "rest_api":
            url = validate_outbound_url(str(cfg.get("base_url", "")))
            headers = _auth_headers(cfg, secrets)
            query_params = {"updated_after": wm_before} if (wm_before and wm_col) else {}
            if http_client is not None:
                res = http_client.get(url, headers=headers, params=query_params, timeout=timeout)
            else:
                with httpx.Client(timeout=timeout, follow_redirects=False) as client:
                    res = client.get(url, headers=headers, params=query_params)
            res.raise_for_status()
            fetched = _extract_by_path(res.json(), cfg.get("records_path"))
            if wm_col and wm_before:
                records = [r for r in fetched if str(r.get(wm_col) or "") > str(wm_before)]
            else:
                records = fetched
        elif stype == "postgresql":
            schema_name = _valid_sql_ident(str(cfg.get("schema") or "public"), "schema")
            table_name = _valid_sql_ident(str(cfg.get("table_or_view") or ""), "table")
            pwd = str(secrets.get("password") or "")
            with psycopg.connect(
                host=str(cfg.get("host")),
                port=int(cfg.get("port") or 5432),
                dbname=str(cfg.get("database")),
                user=str(cfg.get("username")),
                password=pwd,
                connect_timeout=int(timeout),
                options="-c default_transaction_read_only=on",
            ) as pg_conn:
                with pg_conn.cursor() as cur:
                    if wm_col:
                        safe_wm = _valid_sql_ident(wm_col, "watermark column")
                        if wm_before:
                            cur.execute(
                                f'SELECT * FROM "{schema_name}"."{table_name}" WHERE "{safe_wm}" > %s ORDER BY "{safe_wm}" ASC LIMIT 10000',
                                (wm_before,),
                            )
                        else:
                            cur.execute(
                                f'SELECT * FROM "{schema_name}"."{table_name}" ORDER BY "{safe_wm}" ASC LIMIT 10000'
                            )
                    else:
                        cur.execute(f'SELECT * FROM "{schema_name}"."{table_name}" LIMIT 10000')
                    col_names = [desc[0] for desc in cur.description] if cur.description else []
                    records = [dict(zip(col_names, row)) for row in cur.fetchall()]
        else:
            raise IngestionValidationError(f"Live incremental sync is not available in offline runtime for '{stype}'.")
    except Exception as exc:
        with engine.begin() as conn:
            log_id_err = conn.execute(
                connector_sync_logs.insert().values(
                    company_id=company_id,
                    data_source_id=source_id,
                    sync_mode="incremental" if wm_before else "full_initial",
                    status="failed",
                    watermark_before=wm_before,
                    watermark_after=wm_before,
                    records_fetched=0,
                    actor=actor,
                    details_json={"watermark_column": wm_col},
                    error_message=str(exc),
                    finished_at=_utc_now(),
                )
            ).inserted_primary_key[0]
        from backend.app.lineage.service import record_runtime_event

        record_runtime_event(
            engine,
            company_id=company_id,
            pipeline_key=f"connector:{source_id}",
            pipeline_name=f"Connector Sync — {src_dict['name']}",
            pipeline_type="connector_sync",
            run_key=f"conn_sync:{source_id}:{log_id_err}",
            dataset_id=None,
            actor=actor,
            event_type="Connector Sync Failed",
            step_order=2,
            status="failed",
            event_key=f"conn:{source_id}:sync:{log_id_err}",
            node_key=f"proc:conn:{source_id}",
            error_message=str(exc),
        )
        raise

    wm_after = wm_before
    if wm_col and records:
        vals = [str(r.get(wm_col)) for r in records if r.get(wm_col) not in (None, "")]
        if vals:
            wm_after = max(vals)

    ds_id: str | None = None
    if records:
        ds_id = uuid4().hex[:24]
        blob = json.dumps({"records": records}, default=str, ensure_ascii=False).encode("utf-8")
        fname = f"sync_{src_dict['source_type']}_{uuid4().hex[:8]}.json"
        raw_key = f"companies/{company_id}/datasets/{ds_id}/raw/{fname}"
        storage.put_bytes(raw_key, blob, content_type="application/json")
        parsed = parse_uploaded_dataset(blob, fname, limit=200)
        sugg = suggest_column_mapping(parsed.columns, parsed.rows)
        title = (dataset_name or "").strip() or f"{src_dict['name']} Sync ({len(records)} rows)"

        with engine.begin() as conn:
            conn.execute(
                enterprise_datasets.insert().values(
                    id=ds_id,
                    company_id=company_id,
                    data_source_id=source_id,
                    name=title[:160],
                    kind="connector_sync",
                    status="uploaded",
                    storage_mode="partitioned",
                    file_name=fname,
                    file_format="json",
                    file_size_bytes=len(blob),
                    checksum_sha256=hashlib.sha256(blob).hexdigest(),
                    raw_storage_key=raw_key,
                    row_count=parsed.total_rows,
                    mapping_confirmed=False,
                    quality_confirmed=False,
                    is_active=False,
                    mapping_json=sugg["suggested_mapping"],
                    cleaning_policy_json={"invalid_row_policy": "skip_invalid", "duplicate_policy": "keep_all"},
                    capabilities_json=sugg["capabilities_preview"],
                    metadata_json={
                        "columns": parsed.columns,
                        "sync_mode": "incremental" if wm_before else "full_initial",
                        "watermark_before": wm_before,
                        "watermark_after": wm_after,
                    },
                    created_by=actor,
                )
            )

    with engine.begin() as conn:
        conn.execute(
            data_sources.update()
            .where(data_sources.c.id == source_id, data_sources.c.company_id == company_id)
            .values(
                sync_watermark=wm_after,
                last_synced_at=_utc_now(),
                status="active",
                updated_at=_utc_now(),
            )
        )
        log_id = conn.execute(
            connector_sync_logs.insert().values(
                company_id=company_id,
                data_source_id=source_id,
                dataset_id=ds_id,
                sync_mode="incremental" if wm_before else "full_initial",
                status="completed",
                watermark_before=wm_before,
                watermark_after=wm_after,
                records_fetched=len(records),
                actor=actor,
                details_json={"watermark_column": wm_col},
                finished_at=_utc_now(),
            )
        ).inserted_primary_key[0]
        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="connector_synced",
                subject=source_id,
                payload={
                    "dataset_id": ds_id,
                    "records_fetched": len(records),
                    "watermark_before": wm_before,
                    "watermark_after": wm_after,
                    "actor": actor,
                },
            )
        )

    from backend.app.lineage.service import record_runtime_event

    record_runtime_event(
        engine,
        company_id=company_id,
        pipeline_key=f"connector:{source_id}",
        pipeline_name=f"Connector Sync — {src_dict['name']}",
        pipeline_type="connector_sync",
        run_key=f"conn_sync:{source_id}:{int(log_id)}",
        dataset_id=ds_id,
        actor=actor,
        event_type="Connector Sync Completed",
        step_order=2,
        status="completed",
        event_key=f"conn:{source_id}:sync:{int(log_id)}",
        node_key=f"proc:conn:{source_id}",
        input_summary=f"Watermark={wm_before or 'initial'}",
        output_summary=f"Fetched {len(records)} rows",
    )

    return {
        "sync_log_id": int(log_id),
        "source_id": source_id,
        "dataset_id": ds_id,
        "sync_mode": "incremental" if wm_before else "full_initial",
        "records_fetched": len(records),
        "watermark_before": wm_before,
        "watermark_after": wm_after,
    }

