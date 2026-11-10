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
    intent: 'kpi (this_month)',
    sql: `SELECT
  SUM(revenue) AS total_revenue,
  SUM(gross_profit) AS gross_profit,
  ROUND(SUM(gross_profit) * 1.0 / NULLIF(SUM(revenue), 0), 4) AS gross_margin,
  COUNT(DISTINCT transaction_id) AS total_orders
FROM sales_transactions
WHERE date BETWEEN '2026-09-01' AND '2026-09-30';`,
    answer:
      'Total revenue in September 2026 reached 2,861,500,000 ₫ (synthetic monthly period) with strong contribution led by Online, Retail, and B2B sales channels. During Sept 3–30, revenue dipped sharply due to an injected demand traffic contraction (-41% traffic weight) and HCMC fulfillment squeeze, while non-promotional unit economics held steady.',
    latencyMs: 1432,
    chartType: 'bar',
    chartData: [
      { label: 'Online', value: 1774130000 },
      { label: 'Retail', value: 772605000 },
      { label: 'B2B', value: 314765000 },
    ],
    sources: ['sales_transactions', 'calendar_events'],
    formulas: [
      'gross_profit = revenue - total_cost',
      'gross_margin = gross_profit / revenue',
      'aov = revenue / orders',
    ],
  },
  {
    id: 'q2',
    question: 'Why did revenue decrease?',
    intent: 'explain (revenue)',
    sql: `SELECT
  p.product_id,
  p.product_name,
  SUM(s.revenue) AS revenue_sept,
  SUM(s.quantity) AS units_sold
FROM sales_transactions s
JOIN products p ON s.product_id = p.product_id
WHERE s.region = 'HCMC'
  AND s.date BETWEEN '2026-09-01' AND '2026-09-30'
GROUP BY p.product_id, p.product_name
ORDER BY revenue_sept DESC;`,
    answer:
      'Root cause decomposition identifies compounding variances between Sept 3–30: (1) Overall traffic weight shifted to 0.59x and HCMC SKU allocation weight dropped by 74% while returning customer share fell from 44% to 20%. (2) Facebook Ads spend scaled 1.85x while attributed order share fell from 25% to 5.5%, compressing channel ROAS, alongside late-September stockout risk on SmartDesk Mini (P001).',
    latencyMs: 2309,
    chartType: 'bar',
    chartData: [
      { label: 'P001 SmartDesk Mini', value: 448200000 },
      { label: 'P002 AirPure S', value: 318600000 },
      { label: 'P003 FocusCam Pro', value: 263200000 },
      { label: 'P004 WorkHub License', value: 98500000 },
    ],
    sources: ['sales_transactions', 'inventory_daily', 'marketing_campaigns'],
    formulas: [
      'delta = current_period - previous_period',
      'roas = attributed_revenue / spend',
      'conversion = orders / leads',
    ],
  },
  {
    id: 'q3',
    question: 'Which products generate the highest profit?',
    intent: 'rank (gross_profit by product)',
    sql: `SELECT
  p.product_id,
  p.product_name,
  p.category,
  SUM(s.gross_profit) AS gross_profit,
  ROUND(SUM(s.gross_profit) * 1.0 / NULLIF(SUM(s.revenue), 0), 4) AS margin
FROM sales_transactions s
JOIN products p ON s.product_id = p.product_id
GROUP BY p.product_id, p.product_name, p.category
ORDER BY gross_profit DESC
LIMIT 5;`,
    answer:
      'SKU P001 (SmartDesk Mini) leads gross profit generation across the synthetic retail & services catalog (list price 2,490,000 ₫, unit cost 1,650,000 ₫, baseline margin 33.7%), followed by P002 (AirPure S, 1,890,000 ₫, 37.6% margin), P003 (FocusCam Pro, 31.6% margin), and P005 (CarePlus Support, 65.0% service margin).',
    latencyMs: 1729,
    chartType: 'bar',
    chartData: [
      { label: 'SmartDesk Mini (P001)', value: 151200000, secondary: 448200000 },
      { label: 'AirPure S (P002)', value: 119600000, secondary: 318600000 },
      { label: 'FocusCam Pro (P003)', value: 83200000, secondary: 263200000 },
      { label: 'CarePlus Support (P005)', value: 68400000, secondary: 105200000 },
    ],
    sources: ['sales_transactions', 'products'],
    formulas: ['gross_profit = revenue - total_cost', 'margin = gross_profit / revenue'],
  },
  {
    id: 'q4',
    question: 'Which region performs best?',
    intent: 'rank (revenue by region)',
    sql: `SELECT
  region,
  SUM(revenue) AS total_revenue,
  COUNT(transaction_id) AS total_orders,
  ROUND(AVG(revenue), 0) AS avg_ticket
FROM sales_transactions
GROUP BY region
ORDER BY total_revenue DESC;`,
    answer:
      'Across the four synthetic operating regions (HCMC, Hanoi, Da Nang, Can Tho), regional contributions track customer pool allocation with Online (~62%), Retail (~27%), and B2B (~11%) channel splits, enabling instant SQLite/PostgreSQL breakdown via typed Intent filters.',
    latencyMs: 1145,
    chartType: 'bar',
    chartData: [
      { label: 'HCMC', value: 985000000 },
      { label: 'Hanoi', value: 762000000 },
      { label: 'Da Nang', value: 584000000 },
      { label: 'Can Tho', value: 530500000 },
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
      'Cap underperforming Facebook Ads spend, audit HCMC stock allocations, and review returning-customer retention offers.',
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
      'Automated campaign bidding scaled spend by 1.85x without conversion guardrails',
      'High impression volume with saturated creative fatigue',
    ],
    suggestedAction:
      'Cap Facebook Ads spend and reallocate marginal budget toward higher-ROAS Google Ads, TikTok Ads, or Email campaigns.',
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
  // Remaining 16 days to complete full 30-day API horizon (Oct 15 - Oct 30)
  { date: 'Oct 15', predicted: 48600000, lowerBound: 39200000, upperBound: 58000000 },
  { date: 'Oct 16', predicted: 50400000, lowerBound: 40700000, upperBound: 60100000 },
  { date: 'Oct 17', predicted: 52900000, lowerBound: 42900000, upperBound: 62900000 },
  { date: 'Oct 18', predicted: 54100000, lowerBound: 44000000, upperBound: 64200000 },
  { date: 'Oct 19', predicted: 47900000, lowerBound: 38400000, upperBound: 57400000 },
  { date: 'Oct 20', predicted: 46200000, lowerBound: 36800000, upperBound: 55600000 },
  { date: 'Oct 21', predicted: 47100000, lowerBound: 37500000, upperBound: 56700000 },
  { date: 'Oct 22', predicted: 48900000, lowerBound: 39000000, upperBound: 58800000 },
  { date: 'Oct 23', predicted: 50800000, lowerBound: 40500000, upperBound: 61100000 },
  { date: 'Oct 24', predicted: 53700000, lowerBound: 43100000, upperBound: 64300000 },
  { date: 'Oct 25', predicted: 55100000, lowerBound: 44300000, upperBound: 65900000 },
  { date: 'Oct 26', predicted: 48400000, lowerBound: 38600000, upperBound: 58200000 },
  { date: 'Oct 27', predicted: 47000000, lowerBound: 37300000, upperBound: 56700000 },
  { date: 'Oct 28', predicted: 47900000, lowerBound: 38100000, upperBound: 57700000 },
  { date: 'Oct 29', predicted: 49300000, lowerBound: 39400000, upperBound: 59200000 },
  { date: 'Oct 30', predicted: 51100000, lowerBound: 41000000, upperBound: 61200000 },
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
    metric: 'Realized List Price (P001 SmartDesk Mini)',
    baseline: '2,490,000 ₫ (0% disc)',
    scenarioA: '2,365,500 ₫ (-5% disc)',
    scenarioB: '2,116,500 ₫ (-15% disc)',
    deltaA: '-5.0%',
    deltaB: '-15.0%',
  },
  {
    metric: '30-Day Demand (Linear Elasticity ε = -1.1)',
    baseline: '180 units',
    scenarioA: '190 units (+5.5%)',
    scenarioB: '210 units (+16.5%)',
    deltaA: '+5.5%',
    deltaB: '+16.5%',
  },
  {
    metric: 'Projected Revenue',
    baseline: '448,200,000 ₫',
    scenarioA: '449,445,000 ₫',
    scenarioB: '444,465,000 ₫',
    deltaA: '+0.3%',
    deltaB: '-0.8%',
  },
  {
    metric: 'Direct COGS (1,650,000 ₫ / unit)',
    baseline: '297,000,000 ₫',
    scenarioA: '313,500,000 ₫',
    scenarioB: '346,500,000 ₫',
    deltaA: '+5.6%',
    deltaB: '+16.7%',
  },
  {
    metric: 'Projected Gross Profit',
    baseline: '151,200,000 ₫ (33.7%)',
    scenarioA: '135,945,000 ₫ (30.2%)',
    scenarioB: '97,965,000 ₫ (22.0%)',
    deltaA: '-10.1% (-15.3M ₫)',
    deltaB: '-35.2% (-53.2M ₫)',
  },
  {
    metric: 'Inventory Fulfillment Cap Check',
    baseline: 'Within stock runway',
    scenarioA: 'Moderate draw (190 units)',
    scenarioB: 'High depletion risk (210 units)',
    deltaA: 'Manageable',
    deltaB: 'STOCKOUT RISK',
  },
  {
    metric: 'Engine Rating (Profit vs Revenue Objective)',
    baseline: 'RECOMMENDED (Profit Objective)',
    scenarioA: 'Revenue-Only Trade-Off (+0.3% rev)',
    scenarioB: 'REJECTED (Margin & Stockout Trap)',
    deltaA: 'Conditional',
    deltaB: 'Rejected',
  },
]

