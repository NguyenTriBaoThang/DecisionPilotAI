import { Github, Search as SearchIcon, ExternalLink, Activity } from 'lucide-react'
import { REPO_URL, APP_DEMO_URL, VERSION, COMPETITION } from '../data/site'

export function Header({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <header className="app-header">
      <div className="header-container">
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a href="#sec-overview" className="brand-wrapper">
            <img src="./logo.png" alt="DecisionPilot AI" className="brand-logo" />
            <span className="brand-title">DecisionPilot AI</span>
            <span className="brand-badge">{VERSION}</span>
          </a>

          <div className="hackathon-badge" style={{ display: 'none' }}>
            <Activity size={12} />
            <span>{COMPETITION}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="nav-actions">
          <button type="button" className="btn-search" onClick={onOpenSearch} aria-label="Search technical docs">
            <SearchIcon size={15} />
            <span>Search documentation...</span>
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

