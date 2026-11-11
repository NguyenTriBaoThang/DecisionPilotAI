"""3D Digital Twin Business Zones, Honest AI Model Inventory & Scenario Pipeline Topology."""
from __future__ import annotations

from typing import Any


ZONE_DEFINITIONS: list[dict[str, Any]] = [
    {
        "id": "marketing",
        "name": "Marketing Zone",
        "department": "Growth & Demand Generation",
        "description": "Marketing budget allocation, active advertising channels, funnel conversion rate, and customer acquisition flow.",
        "position": [-11.5, 0.0, -5.5],
        "color": "#2563EB",
        "accent": "#0284C7",
        "node_ids": ["mkt_budget", "mkt_channels", "mkt_analytics"],
    },
    {
        "id": "customers",
        "name": "Customer Zone",
        "department": "Customer Lifecycle & Retention",
        "description": "Active segments, new vs. returning cohorts, lifetime value, retention assumptions, and churn sensitivity.",
        "position": [-4.0, 0.0, -7.2],
        "color": "#0284C7",
        "accent": "#38BDF8",
        "node_ids": ["cust_segments", "cust_retention"],
    },
    {
        "id": "sales",
        "name": "Sales Zone",
        "department": "Commercial & Revenue Operations",
        "description": "Realized orders, revenue generation, product pricing elasticity, sales channels, and forecasted unit demand.",
        "position": [4.5, 0.0, -5.5],
        "color": "#16A34A",
        "accent": "#22C55E",
        "node_ids": ["sales_pricing", "sales_orders", "sales_revenue"],
    },
    {
        "id": "supply_chain",
        "name": "Supply Chain Zone",
        "department": "Procurement & Logistics",
        "description": "Supplier lead times, procurement arrivals, inbound replenishment cadence, and supply disruption resilience.",
        "position": [-11.5, 0.0, 5.5],
        "color": "#D97706",
        "accent": "#F59E0B",
        "node_ids": ["sc_suppliers", "sc_lead_time"],
    },
    {
        "id": "inventory",
        "name": "Inventory Zone",
        "department": "Warehouse & Fulfillment",
        "description": "Warehouse stock levels, stock in/out balance, reorder points, overstock exposure, and stockout risk.",
        "position": [-3.8, 0.0, 6.2],
        "color": "#EA580C",
        "accent": "#FB923C",
        "node_ids": ["inv_warehouse", "inv_reorder", "inv_risk"],
    },
    {
        "id": "finance_ops",
        "name": "Finance & Operations Zone",
        "department": "FP&A & Unit Economics",
        "description": "Reconciled revenue, direct COGS, gross profit, profit margin, and explicitly supplied operating expense / cash flow assumptions.",
        "position": [4.8, 0.0, 5.5],
        "color": "#0F766E",
        "accent": "#14B8A6",
        "node_ids": ["fin_costs", "fin_profit", "fin_margin"],
    },
    {
        "id": "ai_engine",
        "name": "AI & Analytics Engine",
        "department": "Central Decision Intelligence Hub",
        "description": "Truthful execution hub connecting SQL Analytics, LightGBM Forecaster, Anomaly Detector, Scenario Engine, RAG, and LLM synthesis.",
        "position": [0.0, 1.35, 0.0],
        "color": "#1D4ED8",
        "accent": "#60A5FA",
        "node_ids": [
            "ai_sql",
            "ai_lgbm",
            "ai_anomaly",
            "ai_scenario",
            "ai_opt",
            "ai_cls",
            "ai_rag",
            "ai_llm",
        ],
    },
    {
        "id": "outcomes",
        "name": "Business Outcomes",
        "department": "Executive Simulation Output",
        "description": "Scenario projections, uncertainty bounds, multi-scenario ranking, and evidence-backed executive recommendations.",
        "position": [11.8, 0.0, 0.0],
        "color": "#2563EB",
        "accent": "#16A34A",
        "node_ids": ["out_forecast", "out_recommendation"],
    },
]


