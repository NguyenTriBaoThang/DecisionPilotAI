import type {
  Alert,
  Dataset,
  Forecast,
  KPI,
  Options,
  QueryResult,
  Recommendation,
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
  dataset_id: 'f32e87e3a5744333ff98d3bf',
  kind: 'synthetic',
  start: '2024-10-01',
  end: '2026-09-30',
  title: 'Synthetic retail & services demo (50k Transactions)',
  counts: {
    calendar_events: 730,
    products: 50,
    customers: 10000,
    marketing_campaigns: 2920,
    sales_transactions: 50000,
    inventory_daily: 24820,
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
  categories: ['Office Equipment', 'Home/Office', 'Electronics', 'SaaS Service', 'Business Service', 'Accessories'],
  channels: ['Online', 'Retail', 'B2B'],
  marketing_channels: ['Facebook Ads', 'Google Ads', 'TikTok Ads', 'Email'],
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
    new_customers: 580,
    returning_customers: 840,
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
  range: ['2026-09-01', '2026-09-30'],
  previous_range: ['2026-08-01', '2026-08-31'],
  trend: [
    { date: '2026-09-01', revenue: 48200000, profit: 21000000, orders: 62 },
    { date: '2026-09-05', revenue: 51400000, profit: 22300000, orders: 66 },
    { date: '2026-09-10', revenue: 44100000, profit: 18900000, orders: 58 },
    { date: '2026-09-15', revenue: 41200000, profit: 17200000, orders: 52 },
    { date: '2026-09-20', revenue: 46800000, profit: 20100000, orders: 59 },
    { date: '2026-09-25', revenue: 49500000, profit: 21600000, orders: 64 },
    { date: '2026-09-30', revenue: 42300000, profit: 17800000, orders: 54 },
  ],
  products: [
    { name: 'SmartDesk Mini', product_name: 'SmartDesk Mini', revenue: 420000000, gross_profit: 189000000, profit: 189000000, units: 480, orders: 480 },
    { name: 'AirPure S', product_name: 'AirPure S', revenue: 310000000, gross_profit: 139500000, profit: 139500000, units: 320, orders: 320 },
    { name: 'FocusCam Pro', product_name: 'FocusCam Pro', revenue: 280000000, gross_profit: 112000000, profit: 112000000, units: 240, orders: 240 },
    { name: 'WorkHub License', product_name: 'WorkHub License', revenue: 240000000, gross_profit: 144000000, profit: 144000000, units: 520, orders: 520 },
    { name: 'CarePlus Support', product_name: 'CarePlus Support', revenue: 200200000, gross_profit: 100100000, profit: 100100000, units: 280, orders: 280 },
  ],
  regions: [
    { name: 'HCMC', region: 'HCMC', revenue: 680000000, gross_profit: 292400000, profit: 292400000, orders: 840 },
    { name: 'Hanoi', region: 'Hanoi', revenue: 440000000, gross_profit: 189200000, profit: 189200000, orders: 560 },
    { name: 'Da Nang', region: 'Da Nang', revenue: 210000000, gross_profit: 90300000, profit: 90300000, orders: 280 },
    { name: 'Can Tho', region: 'Can Tho', revenue: 120200000, gross_profit: 53100000, profit: 53100000, orders: 160 },
  ],
  sales_channels: [
    { name: 'Online', channel: 'Online', revenue: 780000000, gross_profit: 351000000, profit: 351000000, orders: 980 },
    { name: 'Retail', channel: 'Retail', revenue: 450000000, gross_profit: 189000000, profit: 189000000, orders: 570 },
    { name: 'B2B', channel: 'B2B', revenue: 220200000, gross_profit: 85000000, profit: 85000000, orders: 290 },
  ],
  marketing_channels: [
    { name: 'Facebook Ads', channel: 'Facebook Ads', spend: 185000000, revenue: 295000000, roas: 1.59 },
    { name: 'Google Ads', channel: 'Google Ads', spend: 112000000, revenue: 410000000, roas: 3.66 },
    { name: 'TikTok Ads', channel: 'TikTok Ads', spend: 58000000, revenue: 175000000, roas: 3.02 },
    { name: 'Email', channel: 'Email', spend: 12000000, revenue: 84000000, roas: 7.0 },
  ],
  market_scope: 'Retail & Services SME Vietnam (4 Regions)',
  definitions: {
    revenue: 'Gross Realized Sales in VND',
    gross_profit: 'Revenue minus Total Direct Cost',
  },
}

export const mockAlerts: { rows: Alert[] } = {
  rows: [
    {
      id: 'ANOM-2026-09-14-01',
      metric: 'facebook_roas',
      start: '2026-09-03',
      end: '2026-09-30',
      actual: 1.59,
      baseline: 3.66,
      deviation: -0.566,
      severity: 'critical',
      score: 0.94,
      action: 'Review spend and attributed order efficiency on Facebook Ads before reallocating budget toward Google Ads.',
      scope: 'Facebook Ads Channel',
      chart: [
        { date: '09/01', roas: 3.5 },
        { date: '09/05', roas: 2.1 },
        { date: '09/10', roas: 1.8 },
        { date: '09/15', roas: 1.6 },
        { date: '09/25', roas: 1.59 },
      ],
      evidence: {
        spend_multiplier: '1.85x vs trailing 56d shifted reference',
        attribution_share: 'Dropped from 25.0% to 5.5% in Online',
        attributed_revenue: '295M VND',
      },
    },
    {
      id: 'ANOM-2026-09-21-02',
      metric: 'revenue',
      start: '2026-09-03',
      end: '2026-09-30',
      actual: 42000000,
      baseline: 55000000,
      deviation: -0.236,
      severity: 'high',
      score: 0.82,
      action: 'Review product, region, and customer segment mix across HCMC before applying promotional discounts.',
      scope: 'Aggregate Daily Revenue (HCMC Impact)',
      chart: [
        { date: '09/01', revenue: 54000000 },
        { date: '09/08', revenue: 49000000 },
        { date: '09/15', revenue: 45000000 },
        { date: '09/25', revenue: 42000000 },
      ],
      evidence: {
        region: 'HCMC demand shift on P002 / P003',
        returning_share: 'Dropped from 44% to 20%',
      },
    },
  ],
}

export const mockForecast: Forecast = {
  target: 'demand',
  scope: 'sku:P001',
  horizon: 30,
  total: 192,
  data_as_of: '2026-09-30',
  model_version: 'dp-1.1',
  stockout_note: 'Projected cumulative P001 demand exceeds buffer threshold unless replenishment arrives within lead time (14 days).',
  interval_method: 'Empirical validation residual quantiles split by lead bucket (90% nominal)',
  warnings: ['Replenishment watch: monitor closing stock against 14-day supplier lead time.'],
  drivers: {
    mean_7: 0.34,
    lag_7: 0.22,
    lag_1: 0.15,
    holiday: 0.11,
    weekend: 0.08,
  },
  metrics: {
    selected: 'lightgbm',
    test_coverage: 0.9286,
    test: {
      lightgbm: { mae: 2.68, rmse: 3.43, wape: 0.4187, mape: 0.5843, bias: 0.003 },
      moving_average: { mae: 2.77, rmse: 3.54, wape: 0.4328, mape: 0.6344, bias: 0.28 },
      seasonal_naive: { mae: 3.49, rmse: 4.56, wape: 0.5454, mape: 0.7491, bias: -0.15 },
    },
    validation: {
      lightgbm: { mae: 2.73, rmse: 3.54, wape: 0.4068, mape: 0.6449, bias: -0.87 },
      moving_average: { mae: 2.82, rmse: 3.53, wape: 0.4205, mape: 0.7191, bias: -0.45 },
      seasonal_naive: { mae: 3.4, rmse: 4.36, wape: 0.5066, mape: 0.7309, bias: -0.44 },
    },
  },
  history: [
    { date: '09/24', actual: 6, baseline: 6 },
    { date: '09/25', actual: 7, baseline: 6 },
    { date: '09/26', actual: 8, baseline: 7 },
    { date: '09/27', actual: 7, baseline: 7 },
    { date: '09/28', actual: 5, baseline: 6 },
    { date: '09/29', actual: 6, baseline: 6 },
    { date: '09/30', actual: 7, baseline: 6 },
  ],
  prediction: [
    { date: '10/01', forecast: 6.2, lower: 2.0, upper: 10.4 },
    { date: '10/05', forecast: 6.5, lower: 2.3, upper: 10.7 },
    { date: '10/10', forecast: 6.8, lower: 2.1, upper: 11.5 },
    { date: '10/15', forecast: 6.1, lower: 1.4, upper: 10.8 },
    { date: '10/20', forecast: 6.4, lower: 1.7, upper: 11.1 },
    { date: '10/25', forecast: 6.6, lower: 1.9, upper: 11.3 },
    { date: '10/30', forecast: 6.3, lower: 1.6, upper: 11.0 },
  ],
}

export function generateMockScenario(params?: Record<string, unknown>): Scenario {
  const discounts = (params?.discounts as number[]) || [0.05, 0.1]
  const discountA = discounts[0] ?? 0.05
  const discountB = discounts[1] ?? 0.1

  const baseDemand = 180
  const basePrice = 2490000
  const unitCost = 1650000
  const stockCap = 250
  const elasticity = -1.1

  const computeRow = (discount: number, e: number) => {
    const newPrice = basePrice * (1 - discount)
    const demand = Math.max(0, baseDemand * (1 + e * (newPrice / basePrice - 1)))
    const fulfilled = Math.min(demand, stockCap)
    const revenue = Math.round(fulfilled * newPrice)
    const profit = revenue - Math.round(fulfilled * unitCost)
    return {
      demand: Math.round(demand * 100) / 100,
      fulfilled: Math.round(fulfilled * 100) / 100,
      revenue,
      profit,
      margin: revenue > 0 ? Math.round((profit / revenue) * 10000) / 10000 : 0,
      risk: demand > stockCap ? Math.round((demand - stockCap) * 100) / 100 : null,
    }
  }

  const baseRevenue = baseDemand * basePrice
  const baseProfit = baseRevenue - baseDemand * unitCost
  const rowA = computeRow(discountA, elasticity)
  const rowB = computeRow(discountB, elasticity)

  const profitDeltaA = rowA.profit - baseProfit
  const profitDeltaB = rowB.profit - baseProfit

  const bestIsBaseline = baseProfit >= rowA.profit && baseProfit >= rowB.profit
  const recommendedName = bestIsBaseline
    ? 'Current realized price (0% Discount)'
    : rowA.profit >= rowB.profit
      ? `Scenario A (${Math.round(discountA * 100)}% list discount)`
      : `Scenario B (${Math.round(discountB * 100)}% list discount)`

  return {
    simulation_id: 'SIM-' + Date.now().toString(36),
    dataset_id: 'f32e87e3a5744333ff98d3bf',
    decision: 'pending',
    type: (params?.type as string) || 'price',
    objective: (params?.objective as string) || 'profit',
    baseline: {
      name: 'Current realized price',
      demand: baseDemand,
      fulfilled: baseDemand,
      revenue: baseRevenue,
      profit: baseProfit,
      gross_profit: baseProfit,
      margin: Math.round((baseProfit / baseRevenue) * 10000) / 10000,
      risk: null,
    },
    alternatives: [
      {
        name: `${Math.round(discountA * 100)}% list discount`,
        ...rowA,
        gross_profit: rowA.profit,
        profit_delta: profitDeltaA,
      },
      {
        name: `${Math.round(discountB * 100)}% list discount`,
        ...rowB,
        gross_profit: rowB.profit,
        profit_delta: profitDeltaB,
      },
    ],
    recommended: {
      name: recommendedName,
      profit_delta: bestIsBaseline ? 0 : Math.max(profitDeltaA, profitDeltaB),
      rationale:
        'Compares gross contribution profit after unit COGS against stock capacity across catalog elasticity (e = -1.1) and sensitivity bounds.',
    },
    sensitivity: [
      {
        name: `${Math.round(discountA * 100)}% list discount`,
        alternatives: [
          { elasticity: -1.4, result: computeRow(discountA, -1.4) },
          { elasticity: -1.1, result: rowA },
          { elasticity: -0.8, result: computeRow(discountA, -0.8) },
        ],
      },
    ],
    assumptions: [
      `Elasticity ${elasticity}; catalog assumption for P001 SmartDesk Mini.`,
      'Demand response is linear in percentage change relative to trailing realized price.',
      `Physical fulfillment is capped at ${stockCap} units on hand in static demo fallback.`,
    ],
    evidence: {
      product: 'P001',
      calibrated_elasticity: elasticity,
      historical_volume: baseDemand,
    },
  }
}

export const mockRecommendations: { rows: Recommendation[]; dataset_id: string } = {
  dataset_id: 'f32e87e3a5744333ff98d3bf',
  rows: [
    {
      id: 'REC-2026-09-30-01',
      title: 'Hold List Price (0% Blanket Discount) on SmartDesk Mini (P001)',
      context: 'Simulating 5%–10% across-the-board discounting erodes unit margin faster than volume lift (-1.1 catalog elasticity).',
      action: 'Maintain regular list price at 2,490,000 VND and pair targeted stock monitoring over the 14-day supplier lead time.',
      priority: 'high',
      decision: 'pending',
      expected_impact: {
        preserved_profit: 151200000,
        margin_pct: 33.7,
      },
      assumptions: ['Catalog elasticity e = -1.1 within sensitivity [-1.4, -0.8]', 'Unit direct cost 1,650,000 VND'],
      risk: 'Competitor temporary markdowns may still shift price-sensitive segment conversion.',
      uncertainty: 'Sensitivity evaluated across e ± 0.30 bounds',
      evidence: { elasticity: -1.1, base_demand: 180 },
    },
    {
      id: 'REC-2026-09-30-02',
      title: 'Rebalance 50M VND Spend from Saturated Facebook Ads toward Google Ads',
      context: 'Facebook Ads spend surged 1.85x in September while attribution share dropped from 25% to 5.5%, compressing ROAS.',
      action: 'Review Facebook Ads delivery and test reallocating 50,000,000 VND incremental spend toward Google Ads high-intent search.',
      priority: 'high',
      decision: 'pending',
      expected_impact: {
        google_roas: 3.66,
        response_exponent: 0.65,
      },
      assumptions: ['Diminishing returns power exponent alpha = 0.65 over 28d baseline'],
      risk: 'Attribution ratios reflect historical correlations rather than randomized incrementality.',
      uncertainty: 'Medium (Sensitivity tested across alpha ± 0.15)',
      evidence: { facebook_roas: 1.59, google_roas: 3.66 },
    },
  ],
}

export const mockQueryResponse: QueryResult = {
  answer:
    'Gross revenue decreased compared with August 2026 in the active snapshot (f32e87e3a5744333ff98d3bf). Primary observed contributors included a 0.59x store traffic drop, HCMC demand weight reductions across top SKUs, and returning customer share falling from 44% to 20%.',
  chart: {
    type: 'bar',
    x: 'product_name',
    y: 'revenue_delta',
    rows: [
      { product_name: 'SmartDesk Mini', revenue_delta: -48200000, profit_delta: -21400000 },
      { product_name: 'AirPure S', revenue_delta: -32500000, profit_delta: -12800000 },
      { product_name: 'FocusCam Pro', revenue_delta: -24400000, profit_delta: -9100000 },
    ],
  },
  trace: {
    tool: 'explain',
    provider: 'local rules (static fallback)',
    sources: ['sales_transactions', 'products', 'customers'],
    formulas: {
      revenue_delta: 'SUM(september_revenue) - SUM(august_revenue)',
    },
  },
  evidence: {
    top_negative_driver: 'SmartDesk Mini in HCMC',
  },
}
