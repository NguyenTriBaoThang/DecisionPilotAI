"""ThreadPool-backed persistent ingestion_jobs worker with retries, idempotency keys, and graceful shutdown."""
from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
import logging
import os
import threading
import time
from typing import Any, Callable
from uuid import uuid4

import sqlalchemy as sa

from backend.app.db import ingestion_jobs, multimodal_files

log = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_job(row: dict[str, Any]) -> dict[str, Any]:
    def _iso(dt: Any) -> str | None:
        if dt is None:
            return None
        if isinstance(dt, datetime):
            return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()
        return str(dt)

    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "dataset_id": row["dataset_id"],
        "file_id": row.get("file_id"),
        "data_source_id": row.get("data_source_id"),
        "job_type": row["job_type"],
        "idempotency_key": row.get("idempotency_key"),
        "status": row["status"],
        "stage": row["stage"],
        "progress_pct": int(row.get("progress_pct") or 0),
        "attempt": int(row.get("attempt") or 0),
        "max_attempts": int(row.get("max_attempts") or 3),
        "timeout_seconds": int(row.get("timeout_seconds") or 120),
        "result_summary": row.get("result_summary_json") or {},
        "error_message": row.get("error_message"),
        "created_by": row["created_by"],
        "created_at": _iso(row.get("created_at")),
        "started_at": _iso(row.get("started_at")),
        "finished_at": _iso(row.get("finished_at")),
    }


