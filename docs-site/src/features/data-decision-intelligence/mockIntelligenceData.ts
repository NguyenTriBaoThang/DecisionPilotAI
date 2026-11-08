/**
 * Documented Demo Result — Synthetic Dataset
 * Source of truth: artifacts/query_benchmark.json, artifacts/MODEL_EVALUATION.md,
 * artifacts/data_quality.json, and artifacts/scenario_backtest.json.
 *
 * This data is statically compiled for GitHub Pages demonstration with verified ground truth.
 */

export interface QuerySample {
  id: string
  question: string
  intent: string
  sql: string
  answer: string
  latencyMs: number
  chartType: 'bar' | 'line' | 'table'
  chartData: { label: string; value: number; secondary?: number }[]
  sources: string[]
  formulas: string[]
}

export const SAMPLE_QUERIES: QuerySample[] = [
  {
    id: 'q1',
    question: 'How is our business performing this month?',
    intent: 'executive_kpi_summary',
    sql: `SELECT 
  SUM(gross_revenue) AS total_revenue,
  SUM(gross_revenue - cogs) AS gross_profit,
  ROUND(SUM(gross_revenue - cogs)::numeric / NULLIF(SUM(gross_revenue), 0), 4) AS gross_margin,
  COUNT(DISTINCT id) AS total_orders
FROM sales_transactions
WHERE transaction_date BETWEEN '2026-09-01' AND '2026-09-30';`,
    answer:
      'Total gross revenue in September 2026 reached 1,428,500,000 ₫ with a gross profit of 524,000,000 ₫ (gross margin: 36.68%) across 3,420 completed orders. While revenue contracted -24.3% in the latter half of the month due to localized stockouts in HCMC, average order value remained resilient at 417,690 ₫.',
    latencyMs: 1432,
    chartType: 'bar',
    chartData: [
      { label: 'Shopee Mall', value: 620000000 },
      { label: 'Direct Store', value: 485000000 },
      { label: 'TikTok Shop', value: 215000000 },
      { label: 'Website Direct', value: 108500000 },
    ],
    sources: ['sales_transactions', 'calendar_events'],
    formulas: [
      'gross_profit = gross_revenue - cogs',
      'gross_margin = gross_profit / gross_revenue',
      'aov = total_revenue / total_orders',
    ],
  },
  {
    id: 'q2',
    question: 'Why did revenue decrease?',
    intent: 'diagnostic_root_cause_analysis',
    sql: `SELECT 
  p.sku,
  p.name,
  SUM(s.gross_revenue) AS revenue_sept,
  SUM(s.units) AS units_sold
FROM sales_transactions s
JOIN products p ON s.product_id = p.id
WHERE s.region = 'Hồ Chí Minh'
  AND s.transaction_date BETWEEN '2026-09-01' AND '2026-09-30'
GROUP BY p.sku, p.name
ORDER BY revenue_sept DESC;`,
    answer:
      'Root cause diagnosis identifies two simultaneous drivers: (1) SKU P003 (FocusCam Pro) suffered a 14-day supply stockout in the HCMC branch between Sept 12–25, causing a 68% drop in SKU sales (-62,000,000 ₫). (2) Facebook Ads spend increased 1.85x while visitor conversion rate dropped from 25% to 5.5%, eroding marketing ROAS from 4.12x down to 1.25x.',
    latencyMs: 2309,
    chartType: 'bar',
    chartData: [
      { label: 'P001 SmartDesk Mini', value: 420000000 },
      { label: 'P002 ErgoChair Air', value: 280000000 },
      { label: 'P003 FocusCam Pro (Stockout)', value: 108500000 },
      { label: 'P004 UltraCable Type-C', value: 95000000 },
    ],
    sources: ['sales_transactions', 'inventory_daily', 'marketing_campaigns'],
    formulas: [
      'revenue_delta = revenue_t - revenue_baseline',
      'roas = attributed_revenue / ad_spend',
      'conversion_rate = orders / clicks',
    ],
  },
  {
    id: 'q3',
    question: 'Which products generate the highest profit?',
    intent: 'product_profitability_leaderboard',
    sql: `SELECT 
  p.sku,
  p.name,
  p.category,
  SUM(s.gross_revenue - s.cogs) AS gross_profit,
  ROUND(SUM(s.gross_revenue - s.cogs)::numeric / NULLIF(SUM(s.gross_revenue), 0), 4) AS margin
FROM sales_transactions s
JOIN products p ON s.product_id = p.id
GROUP BY p.sku, p.name, p.category
ORDER BY gross_profit DESC
LIMIT 5;`,
    answer:
      'SKU P001 (SmartDesk Mini) is the top profit driver, generating 168,000,000 ₫ in gross profit (40.0% margin, 420 units sold). It is followed by P002 (ErgoChair Air) with 112,000,000 ₫ gross profit (40.0% margin) and P003 (FocusCam Pro) with 108,500,000 ₫ (35.0% margin).',
    latencyMs: 1729,
    chartType: 'bar',
    chartData: [
      { label: 'SmartDesk Mini (P001)', value: 168000000, secondary: 420000000 },
      { label: 'ErgoChair Air (P002)', value: 112000000, secondary: 280000000 },
      { label: 'FocusCam Pro (P003)', value: 108500000, secondary: 310000000 },
      { label: 'SoundBar Ultra (P005)', value: 84000000, secondary: 240000000 },
    ],
    sources: ['sales_transactions', 'products'],
    formulas: ['gross_profit = gross_revenue - cogs', 'margin = gross_profit / gross_revenue'],
  },
  {
    id: 'q4',
    question: 'Which region performs best?',
    intent: 'regional_sales_breakdown',
    sql: `SELECT 
  region,
  SUM(gross_revenue) AS total_revenue,
  COUNT(id) AS total_orders,
  ROUND(AVG(gross_revenue), 0) AS avg_ticket
FROM sales_transactions
GROUP BY region
ORDER BY total_revenue DESC;`,
    answer:
      'Hồ Chí Minh represents the largest market, contributing 685,000,000 ₫ (47.9% of total revenue) across 1,620 orders. Hà Nội follows with 480,000,000 ₫ (33.6%), and Đà Nẵng contributes 263,500,000 ₫ (18.5%). HCMC exhibits the highest average ticket size at 422,840 ₫.',
    latencyMs: 1145,
    chartType: 'bar',
    chartData: [
      { label: 'Hồ Chí Minh', value: 685000000 },
      { label: 'Hà Nội', value: 480000000 },
      { label: 'Đà Nẵng', value: 263500000 },
    ],
    sources: ['sales_transactions', 'customers'],
    formulas: ['regional_share = regional_revenue / total_revenue'],
  },
]

