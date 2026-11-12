import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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
    expect(await screen.findByText('Doanh thu')).toBeTruthy()
    expect(screen.getByText('Lãi')).toBeTruthy()
    expect(screen.getByText('Tiền quảng cáo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Chọn làm' }))
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        '/scenarios/feedback',
        expect.objectContaining({ simulation_id: 's1', decision: 'accepted', recommendation_id: 'marketing:facebook' })
      )
    )
    expect(await screen.findByText(/Đã ghi: Chọn làm/)).toBeTruthy()
  })

  it('disables decisions for viewers', async () => {
    renderPage(<TryFirstPage dataset={DATASET} options={OPTIONS} canEdit={false} />, { route: ROUTE })
    await screen.findByText('Doanh thu')
    expect((screen.getByRole('button', { name: 'Chọn làm' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Bỏ qua' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
