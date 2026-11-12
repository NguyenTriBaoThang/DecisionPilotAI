import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import * as api from '../api'
import { investigateHref } from '../investigate'
import { TodayPage } from '../redesign/TodayPage'
import { tryFirstHref } from '../redesign/logic'
import { OPTIONS, renderPage } from './redesignHelpers'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, request: vi.fn() }
})

const DATASET = { dataset_id: 'd1', kind: 'demo', start: '2025-01-01', end: '2026-09-30', title: 'Demo', counts: {} } as api.Dataset

function mockApi(forecast: 'ok' | 'fail') {
  vi.mocked(api.request).mockImplementation(async (path: string) => {
    if (path.startsWith('/kpi/summary'))
      return {
        summary: { revenue: 3381128200, gross_profit: 1338005717, margin: 0.3957, orders: 1537, aov: 2199823, customers: 1404, new_customers: 25, returning_customers: 1379, spend: 440635324, roas: 2.7558 },
        changes: { revenue: -0.306, gross_profit: -0.3275, orders: -0.3055, spend: 0.2778, roas: -0.5457 },
        range: ['2026-09-01', '2026-09-30'],
        previous_range: ['2026-08-02', '2026-08-31'],
        trend: [
          { date: '2026-09-01', revenue: 175943600, gross_profit: 67380539 },
          { date: '2026-09-02', revenue: 120000000, gross_profit: 50000000 },
        ],
        products: [
          { name: 'SmartDesk Mini', revenue: 339262500 },
          { name: 'ErgoChair', revenue: 210000000 },
        ],
        regions: [{ name: 'Hanoi', revenue: 946523300 }, { name: 'Da Nang', revenue: 500000000 }],
        sales_channels: [{ name: 'Online', revenue: 2044284600 }, { name: 'Store', revenue: 1336843600 }],
        marketing_channels: [
          { name: 'Facebook Ads', spend: 215292715, attributed_revenue: 162712550, roas: 0.7558 },
          { name: 'Email', spend: 15264724, attributed_revenue: 196273350, roas: 12.858 },
        ],
      } as never
    if (path.startsWith('/anomalies'))
      return { rows: [{ id: 'a1', metric: 'facebook_spend', severity: 'critical', deviation: 0.84, actual: 7.3e6, baseline: 4e6 }] } as never
    if (path === '/recommendations')
      return { rows: [{ id: 'marketing:facebook', title: 'Review Facebook Ads allocation', decision: 'pending', action: 'Reduce Facebook budget 15%' }] } as never
    if (path === '/forecast') {
      if (forecast === 'fail') throw new Error('boom')
      return { total: 3.4e9 } as never
    }
    throw new Error('unexpected ' + path)
  })
}

beforeEach(() => {
  vi.mocked(api.request).mockReset()
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never
  }
})

describe('TodayPage', () => {
  it('shows four stats, honest ROAS badge, briefing from data, and the three notes', async () => {
    mockApi('ok')
    renderPage(<TodayPage dataset={DATASET} options={OPTIONS} />)
    for (const label of ['Doanh thu', 'Lãi gộp', 'Đơn hàng', 'Quảng cáo thu về']) {
      expect(await screen.findByText(label)).toBeTruthy()
    }
    expect((await screen.findAllByText('Tốt')).length).toBeGreaterThan(0)
    expect(await screen.findByText(/giảm 30[,.]6/)).toBeTruthy()
    const links = (await screen.findAllByRole('link')).map((a) => a.getAttribute('href'))
    await waitFor(() => {
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
      expect(hrefs).toContain(investigateHref('facebook_spend'))
      expect(hrefs).toContain(tryFirstHref({ id: 'marketing:facebook' }, OPTIONS))
    })
    expect(links.length).toBeGreaterThan(0)
    expect(await screen.findByText(/ước tính/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\blỗ\b/)
  })

  it('shows dashboard detail: changes vs last period, breakdowns and ad table', async () => {
    mockApi('ok')
    renderPage(<TodayPage dataset={DATASET} options={OPTIONS} />)
    expect(await screen.findByText('Giá trị đơn TB')).toBeTruthy()
    expect(screen.getByText('Tiền quảng cáo')).toBeTruthy()
    expect(screen.getByText('Khách hàng')).toBeTruthy()
    expect((await screen.findAllByText(/▼ 30[,.]6%/)).length).toBeGreaterThan(0)
    expect(screen.getByText('Doanh thu & lãi gộp theo ngày')).toBeTruthy()
    expect(screen.getByText('Top sản phẩm')).toBeTruthy()
    expect(screen.getByText('SmartDesk Mini')).toBeTruthy()
    expect(screen.getByText('Hanoi')).toBeTruthy()
    const adTable = screen.getByRole('table', { name: 'Hiệu quả quảng cáo theo kênh' })
    expect(adTable.textContent).toContain('Facebook Ads')
    expect(adTable.textContent).toContain('Thu về chưa đủ vốn')
    expect(adTable.textContent).not.toMatch(/\blỗ\b/)
  })

  it('keeps the other cards when the forecast fails', async () => {
    mockApi('fail')
    renderPage(<TodayPage dataset={DATASET} options={OPTIONS} />)
    expect(await screen.findByText('Chưa tải được dự báo')).toBeTruthy()
    expect(await screen.findByText('Doanh thu')).toBeTruthy()
  })

  it('shows an empty state linking to Data when there is no dataset', () => {
    renderPage(<TodayPage options={OPTIONS} />)
    expect(screen.getByRole('link', { name: /Dữ liệu|tải dữ liệu/i }).getAttribute('href')).toBe('/data-sources')
  })
})
