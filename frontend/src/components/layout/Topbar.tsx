import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bell,
  BookOpen,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  Database,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sun,
  User,
} from 'lucide-react'
import {
  createCompany,
  dateLabel,
  listCompanies,
  percent,
  request,
  type Alert,
  type Dataset,
  type Session,
} from '../../api'
import { useT } from '../../preferences'
import { StatusBadge } from '../../ui'
import { LanguageSwitcher } from '../LanguageSwitcher'

interface TopbarProps {
  activeTitle: string
  companyId: string
  onChangeCompany: (companyId: string) => void
  dataset?: Dataset
  session: Session
  dark: boolean
  setDark: (dark: boolean) => void
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  onOpenMobile: () => void
  onOpenSearch: () => void
}

export function Topbar({
  activeTitle,
  companyId,
  onChangeCompany,
  dataset,
  session,
  dark,
  setDark,
  collapsed,
  setCollapsed,
  onOpenMobile,
  onOpenSearch,
}: TopbarProps) {
  const { t } = useT()
  const queryClient = useQueryClient()
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [createError, setCreateError] = useState('')
  const [deferredReady, setDeferredReady] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: listCompanies,
    staleTime: 60_000,
  })

  const createTenant = useMutation({
    mutationFn: (name: string) => createCompany({ name, activate: true }),
    onSuccess: async (created) => {
      setNewCompanyName('')
      setCreateError('')
      setWorkspaceOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['companies'] })
      onChangeCompany(created.id)
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : 'Unable to create company workspace.')
    },
  })

  useEffect(() => {
    setDeferredReady(false)
    if (!dataset) return
    const timer = window.setTimeout(() => setDeferredReady(true), 6000)
    return () => window.clearTimeout(timer)
  }, [companyId, dataset?.dataset_id])

  const alertsQuery = useQuery({
    queryKey: ['anomalies-radar', companyId, dataset?.dataset_id],
    queryFn: () => request<{ rows: Alert[] }>('/anomalies?limit=6'),
    enabled: !!dataset && (notifOpen || deferredReady),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) setWorkspaceOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const companies = companiesQuery.data?.items || []
  const activeCompany = companies.find((c) => c.id === companyId) || companies[0]
  const canCreateCompany =
    session.role === 'admin' && (!session.company_ids || session.company_ids.includes('*'))

  const alerts = (alertsQuery.data?.rows || []).slice(0, 5)
  const criticalCount = alerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length

  return (
    <header className="dp-topbar px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
      {/* Left: Nav Toggle + Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          className="dp-mobile-only p-2 rounded-lg border hover:bg-[var(--surface-muted)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          aria-label={t('Open navigation')}
          onClick={onOpenMobile}
        >
          <Menu size={17} />
        </button>

        <button
          type="button"
          className="dp-desktop-only p-1.5 rounded-lg border hover:bg-[var(--surface-muted)] transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        <div className="flex items-center gap-2 text-xs min-w-0">
          <Link
            to="/"
            className="hidden sm:inline font-medium hover:text-[var(--heading)] transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            DecisionPilot
          </Link>
          <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
            /
          </span>
          <strong className="font-semibold truncate text-[13px]" style={{ color: 'var(--heading)' }}>
            {t(activeTitle)}
          </strong>
        </div>
      </div>

      {/* Center / Right Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Global Quick Search Trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden md:flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs min-w-[210px] justify-between hover:border-[var(--text-muted)] transition-colors"
          style={{
            background: 'var(--surface-muted)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <span className="flex items-center gap-2">
            <Search size={13} />
            <span>{t('Quick jump or ask…')}</span>
          </span>
          <kbd
            className="rounded border px-1.5 py-0.5 text-[10px] font-mono"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Open quick search"
          className="md:hidden p-2 rounded-lg border hover:bg-[var(--surface-muted)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <Search size={15} />
        </button>

        {/* Multi-Tenant Company Workspace Switcher */}
        <div className="relative" ref={workspaceRef}>
          <button
            type="button"
            onClick={() => {
              setWorkspaceOpen((prev) => !prev)
              setNotifOpen(false)
              setProfileOpen(false)
            }}
            aria-label={t('Company Workspace')}
            aria-expanded={workspaceOpen}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)] transition-colors max-w-[190px]"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--heading)',
            }}
          >
            <Building2 size={13} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
            <span className="truncate">{activeCompany?.name || companyId}</span>
            <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
          </button>

          {workspaceOpen && (
            <div
              className="absolute right-0 mt-2 w-72 rounded-xl border p-2.5 space-y-2 z-50 text-xs"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <div className="flex items-center justify-between px-1.5 pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="font-semibold" style={{ color: 'var(--heading)' }}>
                  {t('Company Workspace')}
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  {companies.length} tenant{companies.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto space-y-1">
                {companies.map((c) => {
                  const selected = c.id === companyId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setWorkspaceOpen(false)
                        if (c.id !== companyId) onChangeCompany(c.id)
                      }}
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]"
                      style={selected ? { background: 'var(--primary-soft)' } : undefined}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
                          {c.name}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {c.dataset_count ?? 0} dataset{(c.dataset_count ?? 0) === 1 ? '' : 's'}
                          {c.active_dataset_id ? ` · Active: ${c.active_dataset_id.slice(0, 10)}` : ` · ${t('Empty Company Workspace')}`}
                        </div>
                      </div>
                      {selected && <Check size={14} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>

              {canCreateCompany && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const trimmed = newCompanyName.trim()
                    if (trimmed.length >= 2 && !createTenant.isPending) {
                      createTenant.mutate(trimmed)
                    }
                  }}
                  className="pt-2 border-t space-y-1.5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {t('Create Company Workspace')}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="e.g. Acme Retail Ltd."
                      className="dp-input flex-1 text-xs py-1.5"
                      minLength={2}
                      maxLength={80}
                    />
                    <button
                      type="submit"
                      disabled={createTenant.isPending || newCompanyName.trim().length < 2}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--primary)' }}
                    >
                      <Plus size={12} />
                      <span>{createTenant.isPending ? '…' : 'Add'}</span>
                    </button>
                  </div>
                  {createError && (
                    <p className="text-[11px]" style={{ color: 'var(--danger-text)' }}>
                      {createError}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {/* Dataset Snapshot Date Pill */}
        {dataset && (
          <Link
            to="/data-sources"
            className="hidden xl:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium hover:bg-[var(--surface-muted)] transition-colors"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
            title={`${dataset.kind === 'synthetic' ? 'Synthetic Demo' : 'Imported Data'} (${dataset.start} – ${dataset.end})`}
          >
            <Calendar size={12} style={{ color: 'var(--primary)' }} />
            <span>{dataset.kind === 'synthetic' ? t('Synthetic Demo') : t('Imported Data')}</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="tabular-nums">{dateLabel(dataset.end)}</span>
          </Link>
        )}

        <LanguageSwitcher />

        {/* Notification Center */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setNotifOpen((prev) => !prev)
              setProfileOpen(false)
            }}
            aria-label={t('Notifications')}
            aria-expanded={notifOpen}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-[var(--surface-muted)] transition-colors"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <Bell size={15} />
            {criticalCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: 'var(--danger)' }}
              >
                {criticalCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 mt-2 w-80 rounded-xl border p-3 space-y-2.5 z-50"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                  {t('Anomaly Alerts')}
                </span>
                <Link
                  to="/anomalies"
                  onClick={() => setNotifOpen(false)}
                  className="text-[11px] font-semibold hover:underline"
                  style={{ color: 'var(--primary-text)' }}
                >
                  {t('View all')}
                </Link>
              </div>
              {alerts.length === 0 ? (
                <p className="py-4 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t('No active anomalies detected.')}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {alerts.map((a) => (
                    <Link
                      key={a.id}
                      to={'/anomalies?alert=' + encodeURIComponent(a.id)}
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center justify-between gap-2 rounded-lg p-2 text-xs hover:bg-[var(--surface-muted)] transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate" style={{ color: 'var(--heading)' }}>
                          {t(a.metric)}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {a.scope} · {dateLabel(a.end)}
                        </div>
                      </div>
                      <StatusBadge tone={a.severity}>
                        {a.deviation != null ? percent(a.deviation) : a.severity}
                      </StatusBadge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Theme switcher hidden: light-only redesign (spec §6). */}

        {/* User Profile Menu */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => {
              setProfileOpen((prev) => !prev)
              setNotifOpen(false)
            }}
            aria-expanded={profileOpen}
            className="flex items-center gap-2 rounded-lg border px-2 py-1 hover:bg-[var(--surface-muted)] transition-colors"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--heading)',
            }}
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary-text)' }}
            >
              <User size={13} />
            </span>
            <span className="hidden sm:inline text-xs font-medium max-w-[110px] truncate">{session.actor}</span>
            <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          {profileOpen && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl border p-2 space-y-1 z-50 text-xs"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <div className="px-2.5 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
                  {session.actor}
                </div>
                <div className="text-[11px] capitalize" style={{ color: 'var(--text-secondary)' }}>
                  Role: {session.role} · {session.authentication === 'token' ? 'Token Auth' : 'Local Demo'}
                </div>
              </div>

              <Link
                to="/data-sources"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--surface-muted)]"
                style={{ color: 'var(--text)' }}
              >
                <Database size={14} style={{ color: 'var(--text-secondary)' }} />
                <span>{t('Data Sources')}</span>
              </Link>
              <Link
                to="/settings"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--surface-muted)]"
                style={{ color: 'var(--text)' }}
              >
                <Settings size={14} style={{ color: 'var(--text-secondary)' }} />
                <span>{t('Settings')}</span>
              </Link>
              <Link
                to="/docs"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--surface-muted)]"
                style={{ color: 'var(--text)' }}
              >
                <BookOpen size={14} style={{ color: 'var(--text-secondary)' }} />
                <span>{t('Documentation')}</span>
              </Link>

              {session.authentication === 'token' && (
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('dp-access-token')
                    window.location.reload()
                  }}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--danger-bg)]"
                  style={{ color: 'var(--danger-text)' }}
                >
                  <LogOut size={14} />
                  <span>{t('Sign out')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

