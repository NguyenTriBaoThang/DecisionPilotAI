import type { Alert, KPI, Options, QueryResult, Row } from '../api'

export type ScenarioType = 'marketing' | 'price' | 'inventory'

/** ROAS label without ever calling it a loss: ad payback is not profit (cost of goods is not counted). */
export function roasLabel(roas: number | null | undefined): { kind: 'bad' | 'normal' | 'good'; key: string } | null {
  if (roas == null || Number.isNaN(roas)) return null
  if (roas < 1) return { kind: 'bad', key: 'Not paying back yet' }
  if (roas < 2) return { kind: 'normal', key: 'Normal' }
  return { kind: 'good', key: 'Good' }
}

export function decisionBucket(decision: string | undefined | null): 'chosen' | 'skipped' | 'pending' {
  if (decision === 'accepted') return 'chosen'
  if (decision === 'rejected') return 'skipped'
  return 'pending'
}

const KEYWORDS: [ScenarioType, RegExp][] = [
  ['marketing', /marketing|\bads?\b|roas|quảng cáo|kênh/i],
  ['price', /price|discount|giảm giá|\bgiá\b/i],
  ['inventory', /stock|inventory|tồn|hết hàng|sắp hết|nhập hàng/i],
]

export function scenarioForQuestion(text: string): ScenarioType | null {
  return KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? null
}

/** Simulator deep link for a recommendation id like "marketing:facebook" or "inventory:P001"; null when unmappable. */
export function tryFirstHref(rec: { id: string }, options: Options): string | null {
  const [kind, key] = rec.id.split(':')
  if (!key) return null
  const qs = new URLSearchParams({ type: kind })
  if (kind === 'marketing') {
    const channel = options.marketing_channels.find((c) => c.toLowerCase().startsWith(key.toLowerCase()))
    if (!channel) return null
    qs.set('channel', channel)
    qs.set('change', '-0.15')
  } else if (kind === 'price' || kind === 'inventory') {
    if (!options.products.some((p) => p.product_id === key)) return null
    qs.set('product', key)
  } else {
    return null
  }
  qs.set('rec', rec.id)
  return '/scenarios?' + qs.toString()
}

export function highlightFromChart(
  answer: string,
  chart: QueryResult['chart']
): { name: string; value: number; y: string } | null {
  if (!chart || chart.rows.length === 0) return null
  const named = chart.rows
    .map((row) => ({ row, at: answer.indexOf(String(row[chart.x])) }))
    .filter((r) => r.at >= 0)
    .sort((a, b) => a.at - b.at)[0]?.row
  const row = named ?? chart.rows[0]
  const value = Number(row[chart.y])
  if (Number.isNaN(value)) return null
  return { name: String(row[chart.x]), value, y: chart.y }
}

const ALERT_PHRASE: Record<string, string> = {
  facebook_spend: 'Facebook ad spend is unusually high',
  facebook_conversion: 'Facebook conversion dropped',
  revenue: 'revenue moved unusually',
  margin: 'margin moved unusually',
}

/** One data-driven sentence for the Today hero. `t` translates the template keys. */
export function briefingSentence(kpi: KPI, alerts: Alert[], t: (s: string) => string): string {
  const change = kpi.changes?.revenue
  let s = ''
  if (change != null) {
    s = t(change >= 0 ? 'Revenue is up {pct}% vs last period.' : 'Revenue is down {pct}% vs last period.').replace(
      '{pct}',
      (Math.abs(change) * 100).toFixed(1)
    )
  }
  const critical = alerts.find((a) => a.severity === 'critical')
  if (critical) {
    const phrase = ALERT_PHRASE[critical.metric] ?? critical.metric.replaceAll('_', ' ')
    s += t(' Watch: {metric}.').replace('{metric}', t(phrase))
  }
  return s.trim()
}

export type TryFirstParams = { type: ScenarioType; channel?: string; product?: string; change?: number; rec?: string; autorun: boolean }

/** Reads simulator deep links; accepts the legacy `tab`/`autorun=1` form that RecommendationsCenter still produces. */
export function parseTryFirstParams(sp: URLSearchParams): TryFirstParams {
  const raw = sp.get('type') ?? sp.get('tab')
  const type: ScenarioType = raw === 'price' || raw === 'inventory' ? raw : 'marketing'
  const change = sp.get('change')
  return {
    type,
    channel: sp.get('channel') ?? undefined,
    product: sp.get('product') ?? undefined,
    change: change != null && change !== '' && !Number.isNaN(Number(change)) ? Number(change) : undefined,
    rec: sp.get('rec') ?? undefined,
    autorun: raw != null || sp.get('autorun') === '1',
  }
}

