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
    description: 'Verifies database connectivity, active dialect, loaded dataset status, and model artifact readiness. Returns minimal {"status": "ok"} when auth is enabled and unauthenticated.',
    role: 'public',
    responseSample: `{
  "status": "ok",
  "database": "ok",
  "database_dialect": "sqlite",
  "dataset_ready": true,
  "model_ready": true,
  "model_version": "f32e87e3a574"
}`,
  },
  {
    method: 'GET',
    path: '/session',
    summary: 'Current caller identity & permissions',
    description: 'Returns authenticated actor, workspace role (viewer, analyst, admin), auth mode ("token" | "local"), and CSV snapshot import flag.',
    role: 'viewer',
    responseSample: `{
  "actor": "analyst@decisionpilot.ai",
  "role": "analyst",
  "authentication": "local",
  "import_enabled": false
}`,
  },
  {
    method: 'GET',
    path: '/dataset',
    summary: 'Active business dataset metadata',
    description: 'Inspects loaded dataset SHA-24 ID, date window (2024-10-01 to 2026-09-30), currency (VND), timezone, and verified row counts across all 6 business tables.',
    role: 'viewer',
    responseSample: `{
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "title": "Synthetic SME retail & services demo",
  "currency": "VND",
  "timezone": "Asia/Ho_Chi_Minh",
  "start": "2024-10-01",
  "end": "2026-09-30",
  "counts": {
    "calendar_events": 730,
    "products": 50,
    "customers": 10000,
    "marketing_campaigns": 2920,
    "sales_transactions": 50000,
    "inventory_daily": 24820
  }
}`,
  },
  {
    method: 'GET',
    path: '/options',
    summary: 'Available dashboard filter options',
    description: 'Fetches distinct categories, regions, sales channels, marketing channels, customer segments, products, and bounds for UI filters.',
    role: 'viewer',
    responseSample: `{
  "regions": ["Can Tho", "Da Nang", "HCMC", "Hanoi"],
  "channels": ["B2B", "Online", "Retail"],
  "marketing_channels": ["Email", "Facebook Ads", "Google Ads", "TikTok Ads"],
  "segments": ["Enterprise", "Retail", "SME", "VIP"],
  "categories": ["Audio & Video", "IT Services", "Networking", "Office Furniture", "Peripherals", "Workstations"],
  "date_bounds": { "min": "2024-10-01", "max": "2026-09-30" }
}`,
  },
  {
    method: 'GET',
    path: '/models/quality',
    summary: 'Model evaluation & validation gate ledger',
    description: 'Returns chronological Train/Val/Test metrics from artifacts/<dataset_id>.joblib (WAPE, MAE, 90% PI coverage, and validation MAE gate decision).',
    role: 'viewer',
    responseSample: `{
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "version": "f32e87e3a574",
  "forecast": {
    "revenue": {
      "selected_model": "seasonal_moving_average",
      "test_wape": 0.2414,
      "test_interval_coverage": 0.8381,
      "validation_gate_passed": false
    },
    "top_product_P001": {
      "selected_model": "lightgbm",
      "test_wape": 0.3016,
      "test_interval_coverage": 0.9286,
      "validation_gate_passed": true
    }
  }
}`,
  },
  {
    method: 'GET',
    path: '/kpi/summary',
    summary: 'Topline executive KPIs & breakdowns',
    description: 'Aggregates gross revenue, profit, margin %, order count, AOV, category/channel mix, and top/bottom SKUs for optional date, region, category, channel, segment, product, and grain filters.',
    role: 'viewer',
    queryParams: [
      { name: 'start', type: 'date (YYYY-MM-DD)', required: false, description: 'Start date filter' },
      { name: 'end', type: 'date (YYYY-MM-DD)', required: false, description: 'End date filter' },
      { name: 'region', type: 'string', required: false, description: 'Region filter (HCMC, Hanoi, Da Nang, Can Tho)' },
      { name: 'channel', type: 'string', required: false, description: 'Sales channel filter (Online, Retail, B2B)' },
      { name: 'category', type: 'string', required: false, description: 'Product category filter' },
      { name: 'grain', type: 'daily|weekly|monthly', required: false, description: 'Series aggregation grain (default: daily)' },
    ],
    responseSample: `{
  "kpis": {
    "revenue": 1428500000,
    "gross_profit": 524000000,
    "margin": 0.3668,
    "orders": 1850,
    "units": 3140,
    "aov": 772162
  },
  "top_products": [
    { "product_id": "P001", "product_name": "Ergonomic Standing Desk Pro", "revenue": 420000000, "gross_profit": 168000000, "units": 420 }
  ],
  "channel_breakdown": [
    { "channel": "Online", "revenue": 685000000, "orders": 940 },
    { "channel": "Retail", "revenue": 463000000, "orders": 620 },
    { "channel": "B2B", "revenue": 280500000, "orders": 290 }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/query',
    summary: 'Ask AI Copilot natural language query',
    description: 'Classifies Vietnamese/English questions into typed Intent schemas (local rule parser by default; Gemini/OpenAI optional), routes to fixed read-only analytics tools, and refuses unsupported or SQL-like inputs.',
    role: 'viewer',
    requestBody: `{
  "question": "Why did revenue drop in HCMC last month?",
  "context": {
    "region": "HCMC"
  }
}`,
    responseSample: `{
  "answer": "Revenue declined in HCMC during the selected window alongside stockout pressure on top SKUs and weaker paid ad conversion.",
  "intent": {
    "action": "explain",
    "metric": "revenue",
    "dimension": "product",
    "period": "last_month",
    "filters": { "region": "HCMC", "grain": "daily" }
  },
  "chart": {
    "type": "bar",
    "title": "Revenue Drivers by Product (HCMC)",
    "data": [{ "label": "P003", "value": -42100000 }]
  },
  "evidence": {
    "period": { "start": "2026-08-01", "end": "2026-08-31" },
    "top_contributors": [{ "product_id": "P003", "delta": -42100000 }]
  },
  "trace": {
    "tool": "explain_change",
    "parser": "local_rules",
    "grounded": true,
    "execution_ms": 142
  }
}`,
  },
  {
    method: 'GET',
    path: '/anomalies',
    summary: 'List observed business anomalies',
    description: 'Fetches statistical anomalies across revenue, profit, marketing ROAS, and inventory depletions using 56-day trailing baseline + IQR/robust Z-score + Isolation Forest.',
    role: 'viewer',
    queryParams: [
      { name: 'start', type: 'date', required: false, description: 'Start date filter' },
      { name: 'end', type: 'date', required: false, description: 'End date filter' },
      { name: 'severity', type: 'critical|high|medium', required: false, description: 'Filter by alert severity' },
      { name: 'limit', type: 'integer (1-100)', required: false, description: 'Max rows to return (default: 40)' },
    ],
    responseSample: `{
  "rows": [
    {
      "id": "rev_2026-09-03",
      "metric": "revenue",
      "date": "2026-09-03",
      "severity": "critical",
      "observed_value": 28615000,
      "expected_value": 48500000,
      "delta_pct": -0.41,
      "summary": "Daily revenue fell 41% below trailing 56-day baseline; top product stockout + conversion drop."
    }
  ],
  "result_type": "observed alerts"
}`,
  },
  {
    method: 'GET',
    path: '/anomalies/{alert_id}',
    summary: 'Inspect anomaly root-cause breakdown',
    description: 'Returns contextual breakdown and product/channel contributors for a specific alert ID within the optional date window.',
    role: 'viewer',
    queryParams: [
      { name: 'start', type: 'date', required: false, description: 'Start date filter' },
      { name: 'end', type: 'date', required: false, description: 'End date filter' },
    ],
    responseSample: `{
  "alert": { "id": "rev_2026-09-03", "metric": "revenue", "severity": "critical" },
  "contributors": [
    { "dimension": "product", "key": "P003", "delta_vnd": -12400000, "note": "Stockout on 2026-09-03" }
  ],
  "investigate_question": "Why did revenue drop around 2026-09-03?"
}`,
  },
  {
    method: 'POST',
    path: '/forecast',
    summary: 'Chronological sales & demand forecast',
    description: 'Generates 7-day or 30-day chronological forecasts with 90% prediction intervals using the artifact-selected model (LightGBM or seasonal MA baseline).',
    role: 'viewer',
    requestBody: `{
  "target": "demand",
  "product": "P001",
  "horizon": 30
}`,
    responseSample: `{
  "target": "demand",
  "scope": { "product": "P001", "category": null },
  "horizon": 30,
  "model_used": "lightgbm",
  "quality": { "wape": 0.3016, "coverage_90": 0.9286 },
  "series": [
    { "date": "2026-10-01", "forecast": 14, "lower": 9, "upper": 19 },
    { "date": "2026-10-02", "forecast": 15, "lower": 10, "upper": 20 }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/simulate',
    summary: 'Microeconomic scenario simulator',
    description: 'Discriminated-union endpoint accepting "price", "marketing", or "inventory" parameters. Persists each run under a deterministic SHA-256 simulation_id.',
    role: 'viewer',
    requestBody: `{
  "type": "price",
  "objective": "profit",
  "horizon": 30,
  "parameters": {
    "product": "P001",
    "discounts": [0, 0.05, 0.10],
    "elasticity": -1.35,
    "additional_cost": 0
  }
}`,
    responseSample: `{
  "simulation_id": "6f3e8c2b...",
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "decision": "pending",
  "recommended": "5% discount",
  "assumptions": ["Elasticity anchored to product catalog (-1.35)", "Unmodeled competitor price reaction"],
  "scenarios": [
    { "label": "0% discount", "revenue": 420000000, "gross_profit": 168000000, "stockout_risk": 0.04 },
    { "label": "5% discount", "revenue": 451200000, "gross_profit": 173900000, "stockout_risk": 0.06 }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/scenarios/feedback',
    summary: 'Record scenario decision (with optional linked recommendation)',
    description: 'Records executive acceptance or rejection of a persisted simulation run. When recommendation_id is supplied, writes both scenario_feedback and recommendation_feedback in the same database transaction.',
    role: 'analyst',
    requestBody: `{
  "simulation_id": "6f3e8c2b91a4d7c10e82a5f4c3d9e1b2a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2",
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "decision": "accepted",
  "recommendation_id": "rec_price_P001"
}`,
    responseSample: `{
  "id": 143,
  "decision": "accepted",
  "status": "recorded"
}`,
  },
  {
    method: 'GET',
    path: '/recommendations',
    summary: 'Prescriptive business decisions',
    description: 'Lists ranked recommendations anchored to live dataset metrics, with upside estimates, assumptions, risk notes, and latest persisted decision.',
    role: 'viewer',
    responseSample: `{
  "rows": [
    {
      "id": "rec_price_P001",
      "category": "pricing",
      "title": "Test 5% promotion on P001",
      "decision": "pending",
      "scenario_preset": { "type": "price", "objective": "profit", "horizon": 30, "parameters": { "product": "P001", "discounts": [0, 0.05, 0.10] } }
    }
  ],
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "result_type": "business recommendation"
}`,
  },
  {
    method: 'POST',
    path: '/recommendations/feedback',
    summary: 'Record recommendation approval/rejection',
    description: 'Appends an immutable recommendation_feedback row to audit_events locked to the active dataset_id.',
    role: 'analyst',
    requestBody: `{
  "recommendation_id": "rec_price_P001",
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
    description: 'Inspects paginated audit_events rows with cursor pagination (before) across queries, dataset loads, and scenario/recommendation decisions.',
    role: 'viewer',
    queryParams: [
      { name: 'limit', type: 'integer (1-100)', required: false, description: 'Number of rows to return (default: 25)' },
      { name: 'kind', type: 'query|dataset_loaded|recommendation_feedback|scenario_feedback|decisions', required: false, description: 'Filter by event kind ("decisions" returns both feedback types)' },
      { name: 'before', type: 'integer (>= 1)', required: false, description: 'Cursor event ID for backward pagination' },
    ],
    responseSample: `{
  "rows": [
    {
      "id": 142,
      "occurred_at": "2026-11-11T08:45:00Z",
      "kind": "recommendation_feedback",
      "subject": "rec_price_P001",
      "payload": {
        "actor": "analyst@decisionpilot.ai",
        "decision": "accepted",
        "dataset_id": "f32e87e3a5744333ff98d3bf"
      }
    }
  ],
  "next_before": null
}`,
  },
  {
    method: 'POST',
    path: '/import',
    summary: 'Replace dataset snapshot from ZIP archive',
    description: 'Admin-only endpoint (requires DEMO_ALLOW_IMPORT=true, matching X-Import-Token header, and expected_dataset_id optimistic lock) to ingest a validated 6-CSV ZIP upload up to 40 MiB.',
    role: 'admin',
    queryParams: [
      { name: 'filename', type: 'string (1..150)', required: true, description: 'Uploaded archive filename' },
      { name: 'expected_dataset_id', type: 'empty | 24-hex', required: true, description: 'Optimistic lock matching current dataset_id' },
    ],
    responseSample: `{
  "dataset_id": "a1b2c3d4e5f6789012345678",
  "status": "loaded"
}`,
  },
]
