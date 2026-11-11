"""Vector Store abstraction supporting SQLite/PostgreSQL portable vector storage, pgvector, and optional Qdrant HTTP backend."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
import logging
from typing import Any
from uuid import uuid4

import httpx
import numpy as np
import sqlalchemy as sa

from backend.app.db import rag_chunks, rag_documents
from backend.app.rag.config import get_rag_settings
from backend.app.rag.security import chunk_allowed_for_identity

log = logging.getLogger(__name__)


class VectorStore(ABC):
    backend_name: str

    @abstractmethod
    def fetch_authorized_chunks(
        self,
        conn: sa.Connection,
        *,
        company_id: str,
        role: str = "viewer",
        dataset_id: str | None = None,
        document_type: str | None = None,
        domain: str | None = None,
        source_file: str | None = None,
        document_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    def search_dense(
        self,
        conn: sa.Connection,
        *,
        query_vector: list[float],
        company_id: str,
        role: str = "viewer",
        dataset_id: str | None = None,
        document_type: str | None = None,
        domain: str | None = None,
        source_file: str | None = None,
        document_ids: list[str] | None = None,
        top_k: int = 12,
    ) -> list[dict[str, Any]]:
        ...

    def upsert_external_vectors(self, chunks: list[dict[str, Any]]) -> None:
        return None

    def delete_external_document(self, company_id: str, document_id: str) -> None:
        return None


class SQLVectorStore(VectorStore):
    """Portable high-precision SQL + NumPy dense/sparse store for SQLite and PostgreSQL (plus optional pgvector support)."""

    def __init__(self, backend_name: str = "sql") -> None:
        self.backend_name = backend_name

    def fetch_authorized_chunks(
        self,
        conn: sa.Connection,
        *,
        company_id: str,
        role: str = "viewer",
        dataset_id: str | None = None,
        document_type: str | None = None,
        domain: str | None = None,
        source_file: str | None = None,
        document_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        q = sa.select(rag_chunks).where(rag_chunks.c.company_id == company_id)
        if dataset_id is not None:
            q = q.where(sa.or_(rag_chunks.c.dataset_id == dataset_id, rag_chunks.c.dataset_id.is_(None)))
        if document_type:
            q = q.where(rag_chunks.c.document_type == document_type)
        if domain:
            q = q.where(rag_chunks.c.domain == domain)
        if source_file:
            q = q.where(rag_chunks.c.source_file == source_file)
        if document_ids:
            q = q.where(rag_chunks.c.document_id.in_(document_ids))

        rows = [dict(r) for r in conn.execute(q).mappings().all()]
        return [
            r
            for r in rows
            if chunk_allowed_for_identity(r, company_id=company_id, role=role, dataset_id=dataset_id)
        ]

    def search_dense(
        self,
        conn: sa.Connection,
        *,
        query_vector: list[float],
        company_id: str,
        role: str = "viewer",
        dataset_id: str | None = None,
        document_type: str | None = None,
        domain: str | None = None,
        source_file: str | None = None,
        document_ids: list[str] | None = None,
        top_k: int = 12,
    ) -> list[dict[str, Any]]:
        candidates = self.fetch_authorized_chunks(
            conn,
            company_id=company_id,
            role=role,
            dataset_id=dataset_id,
            document_type=document_type,
            domain=domain,
            source_file=source_file,
            document_ids=document_ids,
        )
        if not candidates or not query_vector:
            return []

        q_vec = np.asarray(query_vector, dtype=np.float32)
        q_norm = float(np.linalg.norm(q_vec))
        if q_norm < 1e-8:
            return []
        q_unit = q_vec / q_norm
        q_dim = len(query_vector)

        scored: list[tuple[float, dict[str, Any]]] = []
        same_dim_indices: list[int] = []
        same_dim_vecs: list[list[float]] = []

        for idx, row in enumerate(candidates):
            vec = row.get("embedding_json")
            if isinstance(vec, list) and len(vec) == q_dim:
                same_dim_indices.append(idx)
                same_dim_vecs.append(vec)

        if same_dim_vecs:
            mat = np.asarray(same_dim_vecs, dtype=np.float32)
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            norms = np.where(norms < 1e-8, 1.0, norms)
            sims = (mat / norms) @ q_unit
            for local_pos, cand_idx in enumerate(same_dim_indices):
                score = max(0.0, float(sims[local_pos]))
                scored.append((score, candidates[cand_idx]))

        scored.sort(key=lambda item: item[0], reverse=True)
        out: list[dict[str, Any]] = []
        for rank, (score, row) in enumerate(scored[:top_k], start=1):
            out.append({**row, "dense_score": round(score, 6), "dense_rank": rank})
        return out


class QdrantVectorStore(SQLVectorStore):
    """Qdrant HTTP REST adapter layered over relational metadata for sparse BM25 & RBAC validation."""

    def __init__(self, url: str, collection: str, api_key: str = "") -> None:
        super().__init__(backend_name="qdrant")
        self.url = url.rstrip("/")
        self.collection = collection
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        hdr = {"Content-Type": "application/json"}
        if self.api_key:
            hdr["api-key"] = self.api_key
        return hdr

    def _ensure_collection(self, dim: int) -> None:
        r = httpx.get(f"{self.url}/collections/{self.collection}", headers=self._headers(), timeout=5.0)
        if r.status_code == 200:
            return
        httpx.put(
            f"{self.url}/collections/{self.collection}",
            headers=self._headers(),
            json={"vectors": {"size": dim, "distance": "Cosine"}},
            timeout=5.0,
        ).raise_for_status()

    def upsert_external_vectors(self, chunks: list[dict[str, Any]]) -> None:
        if not chunks or not self.url:
            return
        try:
            dim = int(chunks[0].get("embedding_dim") or len(chunks[0]["embedding_json"]))
            self._ensure_collection(dim)
            points = [
                {
                    "id": str(uuid4()),
                    "vector": ch["embedding_json"],
                    "payload": {
                        "chunk_id": ch["id"],
                        "document_id": ch["document_id"],
                        "company_id": ch["company_id"],
                        "dataset_id": ch.get("dataset_id"),
                        "document_type": ch["document_type"],
                        "domain": ch["domain"],
                    },
                }
                for ch in chunks
            ]
            httpx.put(
                f"{self.url}/collections/{self.collection}/points?wait=true",
                headers=self._headers(),
                json={"points": points},
                timeout=10.0,
            ).raise_for_status()
        except Exception as exc:
            log.warning("Qdrant upsert failed (%s); SQL store retains full vectors.", type(exc).__name__)

    def delete_external_document(self, company_id: str, document_id: str) -> None:
        if not self.url:
            return
        try:
            httpx.post(
                f"{self.url}/collections/{self.collection}/points/delete?wait=true",
                headers=self._headers(),
                json={
                    "filter": {
                        "must": [
                            {"key": "company_id", "match": {"value": company_id}},
                            {"key": "document_id", "match": {"value": document_id}},
                        ]
                    }
                },
                timeout=8.0,
            )
        except Exception as exc:
            log.warning("Qdrant delete failed (%s)", type(exc).__name__)

    def search_dense(
        self,
        conn: sa.Connection,
        *,
        query_vector: list[float],
        company_id: str,
        role: str = "viewer",
        dataset_id: str | None = None,
        document_type: str | None = None,
        domain: str | None = None,
        source_file: str | None = None,
        document_ids: list[str] | None = None,
        top_k: int = 12,
    ) -> list[dict[str, Any]]:
        if not self.url:
            return super().search_dense(
                conn,
                query_vector=query_vector,
                company_id=company_id,
                role=role,
                dataset_id=dataset_id,
                document_type=document_type,
                domain=domain,
                source_file=source_file,
                document_ids=document_ids,
                top_k=top_k,
            )
        try:
            must = [{"key": "company_id", "match": {"value": company_id}}]
            if document_type:
                must.append({"key": "document_type", "match": {"value": document_type}})
            if domain:
                must.append({"key": "domain", "match": {"value": domain}})
            res = httpx.post(
                f"{self.url}/collections/{self.collection}/points/search",
                headers=self._headers(),
                json={"vector": query_vector, "filter": {"must": must}, "limit": top_k * 2, "with_payload": True},
                timeout=6.0,
            )
            res.raise_for_status()
            hits = res.json().get("result") or []
            score_by_chunk = {h["payload"]["chunk_id"]: float(h["score"]) for h in hits if h.get("payload", {}).get("chunk_id")}
            if not score_by_chunk:
                return []
            authorized = self.fetch_authorized_chunks(
                conn,
                company_id=company_id,
                role=role,
                dataset_id=dataset_id,
                document_type=document_type,
                domain=domain,
                source_file=source_file,
                document_ids=document_ids,
            )
            filtered = [r for r in authorized if r["id"] in score_by_chunk]
            filtered.sort(key=lambda r: score_by_chunk[r["id"]], reverse=True)
            return [
                {**r, "dense_score": round(score_by_chunk[r["id"]], 6), "dense_rank": idx}
                for idx, r in enumerate(filtered[:top_k], start=1)
            ]
        except Exception as exc:
            log.warning("Qdrant search failed (%s); falling back to SQL vector search.", type(exc).__name__)
            return super().search_dense(
                conn,
                query_vector=query_vector,
                company_id=company_id,
                role=role,
                dataset_id=dataset_id,
                document_type=document_type,
                domain=domain,
                source_file=source_file,
                document_ids=document_ids,
                top_k=top_k,
            )


def get_vector_store(dialect_name: str | None = None) -> VectorStore:
    settings = get_rag_settings()
    if settings.vector_backend == "qdrant" and settings.qdrant_url:
        return QdrantVectorStore(settings.qdrant_url, settings.qdrant_collection, settings.qdrant_api_key)
    backend_label = f"postgresql_{settings.vector_backend}" if dialect_name == "postgresql" else "sqlite_local_vector"
    return SQLVectorStore(backend_name=backend_label)


def store_health(conn: sa.Connection, *, company_id: str) -> dict[str, Any]:
    settings = get_rag_settings()
    docs_count = conn.scalar(
        sa.select(sa.func.count()).select_from(rag_documents).where(rag_documents.c.company_id == company_id)
    ) or 0
    chunks_count = conn.scalar(
        sa.select(sa.func.count()).select_from(rag_chunks).where(rag_chunks.c.company_id == company_id)
    ) or 0
    return {
        "backend": settings.vector_backend,
        "vector_backend": get_vector_store(conn.dialect.name).backend_name,
        "database_dialect": conn.dialect.name,
        "qdrant_configured": bool(settings.qdrant_url),
        "documents_indexed": int(docs_count),
        "chunks_indexed": int(chunks_count),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }

