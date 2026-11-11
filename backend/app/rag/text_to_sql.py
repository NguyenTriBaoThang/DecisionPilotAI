"""Safe, Tenant-Isolated, Read-Only Text-to-SQL Engine with AST/Token Validator, Scoped CTE Sandboxing & Dialect Generation."""
from __future__ import annotations

from datetime import date
import logging
import os
import re
import time
from typing import Any

import httpx
import sqlalchemy as sa

from backend.app.analytics import dataset_info, options
from backend.app.db import audit, make_engine, read_connection
from backend.app.rag.config import fold_text, get_rag_settings

log = logging.getLogger(__name__)

# Allowed schemas strictly scoped by dataset storage mode (admin/secrets/rag tables excluded)
PARTITIONED_TABLES: dict[str, dict[str, Any]] = {
    "tenant_transactions": {
        "has_dataset_id": True,
        "columns": [
            "transaction_id", "date", "product_id", "product_name", "category",
            "customer_id", "customer_segment", "region", "sales_channel",
            "quantity", "unit_price", "discount_pct", "revenue", "unit_cost",
            "total_cost", "gross_profit", "marketing_channel", "marketing_spend", "inventory_level",
        ],
    },
    "tenant_products": {
        "has_dataset_id": True,
        "columns": [
            "product_id", "product_name", "category", "brand", "list_price",
            "unit_cost", "supplier", "is_physical", "lead_time_days",
            "reorder_point", "current_stock", "elasticity",
        ],
    },
    "tenant_customers": {
        "has_dataset_id": True,
        "columns": [
            "customer_id", "customer_name", "segment", "region",
            "first_seen_date", "last_seen_date", "total_orders", "lifetime_value",
        ],
    },
    "tenant_orders": {
        "has_dataset_id": True,
        "columns": [
            "order_id", "order_date", "customer_id", "region", "sales_channel",
            "total_revenue", "total_cost", "gross_profit", "item_count", "validation_status",
        ],
    },
    "tenant_marketing_daily": {
        "has_dataset_id": True,
        "columns": ["date", "channel", "spend", "attributed_revenue", "orders", "leads", "clicks", "impressions"],
    },
    "tenant_inventory_daily": {
        "has_dataset_id": True,
        "columns": ["date", "product_id", "opening_stock", "received_qty", "sold_qty", "closing_stock", "stockout_flag"],
    },
    "tenant_multimodal_insights": {
        "has_dataset_id": True,
        "columns": ["id", "modality", "entity_type", "insight_date", "title", "summary_text", "confidence_score", "validation_status"],
    },
}

LEGACY_TABLES: dict[str, dict[str, Any]] = {
    "sales_transactions": {
        "has_company_id": False,
        "has_dataset_id": False,
        "columns": [
            "transaction_id", "date", "customer_id", "product_id", "quantity",
            "unit_price", "discount_pct", "revenue", "unit_cost", "total_cost",
            "gross_profit", "region", "sales_channel", "campaign_id",
        ],
    },
    "products": {
        "has_company_id": False,
        "has_dataset_id": False,
        "columns": [
            "product_id", "product_name", "category", "brand", "list_price",
            "unit_cost", "supplier", "is_physical", "lead_time_days",
            "reorder_point", "current_stock", "elasticity",
        ],
    },
    "customers": {
        "has_company_id": False,
        "has_dataset_id": False,
        "columns": [
            "customer_id", "customer_segment", "region", "signup_date",
            "acquisition_channel", "is_returning", "lifetime_value", "last_purchase_date",
        ],
    },
    "marketing_campaigns": {
        "has_company_id": False,
        "has_dataset_id": False,
        "columns": ["campaign_id", "date", "channel", "campaign_name", "spend", "impressions", "clicks", "leads", "orders", "attributed_revenue"],
    },
    "inventory_daily": {
        "has_company_id": False,
        "has_dataset_id": False,
        "columns": ["date", "product_id", "opening_stock", "received_qty", "sold_qty", "closing_stock", "stockout_flag"],
    },
    "calendar_events": {
        "has_company_id": False,
        "has_dataset_id": False,
        "columns": ["date", "day_of_week", "month", "quarter", "is_weekend", "is_holiday", "event_name", "promotion_flag"],
    },
    "tenant_multimodal_insights": {
        "has_company_id": True,
        "has_dataset_id": True,
        "columns": ["id", "modality", "entity_type", "insight_date", "title", "summary_text", "confidence_score", "validation_status"],
    },
}

FORBIDDEN_SQL_KEYWORDS = {
    "insert", "update", "delete", "drop", "alter", "create", "replace", "merge",
    "upsert", "truncate", "grant", "revoke", "exec", "execute", "call", "pragma",
    "attach", "detach", "vacuum", "copy", "load", "outfile", "dumpfile", "into",
    "begin", "commit", "rollback", "savepoint", "lock", "unlock", "set", "show",
    "use", "explain", "analyze", "reindex", "cluster",
}

FORBIDDEN_SYSTEM_IDENTIFIERS = {
    "sqlite_master", "sqlite_schema", "sqlite_temp_master", "sqlite_temp_schema",
    "information_schema", "pg_catalog", "pg_shadow", "pg_user", "pg_roles",
    "pg_stat_activity", "data_sources", "audit_events", "companies",
    "rag_chunks", "rag_documents", "chat_conversations", "chat_messages", "company_memories",
}

_STRING_LITERAL_RX = re.compile(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"")
_TABLE_REF_RX = re.compile(r"\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b", re.I)
_CTE_DEF_RX = re.compile(r"(?:with|,)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*\(", re.I)


class UnsafeSQLError(ValueError):
    """Raised when a generated or submitted SQL query violates read-only or tenant isolation rules."""


def _strip_literals(sql: str) -> str:
    return _STRING_LITERAL_RX.sub(" '' ", sql)


def _extract_ctes(unquoted: str) -> set[str]:
    return {m.group(1).lower() for m in _CTE_DEF_RX.finditer(unquoted)}


def validate_and_scope_sql(
    raw_sql: str,
    *,
    info: dict[str, Any],
    company_id: str,
    max_rows: int = 50,
) -> tuple[str, dict[str, Any], list[str]]:
    """
    Strictly validate single-statement read-only SELECT SQL, enforce allowlisted tables,
    wrap tenant tables in parameterized company/dataset CTE sandboxes, and cap output rows.
    """
    cleaned = (raw_sql or "").strip()
    if cleaned.endswith(";"):
        cleaned = cleaned[:-1].strip()
    if not cleaned:
        raise UnsafeSQLError("Generated SQL query is empty.")

    unquoted = _strip_literals(cleaned)

    # 1. Block comments & stacked statements
    if "--" in unquoted or "/*" in unquoted or "*/" in unquoted:
        raise UnsafeSQLError("SQL comments (-- or /* */) are forbidden for security.")
    if ";" in unquoted:
        raise UnsafeSQLError("Multiple SQL statements are forbidden; only a single SELECT query is allowed.")

    # 2. Must begin strictly with SELECT or non-recursive WITH
    tokens = re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", unquoted)
    if not tokens:
        raise UnsafeSQLError("SQL query contains no valid tokens.")
    first = tokens[0].lower()
    if first not in {"select", "with"}:
        raise UnsafeSQLError(f"Only read-only SELECT queries are allowed (got '{tokens[0]}').")

    lower_tokens = {t.lower() for t in tokens}
    if "recursive" in lower_tokens and first == "with":
        raise UnsafeSQLError("WITH RECURSIVE queries are disabled by safety policy.")

    # 3. Forbid all DDL/DML/admin statements & system catalogs
    bad_kw = sorted(lower_tokens & FORBIDDEN_SQL_KEYWORDS)
    if bad_kw:
        raise UnsafeSQLError(f"Forbidden SQL keyword(s) detected: {', '.join(bad_kw)}.")

    bad_sys = sorted(lower_tokens & FORBIDDEN_SYSTEM_IDENTIFIERS)
    if bad_sys:
        raise UnsafeSQLError(f"Access to internal/system table(s) forbidden: {', '.join(bad_sys)}.")

    # 4. Validate every referenced FROM / JOIN target against workspace table allowlist
    storage_mode = info.get("storage_mode") or "partitioned"
    if storage_mode == "legacy_snapshot" and company_id != "comp-default":
        raise UnsafeSQLError("Legacy snapshot workspace is strictly scoped to comp-default.")

    allowlist = PARTITIONED_TABLES if storage_mode == "partitioned" else LEGACY_TABLES
    user_ctes = _extract_ctes(unquoted)
    referenced_tables: list[str] = []
    for match in _TABLE_REF_RX.finditer(unquoted):
        tbl = match.group(1).lower()
        if tbl in user_ctes:
            continue
        if tbl not in allowlist:
            raise UnsafeSQLError(f"Table '{tbl}' is outside the authorized read-only analytics allowlist.")
        if tbl not in referenced_tables:
            referenced_tables.append(tbl)

    if not referenced_tables:
        raise UnsafeSQLError("Query must reference at least one authorized business analytics table.")

    # 5. Sandbox tenant-partitioned tables using non-shadowing parameterized CTE wrappers
    bind_params: dict[str, Any] = {
        "_tenant_cid": company_id,
        "_tenant_did": info["dataset_id"],
        "_sql_limit": int(max_rows),
    }

    scoped_ctes: list[str] = []
    rewritten_sql = cleaned
    for tbl in referenced_tables:
        spec = allowlist[tbl]
        needs_cid = spec.get("has_company_id", True) if storage_mode != "partitioned" else True
        needs_did = spec.get("has_dataset_id", True)
        if not needs_cid and not needs_did:
            continue
        alias_cte = f"__scoped_{tbl}"
        where_parts = []
        if needs_cid:
            where_parts.append("company_id = :_tenant_cid")
        if needs_did:
            where_parts.append("dataset_id = :_tenant_did")
        cols_sql = ", ".join(spec["columns"])
        scoped_ctes.append(f"{alias_cte} AS (SELECT {cols_sql} FROM {tbl} WHERE {' AND '.join(where_parts)})")
        # Rewrite unquoted occurrences of the table identifier to point to its tenant-scoped CTE
        rewritten_sql = _replace_unquoted_identifier(rewritten_sql, tbl, alias_cte)

    if scoped_ctes:
        if first == "with":
            rewritten_sql = re.sub(r"^\s*WITH\s+", f"WITH {', '.join(scoped_ctes)}, ", rewritten_sql, count=1, flags=re.I)
        else:
            rewritten_sql = f"WITH {', '.join(scoped_ctes)} {rewritten_sql}"

    bounded_sql = f"SELECT * FROM ({rewritten_sql}) AS __bounded_result LIMIT :_sql_limit"
    return bounded_sql, bind_params, referenced_tables


