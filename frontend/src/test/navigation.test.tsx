import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Sidebar } from '../components/layout/Sidebar'
import { AdvancedPage } from '../redesign/AdvancedPage'
import { renderPage } from './redesignHelpers'

describe('navigation', () => {
  it('shows exactly the 6 plain-language destinations in order', () => {
    renderPage(<Sidebar open collapsed={false} onCloseMobile={() => {}} />)
    const nav = screen.getAllByRole('link').filter((a) => a.closest('nav'))
    expect(nav.map((a) => a.textContent?.trim())).toEqual(['Hôm nay', 'Hỏi AI', 'Thử trước', 'Quyết định', 'Dữ liệu', 'Nâng cao'])
    expect(nav.map((a) => a.getAttribute('href'))).toEqual(['/', '/ask', '/scenarios', '/decisions', '/data-sources', '/advanced'])
    for (const old of ['Anomaly Center', 'Enterprise Knowledge Map', 'Audit & Governance']) {
      expect(screen.queryByText(old)).toBeNull()
    }
  })

  it('Advanced hub links to every enterprise module', () => {
    renderPage(<AdvancedPage />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    for (const h of ['/advanced/copilot', '/advanced/simulator-3d', '/knowledge-map', '/recommendations', '/audit', '/anomalies', '/forecast', '/docs']) {
      expect(hrefs).toContain(h)
    }
  })
})
