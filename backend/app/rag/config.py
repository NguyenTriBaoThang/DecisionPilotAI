"""Configuration, bilingual EN/VI text normalization, folding, tokenization, and domain bridges."""
from __future__ import annotations

from dataclasses import dataclass
import os
import re
import unicodedata


VI_TRANSLATE = str.maketrans("đĐ", "dD")
WORD_RX = re.compile(r"[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]+(?:[._-][a-zA-Z0-9]+)*", re.UNICODE)

STOPWORDS = {
    "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "at", "is", "are", "was", "were",
    "this", "that", "these", "those", "by", "from", "with", "as", "it", "be", "we", "our", "you",
    "what", "which", "who", "whom", "how", "why", "when", "where", "can", "could", "should", "would",
    "do", "does", "did", "have", "has", "had", "about", "into", "over", "after", "before", "all",
    "va", "la", "cua", "cho", "trong", "tren", "tai", "voi", "tu", "den", "ve", "nhu", "the", "nao",
    "gi", "ai", "sao", "khi", "dau", "co", "khong", "duoc", "nhung", "cac", "mot", "nhieu", "nay",
    "kia", "do", "day", "roi", "hay", "hoac", "nhung", "ma", "thi", "cung", "dang", "da", "se",
}

# Bilingual English <-> Vietnamese business concept bridges for hybrid retrieval and local semantic hashing
BILINGUAL_CONCEPTS: list[tuple[str, tuple[str, ...]]] = [
    ("concept_revenue", ("revenue", "sales", "turnover", "doanh thu", "doanh so", "ban hang")),
    ("concept_profit", ("profit", "gross profit", "net income", "margin", "loi nhuan", "lai gop", "bien loi nhuan", "bien lai")),
    ("concept_cost", ("cost", "cogs", "expense", "chi phi", "gia von", "ton phi")),
    ("concept_orders", ("orders", "transactions", "invoices", "don hang", "giao dich", "hoa don")),
    ("concept_product", ("product", "sku", "item", "merchandise", "san pham", "mat hang", "ma hang")),
    ("concept_category", ("category", "segment", "line", "nganh hang", "danh muc", "nhom hang")),
    ("concept_customer", ("customer", "client", "buyer", "khach hang", "nguoi mua")),
    ("concept_region", ("region", "location", "branch", "city", "khu vuc", "chi nhanh", "thanh pho", "mien")),
    ("concept_channel", ("channel", "storefront", "marketplace", "kenh", "kenh ban")),
    ("concept_marketing", ("marketing", "roas", "cac", "ad spend", "campaign", "ads", "tiep thi", "quang cao", "chien dich")),
    ("concept_inventory", ("inventory", "stock", "stockout", "warehouse", "lead time", "ton kho", "kho", "dut hang", "het hang", "thieu hang")),
    ("concept_forecast", ("forecast", "predict", "projection", "demand", "du bao", "uoc tinh", "nhu cau")),
    ("concept_anomaly", ("anomaly", "alert", "drop", "spike", "risk", "decline", "bat thuong", "canh bao", "sut giam", "tang dot bien", "rui ro")),
    ("concept_scenario", ("scenario", "what-if", "simulate", "discount", "kich ban", "mo phong", "giam gia", "chiet khau")),
    ("concept_policy", ("policy", "guideline", "sop", "contract", "report", "chinh sach", "quy dinh", "hop dong", "bao cao", "tai lieu")),
]

_CONCEPT_LOOKUP: list[tuple[str, str]] = sorted(
    [(term, tag) for tag, terms in BILINGUAL_CONCEPTS for term in terms],
    key=lambda x: -len(x[0]),
)


@dataclass(frozen=True)
class RagSettings:
    embedding_provider: str
    embedding_model: str
    vector_backend: str
    qdrant_url: str
    qdrant_api_key: str
    qdrant_collection: str
    chunk_size: int
    chunk_overlap: int
    dense_top_k: int
    bm25_top_k: int
    dense_weight: float
    bm25_weight: float
    rerank_top_k: int
    min_relevance_score: float
    use_llm_rerank: bool
    readonly_database_url: str
    sql_max_rows: int
    sql_timeout_sec: int
    short_term_turns: int
    memory_token_budget: int
    rate_limit_per_min: int


