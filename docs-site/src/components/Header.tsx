import { BookOpen, Cpu, ExternalLink, Github, Home, Menu, Search as SearchIcon, X } from 'lucide-react'
import { APP_DEMO_URL, REPO_URL, VERSION } from '../data/site'
import { BASE_URL, buildHref, type IntelTabId, type PageId } from '../routes'

interface HeaderProps {
  activePage: PageId
  mobileNavOpen: boolean
  onToggleMobileNav: () => void
  onNavigate: (page: PageId, options?: { tab?: IntelTabId; hashId?: string }) => void
  onOpenSearch: () => void
}

export function Header({
  activePage,
  mobileNavOpen,
  onToggleMobileNav,
  onNavigate,
  onOpenSearch,
}: HeaderProps) {
  const isDocsActive = activePage !== 'home' && activePage !== 'data-decision-intelligence'

  return (
    <header className="app-header">
      <div className="header-container">
        {/* Brand & Top Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activePage !== 'home' && (
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={onToggleMobileNav}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}

          <a
            href={buildHref('home')}
            onClick={(e) => {
              e.preventDefault()
              onNavigate('home')
            }}
            className="brand-wrapper"
          >
            <img src={`${BASE_URL}logo.png`} alt="DecisionPilot AI" className="brand-logo" />
            <span className="brand-title">DecisionPilot AI</span>
            <span className="brand-badge">{VERSION}</span>
          </a>

          <nav className="header-nav" aria-label="Portal sections">
            <a
              href={buildHref('home')}
              onClick={(e) => {
                e.preventDefault()
                onNavigate('home')
              }}
              className={`header-nav-link ${activePage === 'home' ? 'active' : ''}`}
            >
              <Home size={14} />
              <span>Home</span>
            </a>

            <a
              href={buildHref(isDocsActive ? activePage : 'overview')}
              onClick={(e) => {
                e.preventDefault()
                onNavigate(isDocsActive ? activePage : 'overview')
              }}
              className={`header-nav-link ${isDocsActive ? 'active' : ''}`}
            >
              <BookOpen size={14} />
              <span>Technical Docs</span>
            </a>

            <a
              href={buildHref('data-decision-intelligence', { tab: 'ask' })}
              onClick={(e) => {
                e.preventDefault()
                onNavigate('data-decision-intelligence', { tab: 'ask' })
              }}
              className={`header-nav-link ${activePage === 'data-decision-intelligence' ? 'active' : ''}`}
            >
              <Cpu size={14} />
              <span>Track 5 Showcase</span>
            </a>
          </nav>
        </div>

        {/* Right Actions */}
        <div className="nav-actions">
          <button type="button" className="btn-search" onClick={onOpenSearch} aria-label="Search technical docs">
            <SearchIcon size={15} />
            <span>Search docs...</span>
            <kbd>Ctrl K</kbd>
          </button>

          <a href={APP_DEMO_URL} target="_blank" rel="noreferrer" className="btn-gh" style={{ color: 'var(--cyan)' }}>
            <ExternalLink size={15} />
            <span>Live App</span>
          </a>

          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-gh">
            <Github size={15} />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </header>
  )
}
