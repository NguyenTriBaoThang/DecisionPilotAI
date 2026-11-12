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
        summary: { revenue: 3381128200, margin: 0.3957, orders: 1537, roas: 2.7558 },
        changes: { revenue: -0.306 },
        range: ['2026-09-01', '2026-09-30'],
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
})

describe('TodayPage', () => {
  it('shows four stats, honest ROAS badge, briefing from data, and the three notes', async () => {
    mockApi('ok')
    renderPage(<TodayPage dataset={DATASET} options={OPTIONS} />)
    for (const label of ['Doanh thu', 'Lãi gộp', 'Đơn hàng', 'Quảng cáo thu về']) {
      expect(await screen.findByText(label)).toBeTruthy()
    }
    expect(await screen.findByText('Tốt')).toBeTruthy()
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
