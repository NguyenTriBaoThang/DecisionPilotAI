export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface ApiEndpoint {
  method: HttpMethod
  path: string
  summary: string
  description: string
  role: 'public' | 'viewer' | 'analyst' | 'admin'
  requestBody?: string
  queryParams?: { name: string; type: string; required: boolean; description: string }[]
  responseSample: string
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'GET',
    path: '/health',
    summary: 'System health & diagnostic check',
    description: 'Verifies database connectivity, active dialect, loaded dataset status, and model bundle readiness.',
    role: 'public',
    responseSample: `{
  "status": "ok",
  "database": "ok",
  "database_dialect": "postgresql",
  "dataset_ready": true,
  "model_ready": true,
  "model_version": "dp-1.1"
}`,
  },
  {
    method: 'GET',
    path: '/session',
    summary: 'Current caller identity & permissions',
    description: 'Returns authenticated actor, workspace role (viewer, analyst, admin), auth scheme, and import permissions.',
    role: 'viewer',
    responseSample: `{
  "actor": "executive@decisionpilot.ai",
  "role": "analyst",
  "workspace_id": "ws-sme-vietnam-01",
  "authentication": "token",
  "import_enabled": false
}`,
  },
  {
    method: 'GET',
    path: '/dataset',
    summary: 'Active business dataset metadata',
    description: 'Inspects loaded dataset ID, date window (2024-10-01 to 2026-09-30), currency (VND), and row counts across all 6 tables.',
    role: 'viewer',
    responseSample: `{
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "title": "Synthetic retail & services demo",
  "currency": "VND",
  "timezone": "Asia/Ho_Chi_Minh",
  "start": "2024-10-01",
  "end": "2026-09-30",
  "counts": {
    "products": 50,
    "customers": 10000,
    "sales_transactions": 50000,
    "marketing_campaigns": 2920,
    "inventory_daily": 24820,
    "calendar_events": 730
  }
}`,
  },
  {
    method: 'GET',
    path: '/options',
    summary: 'Available dashboard filter options',
    description: 'Fetches distinct products, regions, sales channels, categories, and marketing channels for UI selection.',
    role: 'viewer',
    responseSample: `{
  "products": [{ "product_id": "P001", "product_name": "SmartDesk Mini", "category": "Office Equipment", "is_physical": true }],
  "regions": ["HCMC", "Hanoi", "Da Nang", "Can Tho"],
  "channels": ["Online", "Retail", "B2B"],
  "categories": ["Office Equipment", "Home/Office", "Electronics", "SaaS Service", "Business Service", "Accessories"],
  "marketing_channels": ["Facebook Ads", "Google Ads", "TikTok Ads", "Email"]
}`,
  },
  {
    method: 'GET',
    path: '/kpi/summary',
    summary: 'Topline executive KPIs & breakdowns',
    description: 'Aggregates revenue, gross profit, margin, orders, AOV, active customers, ROAS, and channel/product breakdowns over the filtered date range.',
    role: 'viewer',
    queryParams: [
      { name: 'start', type: 'date (YYYY-MM-DD)', required: false, description: 'Start date filter' },
      { name: 'end', type: 'date (YYYY-MM-DD)', required: false, description: 'End date filter' },
      { name: 'region', type: 'string', required: false, description: 'Region filter (e.g. "HCMC")' },
      { name: 'channel', type: 'string', required: false, description: 'Sales channel filter (Online, Retail, B2B)' },
    ],
    responseSample: `{
  "summary": {
    "revenue": 3988062500,
    "gross_profit": 1612480000,
    "margin": 0.4043,
    "orders": 1764
  },
  "products": [
    { "product_id": "P001", "product_name": "SmartDesk Mini", "revenue": 420000000, "gross_profit": 141600000, "units": 175 }
  ],
  "marketing_channels": [
    { "channel": "Google Ads", "spend": 62000000, "attributed_revenue": 285000000, "roas": 4.59 },
    { "channel": "Facebook Ads", "spend": 85000000, "attributed_revenue": 260000000, "roas": 3.05 }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/query',
    summary: 'Ask AI Copilot natural language query',
    description: 'Classifies Vietnamese/English executive queries into a strict Pydantic Intent schema, runs parameterized SQLAlchemy Core queries on read-only DB sessions, and produces grounded answers with traces.',
    role: 'viewer',
    requestBody: `{
  "question": "Why did revenue decrease in HCMC this month?",
  "context": {
    "region": "HCMC"
  }
}`,
    responseSample: `{
  "answer": "Revenue in HCMC declined compared with the prior period, driven by lower transaction volume and SKU mix shifts.",
  "intent": {
    "action": "explain",
    "metric": "revenue",
    "dimension": "product",
    "period": "this_month",
    "filters": { "region": "HCMC", "grain": "daily" }
  },
  "chart": {
    "type": "bar",
    "x": "name",
    "y": "revenue_delta"
  },
  "trace": {
    "tool": "explain_metric_change",
    "provider": "local_rules",
    "range": ["2026-09-01", "2026-09-30"],
    "sources": ["sales_transactions", "products"],
    "formulas": { "revenue": "SUM(quantity * unit_price * (1 - discount_pct))" }
  }
}`,
  },
  {
    method: 'GET',
    path: '/anomalies',
    summary: 'List observed business anomalies',
    description: 'Fetches statistical anomalies detected across revenue, margin, Facebook spend/ROAS/conversion, and stockout risk using a 56-day shifted rolling window (Isolation Forest, IQR, robust Z-score) and business rules.',
    role: 'viewer',
    queryParams: [
      { name: 'start', type: 'date', required: false, description: 'Start date filter' },
      { name: 'end', type: 'date', required: false, description: 'End date filter' },
      { name: 'severity', type: 'string (critical|high|medium)', required: false, description: 'Filter by alert severity' },
    ],
    responseSample: `{
  "rows": [
    {
      "id": "anom_revenue_20260903",
      "metric": "revenue",
      "start": "2026-09-03",
      "end": "2026-09-30",
      "severity": "critical",
      "score": 92,
      "actual": 28615000,
      "baseline": 48500000,
      "deviation": -0.41,
      "scope": "all"
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/forecast',
    summary: 'Chronological sales & demand forecast',
    description: 'Generates 7- or 30-day forecasts with 90% empirical validation-residual intervals using LightGBM or rolling baselines across 17 point-in-time features.',
    role: 'viewer',
    requestBody: `{
  "target": "demand",
  "product": "P001",
  "horizon": 30
}`,
    responseSample: `{
  "target": "demand",
  "scope": "sku:P001",
  "horizon": 30,
  "model_version": "dp-1.1",
  "interval_method": "Empirical validation residual quantiles split by lead bucket (90% nominal)",
  "prediction": [
    { "date": "2026-10-01", "value": 6.4, "lower": 1.2, "upper": 12.1 }
  ],
  "metrics": {
    "selected": "lightgbm",
    "test_coverage": 0.9286,
    "test": {
      "lightgbm": { "mae": 2.68, "wape": 0.4187 }
    }
  }
}`,
  },
  {
    method: 'POST',
    path: '/simulate',
    summary: 'Microeconomic scenario simulator',
    description: 'Discriminated union supporting price, marketing, and inventory counterfactual scenarios over 7- or 30-day horizons.',
    role: 'viewer',
    requestBody: `{
  "type": "price",
  "objective": "profit",
  "horizon": 30,
  "parameters": {
    "product": "P001",
    "discounts": [0, 0.05, 0.10]
  }
}`,
    responseSample: `{
  "simulation_id": "a7f3c819d4e2...",
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "decision": "pending",
  "type": "price",
  "objective": "profit",
  "baseline": {
    "name": "Current realized price",
    "demand": 192.4,
    "fulfilled": 192.4,
    "revenue": 479076000,
    "profit": 161616000
  },
  "alternatives": [
    {
      "name": "5% list discount",
      "demand": 203.0,
      "fulfilled": 203.0,
      "revenue": 480196500,
      "profit": 145246500
    }
  ],
  "evidence": { "product": "P001", "forecast": "dp-1.1", "elasticity": -1.1 }
}`,
  },
  {
    method: 'GET',
    path: '/recommendations',
    summary: 'AI-generated prescriptive business decisions',
    description: 'Lists ranked recommendations synthesized from active anomalies, forecasts, and counterfactual checks with uncertainty disclosures.',
    role: 'viewer',
    responseSample: `{
  "rows": [
    {
      "id": "rec_stockout_p001",
      "priority": "high",
      "decision": "pending",
      "title": "Replenish SmartDesk Mini (P001) to prevent stockout",
      "action": "Schedule supplier order covering lead-time demand buffer.",
      "assumptions": ["Catalog lead_time_days and 30-day forecast"],
      "risk": "Extended replenishment lead times could amplify lost sales."
    }
  ],
  "dataset_id": "f32e87e3a5744333ff98d3bf"
}`,
  },
  {
    method: 'POST',
    path: '/recommendations/feedback',
    summary: 'Human-in-the-loop decision acceptance/rejection',
    description: 'Records executive acceptance or rejection (accepted | rejected) into the append-only audit ledger pinned to dataset_id.',
    role: 'analyst',
    requestBody: `{
  "recommendation_id": "rec_stockout_p001",
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "decision": "accepted"
}`,
    responseSample: `{
  "id": 142,
  "decision": "accepted",
  "status": "recorded"
}`,
  },
  {
    method: 'GET',
    path: '/audit',
    summary: 'Query append-only audit ledger',
    description: 'Inspects sequential log of human decisions and system events.',
    role: 'viewer',
    queryParams: [
      { name: 'limit', type: 'integer (1-100)', required: false, description: 'Number of rows to return (default: 25)' },
      { name: 'kind', type: 'string', required: false, description: 'Filter by "decisions", "recommendation_feedback", "scenario_feedback"' },
    ],
    responseSample: `{
  "rows": [
    {
      "id": 142,
      "occurred_at": "2026-11-06T13:45:00Z",
      "kind": "recommendation_feedback",
      "subject": "rec_stockout_p001",
      "payload": {
        "actor": "executive@decisionpilot.ai",
        "decision": "accepted",
        "dataset_id": "f32e87e3a5744333ff98d3bf"
      }
    }
  ],
  "next_before": null
}`,
  },
]