def _replace_unquoted_identifier(sql: str, ident: str, replacement: str) -> str:
    """Replace whole-word unquoted table identifiers without modifying text inside single/double quotes."""
    parts = re.split(r"('(?:''|[^'])*'|\"(?:\"\"|[^\"])*\")", sql)
    rx = re.compile(rf"\b{re.escape(ident)}\b", re.I)
    for i in range(0, len(parts), 2):
        parts[i] = rx.sub(replacement, parts[i])
    return "".join(parts)


def schema_prompt_text(info: dict[str, Any], dialect: str) -> str:
    mode = info.get("storage_mode") or "partitioned"
    schema = PARTITIONED_TABLES if mode == "partitioned" else LEGACY_TABLES
    lines = [
        f"Database Dialect: {dialect}",
        f"Dataset Title: {info.get('title')} (currency={info.get('currency', 'USD')}, start={info.get('start')}, end={info.get('end')})",
        "Authorized Read-Only Tables & Columns:",
    ]
    for tbl, spec in schema.items():
        lines.append(f"- {tbl}({', '.join(spec['columns'])})")
    return "\n".join(lines)


def _match_entity_filter(question_folded: str, available: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    """Detect exact region, channel, category, or product values mentioned in EN/VI user query."""
    found: dict[str, str] = {}
    sql_params: dict[str, str] = {}
    for key, opt_key in (("region", "regions"), ("channel", "channels"), ("category", "categories")):
        for val in sorted(available.get(opt_key) or [], key=lambda x: -len(str(x))):
            if fold_text(str(val)) in question_folded:
                found[key] = str(val)
                sql_params[f"f_{key}"] = str(val)
                break
    for prod in sorted(available.get("products") or [], key=lambda p: -len(str(p.get("product_name", "")))):
        pname = str(prod.get("product_name", ""))
        pid = str(prod.get("product_id", ""))
        if pname and (fold_text(pname) in question_folded or fold_text(pid) in question_folded):
            found["product_name"] = pname
            found["product_id"] = pid
            sql_params["f_product"] = pid
            break
    return found, sql_params


def _generate_deterministic_sql(
    question: str,
    *,
    info: dict[str, Any],
    dialect: str,
    available: dict[str, Any],
    session_context: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any], str, dict[str, str]] | None:
    """Deterministic bilingual EN/VI SQL builder over schema for reliable, exact BI answers offline & online."""
    q = fold_text(question)
    mode = info.get("storage_mode") or "partitioned"
    is_pg = dialect == "postgresql"
    caps = info.get("capabilities") or {}
    end_d = date.fromisoformat(info["end"]) if info.get("end") else date.today()
    month_start = end_d.replace(day=1).isoformat()
    end_iso = end_d.isoformat()

    filters, f_params = _match_entity_filter(q, available)

    # Inherit contextual SKU/region from Layer 2 session memory on explicit follow-up references
    if session_context and not filters:
        if any(w in q for w in ("that product", "this product", "san pham do", "mat hang nay", "its ")) and session_context.get("last_product"):
            pid = session_context["last_product"]
            filters["product_id"] = pid
            f_params["f_product"] = pid

    if mode == "partitioned":
        tx_tbl = "tenant_transactions"
        prod_join = ""
        prod_name_col = "product_name"
        cat_col = "category"
        cust_col = "customer_id"
        mkt_tbl = "tenant_marketing_daily"
        inv_tbl = "tenant_inventory_daily"
    else:
        tx_tbl = "sales_transactions"
        prod_join = " JOIN products p ON p.product_id = s.product_id"
        prod_name_col = "p.product_name"
        cat_col = "p.category"
        cust_col = "s.customer_id"
        mkt_tbl = "marketing_campaigns"
        inv_tbl = "inventory_daily"

    alias = "" if mode == "partitioned" else "s."
    where_clauses: list[str] = []
    params: dict[str, Any] = {**f_params}
    explicit_all_time = any(w in q for w in ("all time", "all-time", "entire", "overall", "toan bo", "ca ky", "tu truoc"))
    has_explicit_period = False

    if any(w in q for w in ("this month", "recent month", "latest month", "thang nay", "thang gan nhat", "ky nay", "gan day")):
        where_clauses.append(f"{alias}date BETWEEN :p_start AND :p_end")
        params["p_start"] = month_start
        params["p_end"] = end_iso
        has_explicit_period = True
    elif any(w in q for w in ("last month", "previous month", "thang truoc")):
        prev_end = month_start and (date.fromisoformat(month_start) - __import__("datetime").timedelta(days=1))
        prev_start = prev_end.replace(day=1)
        where_clauses.append(f"{alias}date BETWEEN :p_start AND :p_end")
        params["p_start"] = prev_start.isoformat()
        params["p_end"] = prev_end.isoformat()
        has_explicit_period = True
    elif any(w in q for w in ("last 7 days", "7 days", "7 ngay")):
        from datetime import timedelta

        where_clauses.append(f"{alias}date BETWEEN :p_start AND :p_end")
        params["p_start"] = (end_d - timedelta(days=6)).isoformat()
        params["p_end"] = end_iso
        has_explicit_period = True
    elif any(w in q for w in ("last 30 days", "30 days", "30 ngay")):
        from datetime import timedelta

        where_clauses.append(f"{alias}date BETWEEN :p_start AND :p_end")
        params["p_start"] = (end_d - timedelta(days=29)).isoformat()
        params["p_end"] = end_iso
        has_explicit_period = True

    if "f_region" in params:
        where_clauses.append(f"{alias}region = :f_region")
    if "f_channel" in params:
        where_clauses.append(f"{alias}sales_channel = :f_channel")
    if "f_product" in params:
        where_clauses.append(f"{alias}product_id = :f_product")
    if "f_category" in params:
        where_clauses.append(f"{cat_col} = :f_category")

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    # 1. Approved Multimodal Insights table lookup
    if any(w in q for w in ("multimodal insight", "extracted insight", "invoice", "receipt", "ocr", "transcript", "hoa don", "bien lai")):
        sql = (
            "SELECT title, modality, entity_type, insight_date, summary_text, confidence_score "
            "FROM tenant_multimodal_insights ORDER BY insight_date DESC LIMIT 20"
        )
        return sql, {}, "multimodal_insights_sql", {"chart_type": "none"}

    # 2. Marketing channel ROAS / spend query (defaults to active latest month unless 'all time' specified, matching analytics service)
    if any(w in q for w in ("roas", "marketing", "campaign", "ad spend", "cac", "tiep thi", "quang cao", "chien dich")) and caps.get("has_marketing", True):
        order_dir = "ASC" if any(w in q for w in ("lowest", "worst", "min", "thap nhat", "te nhat")) else "DESC"
        if any(w in q for w in ("spend", "budget", "chi tieu")) and "roas" not in q:
            order_col = "spend"
        else:
            order_col = "roas"
        mkt_params: dict[str, Any] = {}
        if has_explicit_period:
            mkt_params = {"p_start": params["p_start"], "p_end": params["p_end"]}
            mkt_where = " WHERE date BETWEEN :p_start AND :p_end"
        elif not explicit_all_time:
            mkt_params = {"p_start": month_start, "p_end": end_iso}
            mkt_where = " WHERE date BETWEEN :p_start AND :p_end"
        else:
            mkt_where = ""
        sql = (
            "SELECT channel, "
            "ROUND(SUM(spend), 2) AS spend, "
            "ROUND(SUM(attributed_revenue), 2) AS attributed_revenue, "
            "SUM(orders) AS orders, "
            "SUM(leads) AS leads, "
            "ROUND(CASE WHEN SUM(spend) > 0 THEN SUM(attributed_revenue) * 1.0 / SUM(spend) ELSE 0 END, 3) AS roas "
            f"FROM {mkt_tbl}{mkt_where} "
            f"GROUP BY channel ORDER BY {order_col} {order_dir} LIMIT 15"
        )
        return sql, mkt_params, "marketing_roas_sql", {
            "chart_type": "bar", "x": "channel", "y": order_col
        }

    # 3. Inventory / Stockout query
    if any(w in q for w in ("stockout", "inventory", "low stock", "ton kho", "dut hang", "het hang", "thieu hang")) and caps.get("has_inventory", True):
        if mode == "partitioned":
            sql = (
                "SELECT p.product_id, p.product_name, p.category, p.current_stock, "
                "COALESCE(SUM(CASE WHEN i.stockout_flag THEN 1 ELSE 0 END), 0) AS stockout_days "
                "FROM tenant_products p "
                "LEFT JOIN tenant_inventory_daily i ON i.product_id = p.product_id "
                "WHERE p.is_physical "
                "GROUP BY p.product_id, p.product_name, p.category, p.current_stock "
                "ORDER BY stockout_days DESC, p.current_stock ASC LIMIT 15"
            )
        else:
            sql = (
                "SELECT p.product_id, p.product_name, p.category, p.current_stock, "
                "SUM(CASE WHEN i.stockout_flag THEN 1 ELSE 0 END) AS stockout_days "
                "FROM products p "
                "JOIN inventory_daily i ON i.product_id = p.product_id "
                "WHERE p.is_physical "
                "GROUP BY p.product_id, p.product_name, p.category, p.current_stock "
                "ORDER BY stockout_days DESC, p.current_stock ASC LIMIT 15"
            )
        return sql, {}, "inventory_stockout_sql", {"chart_type": "bar", "x": "product_name", "y": "stockout_days"}

    # 4. Monthly / time trend SQL
    if any(w in q for w in ("by month", "monthly", "trend", "over time", "theo thang", "xu huong", "qua cac thang")):
        month_expr = f"to_char({alias}date, 'YYYY-MM')" if is_pg else f"strftime('%Y-%m', {alias}date)"
        gp_col = f"ROUND(SUM(COALESCE({alias}gross_profit, 0)), 2) AS gross_profit," if caps.get("has_cost_or_profit", True) else ""
        sql = (
            f"SELECT {month_expr} AS period, "
            f"ROUND(SUM({alias}revenue), 2) AS revenue, "
            f"{gp_col} "
            f"SUM({alias}quantity) AS units, "
            f"COUNT(*) AS orders "
            f"FROM {tx_tbl}{' s' if mode != 'partitioned' else ''}{prod_join}{where_sql} "
            f"GROUP BY {month_expr} ORDER BY period ASC LIMIT 36"
        )
        return sql, params, "monthly_trend_sql", {"chart_type": "line", "x": "period", "y": "revenue"}

    # 5. Breakdown / ranking by dimension (product, category, region, channel, segment, customer)
    metric_key = "revenue"
    profit_terms = any(w in q for w in ("profit", "margin", "loi nhuan", "lai gop", "bien"))
    explicit_profit_rank = any(
        w in q
        for w in (
            "highest profit", "most profit", "lowest profit", "top profit",
            "highest margin", "lowest margin", "best margin", "worst margin",
            "loi nhuan cao nhat", "loi nhuan thap nhat", "bien loi nhuan",
        )
    )
    has_rev_term = any(w in q for w in ("revenue", "doanh thu", "sales", "doanh so"))
    if profit_terms and caps.get("has_cost_or_profit", True) and (explicit_profit_rank or not has_rev_term):
        if any(w in q for w in ("margin", "bien")):
            metric_key = "margin"
        else:
            metric_key = "gross_profit"
    elif any(w in q for w in ("quantity", "units", "sold", "san luong", "so luong")) and not has_rev_term:
        metric_key = "units"
    elif any(w in q for w in ("orders", "transactions", "don hang")) and not has_rev_term:
        metric_key = "orders"

    order_dir = "ASC" if any(w in q for w in ("lowest", "worst", "bottom", "least", "thap nhat", "it nhat")) else "DESC"

    dim_group = None
    dim_alias = "name"
    extra_join = prod_join
    if any(w in q for w in ("product", "sku", "san pham", "mat hang")) and "f_product" not in params:
        dim_group = prod_name_col
    elif any(w in q for w in ("category", "categories", "nganh hang", "danh muc", "nhom hang")):
        dim_group = cat_col
    elif any(w in q for w in ("region", "city", "khu vuc", "chi nhanh", "mien")) and "f_region" not in params:
        dim_group = f"{alias}region"
    elif any(w in q for w in ("channel", "kenh")):
        dim_group = f"{alias}sales_channel"
    elif any(w in q for w in ("customer", "segment", "khach hang")):
        if "segment" in q or "phan khuc" in q or mode == "legacy_snapshot":
            if mode == "legacy_snapshot":
                extra_join = f"{prod_join} JOIN customers c ON c.customer_id = s.customer_id"
                dim_group = "c.customer_segment"
            else:
                dim_group = "customer_segment"
        else:
            dim_group = cust_col

    if dim_group:
        sql = (
            f"SELECT {dim_group} AS {dim_alias}, "
            f"ROUND(SUM({alias}revenue), 2) AS revenue, "
            f"ROUND(SUM(COALESCE({alias}gross_profit, 0)), 2) AS gross_profit, "
            f"ROUND(CASE WHEN SUM({alias}revenue) > 0 THEN SUM(COALESCE({alias}gross_profit, 0)) * 1.0 / SUM({alias}revenue) ELSE 0 END, 4) AS margin, "
            f"SUM({alias}quantity) AS units, "
            f"COUNT(*) AS orders "
            f"FROM {tx_tbl}{' s' if mode != 'partitioned' else ''}{extra_join}{where_sql} "
            f"GROUP BY {dim_group} ORDER BY {metric_key} {order_dir} LIMIT 15"
        )
        return sql, params, f"breakdown_{dim_alias}_sql", {"chart_type": "bar", "x": dim_alias, "y": metric_key}

    # 6. Overall / filtered aggregate KPI summary SQL
    if any(
        w in q
        for w in (
            "revenue", "profit", "margin", "orders", "units", "sales", "aov",
            "total revenue", "total sales", "total profit", "total orders", "overall performance",
            "how is our business", "doanh thu", "loi nhuan", "don hang", "tong doanh thu",
            "tong loi nhuan", "hieu qua", "kinh doanh",
        )
    ):
        sql = (
            f"SELECT ROUND(COALESCE(SUM({alias}revenue), 0), 2) AS total_revenue, "
            f"ROUND(COALESCE(SUM({alias}gross_profit), 0), 2) AS total_gross_profit, "
            f"ROUND(CASE WHEN SUM({alias}revenue) > 0 THEN SUM(COALESCE({alias}gross_profit, 0)) * 1.0 / SUM({alias}revenue) ELSE 0 END, 4) AS gross_margin, "
            f"COUNT(*) AS total_orders, "
            f"COALESCE(SUM({alias}quantity), 0) AS total_units, "
            f"COUNT(DISTINCT {cust_col}) AS unique_customers, "
            f"ROUND(CASE WHEN COUNT(*) > 0 THEN SUM({alias}revenue) * 1.0 / COUNT(*) ELSE 0 END, 2) AS avg_order_value "
            f"FROM {tx_tbl}{' s' if mode != 'partitioned' else ''}{prod_join}{where_sql}"
        )
        return sql, params, "kpi_aggregate_sql", {"chart_type": "none"}

    return None