NODE_DEFINITIONS: list[dict[str, Any]] = [
    {"id": "mkt_budget", "zone_id": "marketing", "label": "Marketing Budget & Spend", "kind": "input"},
    {"id": "mkt_channels", "zone_id": "marketing", "label": "Advertising Channels & ROAS", "kind": "metric"},
    {"id": "mkt_analytics", "zone_id": "marketing", "label": "Marketing Funnel Analytics", "kind": "process"},
    {"id": "cust_segments", "zone_id": "customers", "label": "Customer Segments & Cohorts", "kind": "metric"},
    {"id": "cust_retention", "zone_id": "customers", "label": "Retention & Churn Sensitivity", "kind": "assumption"},
    {"id": "sales_pricing", "zone_id": "sales", "label": "Pricing & Elasticity Lever", "kind": "input"},
    {"id": "sales_orders", "zone_id": "sales", "label": "Orders & Demand Projection", "kind": "process"},
    {"id": "sales_revenue", "zone_id": "sales", "label": "Revenue Projection", "kind": "metric"},
    {"id": "sc_suppliers", "zone_id": "supply_chain", "label": "Suppliers & Procurement", "kind": "input"},
    {"id": "sc_lead_time", "zone_id": "supply_chain", "label": "Lead Time & Disruption Factor", "kind": "process"},
    {"id": "inv_warehouse", "zone_id": "inventory", "label": "3D Warehouse Stock Levels", "kind": "metric"},
    {"id": "inv_reorder", "zone_id": "inventory", "label": "Reorder Point Calculation", "kind": "process"},
    {"id": "inv_risk", "zone_id": "inventory", "label": "Stockout / Overstock Risk", "kind": "metric"},
    {"id": "fin_costs", "zone_id": "finance_ops", "label": "COGS & Operating Cost Structure", "kind": "input"},
    {"id": "fin_profit", "zone_id": "finance_ops", "label": "Gross & Net Profit Simulation", "kind": "process"},
    {"id": "fin_margin", "zone_id": "finance_ops", "label": "Profit Margin & Cash Buffer", "kind": "metric"},
    {"id": "ai_sql", "zone_id": "ai_engine", "label": "SQL Analytics Engine", "kind": "ai_model"},
    {"id": "ai_lgbm", "zone_id": "ai_engine", "label": "LightGBM Forecasting", "kind": "ai_model"},
    {"id": "ai_anomaly", "zone_id": "ai_engine", "label": "Hybrid Anomaly Detector", "kind": "ai_model"},
    {"id": "ai_scenario", "zone_id": "ai_engine", "label": "Scenario What-if Engine", "kind": "ai_model"},
    {"id": "ai_opt", "zone_id": "ai_engine", "label": "Heuristic Candidate Ranker", "kind": "ai_model"},
    {"id": "ai_cls", "zone_id": "ai_engine", "label": "Classification (Not Integrated)", "kind": "ai_model"},
    {"id": "ai_rag", "zone_id": "ai_engine", "label": "Hybrid RAG Policy Retrieval", "kind": "ai_model"},
    {"id": "ai_llm", "zone_id": "ai_engine", "label": "LLM Evidence Synthesizer", "kind": "ai_model"},
    {"id": "out_forecast", "zone_id": "outcomes", "label": "Scenario Outcome Vector", "kind": "output"},
    {"id": "out_recommendation", "zone_id": "outcomes", "label": "Decision Recommendation", "kind": "output"},
]


