import type { Alert, KPI, Options, QueryResult } from '../api'

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
