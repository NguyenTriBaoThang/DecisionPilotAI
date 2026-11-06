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
    description: 'Fetches distinct sales regions, distribution channels, customer segments, and product categories for UI selection.',
    role: 'viewer',
    responseSample: `{
  "regions": ["Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ"],
  "channels": ["Direct Store", "Shopee Mall", "TikTok Shop", "Website Direct"],
  "categories": ["Electronics", "Office Furniture", "Accessories", "Services"],
  "segments": ["Retail New", "Retail VIP", "SME Wholesale", "Corporate"]
}`,
  },
  {
    method: 'GET',
    path: '/kpi/summary',
    summary: 'Topline executive KPIs & breakdowns',
    description: 'Aggregates total gross revenue, profit, unit counts, margin %, and channel attribution over the filtered date range.',
    role: 'viewer',
    queryParams: [
      { name: 'start', type: 'date (YYYY-MM-DD)', required: false, description: 'Start date filter' },
      { name: 'end', type: 'date (YYYY-MM-DD)', required: false, description: 'End date filter' },
      { name: 'region', type: 'string', required: false, description: 'Region filter (e.g. "Hồ Chí Minh")' },
      { name: 'channel', type: 'string', required: false, description: 'Sales channel filter' },
    ],
    responseSample: `{
  "total_revenue": 1428500000,
  "gross_profit": 524000000,
  "gross_margin": 0.3668,
  "total_orders": 3420,
  "average_order_value": 417690,
  "top_products": [
    { "sku": "P001", "name": "SmartDesk Mini", "revenue": 420000000, "gross_profit": 168000000, "units": 420, "margin": 0.40 },
    { "sku": "P003", "name": "FocusCam Pro", "revenue": 310000000, "gross_profit": 108500000, "units": 248, "margin": 0.35 }
  ],
  "channel_breakdown": [
    { "name": "Shopee Mall", "revenue": 620000000, "roas": 4.59 },
    { "name": "Direct Store", "revenue": 485000000, "roas": 3.05 }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/query',
    summary: 'Ask AI Copilot natural language query',
    description: 'Translates Vietnamese/English executive queries into validated read-only SQL, executes against data, and produces grounded analytical answers with chart configs.',
    role: 'viewer',
    requestBody: `{
  "question": "Tại sao doanh thu tháng 10/2026 tại chi nhánh TP.HCM lại giảm so với tháng 9?",
  "session_id": "sess_89f1a2"
}`,
    responseSample: `{
  "answer": "Doanh thu tháng 10/2026 tại TP.HCM đạt 318,000,000 ₫ (-24.3% so với tháng 9). Nguyên nhân chính xuất phát từ sản phẩm P003 (FocusCam Pro) bị đứt hàng cục bộ từ ngày 12/10 đến 25/10 khiến doanh thu SKU này giảm 68%, kết hợp với chi phí quảng cáo Facebook Ads tăng 1.85x nhưng tỷ lệ chuyển đổi giảm từ 25% xuống 5.5%.",
  "sql": "SELECT p.sku, p.name, SUM(s.gross_revenue) as rev FROM sales_transactions s JOIN products p ON s.product_id=p.id WHERE s.region='Hồ Chí Minh' AND s.transaction_date BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY p.sku, p.name ORDER BY rev DESC",
  "chart": {
    "type": "bar",
    "x_key": "name",
    "y_key": "rev",
    "title": "Doanh thu theo sản phẩm tại TP.HCM (Tháng 10/2026)"
  },
  "trace": {
    "tool": "sql_analytical_engine",
    "execution_ms": 142.5,
    "grounded": true
  }
}`,
  },
  {
    method: 'GET',
    path: '/anomalies',
    summary: 'List observed business anomalies',
    description: 'Fetches statistical anomalies detected across daily revenue, order volumes, inventory depletions, and marketing ROAS using Isolation Forest and Z-score hybrids.',
    role: 'viewer',
    queryParams: [
      { name: 'start', type: 'date', required: false, description: 'Start date filter' },
      { name: 'end', type: 'date', required: false, description: 'End date filter' },
      { name: 'severity', type: 'string (critical|high|medium)', required: false, description: 'Filter by alert severity' },
    ],
    responseSample: `{
  "rows": [
    {
      "id": "alt_rev_20260903",
      "metric": "revenue",
      "date": "2026-09-03",
      "severity": "critical",
      "z_score": -3.84,
      "expected_value": 48500000,
      "actual_value": 28615000,
      "summary": "Doanh thu ngày giảm 41% dưới ngưỡng dự báo; suy giảm lưu lượng đơn hàng tại TP.HCM."
    },
    {
      "id": "alt_mkt_20260905",
      "metric": "facebook_roas",
      "date": "2026-09-05",
      "severity": "high",
      "z_score": -2.92,
      "expected_value": 4.12,
      "actual_value": 1.25,
      "summary": "ROAS Facebook Ads sụt giảm mạnh do chi tiêu tăng đột biến nhưng chuyển đổi giảm."
    }
  ],
  "result_type": "observed alerts"
}`,
  },
  {
    method: 'POST',
    path: '/forecast',
    summary: 'Chronological sales & demand forecast',
    description: 'Generates 30-day chronological forecasts with 90% confidence bands using LightGBM and rolling seasonal features.',
    role: 'viewer',
    requestBody: `{
  "horizon_days": 30,
  "scope": "all",
  "target": "revenue",
  "confidence_interval": 0.90
}`,
    responseSample: `{
  "target": "revenue",
  "scope": "all",
  "model_used": "moving_average_ensemble",
  "horizon_days": 30,
  "forecasts": [
    { "date": "2026-10-01", "predicted": 48200000, "lower_bound": 41200000, "upper_bound": 55100000 },
    { "date": "2026-10-02", "predicted": 51400000, "lower_bound": 43800000, "upper_bound": 58900000 }
  ],
  "historical_wape": 0.1124,
  "test_interval_coverage": 0.8381
}`,
  },
  {
    method: 'POST',
    path: '/simulate',
    summary: 'Microeconomic scenario simulator',
    description: 'Simulates business outcomes under pricing changes, discount shifts, marketing spend reallocations, and inventory restock buffers using microeconomic elasticity curves.',
    role: 'viewer',
    requestBody: `{
  "price_change_pct": -5.0,
  "marketing_budget_multiplier": 1.2,
  "inventory_buffer_days": 15,
  "target_sku": "P001"
}`,
    responseSample: `{
  "simulation_id": "sim_7d8a9f02c4b1e5",
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "decision": "pending",
  "baseline": {
    "revenue": 420000000,
    "gross_profit": 168000000,
    "units": 420,
    "stockout_probability": 0.12
  },
  "projected": {
    "revenue": 462500000,
    "gross_profit": 178200000,
    "units": 492,
    "stockout_probability": 0.04
  },
  "delta": {
    "revenue_pct": 10.12,
    "profit_pct": 6.07,
    "units_pct": 17.14
  },
  "elasticity_coefficient": -1.42,
  "recommended": true
}`,
  },
  {
    method: 'GET',
    path: '/recommendations',
    summary: 'AI-generated prescriptive business decisions',
    description: 'Lists ranked recommendations with quantified upside, risk factors, underlying evidence, and user decision status.',
    role: 'viewer',
    responseSample: `{
  "rows": [
    {
      "id": "rec_price_p001_01",
      "category": "pricing",
      "title": "Áp dụng giảm giá 5% cho SKU SmartDesk Mini (P001)",
      "impact_revenue_vnd": 42500000,
      "impact_profit_vnd": 10200000,
      "confidence": 0.88,
      "status": "pending",
      "supporting_evidence": "Hệ số co giãn giá P001 là -1.42 (co giãn cao). Dự báo nhu cầu sẽ tăng +17.1%, bù đắp hoàn toàn tỷ lệ giảm giá 5% và mang lại 10.2 triệu ₫ lợi nhuận ròng bổ sung.",
      "risks": "Cần đảm bảo tồn kho tối thiểu 120 chiếc để tránh rủi ro đứt hàng khi lượng đặt tăng nhanh."
    }
  ],
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "result_type": "business recommendation"
}`,
  },
  {
    method: 'POST',
    path: '/recommendations/feedback',
    summary: 'Human-in-the-loop decision approval/rejection',
    description: 'Records executive approval or dismissal of a recommendation into immutable audit ledger with dataset version lock.',
    role: 'analyst',
    requestBody: `{
  "recommendation_id": "rec_price_p001_01",
  "dataset_id": "f32e87e3a5744333ff98d3bf",
  "decision": "approved",
  "note": "Phê duyệt chiến dịch ưu đãi 5% cho SmartDesk Mini bắt đầu từ tuần tới."
}`,
    responseSample: `{
  "id": 142,
  "decision": "approved",
  "status": "recorded"
}`,
  },
  {
    method: 'GET',
    path: '/audit',
    summary: 'Query tamper-evident audit ledger',
    description: 'Inspects sequential log of all user natural language queries, simulation runs, dataset imports, and executive approvals.',
    role: 'viewer',
    queryParams: [
      { name: 'limit', type: 'integer (1-100)', required: false, description: 'Number of rows to return (default: 25)' },
      { name: 'kind', type: 'string', required: false, description: 'Filter by "query", "recommendation_feedback", "scenario_feedback"' },
    ],
    responseSample: `{
  "rows": [
    {
      "id": 142,
      "occurred_at": "2026-11-06T13:45:00Z",
      "kind": "recommendation_feedback",
      "subject": "rec_price_p001_01",
      "payload": {
        "actor": "executive@decisionpilot.ai",
        "decision": "approved",
        "dataset_id": "f32e87e3a5744333ff98d3bf"
      }
    }
  ],
  "next_before": null
}`,
  },
]

