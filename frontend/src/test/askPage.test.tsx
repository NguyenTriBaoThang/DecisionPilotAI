import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import * as api from '../api'
import { AskPage } from '../redesign/AskPage'
import { renderPage } from './redesignHelpers'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, request: vi.fn() }
})

const ANSWER: api.QueryResult = {
  answer: 'All campaigns recorded roas of 2.76× from 01 Sep 2026 to 30 Sep 2026. Facebook Ads is lowest at 0.76×.',
  chart: { type: 'bar', x: 'name', y: 'roas', rows: [{ name: 'Facebook Ads', roas: 0.7558 }, { name: 'Google Ads', roas: 3.886 }] },
  trace: { tool: 'marketing', provider: 'rules', sources: ['marketing_campaigns', 'sales_transactions'], formulas: {} },
  evidence: {},
}

beforeEach(() => {
  vi.mocked(api.request).mockReset()
  vi.mocked(api.request).mockResolvedValue(ANSWER as never)
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never
  }
})

describe('AskPage', () => {
  it('auto-sends ?q= once, shows the highlight, sources and a Try-first link', async () => {
    renderPage(<AskPage canEdit />, { route: '/ask?q=' + encodeURIComponent('Which marketing channel had the lowest ROAS?'), language: 'en' })
    expect(await screen.findByText('Which marketing channel had the lowest ROAS?')).toBeTruthy()
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.request).mock.calls[0]).toEqual(['/query', { question: 'Which marketing channel had the lowest ROAS?' }])
    expect(await screen.findByText('0.76×')).toBeTruthy()
    expect(screen.getByText(/marketing_campaigns/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Try first/ }).getAttribute('href')).toBe('/scenarios?type=marketing')
  })

  it('sends a suggested question when its chip is clicked', async () => {
    renderPage(<AskPage canEdit />, { route: '/ask' })
    fireEvent.click(screen.getByRole('button', { name: /Doanh thu tháng này\?/ }))
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/query', { question: 'Doanh thu tháng này?' }))
  })
})
