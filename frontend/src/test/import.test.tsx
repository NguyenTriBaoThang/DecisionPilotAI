import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DataSourcesPage } from '../components/DataSourcesPage'
import { request, uploadSnapshot, type Dataset } from '../api'

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), request: vi.fn(), uploadSnapshot: vi.fn() }))
const dataset: Dataset = { dataset_id: 'a'.repeat(24), kind: 'imported', start: '2026-01-01', end: '2026-01-31', title: 'Test', counts: {} }
it('requires confirmation, sends the expected snapshot ID, and displays import conflicts', async () => {
  vi.mocked(request).mockResolvedValue({ model_ready: false, database_dialect: 'sqlite' })
  vi.mocked(uploadSnapshot).mockRejectedValue(new Error('Dataset changed. Reload metadata before retrying.'))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><DataSourcesPage dataset={dataset} session={{ actor: 'admin', role: 'admin', authentication: 'token', import_enabled: true }} /></QueryClientProvider>)
  expect(screen.getByText('31 Calendar Days')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Security Import Token (X-Import-Token)'), { target: { value: 'import-key' } })
  const file = new File(['data'], 'business.zip')
  fireEvent.change(screen.getByLabelText('Business snapshot file'), { target: { files: [file] } })
  const button = screen.getByRole('button', { name: 'Replace snapshot' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(button)
  await waitFor(() => expect(uploadSnapshot).toHaveBeenCalledWith(file, dataset.dataset_id, 'import-key'))
  await screen.findByText('Dataset changed. Reload metadata before retrying.')
})