EDGE_DEFINITIONS: list[dict[str, Any]] = [
    # Marketing flows
    {"id": "e_mkt_budget_analytics", "source": "mkt_budget", "target": "mkt_analytics", "label": "Budget Allocation"},
    {"id": "e_mkt_channels_analytics", "source": "mkt_channels", "target": "mkt_analytics", "label": "Channel ROAS & Leads"},
    {"id": "e_mkt_analytics_sql", "source": "mkt_analytics", "target": "ai_sql", "label": "28d Spend & Attribution"},
    {"id": "e_mkt_analytics_cust", "source": "mkt_analytics", "target": "cust_segments", "label": "Customer Acquisition"},
    {"id": "e_mkt_analytics_scenario", "source": "mkt_analytics", "target": "ai_scenario", "label": "Concave Response Input"},
    # Customer flows
    {"id": "e_cust_seg_sql", "source": "cust_segments", "target": "ai_sql", "label": "Cohort Mix"},
    {"id": "e_cust_ret_cls", "source": "cust_retention", "target": "ai_cls", "label": "Retention Sensitivity Inputs"},
    {"id": "e_cust_seg_ret", "source": "cust_segments", "target": "cust_retention", "label": "Active Base -> Retention"},
    {"id": "e_cls_sales", "source": "ai_cls", "target": "sales_orders", "label": "Assumed Cohort Demand Shift"},
    # Supply chain & Inventory flows
    {"id": "e_sc_sup_lt", "source": "sc_suppliers", "target": "sc_lead_time", "label": "Procurement Schedule"},
    {"id": "e_sc_lt_inv", "source": "sc_lead_time", "target": "inv_warehouse", "label": "Lead-Time & Receipts"},
    {"id": "e_inv_wh_lgbm", "source": "inv_warehouse", "target": "ai_lgbm", "label": "On-Hand Stock & History"},
    {"id": "e_inv_wh_reorder", "source": "inv_warehouse", "target": "inv_reorder", "label": "Safety Stock Check"},
    {"id": "e_lgbm_reorder", "source": "ai_lgbm", "target": "inv_reorder", "label": "Forecasted Unit Demand"},
    {"id": "e_inv_reorder_scen", "source": "inv_reorder", "target": "ai_scenario", "label": "Replenishment Path"},
    {"id": "e_scen_inv_risk", "source": "ai_scenario", "target": "inv_risk", "label": "Stockout / Overstock Evaluation"},
    {"id": "e_inv_risk_orders", "source": "inv_risk", "target": "sales_orders", "label": "Fulfillment Cap"},
    # AI & Sales flows
    {"id": "e_sql_lgbm", "source": "ai_sql", "target": "ai_lgbm", "label": "Observed Daily Series"},
    {"id": "e_sql_anomaly", "source": "ai_sql", "target": "ai_anomaly", "label": "KPI & Stock Alerts"},
    {"id": "e_lgbm_orders", "source": "ai_lgbm", "target": "sales_orders", "label": "Demand Forecast + 90% Band"},
    {"id": "e_pricing_scen", "source": "sales_pricing", "target": "ai_scenario", "label": "Discount & Elasticity"},
    {"id": "e_lgbm_scen", "source": "ai_lgbm", "target": "ai_scenario", "label": "Baseline Demand Path"},
    {"id": "e_sql_scen", "source": "ai_sql", "target": "ai_scenario", "label": "Baseline Prices & Margins"},
    {"id": "e_scen_orders", "source": "ai_scenario", "target": "sales_orders", "label": "Simulated Volume"},
    {"id": "e_orders_rev", "source": "sales_orders", "target": "sales_revenue", "label": "Price x Fulfilled Units"},
    # Finance & Outcomes flows
    {"id": "e_rev_profit", "source": "sales_revenue", "target": "fin_profit", "label": "Projected Revenue"},
    {"id": "e_costs_sql", "source": "fin_costs", "target": "ai_sql", "label": "COGS & Opex Inputs"},
    {"id": "e_costs_profit", "source": "fin_costs", "target": "fin_profit", "label": "Direct & Fixed Costs"},
    {"id": "e_profit_margin", "source": "fin_profit", "target": "fin_margin", "label": "Net Profit & Margin %"},
    {"id": "e_margin_out", "source": "fin_margin", "target": "out_forecast", "label": "Financial Impact"},
    {"id": "e_inv_risk_out", "source": "inv_risk", "target": "out_forecast", "label": "Operational Risk"},
    {"id": "e_opt_out", "source": "ai_opt", "target": "out_forecast", "label": "Constraint-Checked Ranking"},
    {"id": "e_out_rag", "source": "out_forecast", "target": "ai_rag", "label": "Policy & Constraint Lookup"},
    {"id": "e_rag_llm", "source": "ai_rag", "target": "ai_llm", "label": "Retrieved SOP & Evidence"},
    {"id": "e_llm_rec", "source": "ai_llm", "target": "out_recommendation", "label": "Grounded Recommendation"},
]