def _llm_generate_sql(question: str, *, info: dict[str, Any], dialect: str) -> str | None:
    provider = os.getenv("LLM_PROVIDER", "none").strip().lower()
    if provider not in {"openai", "gemini"}:
        return None
    schema_txt = schema_prompt_text(info, dialect)
    system_prompt = (
        "You are an expert SQL generator for DecisionPilot AI. Generate ONE single read-only SELECT query "
        "answering the user's business question strictly using the authorized tables and columns below.\n"
        f"{schema_txt}\n\n"
        "Rules:\n"
        "1. Output ONLY raw SQL (no markdown fences, no commentary, no semicolon).\n"
        "2. ONLY SELECT or non-recursive WITH ... SELECT is permitted. Never INSERT/UPDATE/DELETE/DROP/PRAGMA.\n"
        "3. Always include LIMIT 25 for non-aggregate listings.\n"
        "4. Use SQLite functions like strftime('%Y-%m', date) if dialect is sqlite; to_char(date, 'YYYY-MM') if postgresql."
    )
    try:
        if provider == "openai" and os.getenv("OPENAI_API_KEY", "").strip():
            res = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
                json={
                    "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                    "temperature": 0,
                    "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": question}],
                },
                timeout=8.0,
            )
            res.raise_for_status()
            sql = res.json()["choices"][0]["message"]["content"].strip()
        elif provider == "gemini" and os.getenv("GEMINI_API_KEY", "").strip():
            model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            res = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                json={
                    "system_instruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": question}]}],
                    "generationConfig": {"temperature": 0},
                },
                timeout=8.0,
            )
            res.raise_for_status()
            sql = res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        else:
            return None
        # Strip accidental markdown code fences
        sql = re.sub(r"^```(?:sql)?\s*", "", sql, flags=re.I)
        sql = re.sub(r"\s*```$", "", sql).strip()
        return sql or None
    except Exception as exc:
        log.warning("LLM SQL generation failed (%s); using deterministic SQL planner.", type(exc).__name__)
        return None


