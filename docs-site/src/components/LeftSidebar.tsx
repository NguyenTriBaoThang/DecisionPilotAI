import { NAV_SECTIONS, type NavSection } from '../data/site'
import { Rocket, Server, Cpu, Wrench, BookOpen } from 'lucide-react'

const GROUPS = [
  { name: 'Getting Started', icon: <Rocket size={14} className="cyan" /> },
  { name: 'Architecture & Data', icon: <Server size={14} className="violet" /> },
  { name: 'AI & Analytics', icon: <Cpu size={14} className="indigo" /> },
  { name: 'Development', icon: <Wrench size={14} className="green" /> },
  { name: 'Reference', icon: <BookOpen size={14} className="amber" /> },
] as const

export function LeftSidebar({ activeId }: { activeId: string }) {
  const getSectionsByGroup = (groupName: string) => {
    return NAV_SECTIONS.filter((s) => s.group === groupName)
  }

  return (
    <aside className="left-sidebar">
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
                  href={`#sec-${sec.id}`}
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
  )
}

