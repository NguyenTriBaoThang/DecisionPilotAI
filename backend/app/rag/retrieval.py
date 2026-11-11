"""Hybrid RAG Retrieval Engine: Query Rewriting, Dense Vector + Okapi BM25 Sparse Search, RRF Fusion & Multi-Signal Reranker."""
from __future__ import annotations

from dataclasses import dataclass, field
import math
import time
from typing import Any

import sqlalchemy as sa

from backend.app.rag.config import (
    BILINGUAL_CONCEPTS,
    detect_language,
    extract_concepts,
    fold_text,
    get_rag_settings,
    tokenize,
)
from backend.app.rag.embeddings import EmbeddingProvider, get_embedding_provider
from backend.app.rag.security import sanitize_retrieved_text
from backend.app.rag.vector_store import VectorStore, get_vector_store


@dataclass
class RetrievalTrace:
    original_query: str
    rewritten_query: str
    language: str
    concepts: list[str]
    filters: dict[str, Any]
    total_candidates: int
    dense_hits: int
    bm25_hits: int
    fused_hits: int
    returned_hits: int
    vector_backend: str
    embedding_provider: str
    latencies_ms: dict[str, float] = field(default_factory=dict)


def rewrite_query(
    question: str,
    *,
    session_context: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    """Expand EN/VI business synonyms and attach unresolved entity hints from conversation memory."""
    clean_q = (question or "").strip()
    lang = detect_language(clean_q)
    concepts = extract_concepts(clean_q)

    # Bilingual query expansion terms (adds key cross-lingual equivalents gently)
    expansions: list[str] = []
    concept_map = dict(BILINGUAL_CONCEPTS)
    for tag in concepts[:4]:
        terms = concept_map.get(tag, ())
        for term in terms[:3]:
            if fold_text(term) not in fold_text(clean_q):
                expansions.append(term)

    ctx_hints: list[str] = []
    if session_context:
        # Resolve implicit pronouns like "that product" / "nó" / "sản phẩm đó" / "kênh đó"
        low = fold_text(clean_q)
        vague_ref = any(
            marker in low
            for marker in ("it ", "its ", "that product", "that channel", "that region", "san pham do", "kenh do", "khu vuc do", "cai do", "no ")
        )
        if vague_ref:
            for key in ("last_product", "last_region", "last_channel"):
                val = session_context.get(key)
                if val and fold_text(str(val)) not in low:
                    ctx_hints.append(str(val))

    rewritten = clean_q
    if ctx_hints:
        rewritten = f"{rewritten} ({' '.join(ctx_hints)})"
    if expansions:
        rewritten = f"{rewritten} {' '.join(expansions[:6])}"

    inferred_domain: str | None = None
    if "concept_marketing" in concepts:
        inferred_domain = "marketing"
    elif "concept_inventory" in concepts:
        inferred_domain = "inventory"
    elif "concept_profit" in concepts or "concept_cost" in concepts:
        inferred_domain = "finance"
    elif "concept_revenue" in concepts or "concept_orders" in concepts:
        inferred_domain = "sales"

    return rewritten, {
        "language": lang,
        "concepts": concepts,
        "expansions": expansions[:6],
        "context_hints": ctx_hints,
        "inferred_domain": inferred_domain,
    }


def bm25_search(
    query: str,
    chunks: list[dict[str, Any]],
    *,
    top_k: int = 12,
    k1: float = 1.5,
    b: float = 0.75,
) -> list[dict[str, Any]]:
    """True Okapi BM25 over sparse term frequencies stored per chunk (supports EN + accent-folded VI)."""
    q_tokens = tokenize(query, include_stopwords=False, include_concepts=True)
    if not q_tokens or not chunks:
        return []

    n_docs = len(chunks)
    doc_tfs: list[dict[str, int]] = []
    doc_lens: list[int] = []
    df: dict[str, int] = {}

    q_term_set = set(q_tokens)
    for row in chunks:
        tf = row.get("sparse_terms_json")
        if not isinstance(tf, dict) or not tf:
            toks = tokenize(row.get("content") or "", include_stopwords=False, include_concepts=True)
            tf = {}
            for tok in toks:
                tf[tok] = tf.get(tok, 0) + 1
        doc_tfs.append(tf)
        dlen = sum(int(v) for v in tf.values()) or 1
        doc_lens.append(dlen)
        for qt in q_term_set:
            if tf.get(qt, 0) > 0:
                df[qt] = df.get(qt, 0) + 1

    avgdl = sum(doc_lens) / float(max(1, n_docs))
    scored: list[tuple[float, dict[str, Any]]] = []
    q_tf: dict[str, int] = {}
    for qt in q_tokens:
        q_tf[qt] = q_tf.get(qt, 0) + 1

    for idx, row in enumerate(chunks):
        tf = doc_tfs[idx]
        dlen = doc_lens[idx]
        score = 0.0
        for qt, qf in q_tf.items():
            freq = int(tf.get(qt, 0))
            if freq <= 0:
                continue
            doc_freq = df.get(qt, 0)
            # Robertson-Sparck Jones IDF smoothed
            idf = math.log(1.0 + (n_docs - doc_freq + 0.5) / (doc_freq + 0.5))
            denom = freq + k1 * (1.0 - b + b * (dlen / max(1.0, avgdl)))
            score += idf * ((freq * (k1 + 1.0)) / max(1e-8, denom)) * (1.0 + 0.25 * (qf - 1))
        if score > 0.0:
            scored.append((score, row))

    scored.sort(key=lambda item: item[0], reverse=True)
    max_raw = scored[0][0] if scored else 1.0
    out: list[dict[str, Any]] = []
    for rank, (raw_s, row) in enumerate(scored[:top_k], start=1):
        out.append({
            **row,
            "bm25_raw": round(raw_s, 6),
            "bm25_score": round(raw_s / max(1e-8, max_raw), 6),
            "bm25_rank": rank,
        })
    return out


def rerank_candidates(
    query: str,
    fused: list[dict[str, Any]],
    *,
    top_k: int = 6,
) -> list[dict[str, Any]]:
    """
    Multi-signal passage reranker combining RRF fusion score, exact bigram/phrase overlap,
    heading/section overlap, numeric/SKU match, and extraction reliability.
    """
    if not fused:
        return []
    q_folded = fold_text(query)
    q_words = tokenize(query, include_stopwords=False, include_concepts=False)
    q_word_set = set(q_words)
    q_bigrams = {f"{a} {b}" for a, b in zip(q_words, q_words[1:])}

    max_rrf = max((item.get("rrf_score") or 0.0) for item in fused) or 1.0
    reranked: list[dict[str, Any]] = []

    for item in fused:
        content = item.get("content") or ""
        c_folded = fold_text(content)
        sec_folded = fold_text(item.get("section") or "")
        file_folded = fold_text(item.get("source_file") or "")

        rrf_norm = (item.get("rrf_score") or 0.0) / max_rrf
        dense_s = float(item.get("dense_score") or 0.0)
        bm25_s = float(item.get("bm25_score") or 0.0)

        # Lexical coverage ratio (raw content tokens + concept bridges)
        c_raw_tokens = set(tokenize(content, include_stopwords=False, include_concepts=False))
        c_tokens = set(tokenize(content, include_stopwords=False, include_concepts=True))
        raw_hits = len(q_word_set & c_raw_tokens)
        q_concept_tokens = set(tokenize(query, include_stopwords=False, include_concepts=True))
        coverage = raw_hits / float(max(1, len(q_word_set)))
        concept_cov = len(q_concept_tokens & c_tokens) / float(max(1, len(q_concept_tokens)))

        # Bigram / exact phrase bonus
        bigram_hits = sum(1 for bg in q_bigrams if bg in c_folded)
        bigram_score = min(1.0, bigram_hits / float(max(1, len(q_bigrams)))) if q_bigrams else 0.0

        # Heading & filename proximity bonus
        header_hits = sum(1 for qw in q_word_set if qw in sec_folded or qw in file_folded)
        header_score = min(1.0, header_hits / float(max(1, len(q_word_set))))

        # Anchor RRF rank bonus strictly to real semantic/lexical evidence strength
        # so off-topic chunks cannot surf high RRF scores when dense cosine is background noise.
        if raw_hits == 0 and header_hits == 0 and bm25_s < 0.20 and dense_s < 0.36:
            final_score = round(min(0.09, dense_s * 0.25 + concept_cov * 0.04), 6)
        else:
            evidence_gate = min(1.0, max(bm25_s, coverage, bigram_score, header_score, max(0.0, (dense_s - 0.18) / 0.65)) * 1.15)
            final_score = (
                0.32 * (rrf_norm * evidence_gate)
                + 0.24 * max(dense_s, bm25_s)
                + 0.22 * max(coverage, concept_cov * 0.7)
                + 0.14 * bigram_score
                + 0.08 * header_score
            )
            # Boost direct exact substring matches
            if len(q_folded) >= 8 and q_folded in c_folded:
                final_score = min(1.0, final_score + 0.12)

        reranked.append({
            **item,
            "rerank_score": round(final_score, 6),
        })

    reranked.sort(key=lambda r: (r["rerank_score"], r.get("rrf_score") or 0.0), reverse=True)
    return reranked[:top_k]


def hybrid_search(
    conn: sa.Connection,
    *,
    query: str,
    company_id: str,
    role: str = "viewer",
    dataset_id: str | None = None,
    document_type: str | None = None,
    domain: str | None = None,
    source_file: str | None = None,
    document_ids: list[str] | None = None,
    session_context: dict[str, Any] | None = None,
    top_k: int | None = None,
    min_score: float | None = None,
    mode: str = "hybrid",
    embedder: EmbeddingProvider | None = None,
    vector_store: VectorStore | None = None,
) -> tuple[list[dict[str, Any]], RetrievalTrace]:
    """Execute end-to-end Hybrid RAG Retrieval: Rewrite -> Dense + BM25 -> RRF -> Rerank -> Filter & Format."""
    t_start = time.perf_counter()
    settings = get_rag_settings()
    resolved_top_k = top_k or settings.rerank_top_k
    resolved_min_score = settings.min_relevance_score if min_score is None else min_score
    norm_mode = mode if mode in {"hybrid", "dense", "bm25"} else "hybrid"

    # 1. Query Understanding & Rewriting
    t0 = time.perf_counter()
    rewritten_q, q_meta = rewrite_query(query, session_context=session_context)
    rewrite_ms = round((time.perf_counter() - t0) * 1000, 2)

    # 2. Fetch tenant/RBAC-authorized chunk pool once for BM25 & metadata verification
    t1 = time.perf_counter()
    provider = embedder or get_embedding_provider()
    store = vector_store or get_vector_store(conn.dialect.name)
    auth_pool = store.fetch_authorized_chunks(
        conn,
        company_id=company_id,
        role=role,
        dataset_id=dataset_id,
        document_type=document_type,
        domain=domain,
        source_file=source_file,
        document_ids=document_ids,
    )
    if not auth_pool and dataset_id is not None:
        # Also allow searching company-wide docs if scoped dataset yielded zero chunks
        auth_pool = store.fetch_authorized_chunks(
            conn,
            company_id=company_id,
            role=role,
            dataset_id=None,
            document_type=document_type,
            domain=domain,
            source_file=source_file,
            document_ids=document_ids,
        )

    q_vec = provider.embed_query(rewritten_q) if norm_mode in {"hybrid", "dense"} else []
    embed_ms = round((time.perf_counter() - t1) * 1000, 2)

    # 3. Dense Search
    t2 = time.perf_counter()
    dense_hits: list[dict[str, Any]] = []
    if norm_mode in {"hybrid", "dense"}:
        dense_hits = store.search_dense(
            conn,
            query_vector=q_vec,
            company_id=company_id,
            role=role,
            dataset_id=dataset_id,
            document_type=document_type,
            domain=domain,
            source_file=source_file,
            document_ids=document_ids,
            top_k=settings.dense_top_k,
        )
        if not dense_hits and dataset_id is not None and auth_pool:
            dense_hits = store.search_dense(
                conn,
                query_vector=q_vec,
                company_id=company_id,
                role=role,
                dataset_id=None,
                document_type=document_type,
                domain=domain,
                source_file=source_file,
                document_ids=document_ids,
                top_k=settings.dense_top_k,
            )
    dense_ms = round((time.perf_counter() - t2) * 1000, 2)

    # 4. Sparse BM25 Search
    t3 = time.perf_counter()
    bm25_hits = bm25_search(rewritten_q, auth_pool, top_k=settings.bm25_top_k) if norm_mode in {"hybrid", "bm25"} else []
    bm25_ms = round((time.perf_counter() - t3) * 1000, 2)

    # 5. Reciprocal Rank Fusion (k=60) + Content Deduplication
    t4 = time.perf_counter()
    k_rrf = 60.0
    fused_map: dict[str, dict[str, Any]] = {}
    for hit in dense_hits:
        cid = hit["id"]
        entry = fused_map.setdefault(cid, {**hit, "dense_score": 0.0, "bm25_score": 0.0, "rrf_score": 0.0})
        entry["dense_score"] = hit["dense_score"]
        entry["dense_rank"] = hit["dense_rank"]
        entry["rrf_score"] += (1.0 if norm_mode == "dense" else settings.dense_weight) / (k_rrf + hit["dense_rank"])

    for hit in bm25_hits:
        cid = hit["id"]
        entry = fused_map.setdefault(cid, {**hit, "dense_score": 0.0, "bm25_score": 0.0, "rrf_score": 0.0})
        entry["bm25_score"] = hit["bm25_score"]
        entry["bm25_rank"] = hit["bm25_rank"]
        entry["rrf_score"] += (1.0 if norm_mode == "bm25" else settings.bm25_weight) / (k_rrf + hit["bm25_rank"])

    fused_list = sorted(fused_map.values(), key=lambda x: x["rrf_score"], reverse=True)
    # Deduplicate identical normalized content hashes across re-ingests
    deduped_fused: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    for row in fused_list:
        ch = row.get("content_hash") or row["id"]
        if ch in seen_hashes:
            continue
        seen_hashes.add(ch)
        deduped_fused.append(row)
    fusion_ms = round((time.perf_counter() - t4) * 1000, 2)

    # 6. Multi-signal Reranker (skipped in single-mode ablation runs)
    t5 = time.perf_counter()
    if norm_mode == "dense":
        filtered = [
            {**r, "rerank_score": round(float(r.get("dense_score") or 0.0), 6)}
            for r in deduped_fused
            if float(r.get("dense_score") or 0.0) >= resolved_min_score
        ][:resolved_top_k]
    elif norm_mode == "bm25":
        filtered = [
            {**r, "rerank_score": round(float(r.get("bm25_score") or 0.0), 6)}
            for r in deduped_fused
            if float(r.get("bm25_score") or 0.0) >= resolved_min_score
        ][:resolved_top_k]
    else:
        reranked = rerank_candidates(query, deduped_fused, top_k=max(resolved_top_k * 2, resolved_top_k))
        filtered = [r for r in reranked if r["rerank_score"] >= resolved_min_score][:resolved_top_k]
    rerank_ms = round((time.perf_counter() - t5) * 1000, 2)

    # Clean up heavy vector blobs and build clean citation payload
    formatted_hits: list[dict[str, Any]] = []
    for idx, hit in enumerate(filtered, start=1):
        meta = dict(hit.get("metadata_json") or {})
        safe_content = sanitize_retrieved_text(hit["content"])
        formatted_hits.append({
            "citation_id": f"C{idx}",
            "chunk_id": hit["id"],
            "document_id": hit["document_id"],
            "source_file": hit["source_file"],
            "document_type": hit["document_type"],
            "domain": hit["domain"],
            "dataset_id": hit.get("dataset_id"),
            "page_number": hit.get("page_number"),
            "section": hit.get("section"),
            "chunking_strategy": hit.get("chunking_strategy"),
            "content": safe_content,
            "snippet": safe_content[:360] + ("…" if len(safe_content) > 360 else ""),
            "scores": {
                "dense": round(float(hit.get("dense_score") or 0.0), 4),
                "bm25": round(float(hit.get("bm25_score") or 0.0), 4),
                "rrf": round(float(hit.get("rrf_score") or 0.0), 5),
                "rerank": round(float(hit.get("rerank_score") or 0.0), 4),
            },
            "dense_score": round(float(hit.get("dense_score") or 0.0), 4),
            "bm25_score": round(float(hit.get("bm25_score") or 0.0), 4),
            "rrf_score": round(float(hit.get("rrf_score") or 0.0), 5),
            "rerank_score": round(float(hit.get("rerank_score") or 0.0), 4),
            "metadata": meta,
            "source_url": meta.get("source_url"),
        })

    total_ms = round((time.perf_counter() - t_start) * 1000, 2)
    trace = RetrievalTrace(
        original_query=query,
        rewritten_query=rewritten_q,
        language=q_meta["language"],
        concepts=q_meta["concepts"],
        filters={
            "company_id": company_id,
            "dataset_id": dataset_id,
            "document_type": document_type,
            "domain": domain,
            "source_file": source_file,
        },
        total_candidates=len(auth_pool),
        dense_hits=len(dense_hits),
        bm25_hits=len(bm25_hits),
        fused_hits=len(deduped_fused),
        returned_hits=len(formatted_hits),
        vector_backend=store.backend_name,
        embedding_provider=provider.provider_name,
        latencies_ms={
            "rewrite_ms": rewrite_ms,
            "embed_ms": embed_ms,
            "dense_ms": dense_ms,
            "bm25_ms": bm25_ms,
            "fusion_ms": fusion_ms,
            "rerank_ms": rerank_ms,
            "total_ms": total_ms,
        },
    )
    return formatted_hits, trace

