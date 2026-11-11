export interface ForecastBenchmark {
  target: string
  scope: string
  model: string
  mae: string
  wape: string
  coverage: string
}

export interface AnomalyBenchmark {
  signal: string
  method: string
  precision: string
  recall: string
  f1: string
  fpr: string
}

export interface QueryMetric {
  metric: string
  score: string
  description: string
}

export const FORECAST_BENCHMARKS: ForecastBenchmark[] = [
  { target: 'revenue', scope: 'all', model: 'moving_average', mae: '34,584,971 ₫', wape: '24.14%', coverage: '83.81%' },
  { target: 'orders', scope: 'all', model: 'moving_average', mae: '14.98', wape: '23.22%', coverage: '83.81%' },
  { target: 'demand', scope: 'all', model: 'moving_average', mae: '17.74', wape: '23.46%', coverage: '80.00%' },
  { target: 'demand', scope: 'sku:P001 (SmartDesk Mini)', model: 'lightgbm', mae: '2.68', wape: '41.87%', coverage: '92.86%' },
]

export const ANOMALY_BENCHMARKS: AnomalyBenchmark[] = [
  { signal: 'facebook_spend', method: 'hybrid', precision: '100.00%', recall: '82.14%', f1: '90.20%', fpr: '0.00%' },
  { signal: 'revenue', method: 'hybrid', precision: '86.67%', recall: '38.24%', f1: '53.06%', fpr: '2.63%' },
  { signal: 'facebook_conversion', method: 'hybrid', precision: '75.00%', recall: '75.00%', f1: '75.00%', fpr: '8.54%' },
  { signal: 'facebook_roas', method: 'hybrid', precision: '68.00%', recall: '60.71%', f1: '64.15%', fpr: '9.76%' },
  { signal: 'margin', method: 'hybrid', precision: '50.00%', recall: '75.00%', f1: '60.00%', fpr: '2.83%' },
  { signal: 'stockout_risk', method: 'business_rule', precision: '18.75%', recall: '25.00%', f1: '21.43%', fpr: '13.27%' },
]

export const COPILOT_BENCHMARKS: QueryMetric[] = [
  { metric: 'Intent Recognition Accuracy', score: '100.0%', description: '46/46 curated test queries (local rules, no LLM) classified to the intended business scope' },
  { metric: 'Execution Success', score: '100.0%', description: 'All 46 curated queries ran through the fixed analytics tools without errors' },
  { metric: 'Numerical Consistency', score: '100.0%', description: '100% agreement between answer totals and values recomputed from the database' },
  { metric: 'Grounding', score: '100.0%', description: 'Every metric in the answer traces to the database result set (curated cases, local rules)' },
  { metric: 'Median Query Latency', score: '1,432 ms', description: 'Interactive response on the local rules path' },
  { metric: '95th Percentile Latency', score: '3,268 ms', description: 'Slowest typical query across the 46-case benchmark' },
]

export const SCENARIO_REPLAY = {
  priceReplay: {
    target: 'Weekly observed P001 units',
    baselineWape: '24.24%',
    scenarioWape: '23.99%',
    observations: 15,
  },
  marketingReplay: {
    target: 'Weekly Facebook Ads attributed revenue',
    baselineWape: '25.44%',
    scenarioWape: '33.00%',
    observations: 15,
  },
  inventoryReplay: {
    target: 'P003 closing stock depletion',
    weeks: 15,
    observedDepletions: 2,
    predictedDepletions: 2,
    matches: '15/15',
  },
}

