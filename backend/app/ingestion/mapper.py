"""AI-assisted semantic column detection, value profiling, custom fields, and mapping templates."""
from __future__ import annotations

from datetime import datetime
from difflib import SequenceMatcher
import hashlib
import json
import os
import re
from typing import Any
import unicodedata

import httpx


CANONICAL_FIELDS: dict[str, dict[str, Any]] = {
    "date": {
        "label": "Date",
        "description": "Transaction, order, invoice, or business calendar date",
        "required": True,
        "kind": "date",
    },
    "product": {
        "label": "Product",
        "description": "Product name, SKU code, or service item",
        "required": False,
        "kind": "dimension",
    },
    "category": {
        "label": "Category",
        "description": "Product category or business line",
        "required": False,
        "kind": "dimension",
    },
    "quantity": {
        "label": "Quantity",
        "description": "Units sold or order item quantity",
        "required": False,
        "kind": "numeric",
    },
    "revenue": {
        "label": "Revenue",
        "description": "Gross or net sales revenue / total order amount",
        "required": True,
        "kind": "currency",
    },
    "cost": {
        "label": "Cost",
        "description": "Direct COGS / total cost (or unit cost if clearly labeled)",
        "required": False,
        "kind": "currency",
    },
    "profit": {
        "label": "Profit",
        "description": "Gross profit / net contribution margin amount",
        "required": False,
        "kind": "currency",
    },
    "customer": {
        "label": "Customer",
        "description": "Customer ID, company client, or buyer identifier",
        "required": False,
        "kind": "dimension",
    },
    "region": {
        "label": "Region",
        "description": "City, province, country, or geographic market",
        "required": False,
        "kind": "dimension",
    },
    "channel": {
        "label": "Channel",
        "description": "Sales channel (Online, Retail, B2B, POS, Marketplace)",
        "required": False,
        "kind": "dimension",
    },
    "marketing_spend": {
        "label": "Marketing Spend",
        "description": "Advertising / campaign budget spent",
        "required": False,
        "kind": "currency",
    },
    "inventory": {
        "label": "Inventory",
        "description": "Stock on hand, closing stock, or available units",
        "required": False,
        "kind": "numeric",
    },
}

IGNORE_FIELD = "__ignore__"
CUSTOM_PREFIX = "custom:"

FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "date": (
        "date", "order_date", "transaction_date", "sale_date", "sales_date", "invoice_date",
        "business_date", "created_at", "timestamp", "day", "ngay", "ngay_ban", "ngay_don_hang",
        "ngay_giao_dich", "thoi_gian", "periode", "period",
    ),
    "product": (
        "product", "product_name", "product_id", "sku", "item", "item_name", "item_code",
        "san_pham", "ten_san_pham", "ma_sp", "ma_sku", "hang_hoa", "service",
    ),
    "category": (
        "category", "product_category", "category_name", "dept", "department", "line",
        "danh_muc", "nganh_hang", "nhom_hang", "loai_san_pham", "segment",
    ),
    "quantity": (
        "quantity", "qty", "units", "units_sold", "sold_qty", "volume", "item_qty",
        "so_luong", "san_luong", "so_luong_ban", "sl",
    ),
    "revenue": (
        "revenue", "sales", "total_sales", "gross_sales", "net_sales", "amount", "total",
        "total_amount", "order_value", "gmv", "turnover", "doanh_thu", "thanh_tien", "tong_tien",
        "gia_tri", "net_revenue",
    ),
    "cost": (
        "cost", "total_cost", "cogs", "direct_cost", "unit_cost", "cost_of_goods", "expense",
        "gia_von", "chi_phi_von", "tong_gia_von", "tien_von",
    ),
    "profit": (
        "profit", "gross_profit", "net_profit", "margin_amount", "contribution", "earnings",
        "loi_nhuan", "loi_nhuan_gop", "lai_gop",
    ),
    "customer": (
        "customer", "customer_id", "customer_name", "client", "client_id", "buyer", "account",
        "khach_hang", "ma_kh", "ten_khach_hang", "nguoi_mua",
    ),
    "region": (
        "region", "city", "province", "state", "country", "area", "territory", "location",
        "khu_vuc", "tinh_thanh", "thanh_pho", "dia_ban", "vung",
    ),
    "channel": (
        "channel", "sales_channel", "order_channel", "platform", "store_type", "distribution",
        "kenh_ban", "kenh", "kenh_ban_hang", "nguon_don",
    ),
    "marketing_spend": (
        "marketing_spend", "ad_spend", "adspend", "ad_budget", "marketing_budget", "advertising_budget",
        "advertising_spend", "media_spend", "promo_spend", "spend", "campaign_spend", "ads_cost",
        "marketing_cost", "budget_spent", "chi_phi_marketing", "chi_phi_qc", "chi_phi_quang_cao",
        "ngan_sach_qc",
    ),
    "inventory": (
        "inventory", "stock", "current_stock", "closing_stock", "stock_on_hand", "on_hand",
        "available_stock", "qty_in_stock", "ton_kho", "so_luong_ton", "ton_cuoi_ky",
    ),
}

