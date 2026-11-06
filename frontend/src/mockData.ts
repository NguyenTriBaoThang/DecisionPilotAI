import type {
  Alert,
  Dataset,
  Forecast,
  KPI,
  Options,
  QueryResult,
  Recommendation,
  Row,
  Scenario,
  Session,
} from './api'

export const mockSession: Session = {
  actor: 'Executive Demo',
  role: 'admin',
  authentication: 'local',
  import_enabled: true,
}

export const mockDataset: Dataset = {
  dataset_id: 'dp_seed_20261105',
  kind: 'retail_sme',
  start: '2024-11-01',
  end: '2026-10-31',
  title: 'Retail & Smart Devices SME (50k Transactions)',
  counts: {
    sales_transactions: 50000,
    products: 50,
    customers: 5000,
    marketing_campaigns: 180,
    inventory_daily: 36500,
  },
}

export const mockOptions: Options = {
  products: [
    { product_id: 'P001', product_name: 'SmartDesk Mini', category: 'Office Equipment', is_physical: true },
    { product_id: 'P002', product_name: 'AirPure S', category: 'Home/Office', is_physical: true },
    { product_id: 'P003', product_name: 'FocusCam Pro', category: 'Electronics', is_physical: true },
    { product_id: 'P004', product_name: 'WorkHub License', category: 'SaaS Service', is_physical: false },
    { product_id: 'P005', product_name: 'CarePlus Support', category: 'Business Service', is_physical: false },
  ],
  regions: ['HCMC', 'Hanoi', 'Da Nang', 'Can Tho'],
  categories: ['Office Equipment', 'Home/Office', 'Electronics', 'SaaS Service', 'Business Service'],
  channels: ['Online Store', 'Retail Store', 'TikTok Shop'],
  marketing_channels: ['Meta Ads', 'Google Search', 'TikTok Shop', 'Email Marketing'],
}

