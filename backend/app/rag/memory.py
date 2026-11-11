"""3-Layer Conversational Memory: Short-Term Sliding Window + Summarizer, Session Entity Context, and Long-Term Company Memory."""
from __future__ import annotations

from datetime import datetime, timezone
import logging
import re
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
import sqlalchemy as sa

from backend.app.db import chat_conversations, chat_messages, company_memories
from backend.app.rag.config import approx_token_count, get_rag_settings

log = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _serialize_conversation(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "dataset_id": row.get("dataset_id"),
        "title": row["title"],
        "is_pinned": bool(row.get("is_pinned")),
        "language": row.get("language") or "auto",
        "session_context": row.get("session_context_json") or {},
        "memory_summary": row.get("memory_summary") or "",
        "message_count": int(row.get("message_count") or 0),
        "created_by": row["created_by"],
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def _serialize_message(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "company_id": row["company_id"],
        "role": row["role"],
        "content": row["content"],
        "intent": row.get("intent"),
        "citations": row.get("citations_json") or [],
        "structured_sections": row.get("structured_sections_json") or None,
        "chart": row.get("chart_json") or None,
        "sql_trace": row.get("sql_trace_json") or None,
        "tool_trace": row.get("tool_trace_json") or None,
        "followups": row.get("followups_json") or [],
        "parent_message_id": row.get("parent_message_id"),
        "prompt_tokens": row.get("prompt_tokens"),
        "completion_tokens": row.get("completion_tokens"),
        "latency_ms": row.get("latency_ms"),
        "created_at": _iso(row.get("created_at")),
    }


def _serialize_memory(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "memory_key": row["memory_key"],
        "memory_type": row["memory_type"],
        "content": row["content"],
        "source_conversation_id": row.get("source_conversation_id"),
        "confidence": float(row.get("confidence") or 1.0),
        "created_by": row["created_by"],
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def create_conversation(
    engine: sa.Engine,
    *,
    company_id: str,
    dataset_id: str | None = None,
    title: str = "New Copilot Session",
    language: str = "auto",
    actor: str = "workspace-user",
) -> dict[str, Any]:
    cid = f"conv-{uuid4().hex[:14]}"
    now = _utc_now()
    with engine.begin() as conn:
        conn.execute(
            chat_conversations.insert().values(
                id=cid,
                company_id=company_id,
                dataset_id=dataset_id,
                title=(title or "New Copilot Session").strip()[:200],
                is_pinned=False,
                language=language or "auto",
                session_context_json={"dataset_id": dataset_id} if dataset_id else {},
                memory_summary=None,
                message_count=0,
                created_by=actor[:100],
                created_at=now,
                updated_at=now,
            )
        )
        row = conn.execute(sa.select(chat_conversations).where(chat_conversations.c.id == cid)).mappings().one()
    return _serialize_conversation(dict(row))


def list_conversations(
    conn: sa.Connection,
    *,
    company_id: str,
    dataset_id: str | None = None,
    search: str | None = None,
    pinned_only: bool = False,
    limit: int = 50,
) -> list[dict[str, Any]]:
    q = (
        sa.select(chat_conversations)
        .where(chat_conversations.c.company_id == company_id)
        .order_by(chat_conversations.c.is_pinned.desc(), chat_conversations.c.updated_at.desc())
        .limit(limit)
    )
    if dataset_id:
        q = q.where(sa.or_(chat_conversations.c.dataset_id == dataset_id, chat_conversations.c.dataset_id.is_(None)))
    if pinned_only:
        q = q.where(chat_conversations.c.is_pinned.is_(True))
    rows = [dict(r) for r in conn.execute(q).mappings().all()]
    if search and search.strip():
        needle = search.strip().lower()
        rows = [
            r
            for r in rows
            if needle in (r.get("title") or "").lower() or needle in (r.get("memory_summary") or "").lower()
        ]
    return [_serialize_conversation(r) for r in rows]


def get_owned_conversation(conn: sa.Connection, *, company_id: str, conversation_id: str) -> dict[str, Any]:
    row = conn.execute(
        sa.select(chat_conversations).where(chat_conversations.c.id == conversation_id)
    ).mappings().first()
    if row is None:
        raise HTTPException(404, "Conversation not found.")
    if row["company_id"] != company_id:
        raise HTTPException(403, "Cross-tenant conversation access denied.")
    return dict(row)


def update_conversation(
    engine: sa.Engine,
    *,
    company_id: str,
    conversation_id: str,
    title: str | None = None,
    is_pinned: bool | None = None,
    dataset_id: str | None = None,
) -> dict[str, Any]:
    with engine.begin() as conn:
        conv = get_owned_conversation(conn, company_id=company_id, conversation_id=conversation_id)
        updates: dict[str, Any] = {"updated_at": _utc_now()}
        if title is not None and title.strip():
            updates["title"] = title.strip()[:200]
        if is_pinned is not None:
            updates["is_pinned"] = bool(is_pinned)
        if dataset_id is not None:
            updates["dataset_id"] = dataset_id or None
            ctx = dict(conv.get("session_context_json") or {})
            ctx["dataset_id"] = dataset_id or None
            updates["session_context_json"] = ctx
        conn.execute(
            chat_conversations.update()
            .where(chat_conversations.c.id == conversation_id, chat_conversations.c.company_id == company_id)
            .values(**updates)
        )
        updated = conn.execute(sa.select(chat_conversations).where(chat_conversations.c.id == conversation_id)).mappings().one()
    return _serialize_conversation(dict(updated))


def delete_conversation(engine: sa.Engine, *, company_id: str, conversation_id: str) -> dict[str, Any]:
    with engine.begin() as conn:
        get_owned_conversation(conn, company_id=company_id, conversation_id=conversation_id)
        conn.execute(chat_messages.delete().where(chat_messages.c.conversation_id == conversation_id))
        conn.execute(chat_conversations.delete().where(chat_conversations.c.id == conversation_id))
    return {"deleted": True, "conversation_id": conversation_id}


def get_conversation_messages(conn: sa.Connection, *, company_id: str, conversation_id: str) -> list[dict[str, Any]]:
    get_owned_conversation(conn, company_id=company_id, conversation_id=conversation_id)
    rows = conn.execute(
        sa.select(chat_messages)
        .where(chat_messages.c.conversation_id == conversation_id, chat_messages.c.company_id == company_id)
        .order_by(chat_messages.c.created_at.asc())
    ).mappings().all()
    return [_serialize_message(dict(r)) for r in rows]


def _summarize_older_turns(older_messages: list[dict[str, Any]], prior_summary: str | None) -> str:
    """Compact deterministic rolling summary of older turns so token budget never blows up."""
    parts: list[str] = []
    if prior_summary:
        parts.append(prior_summary.strip()[:500])
    for m in older_messages:
        role = "Q" if m["role"] == "user" else "A"
        snippet = re.sub(r"\s+", " ", (m.get("content") or "")).strip()[:160]
        if snippet:
            parts.append(f"{role}: {snippet}")
    joined = " | ".join(parts)
    return joined[:1200]


def load_three_layer_memory(
    conn: sa.Connection,
    *,
    company_id: str,
    conversation_id: str,
) -> dict[str, Any]:
    """Assemble Layer 1 (budgeted recent turns + rolling summary), Layer 2 (session context), and Layer 3 (company memories)."""
    settings = get_rag_settings()
    conv = get_owned_conversation(conn, company_id=company_id, conversation_id=conversation_id)
    all_msgs = [
        dict(r)
        for r in conn.execute(
            sa.select(chat_messages)
            .where(chat_messages.c.conversation_id == conversation_id, chat_messages.c.company_id == company_id)
            .order_by(chat_messages.c.created_at.asc())
        ).mappings()
    ]

    # Budgeted Layer 1 window
    max_turns = settings.short_term_turns
    budget = settings.memory_token_budget
    recent: list[dict[str, Any]] = []
    used_tokens = 0
    for msg in reversed(all_msgs[-max_turns:]):
        tok = approx_token_count(msg.get("content") or "")
        if used_tokens + tok > budget and recent:
            break
        recent.append(_serialize_message(msg))
        used_tokens += tok
    recent.reverse()

    # Layer 3 company-wide persistent business memories
    mem_rows = [
        _serialize_memory(dict(r))
        for r in conn.execute(
            sa.select(company_memories)
            .where(company_memories.c.company_id == company_id)
            .order_by(company_memories.c.updated_at.desc())
            .limit(12)
        ).mappings()
    ]

    return {
        "conversation": _serialize_conversation(conv),
        "short_term_messages": recent,
        "memory_summary": conv.get("memory_summary") or "",
        "session_context": dict(conv.get("session_context_json") or {}),
        "company_memories": mem_rows,
        "token_usage_est": used_tokens,
    }


def append_turn_and_update_memory(
    engine: sa.Engine,
    *,
    company_id: str,
    conversation_id: str,
    user_message: str,
    assistant_message: str,
    intent: str,
    citations: list[dict[str, Any]],
    structured_sections: dict[str, Any] | None,
    chart: dict[str, Any] | None,
    sql_trace: dict[str, Any] | None,
    tool_trace: dict[str, Any] | None,
    followups: list[str],
    session_updates: dict[str, Any] | None,
    latency_ms: float,
    prompt_tokens: int,
    completion_tokens: int,
    replace_assistant_id: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    now = _utc_now()
    settings = get_rag_settings()

    with engine.begin() as conn:
        conv = get_owned_conversation(conn, company_id=company_id, conversation_id=conversation_id)

        if replace_assistant_id:
            existing_asst = conn.execute(
                sa.select(chat_messages).where(
                    chat_messages.c.id == replace_assistant_id,
                    chat_messages.c.conversation_id == conversation_id,
                    chat_messages.c.company_id == company_id,
                )
            ).mappings().first()
            if existing_asst and existing_asst.get("parent_message_id"):
                user_msg_id = existing_asst["parent_message_id"]
                user_row = dict(
                    conn.execute(sa.select(chat_messages).where(chat_messages.c.id == user_msg_id)).mappings().one()
                )
                conn.execute(chat_messages.delete().where(chat_messages.c.id == replace_assistant_id))
            else:
                user_msg_id = None
                user_row = None
        else:
            user_msg_id = None
            user_row = None

        if user_row is None:
            user_msg_id = f"msg-{uuid4().hex[:14]}"
            conn.execute(
                chat_messages.insert().values(
                    id=user_msg_id,
                    conversation_id=conversation_id,
                    company_id=company_id,
                    role="user",
                    content=user_message,
                    created_at=now,
                )
            )
            user_row = dict(conn.execute(sa.select(chat_messages).where(chat_messages.c.id == user_msg_id)).mappings().one())

        asst_msg_id = f"msg-{uuid4().hex[:14]}"
        conn.execute(
            chat_messages.insert().values(
                id=asst_msg_id,
                conversation_id=conversation_id,
                company_id=company_id,
                role="assistant",
                content=assistant_message,
                intent=intent,
                citations_json=citations,
                structured_sections_json=structured_sections,
                chart_json=chart,
                sql_trace_json=sql_trace,
                tool_trace_json=tool_trace,
                followups_json=followups,
                parent_message_id=user_msg_id,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                latency_ms=round(latency_ms, 2),
                created_at=_utc_now(),
            )
        )
        asst_row = dict(conn.execute(sa.select(chat_messages).where(chat_messages.c.id == asst_msg_id)).mappings().one())

        all_msgs = [
            dict(r)
            for r in conn.execute(
                sa.select(chat_messages)
                .where(chat_messages.c.conversation_id == conversation_id, chat_messages.c.company_id == company_id)
                .order_by(chat_messages.c.created_at.asc())
            ).mappings()
        ]
        # Summarize older turns outside the active window
        new_summary = conv.get("memory_summary")
        if len(all_msgs) > settings.short_term_turns:
            overflow = all_msgs[: len(all_msgs) - settings.short_term_turns]
            new_summary = _summarize_older_turns(overflow[-4:], new_summary)

        new_ctx = {**(conv.get("session_context_json") or {}), **(session_updates or {})}
        new_title = conv["title"]
        if conv["title"] in {"New Copilot Session", "Cuộc trò chuyện mới", "Untitled Session"} and user_message.strip():
            new_title = re.sub(r"\s+", " ", user_message.strip())[:72]

        conn.execute(
            chat_conversations.update()
            .where(chat_conversations.c.id == conversation_id, chat_conversations.c.company_id == company_id)
            .values(
                title=new_title,
                session_context_json=new_ctx,
                memory_summary=new_summary,
                message_count=len(all_msgs),
                dataset_id=new_ctx.get("dataset_id") or conv.get("dataset_id"),
                updated_at=_utc_now(),
            )
        )
        updated_conv = dict(conn.execute(sa.select(chat_conversations).where(chat_conversations.c.id == conversation_id)).mappings().one())

    return _serialize_conversation(updated_conv), _serialize_message(user_row), _serialize_message(asst_row)


def list_company_memories(conn: sa.Connection, *, company_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        sa.select(company_memories)
        .where(company_memories.c.company_id == company_id)
        .order_by(company_memories.c.updated_at.desc())
    ).mappings().all()
    return [_serialize_memory(dict(r)) for r in rows]


def upsert_company_memory(
    engine: sa.Engine,
    *,
    company_id: str,
    memory_key: str,
    content: str,
    memory_type: str = "business_context",
    source_conversation_id: str | None = None,
    confidence: float = 1.0,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    now = _utc_now()
    clean_key = memory_key.strip()[:120]
    clean_content = content.strip()
    if not clean_key or not clean_content:
        raise HTTPException(422, "Memory key and content are required.")

    with engine.begin() as conn:
        existing = conn.execute(
            sa.select(company_memories).where(
                company_memories.c.company_id == company_id,
                company_memories.c.memory_key == clean_key,
            )
        ).mappings().first()
        if existing:
            mem_id = existing["id"]
            conn.execute(
                company_memories.update()
                .where(company_memories.c.id == mem_id, company_memories.c.company_id == company_id)
                .values(
                    content=clean_content,
                    memory_type=memory_type,
                    source_conversation_id=source_conversation_id or existing.get("source_conversation_id"),
                    confidence=confidence,
                    updated_at=now,
                )
            )
        else:
            mem_id = f"mem-{uuid4().hex[:14]}"
            conn.execute(
                company_memories.insert().values(
                    id=mem_id,
                    company_id=company_id,
                    memory_key=clean_key,
                    memory_type=memory_type,
                    content=clean_content,
                    source_conversation_id=source_conversation_id,
                    confidence=confidence,
                    created_by=actor[:100],
                    created_at=now,
                    updated_at=now,
                )
            )
        row = conn.execute(sa.select(company_memories).where(company_memories.c.id == mem_id)).mappings().one()
    return _serialize_memory(dict(row))


def delete_company_memory(engine: sa.Engine, *, company_id: str, memory_id: str) -> dict[str, Any]:
    with engine.begin() as conn:
        row = conn.execute(sa.select(company_memories).where(company_memories.c.id == memory_id)).mappings().first()
        if row is None:
            raise HTTPException(404, "Memory entry not found.")
        if row["company_id"] != company_id:
            raise HTTPException(403, "Cross-tenant memory deletion denied.")
        conn.execute(company_memories.delete().where(company_memories.c.id == memory_id, company_memories.c.company_id == company_id))
    return {"deleted": True, "memory_id": memory_id}

