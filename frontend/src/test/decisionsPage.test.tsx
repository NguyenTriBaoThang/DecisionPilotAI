import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import * as api from '../api'
import { DecisionsPage } from '../redesign/DecisionsPage'
import { OPTIONS, renderPage } from './redesignHelpers'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, request: vi.fn() }
})

const DATASET = { dataset_id: 'd1', kind: 'demo', start: '2025-01-01', end: '2026-09-30', title: 'Demo', counts: {} } as api.Dataset

beforeEach(() => {
  vi.mocked(api.request).mockReset()
  vi.mocked(api.request).mockImplementation(async (path: string) => {
    if (path === '/recommendations')
      return {
        rows: [
          { id: 'marketing:facebook', title: 'Review Facebook Ads allocation', decision: 'pending' },
          { id: 'sales:decline', title: 'Investigate the largest product contribution', decision: 'pending' },
          { id: 'inventory:P001', title: 'Review replenishment for SmartDesk Mini', decision: 'accepted' },
        ],
      } as never
    if (path.startsWith('/audit'))
      return {
        rows: [
          { id: 2, occurred_at: '2026-11-12T09:00:00+07:00', kind: 'scenario_feedback', subject: 'sim-1', payload: { decision: 'accepted', actor: 'chi-lan' } },
          { id: 1, occurred_at: '2026-11-10T09:00:00+07:00', kind: 'recommendation_feedback', subject: 'price:P001', payload: { decision: 'rejected', actor: 'chi-lan', recommendation: { title: 'Discount SmartDesk 10%' } } },
        ],
        next_before: null,
      } as never
    if (path === '/recommendations/feedback') return { ok: true } as never
    throw new Error('unexpected ' + path)
  })
})

describe('DecisionsPage', () => {
  it('counts chosen / skipped / pending and lists pending suggestions first', async () => {
    renderPage(<DecisionsPage dataset={DATASET} options={OPTIONS} canEdit />)
    await waitFor(() => {
      expect(within(screen.getByTestId('count-chosen')).getByText('1')).toBeTruthy()
      expect(within(screen.getByTestId('count-skipped')).getByText('1')).toBeTruthy()
      expect(within(screen.getByTestId('count-pending')).getByText('2')).toBeTruthy()
    })

    const fb = screen.getByTestId('rec-marketing:facebook')
    expect(within(fb).getByRole('link', { name: 'Thử trước' }).getAttribute('href')).toContain('/scenarios?type=marketing')
    const sales = screen.getByTestId('rec-sales:decline')
    expect(within(sales).queryByRole('link', { name: 'Thử trước' })).toBeNull()

    fireEvent.click(within(sales).getByRole('button', { name: 'Bỏ qua' }))
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith('/recommendations/feedback', expect.objectContaining({ recommendation_id: 'sales:decline', decision: 'rejected' }))
    )
  })

  it('shows each logged decision with actor, title and status', async () => {
    renderPage(<DecisionsPage dataset={DATASET} options={OPTIONS} canEdit />)
    const row = await screen.findByTestId('log-1')
    expect(within(row).getByText('Discount SmartDesk 10%')).toBeTruthy()
    expect(within(row).getByText(/chi-lan/)).toBeTruthy()
    expect(within(row).getByText('Đã bỏ qua')).toBeTruthy()
    expect(within(screen.getByTestId('log-2')).getByText('Đã chọn làm')).toBeTruthy()
  })

  it('disables decisions for viewers', async () => {
    renderPage(<DecisionsPage dataset={DATASET} options={OPTIONS} canEdit={false} />)
    const fb = await screen.findByTestId('rec-marketing:facebook')
    expect((within(fb).getByRole('button', { name: 'Chọn làm' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