class MultimodalJobQueue:
    """Async ingestion queue backed by persistent SQL rows and bounded worker threads."""

    def __init__(self, engine: sa.Engine, worker_fn: Callable[[str], dict[str, Any]], max_workers: int | None = None):
        self.engine = engine
        self.worker_fn = worker_fn
        workers = max_workers or int(os.getenv("INGESTION_JOB_WORKERS", "3"))
        self.executor = ThreadPoolExecutor(max_workers=max(1, workers), thread_name_prefix="mm-ingest")
        self._lock = threading.Lock()
        self._futures: dict[str, Future] = {}

    def submit_file_job(
        self,
        *,
        company_id: str,
        dataset_id: str,
        file_id: str,
        data_source_id: str,
        actor: str,
        params: dict[str, Any],
        idempotency_key: str | None = None,
        timeout_seconds: int = 120,
    ) -> dict[str, Any]:
        if idempotency_key:
            with self.engine.connect() as conn:
                existing = conn.execute(
                    sa.select(ingestion_jobs)
                    .where(
                        ingestion_jobs.c.company_id == company_id,
                        ingestion_jobs.c.idempotency_key == idempotency_key,
                        ingestion_jobs.c.file_id == file_id,
                    )
                    .order_by(ingestion_jobs.c.created_at.desc())
                    .limit(1)
                ).mappings().first()
                if existing and existing["status"] in {"queued", "running", "completed"}:
                    return serialize_job(dict(existing))

        job_id = f"job-{uuid4().hex[:14]}"
        with self.engine.begin() as conn:
            conn.execute(
                ingestion_jobs.insert().values(
                    id=job_id,
                    company_id=company_id,
                    dataset_id=dataset_id,
                    file_id=file_id,
                    data_source_id=data_source_id,
                    job_type="multimodal_extract",
                    idempotency_key=idempotency_key,
                    status="queued",
                    stage="uploaded",
                    progress_pct=5,
                    attempt=0,
                    max_attempts=3,
                    timeout_seconds=timeout_seconds,
                    params_json=params,
                    created_by=actor,
                )
            )
            row = conn.execute(sa.select(ingestion_jobs).where(ingestion_jobs.c.id == job_id)).mappings().one()
        self._dispatch(job_id)
        return serialize_job(dict(row))

    def retry_job(self, job_id: str, *, company_id: str) -> dict[str, Any]:
        with self.engine.begin() as conn:
            row = conn.execute(sa.select(ingestion_jobs).where(ingestion_jobs.c.id == job_id)).mappings().first()
            if row is None:
                raise LookupError("Ingestion job not found.")
            if row["company_id"] != company_id:
                raise PermissionError("Cross-tenant job access denied.")
            if row["status"] == "running":
                return serialize_job(dict(row))
            conn.execute(
                ingestion_jobs.update()
                .where(ingestion_jobs.c.id == job_id)
                .values(
                    status="queued",
                    stage="uploaded",
                    progress_pct=5,
                    error_message=None,
                    finished_at=None,
                )
            )
            if row.get("file_id"):
                conn.execute(
                    multimodal_files.update()
                    .where(multimodal_files.c.id == row["file_id"], multimodal_files.c.company_id == company_id)
                    .values(processing_status="uploaded", extraction_status="pending", updated_at=_utc_now())
                )
            updated = conn.execute(sa.select(ingestion_jobs).where(ingestion_jobs.c.id == job_id)).mappings().one()
        self._dispatch(job_id)
        return serialize_job(dict(updated))

    def _dispatch(self, job_id: str) -> None:
        fut = self.executor.submit(self._run_wrapper, job_id)
        with self._lock:
            self._futures[job_id] = fut

        def _cleanup(_f: Future) -> None:
            with self._lock:
                self._futures.pop(job_id, None)

        fut.add_done_callback(_cleanup)

    def _run_wrapper(self, job_id: str) -> None:
        t0 = time.perf_counter()
        job_meta: dict[str, Any] = {}
        for retry in range(3):
            try:
                with self.engine.begin() as conn:
                    row = conn.execute(sa.select(ingestion_jobs).where(ingestion_jobs.c.id == job_id)).mappings().first()
                    if row is None:
                        return
                    job_meta = dict(row)
                    attempt = int(row.get("attempt") or 0) + 1
                    conn.execute(
                        ingestion_jobs.update()
                        .where(ingestion_jobs.c.id == job_id)
                        .values(
                            status="running",
                            stage="processing",
                            progress_pct=20,
                            attempt=attempt,
                            started_at=_utc_now(),
                            error_message=None,
                        )
                    )
                break
            except sa.exc.OperationalError:
                time.sleep(0.05 * (retry + 1))

        fid = job_meta.get("file_id")
        if fid and job_meta.get("company_id"):
            from backend.app.lineage.service import record_runtime_event

            record_runtime_event(
                self.engine,
                company_id=job_meta["company_id"],
                pipeline_key=f"multimodal:{fid}",
                pipeline_name=f"Multimodal Pipeline — {fid}",
                pipeline_type="multimodal_extraction",
                run_key=f"mm_run:{fid}",
                dataset_id=job_meta.get("dataset_id"),
                actor=job_meta.get("created_by") or "system",
                event_type="Multimodal Extraction Started",
                step_order=2,
                status="processing",
                event_key=f"mm:{fid}:02_extract",
                node_key=f"proc:mm_extract:{fid}",
                input_summary=f"Job {job_id}",
                output_summary="Processing multimodal payload",
            )

        try:
            summary = self.worker_fn(job_id)
            with self.engine.begin() as conn:
                conn.execute(
                    ingestion_jobs.update()
                    .where(ingestion_jobs.c.id == job_id)
                    .values(
                        status="completed",
                        stage=summary.get("stage", "awaiting_approval"),
                        progress_pct=100,
                        result_summary_json=summary,
                        error_message=None,
                        finished_at=_utc_now(),
                    )
                )
            if fid and job_meta.get("company_id"):
                from backend.app.lineage.service import record_runtime_event

                record_runtime_event(
                    self.engine,
                    company_id=job_meta["company_id"],
                    pipeline_key=f"multimodal:{fid}",
                    pipeline_name=f"Multimodal Pipeline — {fid}",
                    pipeline_type="multimodal_extraction",
                    run_key=f"mm_run:{fid}",
                    dataset_id=job_meta.get("dataset_id"),
                    actor=job_meta.get("created_by") or "system",
                    event_type="Multimodal Extraction Completed",
                    step_order=2,
                    status="completed",
                    event_key=f"mm:{fid}:02_extract",
                    node_key=f"proc:mm_extract:{fid}",
                    duration_ms=round((time.perf_counter() - t0) * 1000.0, 2),
                    output_summary=f"{summary.get('total_extracted', 0)} extractions ready for review",
                )
        except Exception as exc:
            log.warning("Multimodal ingestion job %s failed (%s): %s", job_id, type(exc).__name__, exc)
            for retry in range(3):
                try:
                    with self.engine.begin() as conn:
                        conn.execute(
                            ingestion_jobs.update()
                            .where(ingestion_jobs.c.id == job_id)
                            .values(
                                status="failed",
                                stage="failed",
                                progress_pct=100,
                                error_message=str(exc)[:2000],
                                finished_at=_utc_now(),
                            )
                        )
                    break
                except sa.exc.OperationalError:
                    time.sleep(0.05 * (retry + 1))
            if fid and job_meta.get("company_id"):
                from backend.app.lineage.service import record_runtime_event

                record_runtime_event(
                    self.engine,
                    company_id=job_meta["company_id"],
                    pipeline_key=f"multimodal:{fid}",
                    pipeline_name=f"Multimodal Pipeline — {fid}",
                    pipeline_type="multimodal_extraction",
                    run_key=f"mm_run:{fid}",
                    dataset_id=job_meta.get("dataset_id"),
                    actor=job_meta.get("created_by") or "system",
                    event_type="Multimodal Extraction Failed",
                    step_order=2,
                    status="failed",
                    event_key=f"mm:{fid}:02_extract",
                    node_key=f"proc:mm_extract:{fid}",
                    duration_ms=round((time.perf_counter() - t0) * 1000.0, 2),
                    error_message=str(exc)[:2000],
                )

    def wait_for_job(self, job_id: str, timeout: float = 30.0) -> dict[str, Any]:
        with self._lock:
            fut = self._futures.get(job_id)
        if fut is not None:
            fut.result(timeout=timeout)
        with self.engine.connect() as conn:
            row = conn.execute(sa.select(ingestion_jobs).where(ingestion_jobs.c.id == job_id)).mappings().one()
            return serialize_job(dict(row))

    def wait_all(self, timeout: float = 30.0) -> None:
        deadline = time.monotonic() + timeout
        while True:
            with self._lock:
                pending = list(self._futures.values())
            if not pending:
                break
            remaining = max(0.05, deadline - time.monotonic())
            if remaining <= 0.05:
                break
            for f in pending:
                try:
                    f.result(timeout=remaining)
                except Exception:
                    pass

    def shutdown(self, wait: bool = True) -> None:
        if wait:
            self.wait_all(timeout=15.0)
        self.executor.shutdown(wait=wait)