export const mockKPI: KPI = {
  summary: {
    revenue: 1450200000,
    gross_profit: 625000000,
    orders: 1840,
    customers: 1420,
    gross_margin: 0.431,
    margin: 0.431,
    average_order_value: 788152,
    roas: 3.42,
    stockout_units: 42,
    inventory_availability: 0.942,
  },
  changes: {
    revenue: -0.112,
    gross_profit: -0.098,
    orders: -0.065,
    customers: -0.042,
    gross_margin: -0.015,
    margin: -0.015,
    average_order_value: -0.051,
    roas: -0.184,
    stockout_units: 0.35,
    inventory_availability: -0.028,
  },
  range: ['2026-10-01', '2026-10-31'],
  previous_range: ['2026-09-01', '2026-09-30'],
  trend: [
    { date: '2026-10-01', revenue: 48200000, profit: 21000000, orders: 62 },
    { date: '2026-10-05', revenue: 51400000, profit: 22300000, orders: 66 },
    { date: '2026-10-10', revenue: 44100000, profit: 18900000, orders: 58 },
    { date: '2026-10-15', revenue: 41200000, profit: 17200000, orders: 52 },
    { date: '2026-10-20', revenue: 46800000, profit: 20100000, orders: 59 },
    { date: '2026-10-25', revenue: 49500000, profit: 21600000, orders: 64 },
    { date: '2026-10-31', revenue: 42300000, profit: 17800000, orders: 54 },
  ],
  products: [
    { name: 'SmartDesk Mini', product_name: 'SmartDesk Mini', revenue: 420000000, gross_profit: 189000000, profit: 189000000, units: 480, orders: 480 },
    { name: 'AirPure S', product_name: 'AirPure S', revenue: 310000000, gross_profit: 139500000, profit: 139500000, units: 320, orders: 320 },
    { name: 'FocusCam Pro', product_name: 'FocusCam Pro', revenue: 280000000, gross_profit: 112000000, profit: 112000000, units: 240, orders: 240 },
    { name: 'WorkHub License', product_name: 'WorkHub License', revenue: 240000000, gross_profit: 144000000, profit: 144000000, units: 520, orders: 520 },
    { name: 'CarePlus Support', product_name: 'CarePlus Support', revenue: 200200000, gross_profit: 100100000, profit: 100100000, units: 280, orders: 280 },
  ],
  regions: [
    { name: 'HCMC', region: 'HCMC', revenue: 680000000, gross_profit: 292400000, profit: 292400000 },
    { name: 'Hanoi', region: 'Hanoi', revenue: 440000000, gross_profit: 189200000, profit: 189200000 },
    { name: 'Da Nang', region: 'Da Nang', revenue: 210000000, gross_profit: 90300000, profit: 90300000 },
    { name: 'Can Tho', region: 'Can Tho', revenue: 120200000, gross_profit: 53100000, profit: 53100000 },
  ],
  sales_channels: [
    { name: 'Online Store', channel: 'Online Store', revenue: 780000000, gross_profit: 351000000, profit: 351000000 },
    { name: 'Retail Store', channel: 'Retail Store', revenue: 450000000, gross_profit: 189000000, profit: 189000000 },
    { name: 'TikTok Shop', channel: 'TikTok Shop', revenue: 220200000, gross_profit: 85000000, profit: 85000000 },
  ],
  marketing_channels: [
    { name: 'Meta Ads', channel: 'Meta Ads', spend: 85000000, revenue: 260000000, roas: 3.05 },
    { name: 'Google Search', channel: 'Google Search', spend: 62000000, revenue: 285000000, roas: 4.59 },
    { name: 'TikTok Shop', channel: 'TikTok Shop', spend: 41000000, revenue: 125000000, roas: 3.04 },
    { name: 'Email Marketing', channel: 'Email Marketing', spend: 12000000, revenue: 84000000, roas: 7.0 },
  ],
  market_scope: 'Retail SME Vietnam (HCMC & Hanoi Branches)',
  definitions: {
    revenue: 'Gross Realized Sales in VND',
    gross_profit: 'Revenue minus Landed COGS',
  },
}

export const mockAlerts: { rows: Alert[] } = {
  rows: [
    {
      id: 'ANOM-2026-10-14-01',
      metric: 'marketing_roas',
      start: '2026-10-10',
      end: '2026-10-17',
      actual: 2.2,
      baseline: 3.8,
      deviation: -0.42,
      severity: 'high',
      score: 0.94,
      action: 'Reallocate $2,500 budget from Meta Ads to Google Search and pause saturated ad sets.',
      scope: 'Meta Ads Channel',
      chart: [
        { date: '10/08', roas: 3.9 },
        { date: '10/10', roas: 3.4 },
        { date: '10/12', roas: 2.8 },
        { date: '10/14', roas: 2.2 },
        { date: '10/16', roas: 2.1 },
      ],
      evidence: {
        spend_change: '+35%',
        conversion_rate_change: '-40%',
        attributed_revenue: '260M VND',
      },
    },
    {
      id: 'ANOM-2026-10-21-02',
      metric: 'revenue',
      start: '2026-10-15',
      end: '2026-10-22',
      actual: 42000000,
      baseline: 55000000,
      deviation: -0.24,
      severity: 'medium',
      score: 0.78,
      action: 'Apply calibrated 5% discount on SmartDesk Mini in HCMC to counter local price resistance.',
      scope: 'SmartDesk Mini (HCMC)',
      chart: [
        { date: '10/15', revenue: 54000000 },
        { date: '10/17', revenue: 49000000 },
        { date: '10/19', revenue: 45000000 },
        { date: '10/21', revenue: 42000000 },
      ],
      evidence: {
        region: 'HCMC',
        competitor_price_drop: '-8%',
      },
    },
  ],
}