export interface AnomalyIncident {
  id: string
  metric: string
  label: string
  date: string
  severity: 'critical' | 'high' | 'medium'
  observedValue: string
  expectedValue: string
  deviationPct: string
  zScore: number
  contributingFactors: string[]
  suggestedAction: string
}

export const ANOMALY_INCIDENTS: AnomalyIncident[] = [
  {
    id: 'anom-01',
    metric: 'revenue',
    label: 'Revenue Collapse (HCMC Market)',
    date: '2026-09-03 to 2026-09-30',
    severity: 'critical',
    observedValue: '28,615,000 ₫ / day',
    expectedValue: '48,500,000 ₫ / day',
    deviationPct: '-41.0%',
    zScore: -3.84,
    contributingFactors: [
      'Demand traffic multiplier dropped to 0.59x',
      'HCMC SKU delivery allocation reduced by 74%',
      'Returning customer segment share fell from 44% to 20%',
    ],
    suggestedAction:
      'Trigger promotional discount on elastic inventory (P001) and reallocate ad budget to Hà Nội retail.',
  },
  {
    id: 'anom-02',
    metric: 'facebook_spend',
    label: 'Facebook Ads Spend Surge',
    date: '2026-09-03 to 2026-09-30',
    severity: 'critical',
    observedValue: '48,200,000 ₫ / week',
    expectedValue: '26,000,000 ₫ / week',
    deviationPct: '+85.4%',
    zScore: 3.42,
    contributingFactors: [
      'Automated campaign bidding scaled budget by 1.85x without conversion cap',
      'High impression volume with saturated creative fatigue',
    ],
    suggestedAction:
      'Cap daily Facebook ad budget at 4,000,000 ₫ and shift capital to Google Search and Shopee Mall ads.',
  },
  {
    id: 'anom-03',
    metric: 'facebook_roas',
    label: 'Facebook Advertising ROAS Drop',
    date: '2026-09-05',
    severity: 'high',
    observedValue: '1.25x ROAS',
    expectedValue: '4.12x ROAS',
    deviationPct: '-69.6%',
    zScore: -2.92,
    contributingFactors: [
      'Online Facebook attribution probability fell from 25% to 5.5%',
      'Ad click traffic had lower intent with high bounce rate',
    ],
    suggestedAction:
      'Refresh ad creatives, retarget high-intent basket abandoners instead of broad cold traffic.',
  },
  {
    id: 'anom-04',
    metric: 'stockout_risk',
    label: 'FocusCam Pro (P003) Supply Stockout',
    date: '2026-07-12 to 2026-08-18',
    severity: 'high',
    observedValue: '0 units in stock',
    expectedValue: '85 units safety buffer',
    deviationPct: '-100.0%',
    zScore: -3.15,
    contributingFactors: [
      'Supplier port customs delay interrupted replenishment for 37 days',
      'Backorders accumulated without fulfillment availability',
    ],
    suggestedAction:
      'Establish secondary regional supplier and increase safety stock lead-time buffer to 20 days.',
  },
  {
    id: 'anom-05',
    metric: 'margin',
    label: 'Promotional Margin Compression',
    date: '2026-09-27 to 2026-09-30',
    severity: 'medium',
    observedValue: '26.8% gross margin',
    expectedValue: '36.7% baseline margin',
    deviationPct: '-27.0%',
    zScore: -2.18,
    contributingFactors: [
      'Four promotional days executed with cumulative 10% stackable discount vouchers',
      'Increased volume failed to fully offset steep percentage price reduction',
    ],
    suggestedAction:
      'Restrict deep discounting to products with confirmed elastic demand (|ε| > 1.2).',
  },
]

