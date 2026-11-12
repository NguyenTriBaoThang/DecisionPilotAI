import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PreferencesProvider } from '../preferences'
import { ToastProvider } from '../ui'
import type { Options } from '../api'

export const OPTIONS: Options = {
  products: [
    { product_id: 'P001', product_name: 'SmartDesk Mini', category: 'Furniture', is_physical: true },
    { product_id: 'P003', product_name: 'ErgoChair', category: 'Furniture', is_physical: true },
  ],
  marketing_channels: ['Facebook Ads', 'Google Ads'],
  regions: [],
  categories: [],
  channels: [],
}

/** Renders a page inside the app providers at `route`; `path` is the route pattern the page is mounted on. */
export function renderPage(ui: ReactElement, { route = '/', path = '*', language = 'vi' }: { route?: string; path?: string; language?: 'vi' | 'en' } = {}) {
  localStorage.setItem('dp-preferences', JSON.stringify({ language, currency: 'vnd' }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  )
}
