"""Pluggable Embedding Provider abstraction: OpenAI, Gemini, HuggingFace SentenceTransformers & Local Multilingual Dense Hash."""
from __future__ import annotations

from abc import ABC, abstractmethod
import hashlib
import logging
import os
import struct
from typing import Iterable

import httpx
import numpy as np

from backend.app.rag.config import extract_concepts, fold_text, get_rag_settings, tokenize

log = logging.getLogger(__name__)


class EmbeddingProvider(ABC):
    provider_name: str
    model_name: str
    dimension: int

    @abstractmethod
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        ...

    def embed_query(self, query: str) -> list[float]:
        vecs = self.embed_texts([query])
        return vecs[0] if vecs else [0.0] * self.dimension


class LocalMultilingualDenseEmbedder(EmbeddingProvider):
    """
    Deterministic, incremental-safe 256-dim L2-normalized dense embedder using signed random projection
    over diacritic-folded word unigrams, word bigrams, char 3-5-grams, and bilingual EN/VI concept tags.
    Guarantees consistent vector space across incremental uploads without corpus refitting or API keys.
    """

    def __init__(self, dimension: int = 256) -> None:
        self.provider_name = "local_multilingual_dense"
        self.model_name = "signed-multilingual-hash-256"
        self.dimension = dimension

    @staticmethod
    def _feature_idx_sign(feature: str, dim: int) -> tuple[int, float]:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        val, sign_byte = struct.unpack("<QH" if False else "<IB", digest[:5])
        idx = val % dim
        sign = 1.0 if (sign_byte & 1) == 0 else -1.0
        return idx, sign

    def _embed_one(self, text: str) -> list[float]:
        vec = np.zeros(self.dimension, dtype=np.float32)
        toks = tokenize(text, include_stopwords=False, include_concepts=False)
        if not toks and text:
            toks = fold_text(text).split()

        # 1. Word unigrams (strong signal)
        for tok in toks:
            idx, sign = self._feature_idx_sign(f"w:{tok}", self.dimension)
            vec[idx] += sign * 2.2
            # Character 3-5 grams help handle inflections, typos, and partial SKUs
            if len(tok) >= 4:
                padded = f"<{tok}>"
                for n in (3, 4):
                    for pos in range(0, len(padded) - n + 1):
                        g_idx, g_sign = self._feature_idx_sign(f"c:{padded[pos:pos+n]}", self.dimension)
                        vec[g_idx] += g_sign * 0.45

        # 2. Word bigrams (phrase specificity)
        for a, b in zip(toks, toks[1:]):
            idx, sign = self._feature_idx_sign(f"b:{a}_{b}", self.dimension)
            vec[idx] += sign * 1.4

        # 3. Cross-lingual EN <-> VI domain concept tags (bridges Vietnamese queries to English docs and vice versa)
        for tag in extract_concepts(text):
            idx, sign = self._feature_idx_sign(f"x:{tag}", self.dimension)
            vec[idx] += sign * 2.6

        norm = float(np.linalg.norm(vec))
        if norm > 1e-8:
            vec = vec / norm
        return [round(float(x), 6) for x in vec.tolist()]

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t or "") for t in texts]


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self, api_key: str, model: str | None = None) -> None:
        self.api_key = api_key
        self.model_name = model or os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        self.provider_name = "openai"
        self.dimension = 1536 if "small" in self.model_name else 3072

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        clean = [t[:8000] if t else " " for t in texts]
        res = httpx.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": self.model_name, "input": clean},
            timeout=20.0,
        )
        res.raise_for_status()
        data = sorted(res.json()["data"], key=lambda item: item["index"])
        vecs = [item["embedding"] for item in data]
        if vecs:
            self.dimension = len(vecs[0])
        return vecs


class GeminiEmbeddingProvider(EmbeddingProvider):
    def __init__(self, api_key: str, model: str | None = None) -> None:
        self.api_key = api_key
        self.model_name = model or os.getenv("GEMINI_EMBEDDING_MODEL", "text-embedding-004")
        self.provider_name = "gemini"
        self.dimension = 768

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        requests_payload = [
            {
                "model": f"models/{self.model_name}",
                "content": {"parts": [{"text": (t or " ")[:8000]}]},
            }
            for t in texts
        ]
        res = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:batchEmbedContents",
            headers={"x-goog-api-key": self.api_key},
            json={"requests": requests_payload},
            timeout=20.0,
        )
        res.raise_for_status()
        vecs = [e["values"] for e in res.json().get("embeddings", [])]
        if vecs:
            self.dimension = len(vecs[0])
        return vecs


