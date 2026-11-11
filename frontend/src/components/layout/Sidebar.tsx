import { Link, NavLink } from 'react-router-dom'
import {
  Activity,
  BookOpen,
  Compass,
  Database,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  X,
} from 'lucide-react'
import { useT } from '../../preferences'

export interface NavItem {
  to: string
  title: string
  icon: typeof LayoutDashboard
  end?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { to: '/', title: 'Executive Dashboard', icon: LayoutDashboard, end: true },
      { to: '/ask', title: 'Ask Business Data', icon: MessageSquareText },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { to: '/anomalies', title: 'Anomaly Center', icon: Activity },
      { to: '/forecast', title: 'Forecast Center', icon: TrendingUp },
    ],
  },
  {
    label: 'PLANNING',
    items: [
      { to: '/scenarios', title: 'Scenario Simulator', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'GOVERNANCE',
    items: [
      { to: '/recommendations', title: 'Recommendations & Audit', icon: Compass },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { to: '/data-sources', title: 'Data Sources', icon: Database },
      { to: '/settings', title: 'Settings', icon: Settings },
      { to: '/docs', title: 'Documentation', icon: BookOpen },
    ],
  },
]

interface SidebarProps {
  open: boolean
  collapsed: boolean
  onCloseMobile: () => void
}

export function BrandLogo() {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-lg text-white flex-shrink-0"
      style={{ background: 'var(--primary)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="13" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x="10" y="8" width="4" height="13" rx="1" fill="currentColor" fillOpacity="0.95" />
        <rect x="17" y="4" width="4" height="17" rx="1" fill="currentColor" />
      </svg>
    </span>
  )
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
    >
      {/* Brand Header */}
      <div
        className={`flex items-center justify-between border-b px-4 py-3.5 ${
          collapsed ? 'lg:justify-center lg:px-2' : ''
        }`}
        style={{ borderColor: 'var(--border)' }}
      >
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <BrandLogo />
          <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <strong
              className="block text-sm font-bold tracking-tight truncate"
              style={{ color: 'var(--heading)' }}
            >
              DecisionPilot <span style={{ color: 'var(--primary)' }}>AI</span>
            </strong>
            <small
              className="block text-[10px] font-medium tracking-wide truncate"
              style={{ color: 'var(--text-secondary)' }}
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
                className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider uppercase"
                style={{ color: 'var(--text-muted)' }}
              >
                {t(group.label)}
              </div>
            )}
            <nav className="space-y-0.5">
              {group.items.map(({ to, title, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={t(title)}
                  aria-label={collapsed ? t(title) : undefined}
                  style={({ isActive }) =>
                    isActive
                      ? {
                          background: 'var(--sidebar-active)',
                          color: 'var(--primary-text)',
                        }
                      : {
                          color: 'var(--text-secondary)',
                        }
                  }
                  className={({ isActive }) =>
                    `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                      isActive
                        ? 'font-semibold'
                        : 'font-medium hover:bg-[var(--sidebar-hover)] hover:text-[var(--heading)]'
                    } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`
                  }
                >
                  <Icon size={17} className="flex-shrink-0" />
                  <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{t(title)}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  )
}

