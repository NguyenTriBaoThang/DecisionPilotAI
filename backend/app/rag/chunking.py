"""Text normalization & multi-strategy Chunking Engine: Recursive, Semantic, Structure-aware, and Table-aware."""
from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import re
from typing import Any

import numpy as np

from backend.app.rag.config import approx_token_count
from backend.app.rag.embeddings import EmbeddingProvider, cosine_similarities, get_embedding_provider


SENTENCE_SPLIT_RX = re.compile(r"(?<=[.!?])\s+(?=[\w\u00C0-\u1EFF\"'(\[])|\n+")
HEADING_RX = re.compile(
    r"^\s*(?:(#{1,4})\s+(.+)|"
    r"((?:PART|SECTION|CHAPTER|PHẦN|MỤC|CHƯƠNG)\s+[A-Z0-9IVX]+[:.\s-].*)|"
    r"(\[(?:Page|Slide|Sheet)\s+[^\]]+\].*)|"
    r"(\d+(?:\.\d+)*\.\s+[A-Z\u00C0-\u1EFF][^\n]{3,90}))\s*$",
    re.MULTILINE,
)
PAGE_TAG_RX = re.compile(r"\[(?:Page|Slide)\s+(\d+)\]", re.I)


@dataclass
class TextSegment:
    """Intermediate normalized document section or table segment prior to chunking."""
    text: str
    page_number: int | None = None
    section: str | None = None
    is_table: bool = False
    headers: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ChunkCandidate:
    chunk_index: int
    content: str
    content_hash: str
    token_count: int
    source_file: str
    page_number: int | None
    section: str | None
    document_type: str
    domain: str
    chunking_strategy: str
    metadata: dict[str, Any] = field(default_factory=dict)


def normalize_text(raw: str) -> str:
    """Normalize line endings, remove control artifacts, heal broken PDF hyphen wraps while keeping tables intact."""
    if not raw:
        return ""
    txt = raw.replace("\r\n", "\n").replace("\r", "\n")
    txt = re.sub(r"[\u200b-\u200f\u202a-\u202e\ufeff]", "", txt)
    # Heal hyphenated line breaks inside prose
    txt = re.sub(r"([A-Za-z\u00C0-\u1EFF])-\n([A-Za-z\u00C0-\u1EFF])", r"\1\2", txt)
    lines = [ln.rstrip() for ln in txt.split("\n")]
    out_lines: list[str] = []
    blank_streak = 0
    for ln in lines:
        if not ln.strip():
            blank_streak += 1
            if blank_streak <= 1:
                out_lines.append("")
        else:
            blank_streak = 0
            out_lines.append(ln)
    return "\n".join(out_lines).strip()


def _overlap_tail(text: str, overlap_chars: int) -> str:
    if overlap_chars <= 0 or len(text) <= overlap_chars:
        return text
    snippet = text[-overlap_chars:]
    space_idx = snippet.find(" ")
    if 0 < space_idx < len(snippet) - 10:
        snippet = snippet[space_idx + 1 :]
    return snippet.strip()


