import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import * as api from '../api'
import { TryFirstPage } from '../redesign/TryFirstPage'
import { OPTIONS, renderPage } from './redesignHelpers'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, request: vi.fn() }
})

const DATASET = { dataset_id: 'd1', kind: 'demo', start: '2025-01-01', end: '2026-09-30', title: 'Demo', counts: {} } as api.Dataset
const SIM = {
  simulation_id: 's1',
  dataset_id: 'd1',
  decision: 'pending',
  type: 'marketing',
  baseline: { name: 'Current spend', revenue: 111927375, profit: -177084714, spend: 222470051, revenue_delta: 0, profit_delta: 0 },
  alternatives: [
    { name: 'Current spend', revenue: 111927375, profit: -177084714, spend: 222470051, revenue_delta: 0, profit_delta: 0 },
    { name: '-15% budget', revenue: 100706759, profit: -148264044, spend: 189099543, revenue_delta: -11220616, profit_delta: 28820670 },
  ],
  recommended: { name: '-15% budget' },
  assumptions: [],
  evidence: {},
  sensitivity: [],
}
const ROUTE = '/scenarios?type=marketing&channel=Facebook%20Ads&change=-0.15&rec=marketing%3Afacebook'

beforeEach(() => {
  vi.mocked(api.request).mockReset()
  vi.mocked(api.request).mockImplementation(async (path: string) => {
    if (path === '/simulate') return SIM as never
    if (path === '/scenarios/feedback') return { decision: 'accepted', id: 7 } as never
    throw new Error('unexpected ' + path)
  })
})

describe('TryFirstPage', () => {
  it('auto-runs the linked scenario and records the decision with the recommendation id', async () => {
    renderPage(<TryFirstPage dataset={DATASET} options={OPTIONS} canEdit />, { route: ROUTE })
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/simulate', expect.objectContaining({ type: 'marketing' })))
    const body = vi.mocked(api.request).mock.calls.find((c) => c[0] === '/simulate')?.[1] as { parameters: { channel: string; changes: number[] } }
    expect(body.parameters).toEqual({ channel: 'Facebook Ads', changes: [-0.15] })
    expect((await screen.findAllByText('Doanh thu')).length).toBeGreaterThan(0)
    expect(screen.getByText('Lãi')).toBeTruthy()
    expect(screen.getAllByText('Tiền quảng cáo').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Chọn làm' }))
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        '/scenarios/feedback',
        expect.objectContaining({ simulation_id: 's1', decision: 'accepted', recommendation_id: 'marketing:facebook' })
      )
    )
    expect(await screen.findByText(/Đã ghi: Chọn làm/)).toBeTruthy()
  })

  it('refreshes recommendations and the decision log after a decision', async () => {
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    renderPage(<TryFirstPage dataset={DATASET} options={OPTIONS} canEdit />, { route: ROUTE })
    fireEvent.click(await screen.findByRole('button', { name: 'Chọn làm' }))
    await waitFor(() => {
      const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]))
      expect(keys).toContain(JSON.stringify({ queryKey: ['recommendations'] }))
      expect(keys).toContain(JSON.stringify({ queryKey: ['audit'] }))
    })
    spy.mockRestore()
  })

  it('disables decisions for viewers', async () => {
    renderPage(<TryFirstPage dataset={DATASET} options={OPTIONS} canEdit={false} />, { route: ROUTE })
    await screen.findAllByText('Doanh thu')
    expect((screen.getByRole('button', { name: 'Chọn làm' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Bỏ qua' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a before/after table and the assumptions behind the estimate', async () => {
    vi.mocked(api.request).mockImplementation(async (path: string) => {
      if (path === '/simulate')
        return { ...SIM, assumptions: ['Baseline is the latest 28 observed days.'], evidence: { historical_range: ['2026-09-03', '2026-09-30'] } } as never
      throw new Error('unexpected ' + path)
    })
    renderPage(<TryFirstPage dataset={DATASET} options={OPTIONS} canEdit />, { route: ROUTE })
    const table = await screen.findByRole('table', { name: 'So sánh trước / sau' })
    expect(within(table).getByText('Hiện tại')).toBeTruthy()
    expect(within(table).getByText('Nếu làm')).toBeTruthy()
    const spend = within(table).getByText('Tiền quảng cáo').closest('tr') as HTMLElement
    // Spend going down is good: the change cell is green.
    expect(spend.querySelector('.text-emerald-700')?.textContent).toMatch(/^−/)
    expect(screen.getByText('Baseline is the latest 28 observed days.')).toBeTruthy()
    expect(screen.getByText(/Giả định của phép tính/)).toBeTruthy()
  })
})