export const mockForecast: Forecast = {
  target: 'demand',
  scope: 'SmartDesk Mini (P001)',
  horizon: 30,
  total: 624,
  data_as_of: '2026-10-31',
  model_version: 'LightGBM-v1.0.0',
  stockout_note: 'Projected demand exceeds current warehouse inventory on Day 18. Reorder required.',
  interval_method: 'Quantile Loss (90% Confidence Interval)',
  warnings: ['Stockout Risk on Day 18: 140 units short without replenishment.'],
  drivers: {
    rolling_mean_7d: 0.342,
    lag_7d: 0.215,
    promotion_flag: 0.112,
    is_weekend: 0.084,
  },
  metrics: {
    selected: 'LightGBM Regressor',
    test_coverage: 0.94,
    test: {
      demand: { mae: 14.82, rmse: 21.05, wape: 0.112, mape: 0.124, bias: -0.4 },
    },
    validation: {
      demand: { mae: 15.1, rmse: 22.4, wape: 0.118, mape: 0.13, bias: -0.6 },
    },
  },
  history: [
    { date: '10/25', actual: 18, baseline: 17 },
    { date: '10/26', actual: 21, baseline: 20 },
    { date: '10/27', actual: 16, baseline: 17 },
    { date: '10/28', actual: 15, baseline: 16 },
    { date: '10/29', actual: 19, baseline: 18 },
    { date: '10/30', actual: 22, baseline: 21 },
    { date: '10/31', actual: 20, baseline: 19 },
  ],
  prediction: [
    { date: '11/01', forecast: 21, lower: 18, upper: 25 },
    { date: '11/05', forecast: 23, lower: 19, upper: 27 },
    { date: '11/10', forecast: 22, lower: 18, upper: 26 },
    { date: '11/15', forecast: 26, lower: 21, upper: 31 },
    { date: '11/20', forecast: 28, lower: 23, upper: 34 },
    { date: '11/25', forecast: 32, lower: 26, upper: 38 },
    { date: '11/30', forecast: 30, lower: 24, upper: 36 },
  ],
}

export function generateMockScenario(params?: Record<string, unknown>): Scenario {
  const discounts = (params?.discounts as number[]) || [0.05, 0.1]
  const targetDiscount = discounts[0] || 0.05

  // Microeconomic simulation formula
  const baseDemand = 180
  const basePrice = 2490000
  const unitCost = 1650000
  const elasticity = -1.1

  const newDemand = Math.round(baseDemand * (1 + elasticity * -targetDiscount))
  const newPrice = basePrice * (1 - targetDiscount)
  const newRevenue = Math.round(newDemand * newPrice)
  const newProfit = Math.round(newRevenue - newDemand * unitCost)
  const baseRevenue = baseDemand * basePrice
  const baseProfit = baseRevenue - baseDemand * unitCost
  const profitDelta = newProfit - baseProfit

  return {
    simulation_id: 'SIM-' + Date.now().toString(36),
    dataset_id: 'dp_seed_20261105',
    decision: 'pending',
    type: (params?.type as string) || 'price',
    objective: (params?.objective as string) || 'profit',
    baseline: {
      name: 'Baseline (0% Discount)',
      demand: baseDemand,
      fulfilled: baseDemand,
      revenue: baseRevenue,
      profit: baseProfit,
      gross_profit: baseProfit,
      margin: 0.337,
      risk: null,
    },
    alternatives: [
      {
        name: `Scenario A (${Math.round(targetDiscount * 100)}% Discount)`,
        demand: newDemand,
        fulfilled: Math.min(newDemand, 250),
        revenue: newRevenue,
        profit: newProfit,
        gross_profit: newProfit,
        profit_delta: profitDelta,
        margin: Math.round(((newRevenue - newDemand * unitCost) / newRevenue) * 1000) / 1000,
        risk: newDemand > 250 ? newDemand - 250 : null,
      },
      {
        name: 'Scenario B (10% Discount)',
        demand: 276,
        fulfilled: 250,
        revenue: 180000000,
        profit: 70000000,
        gross_profit: 70000000,
        profit_delta: 5200000,
        margin: 0.388,
        risk: 26,
      },
    ],
    recommended: {
      name: `Scenario A (${Math.round(targetDiscount * 100)}% Discount)`,
      profit_delta: profitDelta,
      rationale: 'Optimizes contribution profit yield while avoiding inventory stockout risk.',
    },
    sensitivity: [
      {
        name: 'Elasticity Variations (+/- 20%)',
        alternatives: [
          { elasticity: -0.88, result: { profit: 68400000, revenue: 165000000, risk: 0 } },
          { elasticity: -1.32, result: { profit: 75200000, revenue: 181000000, risk: 12 } },
        ],
      },
    ],
    assumptions: [
      'Constant supplier COGS at 1,650,000 VND per unit',
      'Physical warehouse inventory capped at 250 available units',
      `Consumer price response follows calibrated historical elasticity e = ${elasticity}`,
    ],
    evidence: {
      calibrated_elasticity: elasticity,
      historical_volume: baseDemand,
    },
  }
}

