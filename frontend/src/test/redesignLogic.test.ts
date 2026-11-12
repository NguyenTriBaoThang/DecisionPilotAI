import { describe, expect, it } from 'vitest'
import type { Alert, KPI, Options } from '../api'
import {
  briefingSentence,
  decisionBucket,
  highlightFromChart,
  roasLabel,
  scenarioForQuestion,
  tryFirstHref,
} from '../redesign/logic'

const opts: Options = {
  products: [{ product_id: 'P001', product_name: 'SmartDesk Mini', category: 'x', is_physical: true }],
  marketing_channels: ['Facebook Ads', 'Google Ads'],
  regions: [],
  categories: [],
  channels: [],
}

describe('roasLabel', () => {
  it('never calls ROAS below 1 a loss, grades by payback', () => {
    expect(roasLabel(0.76)?.kind).toBe('bad')
    expect(roasLabel(1)?.kind).toBe('normal')
    expect(roasLabel(2.76)?.kind).toBe('good')
    expect(roasLabel(null)).toBeNull()
    expect(roasLabel(0.76)?.key.toLowerCase()).not.toContain('loss')
  })
})

describe('decisionBucket', () => {
  it('maps decisions into chosen / skipped / pending', () => {
    expect(decisionBucket('accepted')).toBe('chosen')
    expect(decisionBucket('rejected')).toBe('skipped')
    expect(decisionBucket('pending')).toBe('pending')
    expect(decisionBucket(undefined)).toBe('pending')
  })
})

describe('scenarioForQuestion', () => {
  it('maps questions to a simulator type in EN and VI', () => {
    expect(scenarioForQuestion('Which marketing channel had the lowest ROAS?')).toBe('marketing')
    expect(scenarioForQuestion('Quảng cáo nào đang lỗ?')).toBe('marketing')
    expect(scenarioForQuestion('Có nên giảm giá SmartDesk?')).toBe('price')
    expect(scenarioForQuestion('Hàng nào sắp hết?')).toBe('inventory')
    expect(scenarioForQuestion('Doanh thu tháng này?')).toBeNull()
  })
})

describe('tryFirstHref', () => {
  it('builds simulator links only for mappable recommendations', () => {
    expect(tryFirstHref({ id: 'marketing:facebook' }, opts)).toBe(
      '/scenarios?type=marketing&channel=Facebook+Ads&change=-0.15&rec=marketing%3Afacebook'
    )
    expect(tryFirstHref({ id: 'inventory:P001' }, opts)).toBe('/scenarios?type=inventory&product=P001&rec=inventory%3AP001')
    expect(tryFirstHref({ id: 'sales:decline' }, opts)).toBeNull()
    expect(tryFirstHref({ id: 'inventory:P999' }, opts)).toBeNull()
  })
})

describe('highlightFromChart', () => {
  it('picks the row the answer names first', () => {
    const chart = {
      type: 'bar',
      x: 'name',
      y: 'roas',
      rows: [
        { name: 'Google Ads', roas: 3.89 },
        { name: 'Facebook Ads', roas: 0.76 },
      ],
    }
    expect(highlightFromChart('Facebook Ads is lowest at 0.76×.', chart)).toEqual({ name: 'Facebook Ads', value: 0.76, y: 'roas' })
    expect(highlightFromChart('No chart', null)).toBeNull()
  })
})

describe('briefingSentence', () => {
  it('states the revenue direction from data and mentions a critical alert', () => {
    const kpi = { summary: { revenue: 3.38e9 }, changes: { revenue: -0.306 } } as unknown as KPI
    const alerts = [{ metric: 'facebook_spend', severity: 'critical', deviation: 0.84 } as unknown as Alert]
    const s = briefingSentence(kpi, alerts, (x) => x)
    expect(s).toContain('30.6')
    expect(s).toMatch(/down|giảm/i)
    expect(s).toMatch(/facebook/i)
  })
})

import { parseTryFirstParams } from '../redesign/logic'