export type MetricKind = 'money' | 'count' | 'pct' | 'ratio'

/** Format family from a column name returned by /query or /simulate. */
export function metricKind(key: string): MetricKind {
  if (key === 'roas') return 'ratio'
  if (/margin|conversion|share|rate/.test(key)) return 'pct'
  if (/revenue|profit|spend|cost|price|commitment|value|aov|cac/.test(key)) return 'money'
  return 'count'
}

export type CompareRow = { key: string; label: string; before: number; after: number; kind: MetricKind; upIsGood: boolean }

// Order = reading order in the table. `risk` is unmet demand (units), `first_stockout_day` is a day number.
const COMPARE: Record<ScenarioType, { key: string; label: string; upIsGood?: boolean }[]> = {
  marketing: [
    { key: 'revenue', label: 'Revenue' }, { key: 'gross_profit', label: 'Gross profit' }, { key: 'profit', label: 'Profit after ads' },
    { key: 'spend', label: 'Ad spend', upIsGood: false }, { key: 'roas', label: 'Ad return (ROAS)' },
    { key: 'leads', label: 'Interested people' }, { key: 'fulfilled', label: 'Orders' },
  ],
  price: [
    { key: 'unit_price', label: 'Selling price' }, { key: 'revenue', label: 'Revenue' }, { key: 'gross_profit', label: 'Gross profit' },
    { key: 'margin', label: 'Margin' }, { key: 'demand', label: 'Customer demand' }, { key: 'fulfilled', label: 'Units sold' },
    { key: 'risk', label: 'Missed sales (units)', upIsGood: false },
  ],
  inventory: [
    { key: 'revenue', label: 'Revenue' }, { key: 'gross_profit', label: 'Gross profit' }, { key: 'fulfilled', label: 'Units sold' },
    { key: 'risk', label: 'Missed sales (units)', upIsGood: false }, { key: 'purchase_commitment', label: 'Purchase cost', upIsGood: false },
    { key: 'first_stockout_day', label: 'First stock-out day' },
  ],
}

export function compareRows(type: ScenarioType, base: Row | undefined, alt: Row | undefined): CompareRow[] {
  if (!base || !alt) return []
  return COMPARE[type].flatMap(({ key, label, upIsGood = true }) => {
    const b = base[key], a = alt[key]
    if (typeof b !== 'number' || typeof a !== 'number') return []
    return [{ key, label, before: b, after: a, kind: key === 'first_stockout_day' ? 'count' : metricKind(key), upIsGood }]
  })
}

const IMPACT: Record<string, { label: string; kind: MetricKind; signed: boolean; upIsGood: boolean }> = {
  contribution_profit_delta_vnd: { label: 'Profit', kind: 'money', signed: true, upIsGood: true },
  profit_delta_vnd: { label: 'Profit', kind: 'money', signed: true, upIsGood: true },
  attributed_revenue_delta_vnd: { label: 'Revenue', kind: 'money', signed: true, upIsGood: true },
  estimated_units_recovered: { label: 'Extra units sold', kind: 'count', signed: true, upIsGood: true },
  avoided_stockout_units: { label: 'Extra units sold', kind: 'count', signed: true, upIsGood: true },
  purchase_commitment: { label: 'Purchase cost', kind: 'money', signed: false, upIsGood: false },
}

export function impactItems(impact: Record<string, number> | null | undefined) {
  return Object.entries(impact ?? {}).flatMap(([k, value]) => (IMPACT[k] && typeof value === 'number' ? [{ ...IMPACT[k], value }] : []))
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
export function sortByPriority<T extends { priority?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (PRIORITY_RANK[a.priority ?? ''] ?? 3) - (PRIORITY_RANK[b.priority ?? ''] ?? 3))
}

/** Backend titles are English templates; only the product name varies. */
export function localizeRecTitle(title: string, t: (s: string) => string): string {
  const m = /^Review replenishment for (.+)$/.exec(title)
  return m ? t('Review replenishment for {name}').replace('{name}', m[1]) : t(title)
}