export interface ForecastPoint {
  date: string
  actual?: number
  predicted?: number
  lowerBound?: number
  upperBound?: number
}

export const FORECAST_CHRONOLOGICAL_DATA: ForecastPoint[] = [
  // 14 days historical
  { date: 'Sep 17', actual: 48500000 },
  { date: 'Sep 18', actual: 51200000 },
  { date: 'Sep 19', actual: 53800000 },
  { date: 'Sep 20', actual: 49100000 },
  { date: 'Sep 21', actual: 42300000 },
  { date: 'Sep 22', actual: 44100000 },
  { date: 'Sep 23', actual: 46800000 },
  { date: 'Sep 24', actual: 47900000 },
  { date: 'Sep 25', actual: 49500000 },
  { date: 'Sep 26', actual: 52100000 },
  { date: 'Sep 27', actual: 38200000 }, // Promo dip
  { date: 'Sep 28', actual: 40100000 },
  { date: 'Sep 29', actual: 41800000 },
  { date: 'Sep 30', actual: 43500000 },
  // 14 days predicted (with 90% confidence bands)
  { date: 'Oct 01', predicted: 45200000, lowerBound: 39500000, upperBound: 50900000 },
  { date: 'Oct 02', predicted: 46800000, lowerBound: 40200000, upperBound: 53400000 },
  { date: 'Oct 03', predicted: 49100000, lowerBound: 42100000, upperBound: 56100000 },
  { date: 'Oct 04', predicted: 51400000, lowerBound: 43800000, upperBound: 59000000 },
  { date: 'Oct 05', predicted: 47200000, lowerBound: 39800000, upperBound: 54600000 },
  { date: 'Oct 06', predicted: 44900000, lowerBound: 37500000, upperBound: 52300000 },
  { date: 'Oct 07', predicted: 46100000, lowerBound: 38400000, upperBound: 53800000 },
  { date: 'Oct 08', predicted: 48300000, lowerBound: 40100000, upperBound: 56500000 },
  { date: 'Oct 09', predicted: 50200000, lowerBound: 41800000, upperBound: 58600000 },
  { date: 'Oct 10', predicted: 53500000, lowerBound: 44500000, upperBound: 62500000 },
  { date: 'Oct 11', predicted: 55200000, lowerBound: 45800000, upperBound: 64600000 },
  { date: 'Oct 12', predicted: 48100000, lowerBound: 39500000, upperBound: 56700000 },
  { date: 'Oct 13', predicted: 46900000, lowerBound: 38100000, upperBound: 55700000 },
  { date: 'Oct 14', predicted: 47800000, lowerBound: 38900000, upperBound: 56700000 },
]

export interface ScenarioComparisonRow {
  metric: string
  baseline: string
  scenarioA: string
  scenarioB: string
  deltaA: string
  deltaB: string
}

export const SCENARIO_COMPARISON_MATRIX: ScenarioComparisonRow[] = [
  {
    metric: 'Average Realized Price',
    baseline: '1,000,000 ₫',
    scenarioA: '950,000 ₫ (-5%)',
    scenarioB: '850,000 ₫ (-15%)',
    deltaA: '-5.0%',
    deltaB: '-15.0%',
  },
  {
    metric: 'Monthly Demand (Units)',
    baseline: '420 units',
    scenarioA: '492 units (+17.1%)',
    scenarioB: '584 units (+39.0%)',
    deltaA: '+17.1%',
    deltaB: '+39.0%',
  },
  {
    metric: 'Gross Revenue',
    baseline: '420,000,000 ₫',
    scenarioA: '467,400,000 ₫',
    scenarioB: '496,400,000 ₫',
    deltaA: '+11.3%',
    deltaB: '+18.2%',
  },
  {
    metric: 'COGS & Variable Costs',
    baseline: '252,000,000 ₫',
    scenarioA: '295,200,000 ₫',
    scenarioB: '350,400,000 ₫',
    deltaA: '+17.1%',
    deltaB: '+39.0%',
  },
  {
    metric: 'Projected Gross Profit',
    baseline: '168,000,000 ₫',
    scenarioA: '172,200,000 ₫',
    scenarioB: '146,000,000 ₫',
    deltaA: '+2.5% (+4.2M ₫)',
    deltaB: '-13.1% (-22.0M ₫)',
  },
  {
    metric: 'Warehouse Stockout Risk',
    baseline: '4.0%',
    scenarioA: '8.2% (Safe buffer)',
    scenarioB: '64.5% (High Depletion)',
    deltaA: 'Low',
    deltaB: 'CRITICAL',
  },
  {
    metric: 'AI Engine Decision Rating',
    baseline: 'Reference',
    scenarioA: 'RECOMMENDED (Optimal Profit)',
    scenarioB: 'REJECT (Margin Erosion & Stockout)',
    deltaA: 'Approved',
    deltaB: 'Dismissed',
  },
]

