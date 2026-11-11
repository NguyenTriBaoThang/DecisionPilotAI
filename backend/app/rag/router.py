"""REST API router for Advanced RAG, Hybrid Search, Safe Text-to-SQL, Memory & Enterprise AI Copilot."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
import sqlalchemy as sa
from starlette.concurrency import run_in_threadpool

from backend.app.db import rag_chunks, rag_documents, read_connection
from backend.app.ingestion.router import require_role, resolve_tenant
from backend.app.multimodal.security import MODALITY_BY_EXT, max_bytes_for_modality
from backend.app.rag import ingestion as rag_ingestion
from backend.app.rag import memory as rag_memory
from backend.app.rag import orchestrator as rag_orchestrator
from backend.app.rag.config import get_rag_settings
from backend.app.rag.embeddings import get_embedding_provider
from backend.app.rag.retrieval import hybrid_search
from backend.app.rag.security import copilot_rate_limiter
from backend.app.rag.vector_store import store_health
from backend.app.schemas import (
    ChatCompletionRequest,
    CompanyMemoryUpsertRequest,
    ConversationCreateRequest,
    ConversationPatchRequest,
    RagSearchRequest,
    RagTextIngestRequest,
)


async def _read_rag_upload(upload: UploadFile) -> tuple[str, bytes, str | None]:
    fname = upload.filename or "document.txt"
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "txt"
    limit_bytes = max_bytes_for_modality(MODALITY_BY_EXT.get(ext, "document"))
    buf = bytearray()
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        if len(buf) + len(chunk) > limit_bytes:
            limit_mb = limit_bytes // (1024 * 1024)
            raise HTTPException(413, f"File '{fname}' exceeds maximum RAG upload size ({limit_mb} MiB).")
        buf.extend(chunk)
    return fname, bytes(buf), upload.content_type


def build_rag_router(engine: sa.Engine) -> APIRouter:
    router = APIRouter(tags=["Enterprise RAG & AI Copilot"])

    # --- Chat Copilot Completions (Sync JSON + Real-Time SSE Streaming) ---

    @router.post("/chat/completions")
    async def chat_completions(
        body: ChatCompletionRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        settings = get_rag_settings()
        allowed, retry_after = copilot_rate_limiter.check(f"{cid}:{identity['actor']}", settings.rate_limit_per_min)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Copilot rate limit exceeded ({settings.rate_limit_per_min}/min). Retry in {retry_after}s."},
                headers={"Retry-After": str(retry_after)},
            )

        ds_id = body.dataset_id or (x_dataset_id.strip() if x_dataset_id and x_dataset_id.strip() else None)
        if body.stream:
            def _event_gen():
                yield from rag_orchestrator.stream_copilot_turn(
                    engine,
                    question=body.message,
                    company_id=cid,
                    role=identity["role"],
                    actor=identity["actor"],
                    conversation_id=body.conversation_id,
                    dataset_id=ds_id,
                    language=body.language,
                    top_k=body.top_k,
                    domain_filter=body.domain,
                    document_type_filter=body.document_type,
                )

            return StreamingResponse(
                _event_gen(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        return await run_in_threadpool(
            lambda: rag_orchestrator.run_copilot_turn(
                engine,
                question=body.message,
                company_id=cid,
                role=identity["role"],
                actor=identity["actor"],
                conversation_id=body.conversation_id,
                dataset_id=ds_id,
                language=body.language,
                top_k=body.top_k,
                domain_filter=body.domain,
                document_type_filter=body.document_type,
            )
        )

    # --- Conversation History & 3-Layer Memory Management ---

    @router.get("/chat/conversations")
    def list_conversations(
        request: Request,
        dataset_id: str | None = None,
        search: str | None = None,
        pinned_only: bool = False,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            items = rag_memory.list_conversations(
                conn,
                company_id=cid,
                dataset_id=dataset_id,
                search=search,
                pinned_only=pinned_only,
            )
        return {"items": items, "count": len(items), "company_id": cid}

    @router.post("/chat/conversations", status_code=201)
    def create_conversation(
        body: ConversationCreateRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        conv = rag_memory.create_conversation(
            engine,
            company_id=cid,
            dataset_id=body.dataset_id,
            title=body.title,
            language=body.language,
            actor=identity["actor"],
        )
        return conv

    @router.get("/chat/conversations/{conversation_id}")
    def get_conversation_detail(
        conversation_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            mem = rag_memory.load_three_layer_memory(conn, company_id=cid, conversation_id=conversation_id)
            msgs = rag_memory.get_conversation_messages(conn, company_id=cid, conversation_id=conversation_id)
        return {
            "conversation": mem["conversation"],
            "messages": msgs,
            "session_context": mem["session_context"],
            "memory_summary": mem["memory_summary"],
            "company_memories": mem["company_memories"],
            "token_usage_est": mem["token_usage_est"],
        }

    @router.patch("/chat/conversations/{conversation_id}")
    def patch_conversation(
        conversation_id: str,
        body: ConversationPatchRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        return rag_memory.update_conversation(
            engine,
            company_id=cid,
            conversation_id=conversation_id,
            title=body.title,
            is_pinned=body.is_pinned,
            dataset_id=body.dataset_id,
        )

    @router.delete("/chat/conversations/{conversation_id}")
    def delete_conversation(
        conversation_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return rag_memory.delete_conversation(engine, company_id=cid, conversation_id=conversation_id)

    @router.get("/chat/conversations/{conversation_id}/messages")
    def list_conversation_messages(
        conversation_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            msgs = rag_memory.get_conversation_messages(conn, company_id=cid, conversation_id=conversation_id)
        return {"conversation_id": conversation_id, "items": msgs, "count": len(msgs)}

    @router.post("/chat/messages/{message_id}/regenerate")
    async def regenerate_message(
        message_id: str,
        request: Request,
        stream: bool = False,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        from backend.app.db import chat_messages

        with read_connection(engine) as conn:
            asst_msg = conn.execute(
                sa.select(chat_messages).where(chat_messages.c.id == message_id)
            ).mappings().first()
            if asst_msg is None:
                raise HTTPException(404, "Assistant message not found.")
            if asst_msg["company_id"] != cid:
                raise HTTPException(403, "Cross-tenant message access denied.")
            conv = rag_memory.get_owned_conversation(conn, company_id=cid, conversation_id=asst_msg["conversation_id"])
            parent_id = asst_msg.get("parent_message_id")
            if not parent_id:
                raise HTTPException(422, "Only assistant replies linked to a user prompt can be regenerated.")
            user_msg = conn.execute(
                sa.select(chat_messages).where(chat_messages.c.id == parent_id, chat_messages.c.company_id == cid)
            ).mappings().first()
            if user_msg is None:
                raise HTTPException(404, "Original user prompt not found.")
            prompt_text = user_msg["content"]
            conv_id = conv["id"]
            ds_id = conv.get("dataset_id")
            conv_lang = conv.get("language") or "auto"

        if stream:
            def _regen_stream():
                yield from rag_orchestrator.stream_copilot_turn(
                    engine,
                    question=prompt_text,
                    company_id=cid,
                    role=identity["role"],
                    actor=identity["actor"],
                    conversation_id=conv_id,
                    dataset_id=ds_id,
                    language=conv_lang,
                    replace_assistant_id=message_id,
                )

            return StreamingResponse(_regen_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

        return await run_in_threadpool(
            lambda: rag_orchestrator.run_copilot_turn(
                engine,
                question=prompt_text,
                company_id=cid,
                role=identity["role"],
                actor=identity["actor"],
                conversation_id=conv_id,
                dataset_id=ds_id,
                language=conv_lang,
                replace_assistant_id=message_id,
            )
        )

    # --- Long-Term Company Memory CRUD ---

    @router.get("/chat/memory")
    def list_memories(request: Request, x_company_id: Annotated[str | None, Header()] = None):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            items = rag_memory.list_company_memories(conn, company_id=cid)
        return {"items": items, "count": len(items), "company_id": cid}

    @router.post("/chat/memory", status_code=201)
    def upsert_memory(
        body: CompanyMemoryUpsertRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return rag_memory.upsert_company_memory(
            engine,
            company_id=cid,
            memory_key=body.memory_key,
            content=body.content,
            memory_type=body.memory_type,
            source_conversation_id=body.source_conversation_id,
            confidence=body.confidence,
            actor=identity["actor"],
        )

    @router.delete("/chat/memory/{memory_id}")
    def delete_memory(
        memory_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return rag_memory.delete_company_memory(engine, company_id=cid, memory_id=memory_id)

    # --- Hybrid RAG Knowledge Ingestion, Search & Document Management ---

    @router.post("/rag/ingest", status_code=201)
    async def ingest_rag_document(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
        x_dataset_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        ctype = (request.headers.get("content-type") or "").lower()

        if "multipart/form-data" in ctype:
            form = await request.form()
            upload = form.get("file")
            if upload is None or not hasattr(upload, "read"):
                raise HTTPException(422, "Multipart RAG ingest requires a 'file' upload field.")
            fname, blob, mime = await _read_rag_upload(upload)  # type: ignore[arg-type]
            dataset_id = str(form.get("dataset_id") or x_dataset_id or "").strip() or None
            domain = str(form.get("domain") or "").strip() or None
            strategy = str(form.get("chunking_strategy") or "auto").strip() or "auto"
            consent_ext = str(form.get("consent_external_ai") or "false").lower() in {"1", "true", "yes"}
            return await run_in_threadpool(
                lambda: rag_ingestion.ingest_uploaded_document(
                    engine,
                    company_id=cid,
                    file_name=fname,
                    blob=blob,
                    mime_type=mime,
                    dataset_id=dataset_id,
                    domain=domain,
                    chunking_strategy=strategy,
                    consent_external_ai=consent_ext,
                    actor=identity["actor"],
                )
            )

        raw_json = await request.json()
        body = RagTextIngestRequest(**raw_json)
        ds_id = body.dataset_id or (x_dataset_id.strip() if x_dataset_id and x_dataset_id.strip() else None)
        if body.source_file_id:
            res = await run_in_threadpool(
                lambda: rag_ingestion.index_multimodal_file(engine, company_id=cid, file_id=body.source_file_id, actor=identity["actor"])
            )
            if not res:
                raise HTTPException(404, "Multimodal file produced no indexable text.")
            return res
        if body.source_dataset_id:
            res = await run_in_threadpool(
                lambda: rag_ingestion.index_enterprise_dataset(engine, company_id=cid, dataset_id=body.source_dataset_id, actor=identity["actor"])
            )
            if not res:
                raise HTTPException(404, "Dataset produced no indexable profile.")
            return res
        return await run_in_threadpool(
            lambda: rag_ingestion.ingest_text_document(
                engine,
                company_id=cid,
                title=body.title,
                text=body.text,
                dataset_id=ds_id,
                document_type=body.document_type,
                domain=body.domain,
                chunking_strategy=body.chunking_strategy,
                actor=identity["actor"],
            )
        )

    @router.post("/rag/ingest/reindex")
    async def reindex_workspace_knowledge(
        request: Request,
        dataset_id: str | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        ds_res = await run_in_threadpool(
            lambda: rag_ingestion.index_enterprise_dataset(engine, company_id=cid, dataset_id=dataset_id, actor=identity["actor"])
        )
        return {"reindexed_dataset": ds_res}

    @router.post("/rag/search")
    def search_knowledge_base(
        body: RagSearchRequest,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            hits, trace = hybrid_search(
                conn,
                query=body.query,
                company_id=cid,
                role=identity["role"],
                dataset_id=body.dataset_id,
                domain=body.domain,
                document_type=body.document_type,
                document_ids=body.document_ids,
                top_k=body.top_k,
            )
        return {
            "hits": hits,
            "count": len(hits),
            "trace": trace.__dict__,
        }

    @router.get("/rag/documents")
    def list_rag_documents(
        request: Request,
        dataset_id: str | None = None,
        document_type: str | None = None,
        domain: str | None = None,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            items = rag_ingestion.list_documents(
                conn,
                company_id=cid,
                dataset_id=dataset_id,
                document_type=document_type,
                domain=domain,
            )
        return {"items": items, "count": len(items), "company_id": cid}

    @router.get("/rag/documents/{document_id}")
    def get_rag_document(
        document_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        with read_connection(engine) as conn:
            return rag_ingestion.get_document_detail(conn, company_id=cid, document_id=document_id)

    @router.delete("/rag/documents/{document_id}")
    def delete_rag_document(
        document_id: str,
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        identity = require_role(request, "analyst")
        cid = resolve_tenant(request, x_company_id)
        return rag_ingestion.delete_document(
            engine,
            company_id=cid,
            document_id=document_id,
            actor=identity["actor"],
        )

    @router.get("/rag/health")
    def rag_health(
        request: Request,
        x_company_id: Annotated[str | None, Header()] = None,
    ):
        require_role(request, "viewer")
        cid = resolve_tenant(request, x_company_id)
        embedder = get_embedding_provider()
        settings = get_rag_settings()
        with read_connection(engine) as conn:
            vs_health = store_health(conn, company_id=cid)
        return {
            "status": "ok",
            "company_id": cid,
            "embedding_provider": embedder.provider_name,
            "embedding_dim": embedder.dimension,
            "vector_store": vs_health,
            "documents_indexed": vs_health["documents_indexed"],
            "chunks_indexed": vs_health["chunks_indexed"],
            "chunk_size_tokens": settings.chunk_size,
            "chunk_overlap_tokens": settings.chunk_overlap,
            "hybrid_weights": {"dense": settings.dense_weight, "bm25": settings.bm25_weight},
            "min_relevance_score": settings.min_relevance_score,
        }

    return router