class HuggingFaceEmbeddingProvider(EmbeddingProvider):
    _cached_models: dict[str, object] = {}

    def __init__(self, model_name: str | None = None) -> None:
        from sentence_transformers import SentenceTransformer  # type: ignore

        self.model_name = model_name or os.getenv("HF_EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
        self.provider_name = "huggingface"
        if self.model_name not in self._cached_models:
            self._cached_models[self.model_name] = SentenceTransformer(self.model_name)
        self._model = self._cached_models[self.model_name]
        self.dimension = int(self._model.get_sentence_embedding_dimension())

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        arr = self._model.encode([t or " " for t in texts], normalize_embeddings=True)
        return arr.tolist()


class ResilientEmbeddingProvider(EmbeddingProvider):
    """Wraps primary cloud/HF provider with safe fallback to LocalMultilingualDenseEmbedder on offline/network error."""

    def __init__(self, primary: EmbeddingProvider, fallback: EmbeddingProvider) -> None:
        self.primary = primary
        self.fallback = fallback
        self.provider_name = primary.provider_name
        self.model_name = primary.model_name
        self.dimension = primary.dimension

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        try:
            vecs = self.primary.embed_texts(texts)
            if vecs:
                self.dimension = len(vecs[0])
            return vecs
        except Exception as exc:
            log.warning("Embedding provider '%s' unavailable (%s); falling back to local multilingual embeddings.", self.primary.provider_name, type(exc).__name__)
            self.provider_name = self.fallback.provider_name
            self.model_name = self.fallback.model_name
            self.dimension = self.fallback.dimension
            return self.fallback.embed_texts(texts)


_LOCAL_EMBEDDER = LocalMultilingualDenseEmbedder()


def get_embedding_provider(provider_override: str | None = None) -> EmbeddingProvider:
    settings = get_rag_settings()
    choice = (provider_override or settings.embedding_provider or "auto").lower()
    llm_provider = os.getenv("LLM_PROVIDER", "none").strip().lower()
    oai_key = os.getenv("OPENAI_API_KEY", "").strip()
    gem_key = os.getenv("GEMINI_API_KEY", "").strip()

    if choice == "local" or (choice == "auto" and llm_provider == "none" and not oai_key and not gem_key):
        return _LOCAL_EMBEDDER

    if choice == "openai" or (choice == "auto" and llm_provider == "openai" and oai_key):
        if oai_key:
            return ResilientEmbeddingProvider(OpenAIEmbeddingProvider(oai_key, settings.embedding_model or None), _LOCAL_EMBEDDER)

    if choice == "gemini" or (choice == "auto" and llm_provider == "gemini" and gem_key):
        if gem_key:
            return ResilientEmbeddingProvider(GeminiEmbeddingProvider(gem_key, settings.embedding_model or None), _LOCAL_EMBEDDER)

    if choice == "huggingface":
        try:
            return HuggingFaceEmbeddingProvider(settings.embedding_model or None)
        except Exception as exc:
            log.warning("HuggingFace SentenceTransformers unavailable (%s); falling back to local.", exc)

    if choice == "auto":
        if oai_key and llm_provider != "none":
            return ResilientEmbeddingProvider(OpenAIEmbeddingProvider(oai_key, settings.embedding_model or None), _LOCAL_EMBEDDER)
        if gem_key and llm_provider != "none":
            return ResilientEmbeddingProvider(GeminiEmbeddingProvider(gem_key, settings.embedding_model or None), _LOCAL_EMBEDDER)

    return _LOCAL_EMBEDDER


def cosine_similarities(query_vec: list[float], doc_vecs: Iterable[list[float]]) -> list[float]:
    q = np.asarray(query_vec, dtype=np.float32)
    q_norm = float(np.linalg.norm(q))
    if q_norm < 1e-8:
        return [0.0 for _ in doc_vecs]
    q = q / q_norm
    scores: list[float] = []
    for dv in doc_vecs:
        if not dv or len(dv) != len(query_vec):
            scores.append(0.0)
            continue
        v = np.asarray(dv, dtype=np.float32)
        v_norm = float(np.linalg.norm(v))
        scores.append(float(np.dot(q, v / v_norm)) if v_norm > 1e-8 else 0.0)
    return scores