export const mockRecommendations: { rows: Recommendation[]; dataset_id: string } = {
  dataset_id: 'dp_seed_20261105',
  rows: [
    {
      id: 'REC-2026-10-15-01',
      title: 'Apply 5% Calibrated Discount on SmartDesk Mini',
      context: 'HCMC branch sales contracted 24% due to competitor discount campaigns.',
      action: 'Implement a 5% promotional discount on SmartDesk Mini for the next 14 days.',
      priority: 'high',
      decision: 'pending',
      expected_impact: {
        incremental_profit: 8160000,
        volume_expansion_pct: 26.6,
      },
      assumptions: ['Price elasticity stays within [-1.4, -0.9]', 'Warehouse inventory >= 228 units'],
      risk: 'Stockout risk if demand exceeds 250 units without batch replenishment.',
      uncertainty: 'Low (High empirical validation on historical Black Friday cycles)',
      evidence: { elasticity: -1.1, base_demand: 180 },
    },
    {
      id: 'REC-2026-10-15-02',
      title: 'Reallocate $2,500 Ad Budget from Meta to Google Search',
      context: 'Meta Ads ROAS fell from 3.8x to 2.2x as audience frequency reached saturation (4.8).',
      action: 'Shift $2,500 from retargeting to Google Search high-intent keywords.',
      priority: 'high',
      decision: 'pending',
      expected_impact: {
        projected_roas_uplift: 0.65,
        estimated_incremental_revenue: 145000000,
      },
      assumptions: ['Google Search search volume remains consistent'],
      risk: 'Temporary dip in upper-funnel brand impressions.',
      uncertainty: 'Medium',
      evidence: { meta_frequency: 4.8, google_roas: 4.59 },
    },
  ],
}

export const mockQueryResponse: QueryResult = {
  answer:
    'October gross revenue decreased by 11.2% (VND 182.4M) compared to September. The primary drivers were: (1) Meta Ads efficiency declined with ROAS falling from 3.8x to 2.2x; (2) Sales of SmartDesk Mini in HCMC contracted by 24% due to local competitive price resistance.',
  chart: {
    type: 'bar',
    x: 'product_name',
    y: 'revenue_delta',
    rows: [
      { product_name: 'SmartDesk Mini', revenue_delta: -48200000, profit_delta: -21400000 },
      { product_name: 'AirPure S', revenue_delta: -12500000, profit_delta: -5200000 },
      { product_name: 'FocusCam Pro', revenue_delta: -8400000, profit_delta: -3100000 },
    ],
  },
  trace: {
    tool: 'SQL Analytical Drill-down',
    provider: 'Local PostgreSQL / SQLite Core',
    sources: ['sales_transactions', 'marketing_campaigns'],
    formulas: {
      revenue_delta: 'SUM(october_revenue) - SUM(september_revenue)',
    },
  },
  evidence: {
    top_negative_driver: 'SmartDesk Mini in HCMC Branch',
  },
}

