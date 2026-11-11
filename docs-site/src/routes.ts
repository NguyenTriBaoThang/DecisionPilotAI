import { NAV_SECTIONS } from './data/site'

export type DocSectionId = (typeof NAV_SECTIONS)[number]['id']
export type PageId = 'home' | DocSectionId
export type IntelTabId = 'ask' | 'analyze' | 'forecast' | 'simulate'

const VALID_IDS = new Set<string>(NAV_SECTIONS.map((s) => s.id))
const VALID_TABS = new Set<IntelTabId>(['ask', 'analyze', 'forecast', 'simulate'])

const rawBase = import.meta.env.BASE_URL || '/'
export const BASE_URL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`

export function restoreDocsRedirectIfNeeded() {
  if (typeof window === 'undefined') return
  const saved = sessionStorage.getItem('dp-docs-redirect')
  if (saved && saved.startsWith(BASE_URL)) {
    sessionStorage.removeItem('dp-docs-redirect')
    window.history.replaceState(null, '', saved)
  }
}

export function isValidSectionId(id: string): id is DocSectionId {
  return VALID_IDS.has(id)
}

export function isValidIntelTab(tab: string | null): tab is IntelTabId {
  return tab !== null && VALID_TABS.has(tab as IntelTabId)
}

export function parseLocation(
  pathname = typeof window !== 'undefined' ? window.location.pathname : BASE_URL,
  search = typeof window !== 'undefined' ? window.location.search : '',
  hash = typeof window !== 'undefined' ? window.location.hash : ''
): { page: PageId; tab?: IntelTabId; hashId?: string } {
  // Backward-compatible support for legacy #sec-<id> links
  if (hash.startsWith('#sec-')) {
    const legacyId = hash.slice(5)
    if (isValidSectionId(legacyId)) {
      return { page: legacyId }
    }
  }

  let relative = pathname
  if (BASE_URL !== '/' && pathname.startsWith(BASE_URL)) {
    relative = pathname.slice(BASE_URL.length)
  } else if (BASE_URL !== '/' && pathname === BASE_URL.slice(0, -1)) {
    relative = ''
  }

  relative = relative.replace(/^\/+|\/+$/g, '')

  const params = new URLSearchParams(search)
  const rawTab = params.get('tab')
  const tab = isValidIntelTab(rawTab) ? rawTab : undefined
  const hashId = hash.startsWith('#') && hash.length > 1 ? hash.slice(1) : undefined

  if (!relative || relative === 'index.html') {
    return { page: 'home', tab, hashId }
  }

  if (relative === 'docs' || relative === 'docs/index.html') {
    return { page: NAV_SECTIONS[0].id, tab, hashId }
  }

  if (relative.startsWith('docs/')) {
    const candidate = relative.slice(5)
    if (isValidSectionId(candidate)) {
      return { page: candidate, tab, hashId }
    }
  }

  if (isValidSectionId(relative)) {
    return { page: relative, tab, hashId }
  }

  return { page: 'home', tab, hashId }
}

export function buildHref(
  page: PageId,
  options?: { tab?: IntelTabId; hashId?: string }
): string {
  const path = page === 'home' ? BASE_URL : `${BASE_URL}docs/${page}`
  const query = page === 'data-decision-intelligence' && options?.tab ? `?tab=${options.tab}` : ''
  const hash = options?.hashId ? `#${options.hashId}` : ''
  return `${path}${query}${hash}`
}

