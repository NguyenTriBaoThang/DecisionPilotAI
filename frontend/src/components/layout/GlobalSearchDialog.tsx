import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BookOpen,
  Compass,
  Database,
  LayoutDashboard,
  MessageSquareText,
  Search,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  X,
} from 'lucide-react'
import { useT } from '../../preferences'

interface GlobalSearchDialogProps {
  open: boolean
  onClose: () => void
}

const quickRoutes = [
  { to: '/', label: 'Executive Dashboard', hint: 'KPIs, Revenue Trend & Anomaly Radar', icon: LayoutDashboard },
  { to: '/ask', label: 'Ask Business Data', hint: 'Conversational AI BI Copilot', icon: MessageSquareText },
  { to: '/anomalies', label: 'Anomaly Center', hint: 'Severity Queue & Root Cause Attribution', icon: Activity },
  { to: '/forecast', label: 'Forecast Center', hint: 'LightGBM Projections & Model Holdout', icon: TrendingUp },
  { to: '/scenarios', label: 'Scenario Simulator', hint: '3D Pricing, Marketing & Inventory What-If', icon: SlidersHorizontal },
  { to: '/recommendations', label: 'Recommendations & Audit', hint: 'Approval Queue & Immutable Decision Log', icon: Compass },
  { to: '/data-sources', label: 'Data Sources', hint: 'Snapshot SHA-256 & Import Pipeline', icon: Database },
  { to: '/settings', label: 'Settings', hint: 'Theme, Currency & Localization', icon: Settings },
  { to: '/docs', label: 'Documentation', hint: 'Architecture, Schema, ML & API Blueprint', icon: BookOpen },
]

const sampleQueries = [
  'Why did revenue change recently?',
  'Which marketing channel had the lowest ROAS?',
  'Which product generated the highest profit?',
  'How is our business performing this month?',
]

export function GlobalSearchDialog({ open, onClose }: GlobalSearchDialogProps) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { t } = useT()

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const normalized = query.trim().toLowerCase()
  const matchingRoutes = quickRoutes.filter(
    (r) =>
      !normalized ||
      r.label.toLowerCase().includes(normalized) ||
      r.hint.toLowerCase().includes(normalized) ||
      t(r.label).toLowerCase().includes(normalized)
  )

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global workspace search"
      className="fixed inset-0 z-[85] flex items-start justify-center pt-[12vh] px-4"
      style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border overflow-hidden"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2.5 px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim().length >= 3) {
                go('/ask?q=' + encodeURIComponent(query.trim()))
              }
            }}
            placeholder={t('Jump to workspace or type a business question for AI Copilot…')}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--heading)' }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded-md p-1 hover:bg-[var(--surface-subtle)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2 space-y-3">
          {query.trim().length >= 3 && (
            <button
              type="button"
              onClick={() => go('/ask?q=' + encodeURIComponent(query.trim()))}
              className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors"
              style={{
                background: 'var(--primary-soft)',
                color: 'var(--primary-text)',
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <MessageSquareText size={15} />
                <span className="truncate">Ask AI Copilot: &ldquo;{query.trim()}&rdquo;</span>
              </span>
              <ArrowRight size={14} />
            </button>
          )}

          {matchingRoutes.length > 0 && (
            <div>
              <div
                className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('Workspaces')}
              </div>
              <div className="space-y-0.5">
                {matchingRoutes.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => go(item.to)}
                      className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon size={15} style={{ color: 'var(--primary)' }} />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                            {t(item.label)}
                          </div>
                          <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                            {item.hint}
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!normalized && (
            <div>
              <div
                className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('Suggested Analytical Questions')}
              </div>
              <div className="space-y-0.5">
                {sampleQueries.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => go('/ask?q=' + encodeURIComponent(q))}
                    className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--surface-muted)]"
                    style={{ color: 'var(--text)' }}
                  >
                    <span className="truncate">{q}</span>
                    <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