DATE_SAMPLE_RX = re.compile(
    r"^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}-\d{2}-\d{2}[tT ].+)$"
)
CURRENCY_SAMPLE_RX = re.compile(r"^[+-]?\s*(?:[$€£¥₫]|vnd|usd|eur)?\s*\(?[\d.,\s]+[km]?\)?\s*(?:[$€£¥₫]|vnd|usd|eur|đ)?$", re.I)


def _fold(text: str) -> str:
    stripped = "".join(
        ch for ch in unicodedata.normalize("NFD", text.lower().replace("đ", "d")) if unicodedata.category(ch) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", "_", stripped).strip("_")


def compute_source_signature(columns: list[str]) -> str:
    canonical = sorted(_fold(col) for col in columns if col)
    return hashlib.sha256("|".join(canonical).encode("utf-8")).hexdigest()[:24]


def _profile_column_values(values: list[Any]) -> dict[str, Any]:
    non_empty = [v for v in values if v is not None and str(v).strip() != ""]
    total = len(values)
    sample = non_empty[:150]
    date_hits = 0
    currency_symbol_hits = 0
    numeric_hits = 0
    int_hits = 0
    nums: list[float] = []
    for raw in sample:
        s = str(raw).strip()
        if DATE_SAMPLE_RX.match(s):
            date_hits += 1
            continue
        if any(sym in s.lower() for sym in ("$", "₫", "€", "vnd", "usd", "đ")):
            currency_symbol_hits += 1
        cleaned = re.sub(r"[$€£¥₫,\s]", "", s, flags=re.I)
        cleaned = re.sub(r"(?:vnd|usd|eur|đ)$", "", cleaned, flags=re.I).strip()
        if cleaned.startswith("(") and cleaned.endswith(")"):
            cleaned = "-" + cleaned[1:-1]
        try:
            num = float(cleaned)
            if abs(num) < 1e15:
                numeric_hits += 1
                nums.append(num)
                if num.is_integer() and 0 <= num <= 1_000_000:
                    int_hits += 1
        except ValueError:
            pass
    n = max(1, len(sample))
    unique_ratio = len({str(v).strip().lower() for v in sample}) / n
    max_val = max(nums) if nums else 0.0
    inferred_type = "text"
    if date_hits / n >= 0.6:
        inferred_type = "date"
    elif numeric_hits / n >= 0.65:
        if currency_symbol_hits / n >= 0.2 or max_val >= 500:
            inferred_type = "currency"
        elif int_hits / n >= 0.85:
            inferred_type = "integer"
        else:
            inferred_type = "numeric"
    return {
        "inferred_type": inferred_type,
        "non_empty_count": len(non_empty),
        "empty_count": total - len(non_empty),
        "unique_sample_count": len({str(v).strip() for v in non_empty}),
        "date_ratio": round(date_hits / n, 3),
        "numeric_ratio": round(numeric_hits / n, 3),
        "currency_symbol_ratio": round(currency_symbol_hits / n, 3),
        "integer_ratio": round(int_hits / n, 3),
        "unique_ratio": round(unique_ratio, 3),
        "samples": [str(v) for v in non_empty[:4]],
    }


def _score_header_vs_field(header_fold: str, profile: dict[str, Any], target: str) -> tuple[float, str]:
    aliases = FIELD_ALIASES[target]
    tokens = set(header_fold.split("_")) if header_fold else set()
    best_name_score = 0.0
    matched_alias = ""
    for alias in aliases:
        if header_fold == alias:
            best_name_score = 1.0
            matched_alias = alias
            break
        if (len(alias) >= 4 and alias in header_fold) or (len(header_fold) >= 4 and header_fold in alias) or alias in tokens:
            score = 0.84
        else:
            alias_tokens = set(alias.split("_"))
            overlap = len(tokens & alias_tokens) / max(1, len(alias_tokens))
            sim = SequenceMatcher(None, header_fold, alias).ratio()
            score = max(sim * 0.82, overlap * 0.78)
        if score > best_name_score:
            best_name_score = score
            matched_alias = alias

    # Boost or penalize using observed value profile
    kind = CANONICAL_FIELDS[target]["kind"]
    profile_adj = 0.0
    reason_parts = []
    if best_name_score >= 0.72:
        reason_parts.append(f"Header matches '{matched_alias}'")
    if kind == "date":
        if profile["date_ratio"] >= 0.65:
            profile_adj += 0.22
            reason_parts.append("values match date patterns")
        elif profile["numeric_ratio"] >= 0.8 and profile["date_ratio"] == 0:
            profile_adj -= 0.35
    elif kind == "currency":
        if profile["numeric_ratio"] >= 0.65:
            profile_adj += 0.14
            if profile["currency_symbol_ratio"] > 0:
                profile_adj += 0.08
                reason_parts.append("currency formatting detected")
            else:
                reason_parts.append("numeric financial profile")
        elif profile["numeric_ratio"] < 0.25 and profile["non_empty_count"] > 0:
            profile_adj -= 0.40
    elif kind == "numeric":
        if profile["numeric_ratio"] >= 0.65:
            profile_adj += 0.14
            reason_parts.append("integer/numeric count profile" if profile["integer_ratio"] > 0.7 else "numeric profile")
        elif profile["numeric_ratio"] < 0.25 and profile["non_empty_count"] > 0:
            profile_adj -= 0.40
    elif kind == "dimension":
        if profile["date_ratio"] >= 0.75:
            profile_adj -= 0.35
        elif profile["numeric_ratio"] >= 0.9 and target not in {"product", "customer"}:
            profile_adj -= 0.20

    total_score = max(0.0, min(0.99, best_name_score * 0.82 + profile_adj))
    reason = "; ".join(reason_parts) if reason_parts else "Heuristic name & distribution match"
    return round(total_score, 3), reason


def _optional_llm_refine(columns: list[str], profiles: dict[str, dict[str, Any]]) -> dict[str, str]:
    provider = os.getenv("LLM_PROVIDER", "none").lower()
    if provider not in {"openai", "gemini"}:
        return {}
    prompt = (
        "Map each source column header to one canonical business field in "
        + json.dumps(list(CANONICAL_FIELDS.keys()) + [IGNORE_FIELD])
        + ". Return JSON object {\"mappings\": {\"<source>\": \"<target>\"}}. "
        + "Do not invent fields outside the list. Columns and samples: "
        + json.dumps({c: profiles[c]["samples"] for c in columns})
    )
    try:
        if provider == "openai" and os.getenv("OPENAI_API_KEY"):
            resp = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
                json={
                    "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "system", "content": prompt}],
                },
                timeout=3.5,
            )
            resp.raise_for_status()
            parsed = json.loads(resp.json()["choices"][0]["message"]["content"])
            raw_map = parsed.get("mappings", {})
        elif provider == "gemini" and os.getenv("GEMINI_API_KEY"):
            model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            resp = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
                timeout=3.5,
            )
            resp.raise_for_status()
            parsed = json.loads(resp.json()["candidates"][0]["content"]["parts"][0]["text"])
            raw_map = parsed.get("mappings", {})
        else:
            return {}
        return {str(k): str(v) for k, v in raw_map.items() if str(v) in CANONICAL_FIELDS}
    except Exception:
        return {}