SCENARIO_PIPELINES: dict[str, list[str]] = {
    "baseline": [
        "e_mkt_budget_analytics",
        "e_mkt_analytics_sql",
        "e_cust_seg_sql",
        "e_inv_wh_lgbm",
        "e_costs_sql",
        "e_sql_lgbm",
        "e_sql_anomaly",
        "e_lgbm_orders",
        "e_orders_rev",
        "e_rev_profit",
        "e_costs_profit",
        "e_profit_margin",
        "e_margin_out",
    ],
    "revenue_growth": [
        "e_mkt_budget_analytics",
        "e_mkt_analytics_sql",
        "e_mkt_analytics_scenario",
        "e_pricing_scen",
        "e_sql_lgbm",
        "e_lgbm_scen",
        "e_sql_scen",
        "e_scen_orders",
        "e_orders_rev",
        "e_rev_profit",
        "e_costs_profit",
        "e_profit_margin",
        "e_margin_out",
        "e_out_rag",
        "e_rag_llm",
        "e_llm_rec",
    ],
    "marketing_optimization": [
        "e_mkt_budget_analytics",
        "e_mkt_channels_analytics",
        "e_mkt_analytics_sql",
        "e_mkt_analytics_cust",
        "e_mkt_analytics_scenario",
        "e_sql_scen",
        "e_scen_orders",
        "e_orders_rev",
        "e_rev_profit",
        "e_profit_margin",
        "e_margin_out",
        "e_out_rag",
        "e_rag_llm",
        "e_llm_rec",
    ],
    "pricing_strategy": [
        "e_sql_lgbm",
        "e_pricing_scen",
        "e_lgbm_scen",
        "e_sql_scen",
        "e_scen_inv_risk",
        "e_scen_orders",
        "e_orders_rev",
        "e_rev_profit",
        "e_costs_profit",
        "e_profit_margin",
        "e_margin_out",
        "e_opt_out",
        "e_out_rag",
        "e_rag_llm",
        "e_llm_rec",
    ],
    "inventory_optimization": [
        "e_sc_sup_lt",
        "e_sc_lt_inv",
        "e_inv_wh_lgbm",
        "e_inv_wh_reorder",
        "e_lgbm_reorder",
        "e_inv_reorder_scen",
        "e_scen_inv_risk",
        "e_inv_risk_orders",
        "e_orders_rev",
        "e_rev_profit",
        "e_inv_risk_out",
        "e_opt_out",
        "e_out_rag",
        "e_rag_llm",
        "e_llm_rec",
    ],
    "supply_chain_disruption": [
        "e_sc_sup_lt",
        "e_sc_lt_inv",
        "e_inv_wh_lgbm",
        "e_lgbm_reorder",
        "e_inv_reorder_scen",
        "e_scen_inv_risk",
        "e_inv_risk_orders",
        "e_orders_rev",
        "e_rev_profit",
        "e_inv_risk_out",
        "e_margin_out",
        "e_out_rag",
        "e_rag_llm",
        "e_llm_rec",
    ],
    "customer_retention": [
        "e_cust_seg_sql",
        "e_cust_seg_ret",
        "e_cust_ret_cls",
        "e_cls_sales",
        "e_orders_rev",
        "e_rev_profit",
        "e_profit_margin",
        "e_margin_out",
        "e_out_rag",
        "e_rag_llm",
        "e_llm_rec",
    ],
    "cost_reduction": [
        "e_costs_sql",
        "e_sql_scen",
        "e_costs_profit",
        "e_profit_margin",
        "e_margin_out",
        "e_out_rag",
        "e_rag_llm",
        "e_llm_rec",
    ],
    "custom": [
        "e_mkt_budget_analytics",
        "e_mkt_analytics_scenario",
        "e_cust_seg_ret",
        "e_sc_sup_lt",
        "e_sc_lt_inv",
        "e_pricing_scen",
        "e_sql_lgbm",
        "e_lgbm_scen",
        "e_sql_scen",
        "e_scen_inv_risk",
        "e_scen_orders",
        "e_orders_rev",
        "e_rev_profit",
        "e_costs_profit",
        "e_profit_margin",
        "e_margin_out",
        "e_inv_risk_out",
        "e_out_rag",
        "e_rag_llm",
        "e_llm_rec",
    ],
}