def recursive_chunk_text(
    text: str,
    *,
    chunk_size: int = 720,
    chunk_overlap: int = 120,
) -> list[str]:
    """Hierarchical recursive splitter: paragraphs -> lines -> sentences -> words."""
    clean = normalize_text(text)
    if not clean:
        return []
    if len(clean) <= chunk_size:
        return [clean]

    paragraphs = [p.strip() for p in clean.split("\n\n") if p.strip()]
    units: list[str] = []
    for p in paragraphs:
        if len(p) <= chunk_size:
            units.append(p)
        else:
            sents = [s.strip() for s in SENTENCE_SPLIT_RX.split(p) if s and s.strip()]
            for s in sents:
                if len(s) <= chunk_size:
                    units.append(s)
                else:
                    # Fallback hard word split for huge single lines
                    words = s.split()
                    cur = ""
                    for w in words:
                        cand = f"{cur} {w}".strip() if cur else w
                        if len(cand) > chunk_size and cur:
                            units.append(cur)
                            cur = f"{_overlap_tail(cur, chunk_overlap)} {w}".strip()
                        else:
                            cur = cand
                    if cur:
                        units.append(cur)

    chunks: list[str] = []
    buf = ""
    for u in units:
        sep = "\n\n" if ("\n" in buf or "\n" in u) else " "
        cand = f"{buf}{sep}{u}".strip() if buf else u
        if len(cand) <= chunk_size:
            buf = cand
        else:
            if buf:
                chunks.append(buf)
                tail = _overlap_tail(buf, chunk_overlap)
                buf = f"{tail} {u}".strip() if (tail and len(tail) + len(u) + 1 <= chunk_size) else u
            else:
                chunks.append(u[:chunk_size])
                buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def semantic_chunk_text(
    text: str,
    *,
    embedder: EmbeddingProvider | None = None,
    chunk_size: int = 720,
    chunk_overlap: int = 100,
    similarity_drop_threshold: float = 0.22,
) -> list[str]:
    """Split prose when adjacent sentence cosine similarity drops noticeably (topic shift), enforcing length bounds."""
    clean = normalize_text(text)
    if not clean:
        return []
    if len(clean) <= chunk_size:
        return [clean]

    sents = [s.strip() for s in SENTENCE_SPLIT_RX.split(clean) if s and s.strip()]
    if len(sents) < 4:
        return recursive_chunk_text(clean, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    provider = embedder or get_embedding_provider("local")
    vecs = provider.embed_texts(sents)
    adj_sims: list[float] = []
    for idx in range(len(vecs) - 1):
        v1 = np.asarray(vecs[idx], dtype=np.float32)
        v2 = np.asarray(vecs[idx + 1], dtype=np.float32)
        n1, n2 = float(np.linalg.norm(v1)), float(np.linalg.norm(v2))
        sim = float(np.dot(v1, v2) / (n1 * n2)) if n1 > 1e-8 and n2 > 1e-8 else 0.0
        adj_sims.append(sim)

    mean_sim = float(np.mean(adj_sims)) if adj_sims else 0.0
    chunks: list[str] = []
    buf = sents[0]
    for idx in range(1, len(sents)):
        next_sent = sents[idx]
        sim = adj_sims[idx - 1]
        cand = f"{buf} {next_sent}".strip()
        topic_shift = sim < (mean_sim - similarity_drop_threshold) and len(buf) >= max(160, chunk_size // 3)
        if len(cand) > chunk_size or topic_shift:
            chunks.append(buf)
            tail = _overlap_tail(buf, chunk_overlap) if len(cand) > chunk_size else ""
            buf = f"{tail} {next_sent}".strip() if (tail and len(tail) + len(next_sent) + 1 <= chunk_size) else next_sent
        else:
            buf = cand
    if buf:
        chunks.append(buf)
    return chunks


def table_chunk_rows(
    headers: list[str],
    rows: list[dict[str, Any]] | list[list[Any]],
    *,
    section: str | None = None,
    page_number: int | None = None,
    chunk_size: int = 720,
) -> list[str]:
    """Chunk tabular data keeping header columns & unit/period semantics pinned to every slice."""
    if not headers or not rows:
        return []
    clean_headers = [str(h or f"col_{i+1}").strip() for i, h in enumerate(headers)]
    header_md = "| " + " | ".join(clean_headers) + " |"
    sep_md = "| " + " | ".join("---" for _ in clean_headers) + " |"
    prefix = f"[{section}] " if section else ""
    base_header = f"{prefix}\n{header_md}\n{sep_md}".strip()

    formatted_rows: list[str] = []
    for r in rows:
        if isinstance(r, dict):
            vals = [str(r.get(h, "")).replace("\n", " ").strip() for h in headers]
        else:
            vals = [str(c if c is not None else "").replace("\n", " ").strip() for c in r]
            vals = vals[: len(clean_headers)] + [""] * max(0, len(clean_headers) - len(vals))
        formatted_rows.append("| " + " | ".join(vals) + " |")

    chunks: list[str] = []
    cur_lines = [base_header]
    cur_len = len(base_header)
    for row_line in formatted_rows:
        if cur_len + len(row_line) + 1 > chunk_size and len(cur_lines) > 1:
            chunks.append("\n".join(cur_lines))
            cur_lines = [base_header, row_line]
            cur_len = len(base_header) + len(row_line) + 1
        else:
            cur_lines.append(row_line)
            cur_len += len(row_line) + 1
    if len(cur_lines) > 1:
        chunks.append("\n".join(cur_lines))
    return chunks


def split_structure_sections(text: str, *, default_page: int | None = None) -> list[TextSegment]:
    """Detect Markdown headings, numbered report sections, and [Page N]/[Slide N] markers."""
    clean = normalize_text(text)
    if not clean:
        return []
    lines = clean.split("\n")
    segments: list[TextSegment] = []
    cur_section: str | None = None
    cur_page: int | None = default_page
    buf_lines: list[str] = []

    def _flush():
        nonlocal buf_lines
        joined = "\n".join(buf_lines).strip()
        if joined:
            segments.append(TextSegment(text=joined, page_number=cur_page, section=cur_section))
        buf_lines = []

    for ln in lines:
        stripped = ln.strip()
        p_match = PAGE_TAG_RX.search(stripped)
        if p_match and stripped.startswith("["):
            _flush()
            cur_page = int(p_match.group(1))
            rest = PAGE_TAG_RX.sub("", stripped).strip(" :-")
            if rest:
                cur_section = rest[:180]
            continue

        is_heading = False
        heading_title: str | None = None
        if stripped.startswith("#"):
            is_heading = True
            heading_title = stripped.lstrip("#").strip()[:180]
        elif re.match(r"^(?:PART|SECTION|CHAPTER|PHẦN|MỤC|CHƯƠNG)\s+[A-Z0-9IVX]+[:.\s-]", stripped):
            is_heading = True
            heading_title = stripped[:180]
        elif re.match(r"^\d+(?:\.\d+)*\.\s+[A-Z\u00C0-\u1EFF][^\n]{3,90}$", stripped) and "|" not in stripped:
            is_heading = True
            heading_title = stripped[:180]

        if is_heading and heading_title:
            _flush()
            cur_section = heading_title
            buf_lines.append(stripped)
        else:
            buf_lines.append(ln)

    _flush()
    return segments or [TextSegment(text=clean, page_number=default_page, section=None)]


def _is_markdown_table_block(text: str) -> bool:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    pipe_lines = sum(1 for ln in lines if ln.startswith("|") and ln.endswith("|") and ln.count("|") >= 2)
    return len(lines) >= 2 and pipe_lines >= 2


def chunk_segments(
    segments: list[TextSegment],
    *,
    source_file: str,
    document_type: str,
    domain: str = "general",
    strategy: str = "auto",
    chunk_size: int = 720,
    chunk_overlap: int = 120,
    embedder: EmbeddingProvider | None = None,
) -> list[ChunkCandidate]:
    """Chunk structured or raw segments using the optimal strategy, preserving section/page provenance & deduplicating."""
    candidates: list[ChunkCandidate] = []
    seen_hashes: set[str] = set()
    chunk_idx = 0

    for seg in segments:
        txt = normalize_text(seg.text)
        if not txt:
            continue

        chosen_strategy = strategy
        pieces: list[str] = []

        if seg.is_table or _is_markdown_table_block(txt):
            chosen_strategy = "table"
            # Preserve markdown table header lines if raw text has pipe table
            lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
            if len(lines) >= 3 and "|" in lines[0] and "---" in lines[1]:
                header_block = "\n".join(lines[:2])
                body_rows = lines[2:]
                cur = header_block
                for rline in body_rows:
                    if len(cur) + len(rline) + 1 > chunk_size and cur != header_block:
                        pieces.append(cur)
                        cur = f"{header_block}\n{rline}"
                    else:
                        cur = f"{cur}\n{rline}"
                if cur != header_block:
                    pieces.append(cur)
            else:
                pieces = recursive_chunk_text(txt, chunk_size=chunk_size, chunk_overlap=min(60, chunk_overlap))
        else:
            if chosen_strategy == "auto":
                chosen_strategy = "semantic" if len(txt) > chunk_size * 1.4 else "structure" if seg.section else "recursive"
            if chosen_strategy == "semantic":
                pieces = semantic_chunk_text(txt, embedder=embedder, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
            else:
                pieces = recursive_chunk_text(txt, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

        for piece in pieces:
            body = piece.strip()
            if not body:
                continue
            # Prepend crisp structural header if section isn't already inside body so retrieval embeds heading context
            if seg.section and not body.lower().startswith(seg.section.lower()[:30]):
                contextual_body = f"[{seg.section}] {body}"
            else:
                contextual_body = body

            dedup_key = re.sub(r"\s+", " ", contextual_body.strip())
            c_hash = hashlib.sha256(
                f"{dedup_key}::{seg.section or ''}".encode("utf-8")
            ).hexdigest()
            if c_hash in seen_hashes:
                continue
            seen_hashes.add(c_hash)
            candidates.append(
                ChunkCandidate(
                    chunk_index=chunk_idx,
                    content=contextual_body,
                    content_hash=c_hash,
                    token_count=approx_token_count(contextual_body),
                    source_file=source_file,
                    page_number=seg.page_number,
                    section=seg.section,
                    document_type=document_type,
                    domain=domain,
                    chunking_strategy=chosen_strategy,
                    metadata=dict(seg.metadata),
                )
            )
            chunk_idx += 1

    return candidates