def compute_capabilities(mapped_targets: set[str]) -> dict[str, bool]:
    has_date = "date" in mapped_targets
    has_revenue = "revenue" in mapped_targets
    has_cost = "cost" in mapped_targets
    has_profit = "profit" in mapped_targets
    return {
        "has_date": has_date,
        "has_revenue": has_revenue,
        "has_product": "product" in mapped_targets,
        "has_category": "category" in mapped_targets,
        "has_quantity": "quantity" in mapped_targets,
        "has_cost_or_profit": has_cost or has_profit,
        "has_customer": "customer" in mapped_targets,
        "has_region": "region" in mapped_targets,
        "has_channel": "channel" in mapped_targets,
        "has_marketing": "marketing_spend" in mapped_targets,
        "has_inventory": "inventory" in mapped_targets,
        "supports_dashboard": has_date and has_revenue,
        "supports_ask": has_date and has_revenue,
        "supports_anomalies": has_date and has_revenue,
        "supports_forecast": has_date and (has_revenue or "quantity" in mapped_targets),
        "supports_price_scenario": has_date and has_revenue and "product" in mapped_targets,
        "supports_marketing_scenario": has_date and "marketing_spend" in mapped_targets,
        "supports_inventory_scenario": has_date and "inventory" in mapped_targets and "product" in mapped_targets,
    }


