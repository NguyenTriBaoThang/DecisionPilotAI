import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecommendationsTab } from '../features/scenario-simulator/components/tabs/RecommendationsTab'
import { request, type Scenario } from '../api'

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), request: vi.fn() }))
const scenario: Scenario = {
  simulation_id: 'a'.repeat(64), dataset_id: 'b'.repeat(24), decision: 'pending', type: 'price', objective: 'profit',
  baseline: {}, alternatives: [], recommended: { name: '5% discount', profit_delta: 100, margin: .2, risk: null },
  assumptions: ['Assumed elasticity'], evidence: {}, sensitivity: [],
}
function mount(data: Scenario = scenario) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(['session'], { actor: 'analyst', role: 'analyst', authentication: 'token' })
  return render(<QueryClientProvider client={client}><RecommendationsTab scenarioData={data} /></QueryClientProvider>)
}
describe('Scenario decisions', () => {
  it('records the scenario ID and waits for server confirmation', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(request).mockReturnValue(new Promise(done => { resolve = done }))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Accept scenario' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/scenarios/feedback', {
      simulation_id: scenario.simulation_id, dataset_id: scenario.dataset_id, decision: 'accepted',
    }))
    expect(screen.queryByText(/Decision recorded:/)).toBeNull()
    expect((screen.getByRole('button', { name: 'Accept scenario' }) as HTMLButtonElement).disabled).toBe(true)
    resolve({ decision: 'accepted', id: 12 })
    await screen.findByText('Decision recorded: accepted. Audit event #12.')
  })
  it('keeps the decision pending when the API fails and permits retry', async () => {
    vi.mocked(request).mockRejectedValue(new Error('Dataset changed. Run the scenario again.'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Accept scenario' }))
    await screen.findByText('Dataset changed. Run the scenario again.')
    expect(screen.getByText('STATUS: PENDING')).toBeTruthy()
    expect(screen.queryByText(/Decision recorded:/)).toBeNull()
    expect((screen.getByRole('button', { name: 'Accept scenario' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('does not turn an unknown inventory risk into zero stockouts', () => {
    mount()
    expect(screen.getByText('Not estimated')).toBeTruthy()
  })
})
