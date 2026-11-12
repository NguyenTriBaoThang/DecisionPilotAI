"""Lightweight thread-safe request memoization and recommendation payload cache."""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
from threading import Lock
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_MEMO: ContextVar[dict[Any, Any] | None] = ContextVar("dp_req_memo", default=None)

_RECS_LOCK = Lock()
_RECS_CACHE: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
_RECS_MAX_ENTRIES = 16


@contextmanager
def memo_scope():
    """Scope an ephemeral per-operation memo dict to the current call stack without leaking across requests or tests."""
    if _MEMO.get() is not None:
        yield
        return
    store: dict[Any, Any] = {}
    token = _MEMO.set(store)
    try:
        yield
    finally:
        _MEMO.reset(token)


def current_memo() -> dict[Any, Any] | None:
    return _MEMO.get()


def memo_call(key: Any, compute: Callable[[], T]) -> T:
    store = _MEMO.get()
    if store is None:
        return compute()
    if key in store:
        return store[key]
    val = compute()
    store[key] = val
    return val


def get_cached_recs(key: tuple[Any, ...]) -> list[dict[str, Any]] | None:
    with _RECS_LOCK:
        cached = _RECS_CACHE.get(key)
        return deepcopy(cached) if cached is not None else None


def set_cached_recs(key: tuple[Any, ...], rows: list[dict[str, Any]]) -> None:
    with _RECS_LOCK:
        if len(_RECS_CACHE) >= _RECS_MAX_ENTRIES and key not in _RECS_CACHE:
            oldest = next(iter(_RECS_CACHE))
            _RECS_CACHE.pop(oldest, None)
        _RECS_CACHE[key] = deepcopy(rows)


def invalidate_recs_cache(company_id: str | None = None) -> None:
    with _RECS_LOCK:
        if company_id is None:
            _RECS_CACHE.clear()
            return
        for k in [k for k in _RECS_CACHE if len(k) > 2 and k[2] == company_id]:
            _RECS_CACHE.pop(k, None)