def _resolve_readonly_engine(main_engine: sa.Engine) -> tuple[sa.Engine, bool]:
    ro_url = get_rag_settings().readonly_database_url
    if ro_url:
        return make_engine(ro_url), True
    return main_engine, False


def execute_text_to_sql(
    engine: sa.Engine,
    *,
    question: str,
    company_id: str,
    dataset_id: str | None = None,
    session_context: dict[str, Any] | None = None,
    explicit_sql: str | None = None,
    actor: str = "workspace-user",
) -> dict[str, Any]:
    """
    Generate (or accept explicit SQL for testing), validate read-only + tenant isolation,
    execute inside read_connection(), audit-log, and return rows + metadata.
    """
    t0 = time.perf_counter()
    settings = get_rag_settings()
    dialect = engine.dialect.name

    with read_connection(engine) as conn:
        info = dataset_info(conn, company_id=company_id, dataset_id=dataset_id)
        avail = options(conn, info=info)

    chart_hint: dict[str, Any] = {"chart_type": "none"}
    template_name = "explicit_sql" if explicit_sql else "llm_generated"
    params: dict[str, Any] = {}

    candidate_sql = explicit_sql
    if not candidate_sql:
        det = _generate_deterministic_sql(
            question, info=info, dialect=dialect, available=avail, session_context=session_context
        )
        if det is not None:
            candidate_sql, params, template_name, chart_hint = det
        else:
            candidate_sql = _llm_generate_sql(question, info=info, dialect=dialect)

    if not candidate_sql:
        return {
            "executed": False,
            "reason": "no_sql_matched",
            "sql": None,
            "rows": [],
            "columns": [],
            "row_count": 0,
            "execution_ms": round((time.perf_counter() - t0) * 1000, 2),
        }

    try:
        scoped_sql, bind_params, ref_tables = validate_and_scope_sql(
            candidate_sql,
            info=info,
            company_id=company_id,
            max_rows=settings.sql_max_rows,
        )
    except UnsafeSQLError as exc:
        # Audit rejected unsafe SQL
        try:
            with engine.begin() as aconn:
                aconn.execute(
                    audit.insert().values(
                        company_id=company_id,
                        kind="sql_blocked",
                        subject=info["dataset_id"],
                        payload={"actor": actor, "question": question[:300], "candidate_sql": candidate_sql[:600], "reason": str(exc)},
                    )
                )
        except Exception:
            pass
        return {
            "executed": False,
            "blocked": True,
            "reason": str(exc),
            "sql": candidate_sql,
            "rows": [],
            "columns": [],
            "row_count": 0,
            "execution_ms": round((time.perf_counter() - t0) * 1000, 2),
        }

    all_params = {**params, **bind_params}
    ro_engine, owns_ro = _resolve_readonly_engine(engine)
    try:
        with read_connection(ro_engine) as ro_conn:
            if ro_conn.dialect.name == "postgresql":
                ro_conn.exec_driver_sql(f"SET LOCAL statement_timeout = '{settings.sql_timeout_sec}s'")
            result = ro_conn.execute(sa.text(scoped_sql), all_params)
            cols = list(result.keys())
            rows = [{k: row[k] for k in cols} for row in result.mappings().all()]
            if (
                not rows
                and template_name == "marketing_roas_sql"
                and " WHERE date BETWEEN :p_start AND :p_end" in candidate_sql
                and not any(w in fold_text(question) for w in ("month", "thang"))
            ):
                fallback_sql = candidate_sql.replace(" WHERE date BETWEEN :p_start AND :p_end", "")
                scoped_fb, fb_bind, _ = validate_and_scope_sql(
                    fallback_sql, info=info, company_id=company_id, max_rows=settings.sql_max_rows
                )
                result = ro_conn.execute(sa.text(scoped_fb), fb_bind)
                cols = list(result.keys())
                rows = [{k: row[k] for k in cols} for row in result.mappings().all()]
                candidate_sql = fallback_sql
    except sa.exc.SQLAlchemyError as exc:
        log.warning("Read-only SQL execution failed (%s); returning non-fatal fallback.", type(exc).__name__)
        return {
            "executed": False,
            "blocked": False,
            "reason": f"sql_runtime_error:{type(exc).__name__}",
            "sql": candidate_sql,
            "scoped_tables": ref_tables,
            "read_only_verified": True,
            "rows": [],
            "columns": [],
            "row_count": 0,
            "execution_ms": round((time.perf_counter() - t0) * 1000, 2),
        }
    finally:
        if owns_ro:
            ro_engine.dispose()

    exec_ms = round((time.perf_counter() - t0) * 1000, 2)
    try:
        with engine.begin() as aconn:
            aconn.execute(
                audit.insert().values(
                    company_id=company_id,
                    kind="sql_query",
                    subject=info["dataset_id"],
                    payload={
                        "actor": actor,
                        "template": template_name,
                        "tables": ref_tables,
                        "row_count": len(rows),
                        "execution_ms": exec_ms,
                    },
                )
            )
    except Exception:
        pass

    chart = None
    if rows and chart_hint.get("chart_type") in {"bar", "line"} and chart_hint.get("x") in cols and chart_hint.get("y") in cols:
        chart = {
            "type": chart_hint["chart_type"],
            "x": chart_hint["x"],
            "y": chart_hint["y"],
            "rows": rows[:15],
        }

    return {
        "executed": True,
        "blocked": False,
        "template": template_name,
        "sql": candidate_sql,
        "scoped_tables": ref_tables,
        "read_only_verified": True,
        "columns": cols,
        "rows": rows,
        "row_count": len(rows),
        "chart": chart,
        "dataset_id": info["dataset_id"],
        "currency": info.get("currency", "USD"),
        "execution_ms": exec_ms,
    }