def get_rag_settings() -> RagSettings:
    return RagSettings(
        embedding_provider=os.getenv("EMBEDDING_PROVIDER", "auto").strip().lower(),
        embedding_model=os.getenv("EMBEDDING_MODEL", "").strip(),
        vector_backend=os.getenv("VECTOR_DB_BACKEND", "sql").strip().lower(),
        qdrant_url=os.getenv("QDRANT_URL", "").strip().rstrip("/"),
        qdrant_api_key=os.getenv("QDRANT_API_KEY", "").strip(),
        qdrant_collection=os.getenv("QDRANT_COLLECTION", "decisionpilot_rag_chunks").strip(),
        chunk_size=max(200, int(os.getenv("RAG_CHUNK_SIZE", "720"))),
        chunk_overlap=max(20, int(os.getenv("RAG_CHUNK_OVERLAP", "120"))),
        dense_top_k=max(3, int(os.getenv("RAG_DENSE_TOP_K", "12"))),
        bm25_top_k=max(3, int(os.getenv("RAG_BM25_TOP_K", "12"))),
        dense_weight=max(0.0, float(os.getenv("RAG_DENSE_WEIGHT", "0.52"))),
        bm25_weight=max(0.0, float(os.getenv("RAG_BM25_WEIGHT", "0.48"))),
        rerank_top_k=max(1, int(os.getenv("RAG_RERANK_TOP_K", "6"))),
        min_relevance_score=float(os.getenv("RAG_MIN_RELEVANCE_SCORE", "0.14")),
        use_llm_rerank=os.getenv("RAG_USE_LLM_RERANK", "false").lower() == "true",
        readonly_database_url=os.getenv("READONLY_DATABASE_URL", "").strip(),
        sql_max_rows=min(200, max(5, int(os.getenv("SQL_MAX_ROWS", "50")))),
        sql_timeout_sec=min(30, max(1, int(os.getenv("SQL_TIMEOUT_SEC", "8")))),
        short_term_turns=max(2, int(os.getenv("CHAT_SHORT_TERM_TURNS", "8"))),
        memory_token_budget=max(400, int(os.getenv("CHAT_MEMORY_TOKEN_BUDGET", "2600"))),
        rate_limit_per_min=max(5, int(os.getenv("COPILOT_RATE_LIMIT_PER_MIN", "45"))),
    )


def fold_text(text: str) -> str:
    """Normalize text and strip Vietnamese/Latin diacritics cleanly while preserving digits and punctuation boundaries."""
    nfd = unicodedata.normalize("NFD", (text or "").translate(VI_TRANSLATE))
    stripped = "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn")
    return unicodedata.normalize("NFC", stripped).lower()


def extract_concepts(text: str) -> list[str]:
    folded = f" {fold_text(text)} "
    found: list[str] = []
    seen: set[str] = set()
    for term, tag in _CONCEPT_LOOKUP:
        if f" {term} " in folded or (len(term) > 4 and term in folded):
            if tag not in seen:
                seen.add(tag)
                found.append(tag)
    return found


def tokenize(text: str, *, include_stopwords: bool = False, include_concepts: bool = True) -> list[str]:
    """Produce accent-folded lexical tokens plus optional bilingual concept tokens for BM25 and scoring."""
    folded = fold_text(text)
    raw = WORD_RX.findall(folded)
    tokens: list[str] = []
    for tok in raw:
        if len(tok) <= 1 and not tok.isdigit():
            continue
        if not include_stopwords and tok in STOPWORDS:
            continue
        tokens.append(tok)
    if include_concepts:
        tokens.extend(extract_concepts(folded))
    return tokens


def term_frequencies(tokens: list[str]) -> dict[str, int]:
    tf: dict[str, int] = {}
    for tok in tokens:
        tf[tok] = tf.get(tok, 0) + 1
    return tf


def detect_language(text: str) -> str:
    """Detect Vietnamese vs English robustly using Vietnamese diacritics and Vietnamese function words."""
    if not text:
        return "en"
    vi_chars = sum(1 for c in text if "\u0100" <= c <= "\u1EFF" and c not in {"\u00d7", "\u2013"})
    if vi_chars >= 2:
        return "vi"
    folded_words = set(re.findall(r"[a-z]+", fold_text(text)))
    vi_markers = {
        "doanh", "thu", "loi", "nhuan", "san", "pham", "khu", "vuc", "bao", "nhieu",
        "tai", "sao", "du", "bao", "thang", "tuan", "nam", "kenh", "khach", "hang",
        "tang", "giam", "cao", "nhat", "thap", "phan", "tich", "ton", "kho", "chi",
        "phi", "giup", "toi", "cho", "biet", "nao", "the", "voi", "cua", "ve",
    }
    hits = len(folded_words & vi_markers)
    return "vi" if hits >= 2 else "en"


def approx_token_count(text: str) -> int:
    return max(1, int(round(len((text or "").split()) * 1.35)))

