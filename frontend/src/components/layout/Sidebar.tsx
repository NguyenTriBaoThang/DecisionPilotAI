import { Link, NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { useT } from '../../preferences'
import { illus, type IllusName } from '../../redesign/illustrations'

export interface NavItem {
  to: string
  title: string
  illus: IllusName
  end?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'MAIN',
    items: [
      { to: '/', title: 'Bản tin', illus: 'sun', end: true },
      { to: '/cases', title: 'Vụ việc', illus: 'clipboard' },
      { to: '/advanced', title: 'Nâng cao', illus: 'testtube' },
    ],
  },
  {
    label: 'OTHER',
    items: [
      { to: '/data-sources', title: 'Data', illus: 'filebox' },
      { to: '/today', title: 'Hôm nay', illus: 'sun' },
      { to: '/ask', title: 'Hỏi AI', illus: 'chat' },
      { to: '/scenarios', title: 'Thử trước', illus: 'slider' },
      { to: '/decisions', title: 'Quyết định', illus: 'clipboard' },
    ],
  },
]

interface SidebarProps {
  open: boolean
  collapsed: boolean
  onCloseMobile: () => void
}

export function BrandLogo() {
  return <img src={illus('airplane')} alt="" aria-hidden="true" width={30} height={30} className="flex-shrink-0" />
}

export function Sidebar({
  open,
  collapsed,
  onCloseMobile,
}: SidebarProps) {
  const { t } = useT()

  return (
    <aside
      aria-label="Primary navigation"
      className={`dp-sidebar ${open ? 'sidebar-open' : ''}`}
      style={{ background: 'linear-gradient(180deg,#14306b,#1b2c5c)', borderColor: 'transparent' }}
    >
      {/* Brand Header */}
      <div
        className={`flex items-center justify-between border-b px-4 py-3.5 ${
          collapsed ? 'lg:justify-center lg:px-2' : ''
        }`}
        style={{ borderColor: 'rgba(255,255,255,0.12)' }}
      >
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <BrandLogo />
          <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <strong
              className="block text-sm font-bold tracking-tight truncate"
              style={{ color: '#ffffff' }}
            >
              DecisionPilot <span style={{ color: '#fde68a' }}>AI</span>
            </strong>
            <small
              className="block text-[10px] font-medium tracking-wide truncate"
              style={{ color: '#c7d4ff' }}
            >
              {t('Decision Intelligence')}
            </small>
          </div>
        </Link>

        <button
          type="button"
          className="dp-mobile-only p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)]"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={t('Close navigation')}
          onClick={onCloseMobile}
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && (
              <div
                className="px-2.5 pb-1 text-[11px] font-bold tracking-wider uppercase"
                style={{ color: '#8fa3d6' }}
              >
                {t(group.label)}
              </div>
            )}
            <nav className="space-y-0.5">
              {group.items.map(({ to, title, illus: art, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={t(title)}
                  aria-label={collapsed ? t(title) : undefined}
                  style={({ isActive }) =>
                    isActive ? { background: 'rgba(255,255,255,0.14)', color: '#ffffff' } : { color: '#dbe4ff' }
                  }
                  className={({ isActive }) =>
                    `group flex min-h-[40px] items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] transition-colors ${
                      isActive
                        ? 'font-semibold'
                        : 'font-semibold hover:bg-white/10 hover:text-white'
                    } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`
                  }
                >
                  <img src={illus(art)} alt="" aria-hidden="true" width={22} height={22} className="flex-shrink-0" />
                  <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{t(title)}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
      </div>
      <div className={`border-t px-3 py-3 ${collapsed ? 'lg:hidden' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
        <Link to="/settings" className="block rounded-xl px-2.5 py-2 text-[13px] font-semibold text-[#c7d4ff] hover:bg-white/10 hover:text-white">
          {t('Settings')}
        </Link>
      </div>
    </aside>
  )
}