describe('parseTryFirstParams', () => {
  it('reads the new link format', () => {
    const p = parseTryFirstParams(new URLSearchParams('type=marketing&channel=Facebook%20Ads&change=-0.15&rec=marketing%3Afacebook'))
    expect(p).toMatchObject({ type: 'marketing', channel: 'Facebook Ads', change: -0.15, rec: 'marketing:facebook', autorun: true })
  })
  it('accepts the legacy tab/autorun format still produced by RecommendationsCenter', () => {
    const p = parseTryFirstParams(new URLSearchParams('tab=marketing&channel=Facebook%20Ads&autorun=1&rec=x'))
    expect(p).toMatchObject({ type: 'marketing', channel: 'Facebook Ads', rec: 'x', autorun: true })
  })
  it('defaults to marketing without autorun', () => {
    expect(parseTryFirstParams(new URLSearchParams(''))).toMatchObject({ type: 'marketing', autorun: false })
  })
})

import { compareRows, impactItems, metricKind, sortByPriority } from '../redesign/logic'

describe('compareRows (Try first before/after table)', () => {
  const base = { revenue: 100, gross_profit: 40, profit: -60, margin: 0.4, spend: 200, roas: 0.5, leads: 1000, fulfilled: 50 }
  const alt = { revenue: 90, gross_profit: 36, profit: -40, margin: 0.4, spend: 170, roas: 0.53, leads: 900, fulfilled: 46 }

  it('lists marketing metrics with spend marked as lower-is-better', () => {
    const rows = compareRows('marketing', base, alt)
    expect(rows.map((r) => r.key)).toEqual(['revenue', 'gross_profit', 'profit', 'spend', 'roas', 'leads', 'fulfilled'])
    expect(rows.find((r) => r.key === 'spend')).toMatchObject({ before: 200, after: 170, upIsGood: false, kind: 'money' })
    expect(rows.find((r) => r.key === 'roas')?.kind).toBe('ratio')
  })

  it('skips metrics the scenario did not return and handles inventory fields', () => {
    const rows = compareRows('inventory', { revenue: 1, fulfilled: 55, purchase_commitment: 0, risk: 150, first_stockout_day: 9 }, { revenue: 2, fulfilled: 95, purchase_commitment: 66, risk: 110, first_stockout_day: 9 })
    expect(rows.map((r) => r.key)).toEqual(['revenue', 'fulfilled', 'risk', 'purchase_commitment', 'first_stockout_day'])
    expect(rows.find((r) => r.key === 'risk')?.upIsGood).toBe(false)
  })

  it('returns nothing without a result', () => {
    expect(compareRows('price', undefined, undefined)).toEqual([])
  })
})

describe('impactItems (Decisions expected impact)', () => {
  it('maps known impact keys to labelled, signed values and drops unknown keys', () => {
    expect(impactItems({ contribution_profit_delta_vnd: 28820670, attributed_revenue_delta_vnd: -11220616, weird_key: 3 })).toEqual([
      { label: 'Profit', value: 28820670, kind: 'money', signed: true, upIsGood: true },
      { label: 'Revenue', value: -11220616, kind: 'money', signed: true, upIsGood: true },
    ])
    expect(impactItems({ estimated_units_recovered: 111.75, purchase_commitment: 237600000 })).toEqual([
      { label: 'Extra units sold', value: 111.75, kind: 'count', signed: true, upIsGood: true },
      { label: 'Purchase cost', value: 237600000, kind: 'money', signed: false, upIsGood: false },
    ])
    expect(impactItems(null)).toEqual([])
  })
})

describe('metricKind / sortByPriority', () => {
  it('guesses the format from the column name', () => {
    expect(metricKind('revenue')).toBe('money')
    expect(metricKind('gross_profit')).toBe('money')
    expect(metricKind('units')).toBe('count')
    expect(metricKind('margin')).toBe('pct')
    expect(metricKind('roas')).toBe('ratio')
  })
  it('puts high priority first and keeps order otherwise', () => {
    expect(sortByPriority([{ id: 'a', priority: 'medium' }, { id: 'b', priority: 'high' }, { id: 'c', priority: 'low' }, { id: 'd', priority: 'high' }]).map((x) => x.id)).toEqual(['b', 'd', 'a', 'c'])
  })
})
