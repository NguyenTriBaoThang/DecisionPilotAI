import { NAV_SECTIONS } from '../data/site'
import { buildHref, type IntelTabId, type PageId } from '../routes'
import { Rocket, Server, Cpu, Wrench, BookOpen, Home } from 'lucide-react'

const GROUPS = [
  { name: 'Getting Started', icon: <Rocket size={14} className="cyan" /> },
  { name: 'Architecture & Data', icon: <Server size={14} className="violet" /> },
  { name: 'AI & Analytics', icon: <Cpu size={14} className="indigo" /> },
  { name: 'Development', icon: <Wrench size={14} className="green" /> },
  { name: 'Reference', icon: <BookOpen size={14} className="amber" /> },
] as const

interface LeftSidebarProps {
  activeId: PageId
  mobileOpen?: boolean
  onCloseMobile?: () => void
  onNavigate: (page: PageId, options?: { tab?: IntelTabId; hashId?: string }) => void
}

export function LeftSidebar({ activeId, mobileOpen = false, onCloseMobile, onNavigate }: LeftSidebarProps) {
  const getSectionsByGroup = (groupName: string) => {
    return NAV_SECTIONS.filter((s) => s.group === groupName)
  }

  return (
    <>
      <div
        className={`mobile-drawer-overlay ${mobileOpen ? 'open' : ''}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside className={`left-sidebar ${mobileOpen ? 'open' : ''}`} aria-label="Documentation chapters">
        <a
          href={buildHref('home')}
          onClick={(e) => {
            e.preventDefault()
            onNavigate('home')
            onCloseMobile?.()
          }}
          className="sidebar-home-link"
        >
          <Home size={15} />
          <span>Home Portal</span>
        </a>

        {GROUPS.map((grp) => {
          const sections = getSectionsByGroup(grp.name)
          if (sections.length === 0) return null

          return (
            <div key={grp.name}>
              <div className="nav-group-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {grp.icon}
                <span>{grp.name}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '16px' }}>
                {sections.map((sec) => (
                  <a
                    key={sec.id}
                    href={buildHref(sec.id)}
                    onClick={(e) => {
                      e.preventDefault()
                      onNavigate(sec.id)
                      onCloseMobile?.()
                    }}
                    className={`nav-item ${activeId === sec.id ? 'active' : ''}`}
                  >
                    <span className="nav-item-num">{sec.num}</span>
                    <span>{sec.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )
        })}
      </aside>
    </>
  )
}