def get_pipeline_subgraph(scenario_type: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return active nodes & edges strictly for a given scenario pipeline graph."""
    edge_map = {e["id"]: e for e in EDGE_DEFINITIONS}
    node_map = {n["id"]: n for n in NODE_DEFINITIONS}
    edge_ids = SCENARIO_PIPELINES.get(scenario_type, SCENARIO_PIPELINES["custom"])
    edges = [edge_map[eid] for eid in edge_ids if eid in edge_map]
    used_nodes = set()
    for e in edges:
        used_nodes.add(e["source"])
        used_nodes.add(e["target"])
    nodes = [node_map[nid] for nid in node_map if nid in used_nodes]
    return nodes, edges


def build_honest_ai_inventory(
    *,
    has_artifact: bool,
    model_version: str | None,
    short_window: bool,
    days_count: int,
    rag_doc_count: int,
    llm_provider: str,
    capabilities: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build strictly truthful AI & analytics model status list (no faked models)."""
    lgbm_status = (
        "integrated"
        if (has_artifact and not short_window)
        else ("degraded" if (has_artifact and short_window) else "unavailable")
    )
    lgbm_note = (
        f"LGBMRegressor trained ({days_count}d observed, calibrated 90% empirical error intervals)"
        if lgbm_status == "integrated"
        else (
            f"Dataset spans {days_count}d (<201d required for full LightGBM); using causal rolling seasonal_naive / moving_average baseline."
            if lgbm_status == "degraded"
            else "Requires >=7 historical calendar days with trained forecast bundle."
        )
    )

    llm_active = llm_provider in {"openai", "gemini"}
    return [
        {
            "id": "ai_sql",
            "name": "SQL Analytics Engine",
            "version": "sql-analytics-2.1",
            "status": "integrated",
            "kind": "sql_analytics",
            "input": "Partitioned / core sales, marketing, inventory tables",
            "output": "Observed Baseline KPIs, cohorts, channel spend, availability",
            "note": "Read-only parameterized SQL aggregations grounded in current database.",
        },
        {
            "id": "ai_lgbm",
            "name": "LightGBM Forecaster",
            "version": model_version or ("short-window-statistical" if short_window else "untrained"),
            "status": lgbm_status,
            "kind": "forecasting",
            "input": "28-day demand/revenue lag matrix & calendar features",
            "output": "Horizon point forecast + 90% nominal empirical error bands",
            "note": lgbm_note,
        },
        {
            "id": "ai_anomaly",
            "name": "Hybrid Anomaly Detector",
            "version": "hybrid-isoforest-z-1.0",
            "status": "integrated" if has_artifact else "degraded",
            "kind": "anomaly_detection",
            "input": "Daily KPI frame & lead-time stock levels",
            "output": "Observed anomalies & stockout warning flags",
            "note": "Combines IsolationForest, rolling Z/IQR checks, and lead-time stockout rules.",
        },
        {
            "id": "ai_scenario",
            "name": "Scenario What-if Engine",
            "version": "counterfactual-1.0",
            "status": "integrated",
            "kind": "scenario_engine",
            "input": "Elasticity, concave spend exponent, lead-time replenishment parameters",
            "output": "Conditional sensitivity & replenishment projections",
            "note": "Deterministic conditional sensitivity curves (not randomized causal experiments).",
        },
        {
            "id": "ai_opt",
            "name": "Heuristic Candidate Ranker",
            "version": "constraint-rank-1.0",
            "status": "partial",
            "kind": "optimization",
            "input": "Candidate scenario results & operator constraints",
            "output": "Constraint-filtered objective ranking & lead-time EOQ reorder qty",
            "note": "Heuristic discrete ranking + lead-time reorder calculator (no multi-constraint LP/MIP solver integrated).",
        },
        {
            "id": "ai_cls",
            "name": "Classification (Churn / Propensity)",
            "version": None,
            "status": "not_integrated",
            "kind": "classification",
            "input": "Customer churn / propensity ML model",
            "output": "Not integrated",
            "note": "No trained classification model exists in this system; customer retention scenarios run explicit sensitivity assumptions only.",
        },
        {
            "id": "ai_rag",
            "name": "Hybrid RAG Knowledge Engine",
            "version": "hybrid-rrf-1.0",
            "status": "integrated" if rag_doc_count > 0 else "degraded",
            "kind": "rag",
            "input": f"{rag_doc_count} indexed company document(s)",
            "output": "Policy & SOP evidence snippets for decision recommendations",
            "note": (
                f"Retrieves grounded citations across {rag_doc_count} uploaded document(s)."
                if rag_doc_count > 0
                else "Engine active, but 0 RAG documents indexed in this company workspace."
            ),
        },
        {
            "id": "ai_llm",
            "name": "LLM Evidence Synthesizer",
            "version": llm_provider if llm_active else "deterministic-grounded-1.0",
            "status": "integrated" if llm_active else "degraded",
            "kind": "llm",
            "input": "Verified SQL metrics, simulation outputs, RAG chunks",
            "output": "Executive decision summary without invented numbers",
            "note": (
                f"External {llm_provider.upper()} LLM active with strict numeric grounding."
                if llm_active
                else "No external LLM API key configured; using deterministic bilingual evidence synthesis (zero fabricated metrics)."
            ),
        },
    ]

