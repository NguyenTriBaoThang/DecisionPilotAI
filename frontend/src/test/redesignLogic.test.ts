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
