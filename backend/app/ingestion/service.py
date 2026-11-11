"""Enterprise Multi-Tenant Data Ingestion Service: workflow orchestration, quality assurance, atomic import & isolation."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import logging
import re
from typing import Any
from uuid import uuid4

import joblib
import sqlalchemy as sa
from fastapi import HTTPException

from ai_service import anomaly, forecasting
from ai_service.features import anomaly_frame, observed_series
from backend.app.analytics import FULL_CAPABILITIES, _format_enterprise_row, dataset_info
from backend.app.db import (
    ARTIFACTS,
    audit,
    companies,
    data_sources,
    dataset_quality_reports,
    datasets as legacy_datasets,
    enterprise_datasets,
    import_logs,
    mapping_templates,
    tenant_inventory_daily,
    tenant_marketing_daily,
    tenant_products,
    tenant_transactions,
)
from backend.app.ingestion.connectors import get_connector, redact_config
from backend.app.ingestion.mapper import (
    CANONICAL_FIELDS,
    CUSTOM_PREFIX,
    IGNORE_FIELD,
    compute_capabilities,
    compute_source_signature,
    suggest_column_mapping,
)
from backend.app.ingestion.parsers import (
    FileTooLargeError,
    IngestionValidationError,
    parse_uploaded_dataset,
    safe_filename,
)
from backend.app.ingestion.quality import (
    evaluate_and_clean,
    render_error_report_csv,
    render_error_report_json,
)
from backend.app.ingestion.storage import ObjectStorage

log = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _slugify(value: str, fallback: str = "item") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return (cleaned or fallback)[:60]


def _product_id_map(names: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    used: set[str] = set()
    for name in sorted(set(names)):
        candidate = re.sub(r"[^a-zA-Z0-9._-]+", "_", name.strip()).strip("_")[:64]
        if not candidate or candidate in used:
            h = hashlib.sha1(name.encode("utf-8")).hexdigest()[:8]
            base = (candidate or "SKU")[:55]
            candidate = f"{base}_{h}"
        used.add(candidate)
        mapping[name] = candidate
    return mapping


def _json_safe_iso(dt: datetime | date | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return dt.isoformat()


def _serialize_dataset_summary(row: dict[str, Any], company_name: str, latest_quality: dict[str, Any] | None = None) -> dict[str, Any]:
    meta = dict(row.get("metadata_json") or {})
    return {
        "id": row["id"],
        "dataset_id": row["id"],
        "company_id": row["company_id"],
        "company_name": company_name,
        "data_source_id": row["data_source_id"],
        "name": row["name"],
        "kind": row["kind"],
        "status": row["status"],
        "storage_mode": row["storage_mode"],
        "file_name": row.get("file_name"),
        "file_format": row.get("file_format"),
        "file_size_bytes": int(row.get("file_size_bytes") or 0),
        "selected_sheet": row.get("selected_sheet"),
        "sheets": meta.get("sheets", []),
        "columns": meta.get("columns", []),
        "row_count": int(row.get("row_count") or 0),
        "valid_rows": int(row.get("valid_rows") or 0),
        "invalid_rows": int(row.get("invalid_rows") or 0),
        "duplicate_rows": int(row.get("duplicate_rows") or 0),
        "date_start": _json_safe_iso(row.get("date_start")) or meta.get("start"),
        "date_end": _json_safe_iso(row.get("date_end")) or meta.get("end"),
        "currency": meta.get("currency", "USD"),
        "mapping_confirmed": bool(row.get("mapping_confirmed")),
        "quality_confirmed": bool(row.get("quality_confirmed")),
        "is_active": bool(row.get("is_active")),
        "mapping": row.get("mapping_json") or {},
        "cleaning_policy": row.get("cleaning_policy_json") or {"invalid_row_policy": "skip_invalid", "duplicate_policy": "keep_all"},
        "capabilities": row.get("capabilities_json") or {},
        "parse_warnings": meta.get("parse_warnings", []),
        "quality_summary": latest_quality,
        "quality_score": (latest_quality or {}).get("overall_score") if latest_quality else meta.get("quality_score"),
        "created_by": row["created_by"],
        "created_at": _json_safe_iso(row.get("created_at")),
        "updated_at": _json_safe_iso(row.get("updated_at")),
        "imported_at": _json_safe_iso(row.get("imported_at")),
    }


def _ensure_company_and_source(conn: sa.Connection, company_id: str) -> tuple[dict[str, Any], str]:
    company = conn.execute(sa.select(companies).where(companies.c.id == company_id)).mappings().first()
    if company is None:
        if company_id == "comp-default":
            conn.execute(
                companies.insert().values(
                    id="comp-default",
                    name="Default Enterprise Workspace",
                    slug="default",
                    status="active",
                )
            )
            company = conn.execute(sa.select(companies).where(companies.c.id == "comp-default")).mappings().one()
        else:
            raise HTTPException(404, f"Company workspace '{company_id}' does not exist.")
    src_id = f"src-file-{company_id[:48]}"
    existing_src = conn.scalar(sa.select(data_sources.c.id).where(data_sources.c.id == src_id))
    if not existing_src:
        conn.execute(
            data_sources.insert().values(
                id=src_id,
                company_id=company_id,
                name="Direct File Upload",
                source_type="file_upload",
                config_json={"supported_formats": ["csv", "xlsx", "xls", "json"]},
                status="active",
            )
        )
    return dict(company), src_id


def sync_default_legacy_dataset(conn: sa.Connection, company_id: str) -> dict[str, Any]:
    company, src_id = _ensure_company_and_source(conn, company_id)
    if company_id != "comp-default":
        return company
    legacy = conn.scalar(sa.select(legacy_datasets.c.payload))
    if not legacy:
        return company

    legacy_rows = conn.execute(
        sa.select(enterprise_datasets).where(
            enterprise_datasets.c.company_id == "comp-default",
            enterprise_datasets.c.storage_mode == "legacy_snapshot",
        )
    ).mappings().all()

    ds_id = legacy["dataset_id"]
    already = next((r for r in legacy_rows if r["id"] == ds_id), None)
    has_other_active = bool(
        company.get("active_dataset_id")
        and company["active_dataset_id"] != ds_id
        and conn.scalar(
            sa.select(enterprise_datasets.c.id).where(
                enterprise_datasets.c.id == company["active_dataset_id"],
                enterprise_datasets.c.company_id == "comp-default",
                enterprise_datasets.c.storage_mode == "partitioned",
                enterprise_datasets.c.status == "imported",
            )
        )
    )

    if already is None:
        # Clean up stale legacy snapshot pointers if dataset_id changed
        for stale in legacy_rows:
            conn.execute(enterprise_datasets.delete().where(enterprise_datasets.c.id == stale["id"]))
        make_active = not has_other_active
        conn.execute(
            enterprise_datasets.insert().values(
                id=ds_id,
                company_id="comp-default",
                data_source_id=src_id,
                name=legacy.get("title") or "Enterprise Demo Business Snapshot",
                kind=legacy.get("kind") or "synthetic",
                status="imported",
                storage_mode="legacy_snapshot",
                file_name=None,
                file_format="snapshot",
                file_size_bytes=0,
                row_count=int(legacy.get("counts", {}).get("sales_transactions", 0)),
                valid_rows=int(legacy.get("counts", {}).get("sales_transactions", 0)),
                invalid_rows=0,
                duplicate_rows=0,
                date_start=date.fromisoformat(legacy["start"]) if legacy.get("start") else None,
                date_end=date.fromisoformat(legacy["end"]) if legacy.get("end") else None,
                mapping_confirmed=True,
                quality_confirmed=True,
                is_active=make_active,
                mapping_json={},
                cleaning_policy_json={"invalid_row_policy": "skip_invalid", "duplicate_policy": "keep_all"},
                capabilities_json=FULL_CAPABILITIES,
                metadata_json=legacy,
                created_by="system",
                imported_at=_utc_now(),
            )
        )
        if make_active:
            conn.execute(
                companies.update().where(companies.c.id == "comp-default").values(active_dataset_id=ds_id)
            )
            company["active_dataset_id"] = ds_id
    elif not has_other_active and company.get("active_dataset_id") != ds_id:
        conn.execute(
            enterprise_datasets.update()
            .where(enterprise_datasets.c.id == ds_id)
            .values(is_active=True)
        )
        conn.execute(companies.update().where(companies.c.id == "comp-default").values(active_dataset_id=ds_id))
        company["active_dataset_id"] = ds_id
    return company


def list_companies(conn: sa.Connection, allowed_company_ids: list[str]) -> list[dict[str, Any]]:
    q = sa.select(companies).order_by(companies.c.created_at.asc(), companies.c.name.asc())
    if "*" not in allowed_company_ids:
        q = q.where(companies.c.id.in_(allowed_company_ids))
    rows = []
    for r in conn.execute(q).mappings():
        ds_count = conn.scalar(
            sa.select(sa.func.count()).select_from(enterprise_datasets).where(enterprise_datasets.c.company_id == r["id"])
        ) or 0
        rows.append(
            {
                "id": r["id"],
                "name": r["name"],
                "slug": r["slug"],
                "status": r["status"],
                "active_dataset_id": r["active_dataset_id"],
                "dataset_count": int(ds_count),
                "created_at": _json_safe_iso(r["created_at"]),
            }
        )
    return rows


def create_company(engine: sa.Engine, *, name: str, slug: str | None, actor: str, activate: bool = True) -> dict[str, Any]:
    comp_id = f"comp-{uuid4().hex[:12]}"
    resolved_slug = slug or _slugify(name, comp_id)
    with engine.begin() as conn:
        existing_slug = conn.scalar(sa.select(companies.c.id).where(companies.c.slug == resolved_slug))
        if existing_slug:
            resolved_slug = f"{resolved_slug[:48]}-{uuid4().hex[:6]}"
        conn.execute(
            companies.insert().values(
                id=comp_id,
                name=name.strip(),
                slug=resolved_slug,
                status="active",
                active_dataset_id=None,
            )
        )
        _ensure_company_and_source(conn, comp_id)
        conn.execute(
            audit.insert().values(
                company_id=comp_id,
                kind="company_created",
                subject=comp_id,
                payload={"name": name.strip(), "slug": resolved_slug, "actor": actor, "activate": activate},
            )
        )
    return {
        "id": comp_id,
        "name": name.strip(),
        "slug": resolved_slug,
        "status": "active",
        "active_dataset_id": None,
        "dataset_count": 0,
    }


def _get_owned_dataset(conn: sa.Connection, company_id: str, dataset_id: str) -> dict[str, Any]:
    ds = conn.execute(sa.select(enterprise_datasets).where(enterprise_datasets.c.id == dataset_id)).mappings().first()
    if ds is None:
        raise HTTPException(404, "Dataset not found.")
    if ds["company_id"] != company_id:
        raise HTTPException(403, "Cross-tenant dataset access denied.")
    return dict(ds)


def _log_stage(
    conn: sa.Connection,
    *,
    dataset_id: str,
    company_id: str,
    data_source_id: str,
    stage: str,
    status: str,
    actor: str,
    details: dict[str, Any],
    error_message: str | None = None,
) -> None:
    conn.execute(
        import_logs.insert().values(
            dataset_id=dataset_id,
            company_id=company_id,
            data_source_id=data_source_id,
            stage=stage,
            status=status,
            actor=actor,
            details_json=details,
            error_message=error_message,
        )
    )


def upload_dataset(
    engine: sa.Engine,
    storage: ObjectStorage,
    *,
    company_id: str,
    filename: str,
    blob: bytes,
    dataset_name: str | None = None,
    sheet_name: str | None = None,
    data_source_id: str | None = None,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    try:
        clean_name = safe_filename(filename)
        parsed = parse_uploaded_dataset(blob, clean_name, sheet_name=sheet_name, limit=200)
    except FileTooLargeError as exc:
        raise HTTPException(413, str(exc)) from exc
    except IngestionValidationError as exc:
        raise HTTPException(422, str(exc)) from exc

    dataset_id = uuid4().hex[:24]
    checksum = hashlib.sha256(blob).hexdigest()
    raw_key = f"companies/{company_id}/datasets/{dataset_id}/raw/{clean_name}"
    storage.put_bytes(raw_key, blob)

    with engine.begin() as conn:
        company, default_src_id = _ensure_company_and_source(conn, company_id)
        if company_id == "comp-default":
            sync_default_legacy_dataset(conn, company_id)

        resolved_src_id = default_src_id
        if data_source_id:
            src_row = conn.execute(sa.select(data_sources).where(data_sources.c.id == data_source_id)).mappings().first()
            if src_row is None:
                storage.delete_prefix(f"companies/{company_id}/datasets/{dataset_id}")
                raise HTTPException(404, "Specified data source was not found.")
            if src_row["company_id"] != company_id:
                storage.delete_prefix(f"companies/{company_id}/datasets/{dataset_id}")
                raise HTTPException(403, "Data source belongs to another company.")
            resolved_src_id = src_row["id"]

        tpl_rows = [
            dict(r)
            for r in conn.execute(
                sa.select(mapping_templates)
                .where(mapping_templates.c.company_id == company_id)
                .order_by(mapping_templates.c.updated_at.desc())
            ).mappings()
        ]
        ai_suggestions = suggest_column_mapping(parsed.columns, parsed.rows, templates=tpl_rows)

        title = (dataset_name or "").strip() or clean_name.rsplit(".", 1)[0]
        meta = {
            "columns": parsed.columns,
            "sheets": parsed.sheets,
            "encoding": parsed.encoding,
            "delimiter": parsed.delimiter,
            "parse_warnings": parsed.parse_warnings,
            "currency": "USD",
            "timezone": "Asia/Ho_Chi_Minh",
            "source_signature": ai_suggestions["source_signature"],
        }
        conn.execute(
            enterprise_datasets.insert().values(
                id=dataset_id,
                company_id=company_id,
                data_source_id=resolved_src_id,
                name=title[:160],
                kind="uploaded",
                status="uploaded",
                storage_mode="partitioned",
                file_name=clean_name,
                file_format=parsed.file_format,
                file_size_bytes=len(blob),
                checksum_sha256=checksum,
                raw_storage_key=raw_key,
                cleaned_storage_key=None,
                selected_sheet=parsed.selected_sheet,
                row_count=parsed.total_rows,
                valid_rows=0,
                invalid_rows=0,
                duplicate_rows=0,
                mapping_confirmed=False,
                quality_confirmed=False,
                is_active=False,
                mapping_json=ai_suggestions["suggested_mapping"],
                cleaning_policy_json={"invalid_row_policy": "skip_invalid", "duplicate_policy": "keep_all"},
                capabilities_json=ai_suggestions["capabilities_preview"],
                metadata_json=meta,
                created_by=actor,
            )
        )
        _log_stage(
            conn,
            dataset_id=dataset_id,
            company_id=company_id,
            data_source_id=resolved_src_id,
            stage="upload",
            status="completed",
            actor=actor,
            details={
                "file_name": clean_name,
                "file_format": parsed.file_format,
                "file_size_bytes": len(blob),
                "total_rows": parsed.total_rows,
                "columns_count": len(parsed.columns),
                "sheet": parsed.selected_sheet,
            },
        )
        ds_row = _get_owned_dataset(conn, company_id, dataset_id)
        company_name = company["name"]

    return {
        "dataset": _serialize_dataset_summary(ds_row, company_name),
        "preview": {
            "columns": parsed.columns,
            "rows": parsed.rows[:50],
            "total_rows": parsed.total_rows,
            "sheets": parsed.sheets,
            "selected_sheet": parsed.selected_sheet,
            "parse_warnings": parsed.parse_warnings,
        },
        "mapping_suggestions": ai_suggestions,
    }


def preview_dataset(
    conn: sa.Connection,
    storage: ObjectStorage,
    *,
    company_id: str,
    dataset_id: str,
    sheet_name: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    ds = _get_owned_dataset(conn, company_id, dataset_id)
    if ds["storage_mode"] == "legacy_snapshot":
        raise HTTPException(422, "Raw file preview is only available for uploaded enterprise datasets.")
    if not ds.get("raw_storage_key"):
        raise HTTPException(404, "Raw file object key is missing.")
    try:
        blob = storage.get_bytes(ds["raw_storage_key"])
    except FileNotFoundError as exc:
        raise HTTPException(404, "Stored raw dataset file could not be located.") from exc

    target_sheet = sheet_name or ds.get("selected_sheet")
    try:
        parsed = parse_uploaded_dataset(blob, ds["file_name"] or "upload.csv", sheet_name=target_sheet, limit=max(limit, 200))
    except IngestionValidationError as exc:
        raise HTTPException(422, str(exc)) from exc

    tpl_rows = [
        dict(r)
        for r in conn.execute(
            sa.select(mapping_templates)
            .where(mapping_templates.c.company_id == company_id)
            .order_by(mapping_templates.c.updated_at.desc())
        ).mappings()
    ]
    suggestions = suggest_column_mapping(parsed.columns, parsed.rows, templates=tpl_rows)

    current_mapping = ds.get("mapping_json") or {}
    if set(current_mapping.keys()) != set(parsed.columns):
        current_mapping = suggestions["suggested_mapping"]

    return {
        "dataset_id": dataset_id,
        "company_id": company_id,
        "file_name": ds.get("file_name"),
        "file_format": parsed.file_format,
        "total_rows": parsed.total_rows,
        "columns": parsed.columns,
        "rows": parsed.rows[:limit],
        "sheets": parsed.sheets,
        "selected_sheet": parsed.selected_sheet,
        "parse_warnings": parsed.parse_warnings,
        "current_mapping": current_mapping,
        "mapping_suggestions": suggestions,
    }


def save_mapping(
    engine: sa.Engine,
    storage: ObjectStorage,
    *,
    company_id: str,
    dataset_id: str,
    mappings: dict[str, str],
    custom_fields: list[str],
    sheet_name: str | None,
    currency: str | None,
    confirmed: bool,
    save_template: bool,
    template_name: str | None,
    template_id: str | None,
    actor: str,
) -> dict[str, Any]:
    with engine.begin() as conn:
        company, _ = _ensure_company_and_source(conn, company_id)
        ds = _get_owned_dataset(conn, company_id, dataset_id)
        if ds["storage_mode"] == "legacy_snapshot":
            raise HTTPException(422, "Built-in demo snapshot schema cannot be remapped.")
        try:
            blob = storage.get_bytes(ds["raw_storage_key"])
        except FileNotFoundError as exc:
            raise HTTPException(404, "Stored raw dataset file could not be located.") from exc

        effective_sheet = sheet_name or ds.get("selected_sheet")
        try:
            parsed = parse_uploaded_dataset(blob, ds["file_name"] or "upload.csv", sheet_name=effective_sheet, limit=200)
        except IngestionValidationError as exc:
            raise HTTPException(422, str(exc)) from exc

        resolved_map = dict(mappings)
        resolved_custom = list(custom_fields)
        if template_id:
            tpl = conn.execute(
                sa.select(mapping_templates).where(mapping_templates.c.id == template_id)
            ).mappings().first()
            if tpl is None:
                raise HTTPException(404, "Mapping template not found.")
            if tpl["company_id"] != company_id:
                raise HTTPException(403, "Cannot apply a mapping template owned by another company.")
            tpl_map = tpl["mappings_json"] or {}
            resolved_map = {col: tpl_map.get(col, resolved_map.get(col, IGNORE_FIELD)) for col in parsed.columns}
            resolved_custom = list(dict.fromkeys([*(tpl.get("custom_fields_json") or []), *resolved_custom]))

        # Validate targets & duplicate canonical mappings
        canon_owners: dict[str, str] = {}
        clean_map: dict[str, str] = {}
        for col in parsed.columns:
            tgt = (resolved_map.get(col) or IGNORE_FIELD).strip()
            if tgt != IGNORE_FIELD and tgt not in CANONICAL_FIELDS:
                if tgt.startswith(CUSTOM_PREFIX):
                    custom_name = tgt[len(CUSTOM_PREFIX):].strip()
                    if not custom_name:
                        raise HTTPException(422, f"Custom field name for column '{col}' cannot be blank.")
                elif tgt in resolved_custom:
                    tgt = f"{CUSTOM_PREFIX}{tgt}"
                else:
                    raise HTTPException(422, f"Unsupported mapping target '{tgt}' for column '{col}'.")
            if tgt in CANONICAL_FIELDS:
                if tgt in canon_owners:
                    raise HTTPException(
                        422,
                        f"Multiple columns ('{canon_owners[tgt]}' and '{col}') cannot both map to '{CANONICAL_FIELDS[tgt]['label']}'.",
                    )
                canon_owners[tgt] = col
            clean_map[col] = tgt

        mapped_canon = set(canon_owners.keys())
        if confirmed and ({"date", "revenue"} - mapped_canon):
            missing = [CANONICAL_FIELDS[f]["label"] for f in ("date", "revenue") if f not in mapped_canon]
            raise HTTPException(422, f"Required mapping missing before confirmation: {', '.join(missing)}.")

        caps = compute_capabilities(mapped_canon)
        meta = dict(ds.get("metadata_json") or {})
        meta["columns"] = parsed.columns
        if parsed.sheets:
            meta["sheets"] = parsed.sheets
        meta["source_signature"] = compute_source_signature(parsed.columns)
        if currency:
            meta["currency"] = currency
            meta["currency_user_set"] = True

        saved_template = None
        if save_template:
            tpl_label = (template_name or "").strip() or f"{ds['name']} Template"
            tpl_id = f"tpl-{uuid4().hex[:12]}"
            conn.execute(
                mapping_templates.insert().values(
                    id=tpl_id,
                    company_id=company_id,
                    name=tpl_label[:120],
                    source_signature=meta["source_signature"],
                    mappings_json=clean_map,
                    custom_fields_json=resolved_custom,
                    created_by=actor,
                )
            )
            saved_template = {"id": tpl_id, "name": tpl_label[:120], "source_signature": meta["source_signature"]}

        next_status = "imported" if ds["status"] == "imported" else ("mapped" if confirmed else "uploaded")
        conn.execute(
            enterprise_datasets.update()
            .where(enterprise_datasets.c.id == dataset_id, enterprise_datasets.c.company_id == company_id)
            .values(
                selected_sheet=parsed.selected_sheet,
                row_count=parsed.total_rows,
                mapping_json=clean_map,
                mapping_confirmed=confirmed,
                capabilities_json=caps,
                metadata_json=meta,
                status=next_status,
                updated_at=_utc_now(),
            )
        )
        _log_stage(
            conn,
            dataset_id=dataset_id,
            company_id=company_id,
            data_source_id=ds["data_source_id"],
            stage="mapping",
            status="completed",
            actor=actor,
            details={
                "confirmed": confirmed,
                "mapped_fields": sorted(mapped_canon),
                "saved_template": saved_template,
                "sheet": parsed.selected_sheet,
            },
        )
        updated_ds = _get_owned_dataset(conn, company_id, dataset_id)

    return {
        "dataset": _serialize_dataset_summary(updated_ds, company["name"]),
        "mapping": clean_map,
        "capabilities": caps,
        "saved_template": saved_template,
    }


def validate_dataset(
    engine: sa.Engine,
    storage: ObjectStorage,
    *,
    company_id: str,
    dataset_id: str,
    sheet_name: str | None = None,
    mappings: dict[str, str] | None = None,
    custom_fields: list[str] | None = None,
    invalid_row_policy: str = "skip_invalid",
    duplicate_policy: str = "keep_all",
    currency: str | None = None,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    with engine.begin() as conn:
        company, _ = _ensure_company_and_source(conn, company_id)
        ds = _get_owned_dataset(conn, company_id, dataset_id)
        if ds["storage_mode"] == "legacy_snapshot":
            raise HTTPException(422, "Legacy snapshot uses structural verification at snapshot load time.")
        try:
            blob = storage.get_bytes(ds["raw_storage_key"])
        except FileNotFoundError as exc:
            raise HTTPException(404, "Stored raw dataset file could not be located.") from exc

        effective_sheet = sheet_name or ds.get("selected_sheet")
        try:
            parsed = parse_uploaded_dataset(blob, ds["file_name"] or "upload.csv", sheet_name=effective_sheet, limit=None)
        except IngestionValidationError as exc:
            raise HTTPException(422, str(exc)) from exc

        effective_mapping = mappings if mappings is not None else (ds.get("mapping_json") or {})
        meta = dict(ds.get("metadata_json") or {})
        preferred_cur = currency or (meta.get("currency") if meta.get("currency_user_set") else None)
        result = evaluate_and_clean(
            parsed.columns,
            parsed.rows,
            effective_mapping,
            row_numbers=parsed.row_numbers,
            custom_fields=custom_fields,
            invalid_row_policy=invalid_row_policy,
            duplicate_policy=duplicate_policy,
            preferred_currency=preferred_cur,
        )

        # Persist downloadable error report & cleaned preview artifact to object storage
        err_key = f"companies/{company_id}/datasets/{dataset_id}/reports/error_report.csv"
        err_json_key = f"companies/{company_id}/datasets/{dataset_id}/reports/error_report.json"
        storage.put_bytes(err_key, render_error_report_csv(result.all_issues), content_type="text/csv")
        storage.put_bytes(err_json_key, render_error_report_json(result.report, result.all_issues), content_type="application/json")

        cleaned_preview_key = f"companies/{company_id}/datasets/{dataset_id}/cleaned/validated_records.json"
        serializable_cleaned = [{**r, "date": r["date"].isoformat() if r["date"] else None} for r in result.cleaned_rows]
        storage.put_bytes(cleaned_preview_key, json.dumps(serializable_cleaned).encode("utf-8"), content_type="application/json")

        report_id = f"qr-{uuid4().hex[:14]}"
        conn.execute(
            dataset_quality_reports.insert().values(
                id=report_id,
                dataset_id=dataset_id,
                company_id=company_id,
                overall_score=result.report["overall_score"],
                completeness_score=result.report["dimensions"]["completeness"],
                validity_score=result.report["dimensions"]["validity"],
                consistency_score=result.report["dimensions"]["consistency"],
                uniqueness_score=result.report["dimensions"]["uniqueness"],
                accuracy_score=result.report["dimensions"]["accuracy"],
                total_rows=result.report["total_rows"],
                valid_rows=result.report["valid_rows"],
                invalid_rows=result.report["invalid_rows"],
                missing_values_count=result.report["missing_values"],
                duplicate_records_count=result.report["duplicate_records"],
                column_metrics_json=result.report["column_quality"],
                warnings_json=result.report["warnings"],
                error_summary_json={
                    "issue_breakdown": result.report["issue_breakdown"],
                    "sample_errors": result.report["sample_errors"],
                    "inconsistent_date_formats": result.report["inconsistent_date_formats"],
                    "mixed_currency_formats": result.report["mixed_currency_formats"],
                    "cleaning_summary": result.report["cleaning_summary"],
                    "error_report_json_key": err_json_key,
                    "detected_currency": result.detected_currency,
                },
                error_report_storage_key=err_key,
            )
        )

        if currency:
            meta["currency_user_set"] = True
        meta["currency"] = preferred_cur or result.detected_currency
        meta["quality_score"] = result.report["overall_score"]
        meta["columns"] = parsed.columns
        if parsed.sheets:
            meta["sheets"] = parsed.sheets
        meta["start"] = result.date_start.isoformat() if result.date_start else None
        meta["end"] = result.date_end.isoformat() if result.date_end else None

        next_status = "imported" if ds["status"] == "imported" else "validated"
        conn.execute(
            enterprise_datasets.update()
            .where(enterprise_datasets.c.id == dataset_id, enterprise_datasets.c.company_id == company_id)
            .values(
                selected_sheet=parsed.selected_sheet,
                row_count=result.report["total_rows"],
                valid_rows=result.report["valid_rows"],
                invalid_rows=result.report["invalid_rows"],
                duplicate_rows=result.report["duplicate_records"],
                date_start=result.date_start,
                date_end=result.date_end,
                mapping_json=effective_mapping,
                cleaning_policy_json={"invalid_row_policy": invalid_row_policy, "duplicate_policy": duplicate_policy},
                capabilities_json=result.capabilities,
                metadata_json=meta,
                cleaned_storage_key=cleaned_preview_key,
                status=next_status,
                updated_at=_utc_now(),
            )
        )
        _log_stage(
            conn,
            dataset_id=dataset_id,
            company_id=company_id,
            data_source_id=ds["data_source_id"],
            stage="validation",
            status="completed",
            actor=actor,
            details={
                "overall_score": result.report["overall_score"],
                "valid_rows": result.report["valid_rows"],
                "invalid_rows": result.report["invalid_rows"],
                "duplicate_records": result.report["duplicate_records"],
                "invalid_row_policy": invalid_row_policy,
                "duplicate_policy": duplicate_policy,
            },
        )
        updated_ds = _get_owned_dataset(conn, company_id, dataset_id)

    return {
        "dataset": _serialize_dataset_summary(updated_ds, company["name"], result.report),
        "quality_report": {**result.report, "id": report_id, "error_report_available": True},
    }


def _insert_partitioned_rows(
    conn: sa.Connection,
    *,
    company_id: str,
    dataset_id: str,
    cleaned_rows: list[dict[str, Any]],
    capabilities: dict[str, bool],
) -> dict[str, int]:
    """Atomic bulk insert into tenant-partitioned analytical tables. Extracted for clean testability."""
    for tbl in (tenant_inventory_daily, tenant_marketing_daily, tenant_transactions, tenant_products):
        conn.execute(tbl.delete().where(tbl.c.company_id == company_id, tbl.c.dataset_id == dataset_id))

    prod_ids = _product_id_map([r["product"] for r in cleaned_rows])
    prod_agg: dict[str, dict[str, Any]] = {}
    tx_rows: list[dict[str, Any]] = []
    mkt_agg: dict[tuple[date, str], dict[str, Any]] = {}
    inv_agg: dict[tuple[date, str], dict[str, Any]] = {}
    customer_ids: set[str] = set()

    has_inventory = bool(capabilities.get("has_inventory"))
    has_marketing = bool(capabilities.get("has_marketing"))

    for r in cleaned_rows:
        pid = prod_ids[r["product"]]
        p_entry = prod_agg.setdefault(
            pid,
            {
                "company_id": company_id,
                "dataset_id": dataset_id,
                "product_id": pid,
                "product_name": r["product"][:160],
                "category": r["category"][:120],
                "brand": r["category"][:120],
                "price_sum": 0.0,
                "cost_sum": 0.0,
                "qty_sum": 0,
                "last_stock": None,
                "last_stock_date": None,
            },
        )
        p_entry["price_sum"] += float(r["unit_price"]) * max(1, int(r["quantity"]))
        p_entry["cost_sum"] += float(r["unit_cost"]) * max(1, int(r["quantity"]))
        p_entry["qty_sum"] += max(1, int(r["quantity"]))
        if r.get("inventory_level") is not None:
            if p_entry["last_stock_date"] is None or r["date"] >= p_entry["last_stock_date"]:
                p_entry["last_stock_date"] = r["date"]
                p_entry["last_stock"] = int(r["inventory_level"])

        customer_ids.add(r["customer"])
        m_chan = r["channel"] if has_marketing and r.get("marketing_spend") is not None else None
        tx_rows.append(
            {
                "company_id": company_id,
                "dataset_id": dataset_id,
                "row_num": int(r["row_num"]),
                "transaction_id": f"TX-{int(r['row_num'])}",
                "date": r["date"],
                "product_id": pid,
                "product_name": r["product"][:160],
                "category": r["category"][:120],
                "customer_id": r["customer"][:120],
                "customer_segment": r["category"][:120],
                "region": r["region"][:120],
                "sales_channel": r["channel"][:120],
                "quantity": int(r["quantity"]),
                "unit_price": float(r["unit_price"]),
                "discount_pct": 0.0,
                "revenue": float(r["revenue"]),
                "unit_cost": float(r["unit_cost"]),
                "total_cost": float(r["total_cost"]),
                "gross_profit": float(r["gross_profit"]) if r["gross_profit"] is not None else None,
                "marketing_channel": m_chan[:120] if m_chan else None,
                "marketing_spend": float(r["marketing_spend"]) if r.get("marketing_spend") is not None else None,
                "inventory_level": int(r["inventory_level"]) if r.get("inventory_level") is not None else None,
                "custom_fields_json": r.get("custom_fields_json"),
            }
        )

        if has_marketing and r.get("marketing_spend") is not None and float(r["marketing_spend"]) >= 0:
            key = (r["date"], r["channel"][:120])
            entry = mkt_agg.setdefault(
                key,
                {
                    "company_id": company_id,
                    "dataset_id": dataset_id,
                    "date": r["date"],
                    "channel": r["channel"][:120],
                    "spend": 0.0,
                    "attributed_revenue": 0.0,
                    "orders": 0,
                    "leads": 0,
                    "clicks": 0,
                    "impressions": 0,
                },
            )
            entry["spend"] += float(r["marketing_spend"])
            entry["attributed_revenue"] += float(r["revenue"])
            entry["orders"] += 1
            entry["leads"] += 1

        if has_inventory and r.get("inventory_level") is not None:
            ikey = (r["date"], pid)
            inv_entry = inv_agg.setdefault(
                ikey,
                {
                    "company_id": company_id,
                    "dataset_id": dataset_id,
                    "date": r["date"],
                    "product_id": pid,
                    "closing_stock": max(0, int(r["inventory_level"])),
                    "sold_qty": 0,
                },
            )
            inv_entry["sold_qty"] += max(0, int(r["quantity"]))
            inv_entry["closing_stock"] = max(0, int(r["inventory_level"]))

    product_rows = []
    for pid, p in prod_agg.items():
        denom = max(1, p["qty_sum"])
        avg_price = max(0.01, round(p["price_sum"] / denom, 4))
        avg_cost = max(0.0, round(p["cost_sum"] / denom, 4))
        stock_val = p["last_stock"]
        is_phys = stock_val is not None
        product_rows.append(
            {
                "company_id": company_id,
                "dataset_id": dataset_id,
                "product_id": pid,
                "product_name": p["product_name"],
                "category": p["category"],
                "brand": p["brand"],
                "list_price": avg_price,
                "unit_cost": avg_cost,
                "supplier": "Primary Supplier",
                "is_physical": is_phys,
                "lead_time_days": 7 if is_phys else None,
                "reorder_point": max(5, int(round((denom / 30.0) * 7))) if is_phys else None,
                "current_stock": stock_val,
                "elasticity": -1.1,
            }
        )

    inv_rows = []
    for (d_val, pid), item in inv_agg.items():
        closing = item["closing_stock"]
        sold = item["sold_qty"]
        opening = closing + sold
        inv_rows.append(
            {
                "company_id": company_id,
                "dataset_id": dataset_id,
                "date": d_val,
                "product_id": pid,
                "opening_stock": opening,
                "received_qty": 0,
                "sold_qty": sold,
                "closing_stock": closing,
                "stockout_flag": closing == 0,
            }
        )

    mkt_rows = list(mkt_agg.values())
    for chunk_start in range(0, len(product_rows), 500):
        conn.execute(tenant_products.insert(), product_rows[chunk_start:chunk_start + 500])
    for chunk_start in range(0, len(tx_rows), 1000):
        conn.execute(tenant_transactions.insert(), tx_rows[chunk_start:chunk_start + 1000])
    for chunk_start in range(0, len(mkt_rows), 500):
        conn.execute(tenant_marketing_daily.insert(), mkt_rows[chunk_start:chunk_start + 500])
    for chunk_start in range(0, len(inv_rows), 500):
        conn.execute(tenant_inventory_daily.insert(), inv_rows[chunk_start:chunk_start + 500])

    return {
        "sales_transactions": len(tx_rows),
        "products": len(product_rows),
        "customers": len(customer_ids) if capabilities.get("has_customer") else 0,
        "marketing_campaigns": len(mkt_rows),
        "inventory_daily": len(inv_rows),
    }


def train_partitioned_artifacts(engine: sa.Engine, info: dict[str, Any]) -> bool:
    """Build isolated forecast + anomaly joblib bundle when dataset covers >= 7 calendar days."""
    d_start = date.fromisoformat(info["start"]) if info.get("start") else None
    d_end = date.fromisoformat(info["end"]) if info.get("end") else None
    if not d_start or not d_end or (d_end - d_start).days + 1 < 7:
        return False
    try:
        with engine.connect() as conn:
            dates, labels, matrices, holidays = observed_series(conn, info)
            fc_bundle, fc_eval, split, _ = forecasting.train_adaptive_forecasts(dates, labels, matrices, holidays)
            frame = anomaly_frame(conn, info)
            an_models, an_report = anomaly.fit_detectors(frame, {"kind": "uploaded"})
        version = f"ent-v1-{info['dataset_id'][:8]}"
        out_path = ARTIFACTS / f"tenant_{info['company_id']}__{info['dataset_id']}.joblib"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "version": version,
                "dataset_id": info["dataset_id"],
                "company_id": info["company_id"],
                "split": split,
                "forecast": fc_bundle,
                "anomaly": an_models,
                "report": {"forecast": fc_eval, "anomaly": an_report},
            },
            out_path,
            compress=3,
        )
        return True
    except Exception as exc:
        log.warning("Non-fatal: skipped model bundle build for dataset %s (%s)", info.get("dataset_id"), exc)
        return False


def import_dataset(
    engine: sa.Engine,
    storage: ObjectStorage,
    *,
    company_id: str,
    dataset_id: str,
    confirmed: bool,
    sheet_name: str | None = None,
    invalid_row_policy: str = "skip_invalid",
    duplicate_policy: str = "keep_all",
    currency: str | None = None,
    activate: bool = True,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    if not confirmed:
        raise HTTPException(422, "Explicit user confirmation is required before importing records into analytics.")

    # Pre-read dataset and parse outside main DB write transaction so parsing failures don't hold locks
    with engine.connect() as conn:
        company, _ = _ensure_company_and_source(conn, company_id)
        ds = _get_owned_dataset(conn, company_id, dataset_id)
        if ds["storage_mode"] == "legacy_snapshot":
            raise HTTPException(422, "Legacy snapshot is already imported.")
        mapping = ds.get("mapping_json") or {}
        mapped_canon = {t for t in mapping.values() if t in CANONICAL_FIELDS}
        if not {"date", "revenue"}.issubset(mapped_canon):
            raise HTTPException(422, "Map both 'Date' and 'Revenue' before importing dataset into analytics.")
        if not ds.get("mapping_confirmed"):
            raise HTTPException(422, "Confirm your column mapping before importing.")
        raw_key = ds.get("raw_storage_key")
        if not raw_key:
            raise HTTPException(404, "Raw file object missing.")
        try:
            blob = storage.get_bytes(raw_key)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Stored raw dataset file could not be located.") from exc

    effective_sheet = sheet_name or ds.get("selected_sheet")
    try:
        parsed = parse_uploaded_dataset(blob, ds["file_name"] or "upload.csv", sheet_name=effective_sheet, limit=None)
    except IngestionValidationError as exc:
        raise HTTPException(422, str(exc)) from exc

    ds_meta = dict(ds.get("metadata_json") or {})
    preferred_cur = currency or (ds_meta.get("currency") if ds_meta.get("currency_user_set") else None)
    quality_res = evaluate_and_clean(
        parsed.columns,
        parsed.rows,
        mapping,
        row_numbers=parsed.row_numbers,
        invalid_row_policy=invalid_row_policy,
        duplicate_policy=duplicate_policy,
        preferred_currency=preferred_cur,
    )

    if invalid_row_policy == "fail_on_error" and quality_res.report["invalid_rows"] > 0:
        raise HTTPException(
            422,
            f"Import blocked by policy: {quality_res.report['invalid_rows']} invalid row(s) found. "
            "Download the error report to fix records or choose 'skip_invalid' explicitly.",
        )
    if not quality_res.cleaned_rows:
        raise HTTPException(422, "Zero valid records remain after applying cleaning policies. Review your mapping and quality report.")

    err_key = f"companies/{company_id}/datasets/{dataset_id}/reports/error_report.csv"
    err_json_key = f"companies/{company_id}/datasets/{dataset_id}/reports/error_report.json"
    storage.put_bytes(err_key, render_error_report_csv(quality_res.all_issues), content_type="text/csv")
    storage.put_bytes(err_json_key, render_error_report_json(quality_res.report, quality_res.all_issues), content_type="application/json")

    cleaned_key = f"companies/{company_id}/datasets/{dataset_id}/cleaned/imported_records.json"
    serializable_cleaned = [{**r, "date": r["date"].isoformat() if r["date"] else None} for r in quality_res.cleaned_rows]
    storage.put_bytes(cleaned_key, json.dumps(serializable_cleaned).encode("utf-8"), content_type="application/json")

    try:
        with engine.begin() as conn:
            counts = _insert_partitioned_rows(
                conn,
                company_id=company_id,
                dataset_id=dataset_id,
                cleaned_rows=quality_res.cleaned_rows,
                capabilities=quality_res.capabilities,
            )
            counts["calendar_events"] = quality_res.capabilities.get("day_span", 0)

            meta = dict(ds.get("metadata_json") or {})
            meta["currency"] = preferred_cur or quality_res.detected_currency
            meta["quality_score"] = quality_res.report["overall_score"]
            meta["counts"] = counts
            meta["start"] = quality_res.date_start.isoformat() if quality_res.date_start else None
            meta["end"] = quality_res.date_end.isoformat() if quality_res.date_end else None

            if activate:
                conn.execute(
                    enterprise_datasets.update()
                    .where(enterprise_datasets.c.company_id == company_id)
                    .values(is_active=False)
                )
                conn.execute(
                    companies.update()
                    .where(companies.c.id == company_id)
                    .values(active_dataset_id=dataset_id, updated_at=_utc_now())
                )

            conn.execute(
                enterprise_datasets.update()
                .where(enterprise_datasets.c.id == dataset_id, enterprise_datasets.c.company_id == company_id)
                .values(
                    status="imported",
                    quality_confirmed=True,
                    is_active=activate,
                    selected_sheet=parsed.selected_sheet,
                    row_count=quality_res.report["total_rows"],
                    valid_rows=quality_res.report["valid_rows"],
                    invalid_rows=quality_res.report["invalid_rows"],
                    duplicate_rows=quality_res.report["duplicate_records"],
                    date_start=quality_res.date_start,
                    date_end=quality_res.date_end,
                    cleaning_policy_json={"invalid_row_policy": invalid_row_policy, "duplicate_policy": duplicate_policy},
                    capabilities_json=quality_res.capabilities,
                    metadata_json=meta,
                    cleaned_storage_key=cleaned_key,
                    imported_at=_utc_now(),
                    updated_at=_utc_now(),
                )
            )
            _log_stage(
                conn,
                dataset_id=dataset_id,
                company_id=company_id,
                data_source_id=ds["data_source_id"],
                stage="import",
                status="completed",
                actor=actor,
                details={
                    "imported_rows": len(quality_res.cleaned_rows),
                    "skipped_invalid_rows": quality_res.report["cleaning_summary"]["skipped_invalid_rows"],
                    "deduplicated_rows": quality_res.report["cleaning_summary"]["deduplicated_rows"],
                    "activated": activate,
                    "currency": meta["currency"],
                },
            )
            conn.execute(
                audit.insert().values(
                    company_id=company_id,
                    kind="dataset_loaded",
                    subject=dataset_id,
                    payload={"kind": "uploaded", "counts": counts, "start": meta["start"], "end": meta["end"], "actor": actor},
                )
            )
            updated_ds = _get_owned_dataset(conn, company_id, dataset_id)
            active_info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Atomic import rolled back for dataset %s (%s): %s", dataset_id, type(exc).__name__, exc)
        with engine.begin() as err_conn:
            err_conn.execute(
                enterprise_datasets.update()
                .where(enterprise_datasets.c.id == dataset_id, enterprise_datasets.c.company_id == company_id)
                .values(status="failed", updated_at=_utc_now())
            )
            _log_stage(
                err_conn,
                dataset_id=dataset_id,
                company_id=company_id,
                data_source_id=ds["data_source_id"],
                stage="import",
                status="failed",
                actor=actor,
                details={"invalid_row_policy": invalid_row_policy, "duplicate_policy": duplicate_policy},
                error_message=str(exc),
            )
        raise HTTPException(500, f"Dataset import failed and was cleanly rolled back: {type(exc).__name__}") from exc

    model_built = train_partitioned_artifacts(engine, active_info)
    return {
        "dataset": _serialize_dataset_summary(updated_ds, company["name"], quality_res.report),
        "quality_report": quality_res.report,
        "imported_counts": counts,
        "model_ready": model_built,
    }


def activate_dataset(engine: sa.Engine, *, company_id: str, dataset_id: str, actor: str) -> dict[str, Any]:
    with engine.begin() as conn:
        company, _ = _ensure_company_and_source(conn, company_id)
        if company_id == "comp-default":
            sync_default_legacy_dataset(conn, company_id)
        ds = _get_owned_dataset(conn, company_id, dataset_id)
        if ds["status"] != "imported":
            raise HTTPException(422, f"Cannot activate dataset in status '{ds['status']}'. Confirm and import it first.")
        conn.execute(
            enterprise_datasets.update().where(enterprise_datasets.c.company_id == company_id).values(is_active=False)
        )
        conn.execute(
            enterprise_datasets.update()
            .where(enterprise_datasets.c.id == dataset_id, enterprise_datasets.c.company_id == company_id)
            .values(is_active=True, updated_at=_utc_now())
        )
        conn.execute(
            companies.update().where(companies.c.id == company_id).values(active_dataset_id=dataset_id, updated_at=_utc_now())
        )
        _log_stage(
            conn,
            dataset_id=dataset_id,
            company_id=company_id,
            data_source_id=ds["data_source_id"],
            stage="activate",
            status="completed",
            actor=actor,
            details={"activated_dataset_id": dataset_id},
        )
        updated_ds = _get_owned_dataset(conn, company_id, dataset_id)
    return _serialize_dataset_summary(updated_ds, company["name"])


def list_company_datasets(conn: sa.Connection, company_id: str) -> dict[str, Any]:
    company = conn.execute(sa.select(companies).where(companies.c.id == company_id)).mappings().first()
    if company is None and company_id != "comp-default":
        raise HTTPException(404, f"Company workspace '{company_id}' does not exist.")
    company_name = company["name"] if company else "Default Enterprise Workspace"
    active_id = company["active_dataset_id"] if company else None

    rows = conn.execute(
        sa.select(enterprise_datasets)
        .where(enterprise_datasets.c.company_id == company_id)
        .order_by(enterprise_datasets.c.is_active.desc(), enterprise_datasets.c.created_at.desc())
    ).mappings().all()

    items = []
    for r in rows:
        q_row = conn.execute(
            sa.select(dataset_quality_reports)
            .where(dataset_quality_reports.c.dataset_id == r["id"], dataset_quality_reports.c.company_id == company_id)
            .order_by(dataset_quality_reports.c.created_at.desc())
            .limit(1)
        ).mappings().first()
        q_summary = (
            {
                "overall_score": q_row["overall_score"],
                "completeness": q_row["completeness_score"],
                "validity": q_row["validity_score"],
                "consistency": q_row["consistency_score"],
                "uniqueness": q_row["uniqueness_score"],
                "accuracy": q_row["accuracy_score"],
                "total_rows": q_row["total_rows"],
                "valid_rows": q_row["valid_rows"],
                "invalid_rows": q_row["invalid_rows"],
                "duplicate_records": q_row["duplicate_records_count"],
            }
            if q_row
            else None
        )
        items.append(_serialize_dataset_summary(dict(r), company_name, q_summary))
    return {"company_id": company_id, "company_name": company_name, "active_dataset_id": active_id, "items": items}


def get_dataset_detail(conn: sa.Connection, *, company_id: str, dataset_id: str) -> dict[str, Any]:
    company = conn.execute(sa.select(companies).where(companies.c.id == company_id)).mappings().first()
    company_name = company["name"] if company else "Default Enterprise Workspace"
    ds = _get_owned_dataset(conn, company_id, dataset_id)
    q_report = get_dataset_quality(conn, company_id=company_id, dataset_id=dataset_id, optional=True)
    return _serialize_dataset_summary(ds, company_name, q_report)


def get_dataset_quality(
    conn: sa.Connection, *, company_id: str, dataset_id: str, optional: bool = False
) -> dict[str, Any] | None:
    ds = _get_owned_dataset(conn, company_id, dataset_id)
    row = conn.execute(
        sa.select(dataset_quality_reports)
        .where(dataset_quality_reports.c.dataset_id == dataset_id, dataset_quality_reports.c.company_id == company_id)
        .order_by(dataset_quality_reports.c.created_at.desc())
        .limit(1)
    ).mappings().first()
    if row is None:
        if optional:
            return None
        if ds["storage_mode"] == "legacy_snapshot":
            return {
                "overall_score": 100.0,
                "dimensions": {"completeness": 100.0, "validity": 100.0, "consistency": 100.0, "uniqueness": 100.0, "accuracy": 100.0},
                "total_rows": int(ds.get("row_count") or 0),
                "valid_rows": int(ds.get("valid_rows") or 0),
                "invalid_rows": 0,
                "missing_values": 0,
                "duplicate_records": 0,
                "warnings": [],
                "column_quality": [],
                "sample_errors": [],
                "error_report_available": False,
            }
        raise HTTPException(404, "No validation quality report exists yet for this dataset. Run Validate first.")
    err_sum = row["error_summary_json"] or {}
    return {
        "id": row["id"],
        "dataset_id": dataset_id,
        "overall_score": row["overall_score"],
        "dimensions": {
            "completeness": row["completeness_score"],
            "validity": row["validity_score"],
            "consistency": row["consistency_score"],
            "uniqueness": row["uniqueness_score"],
            "accuracy": row["accuracy_score"],
        },
        "total_rows": row["total_rows"],
        "valid_rows": row["valid_rows"],
        "invalid_rows": row["invalid_rows"],
        "missing_values": row["missing_values_count"],
        "duplicate_records": row["duplicate_records_count"],
        "detected_currency": err_sum.get("detected_currency", "USD"),
        "column_quality": row["column_metrics_json"] or [],
        "warnings": row["warnings_json"] or [],
        "issue_breakdown": err_sum.get("issue_breakdown", {}),
        "sample_errors": err_sum.get("sample_errors", []),
        "inconsistent_date_formats": err_sum.get("inconsistent_date_formats", []),
        "mixed_currency_formats": err_sum.get("mixed_currency_formats", []),
        "cleaning_summary": err_sum.get("cleaning_summary", {}),
        "error_report_available": bool(row.get("error_report_storage_key")),
        "created_at": _json_safe_iso(row["created_at"]),
    }


def get_error_report_content(
    conn: sa.Connection,
    storage: ObjectStorage,
    *,
    company_id: str,
    dataset_id: str,
    fmt: str = "csv",
) -> tuple[bytes, str, str]:
    _get_owned_dataset(conn, company_id, dataset_id)
    row = conn.execute(
        sa.select(dataset_quality_reports)
        .where(dataset_quality_reports.c.dataset_id == dataset_id, dataset_quality_reports.c.company_id == company_id)
        .order_by(dataset_quality_reports.c.created_at.desc())
        .limit(1)
    ).mappings().first()
    if row is None or not row.get("error_report_storage_key"):
        raise HTTPException(404, "Error report is unavailable; validate the dataset first.")
    if fmt == "json":
        json_key = (row.get("error_summary_json") or {}).get("error_report_json_key")
        if not json_key:
            raise HTTPException(404, "JSON error report is unavailable.")
        return storage.get_bytes(json_key), "application/json", f"error-report-{dataset_id}.json"
    return storage.get_bytes(row["error_report_storage_key"]), "text/csv; charset=utf-8", f"error-report-{dataset_id}.csv"


def get_import_history(conn: sa.Connection, *, company_id: str, dataset_id: str) -> dict[str, Any]:
    ds = _get_owned_dataset(conn, company_id, dataset_id)
    logs = conn.execute(
        sa.select(import_logs)
        .where(import_logs.c.company_id == company_id, import_logs.c.dataset_id == dataset_id)
        .order_by(import_logs.c.id.desc())
    ).mappings().all()
    items = [
        {
            "id": int(r["id"]),
            "dataset_id": r["dataset_id"],
            "company_id": r["company_id"],
            "data_source_id": r["data_source_id"],
            "stage": r["stage"],
            "status": r["status"],
            "actor": r["actor"],
            "details": r["details_json"] or {},
            "error_message": r.get("error_message"),
            "created_at": _json_safe_iso(r["created_at"]),
        }
        for r in logs
    ]
    return {"dataset_id": dataset_id, "dataset_name": ds["name"], "company_id": company_id, "items": items}


def delete_dataset(
    engine: sa.Engine,
    storage: ObjectStorage,
    *,
    company_id: str,
    dataset_id: str,
    actor: str,
) -> dict[str, Any]:
    with engine.begin() as conn:
        company, _ = _ensure_company_and_source(conn, company_id)
        ds = _get_owned_dataset(conn, company_id, dataset_id)
        if ds["storage_mode"] == "legacy_snapshot":
            raise HTTPException(422, "Built-in demo snapshot cannot be deleted here; activate another dataset or replace snapshot.")

        for tbl in (
            tenant_inventory_daily,
            tenant_marketing_daily,
            tenant_transactions,
            tenant_products,
            dataset_quality_reports,
            import_logs,
        ):
            conn.execute(tbl.delete().where(tbl.c.company_id == company_id, tbl.c.dataset_id == dataset_id))
        conn.execute(
            enterprise_datasets.delete().where(
                enterprise_datasets.c.id == dataset_id, enterprise_datasets.c.company_id == company_id
            )
        )

        new_active = company.get("active_dataset_id")
        if new_active == dataset_id or ds["is_active"]:
            fallback = conn.execute(
                sa.select(enterprise_datasets.c.id)
                .where(
                    enterprise_datasets.c.company_id == company_id,
                    enterprise_datasets.c.status == "imported",
                )
                .order_by(enterprise_datasets.c.imported_at.desc(), enterprise_datasets.c.created_at.desc())
                .limit(1)
            ).scalar()
            new_active = fallback
            conn.execute(companies.update().where(companies.c.id == company_id).values(active_dataset_id=new_active, updated_at=_utc_now()))
            if new_active:
                conn.execute(
                    enterprise_datasets.update()
                    .where(enterprise_datasets.c.id == new_active, enterprise_datasets.c.company_id == company_id)
                    .values(is_active=True)
                )

        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="dataset_deleted",
                subject=dataset_id,
                payload={"name": ds["name"], "actor": actor, "fallback_active_dataset_id": new_active},
            )
        )

    removed_objects = storage.delete_prefix(f"companies/{company_id}/datasets/{dataset_id}")
    art_path = ARTIFACTS / f"tenant_{company_id}__{dataset_id}.joblib"
    if art_path.is_file():
        art_path.unlink(missing_ok=True)
    return {
        "deleted": True,
        "dataset_id": dataset_id,
        "company_id": company_id,
        "removed_storage_objects": removed_objects,
        "active_dataset_id": new_active,
    }


def list_company_templates(conn: sa.Connection, company_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        sa.select(mapping_templates)
        .where(mapping_templates.c.company_id == company_id)
        .order_by(mapping_templates.c.updated_at.desc())
    ).mappings().all()
    return [
        {
            "id": r["id"],
            "company_id": r["company_id"],
            "name": r["name"],
            "source_signature": r["source_signature"],
            "mappings": r["mappings_json"] or {},
            "custom_fields": r["custom_fields_json"] or [],
            "created_by": r["created_by"],
            "created_at": _json_safe_iso(r["created_at"]),
        }
        for r in rows
    ]


def delete_company_template(engine: sa.Engine, *, company_id: str, template_id: str) -> dict[str, Any]:
    with engine.begin() as conn:
        tpl = conn.execute(sa.select(mapping_templates).where(mapping_templates.c.id == template_id)).mappings().first()
        if tpl is None:
            raise HTTPException(404, "Mapping template not found.")
        if tpl["company_id"] != company_id:
            raise HTTPException(403, "Template belongs to another company.")
        conn.execute(mapping_templates.delete().where(mapping_templates.c.id == template_id, mapping_templates.c.company_id == company_id))
    return {"deleted": True, "template_id": template_id}


def list_company_data_sources(conn: sa.Connection, company_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        sa.select(data_sources)
        .where(data_sources.c.company_id == company_id)
        .order_by(data_sources.c.created_at.desc())
    ).mappings().all()
    return [
        {
            "id": r["id"],
            "company_id": r["company_id"],
            "name": r["name"],
            "source_type": r["source_type"],
            "config": redact_config(r["config_json"]),
            "status": r["status"],
            "created_at": _json_safe_iso(r["created_at"]),
        }
        for r in rows
    ]


def create_company_data_source(
    engine: sa.Engine, *, company_id: str, name: str, source_type: str, config: dict[str, Any], actor: str
) -> dict[str, Any]:
    try:
        connector = get_connector(source_type)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    errors = connector.validate_config(config)
    if errors:
        raise HTTPException(422, "; ".join(errors))
    src_id = f"src-{source_type[:8]}-{uuid4().hex[:10]}"
    safe_cfg = redact_config(config)
    with engine.begin() as conn:
        _ensure_company_and_source(conn, company_id)
        conn.execute(
            data_sources.insert().values(
                id=src_id,
                company_id=company_id,
                name=name.strip(),
                source_type=source_type,
                config_json=safe_cfg,
                status="configured" if connector.capability.status == "extensible" else "active",
            )
        )
        conn.execute(
            audit.insert().values(
                company_id=company_id,
                kind="data_source_registered",
                subject=src_id,
                payload={"name": name.strip(), "source_type": source_type, "actor": actor},
            )
        )
    return {
        "id": src_id,
        "company_id": company_id,
        "name": name.strip(),
        "source_type": source_type,
        "config": safe_cfg,
        "status": "configured" if connector.capability.status == "extensible" else "active",
    }