def suggest_column_mapping(
    columns: list[str],
    rows: list[dict[str, Any]],
    *,
    templates: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Profile parsed dataset columns and propose canonical mappings + template matches."""
    profiles = {col: _profile_column_values([r.get(col) for r in rows[:200]]) for col in columns}
    signature = compute_source_signature(columns)

    # Check tenant mapping templates for exact or high-overlap reuse
    matched_templates: list[dict[str, Any]] = []
    folded_cols = {_fold(c): c for c in columns}
    col_set = set(columns)
    for tpl in templates or []:
        tpl_map: dict[str, str] = tpl.get("mappings_json") or {}
        if not tpl_map:
            continue
        exact_sig = tpl.get("source_signature") == signature
        overlap_cols = [c for c in tpl_map if c in col_set]
        overlap_ratio = len(overlap_cols) / max(1, len(col_set | set(tpl_map.keys())))
        if exact_sig or overlap_ratio >= 0.5:
            matched_templates.append(
                {
                    "id": tpl["id"],
                    "name": tpl["name"],
                    "exact_match": exact_sig,
                    "overlap_ratio": round(overlap_ratio, 2),
                    "mappings": tpl_map,
                    "custom_fields": tpl.get("custom_fields_json") or [],
                }
            )
    matched_templates.sort(key=lambda item: (-int(item["exact_match"]), -item["overlap_ratio"]))

    # Best-fit greedy assignment across candidate pairs (header x canonical target)
    candidates: list[tuple[float, str, str, str]] = []
    llm_hints = _optional_llm_refine(columns, profiles)
    per_column_alts: dict[str, list[dict[str, Any]]] = {c: [] for c in columns}
    for col in columns:
        col_fold = _fold(col)
        for target in CANONICAL_FIELDS:
            score, reason = _score_header_vs_field(col_fold, profiles[col], target)
            if llm_hints.get(col) == target and score >= 0.35:
                score = min(0.98, round(score + 0.14, 3))
                reason = f"AI hint + {reason}"
            if score >= 0.35:
                candidates.append((score, col, target, reason))
            per_column_alts[col].append({"target": target, "confidence": score})
        per_column_alts[col].sort(key=lambda x: -x["confidence"])

    candidates.sort(key=lambda item: -item[0])
    assigned_cols: dict[str, tuple[str, float, str]] = {}
    used_targets: set[str] = set()

    # Apply top exact template suggestions first when available
    if matched_templates and matched_templates[0]["exact_match"]:
        tpl_best = matched_templates[0]
        for col in columns:
            tgt = tpl_best["mappings"].get(col)
            if tgt and (tgt in CANONICAL_FIELDS or tgt == IGNORE_FIELD or str(tgt).startswith(CUSTOM_PREFIX)):
                assigned_cols[col] = (tgt, 0.99, f"Matched saved company template '{tpl_best['name']}'")
                if tgt in CANONICAL_FIELDS:
                    used_targets.add(tgt)

    for score, col, target, reason in candidates:
        if col in assigned_cols or target in used_targets:
            continue
        if score < 0.45:
            continue
        assigned_cols[col] = (target, score, reason)
        used_targets.add(target)

    suggestions: list[dict[str, Any]] = []
    suggested_map: dict[str, str] = {}
    for col in columns:
        prof = profiles[col]
        if col in assigned_cols:
            target, conf, reason = assigned_cols[col]
        else:
            target = IGNORE_FIELD
            conf = 0.0
            reason = "No high-confidence canonical match; map manually, mark custom field, or ignore"
        suggested_map[col] = target
        suggestions.append(
            {
                "source_column": col,
                "target_field": target,
                "confidence": conf,
                "reason": reason,
                "inferred_type": prof["inferred_type"],
                "non_empty_count": prof["non_empty_count"],
                "empty_count": prof["empty_count"],
                "unique_sample_count": prof["unique_sample_count"],
                "sample_values": prof["samples"],
                "top_alternatives": per_column_alts[col][:3],
            }
        )

    mapped_canon = {t for t in suggested_map.values() if t in CANONICAL_FIELDS}
    return {
        "source_signature": signature,
        "canonical_fields": CANONICAL_FIELDS,
        "suggested_mapping": suggested_map,
        "suggestions": suggestions,
        "matched_templates": matched_templates,
        "capabilities_preview": compute_capabilities(mapped_canon),
        "folded_headers": list(folded_cols.keys()),
    }
