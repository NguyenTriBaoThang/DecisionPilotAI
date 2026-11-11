import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, CircleGauge, Compass, MessageSquareText, SlidersHorizontal } from 'lucide-react'
import { useT } from '../preferences'

export interface WorkflowStep {
  step: number
  path: string
  titleKey: string
  descKey: string
  icon: typeof CircleGauge
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    step: 1,
    path: '/',
    titleKey: 'Step 1: Diagnostics',
    descKey: 'Monitor health & alerts',
    icon: CircleGauge,
  },
  {
    step: 2,
    path: '/ask',
    titleKey: 'Step 2: AI Investigation',
    descKey: 'Investigate root causes',
    icon: MessageSquareText,
  },
  {
    step: 3,
    path: '/scenarios',
    titleKey: 'Step 3: 3D Simulation',
    descKey: 'Test What-If scenarios',
    icon: SlidersHorizontal,
  },
  {
    step: 4,
    path: '/recommendations',
    titleKey: 'Step 4: Decisions',
    descKey: 'Approve strategic actions',
    icon: Compass,
  },
]

export function EndToEndStepper() {
  const { pathname } = useLocation()
  const { t } = useT()

  const currentStep =
    WORKFLOW_STEPS.find((s) => s.path === pathname)?.step ||
    (pathname.startsWith('/ask') ? 2 : pathname.startsWith('/scenarios') ? 3 : pathname.startsWith('/recommendations') ? 4 : 1)

  return (
    <div
      className="dp-surface p-3.5 sm:p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--primary-text)' }}
        >
          {t('End-to-End Decision Flow')}
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {t('Step')} <strong style={{ color: 'var(--heading)' }}>{currentStep}</strong> / 4
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {WORKFLOW_STEPS.map((s) => {
          const Icon = s.icon
          const isActive = s.step === currentStep
          const isPassed = s.step < currentStep

          return (
            <Link
              key={s.path}
              to={s.path}
              style={{
                background: isActive ? 'var(--primary-soft)' : 'var(--surface-muted)',
                borderColor: isActive
                  ? 'var(--primary-border)'
                  : isPassed
                  ? 'var(--success-border)'
                  : 'var(--border)',
              }}
              className="flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <span
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border"
                style={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: isActive
                    ? 'var(--primary)'
                    : isPassed
                    ? 'var(--success)'
                    : 'var(--text-secondary)',
                }}
              >
                {isPassed ? <CheckCircle2 size={16} /> : <Icon size={16} />}
              </span>

              <div className="min-w-0 flex-1">
                <span
                  className="block text-xs font-semibold truncate"
                  style={{ color: isActive ? 'var(--primary-text)' : 'var(--heading)' }}
                >
                  {t(s.titleKey)}
                </span>
                <span className="block text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                  {t(s.descKey)}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function WorkflowNavigationFooter({
  prevPath,
  prevLabelKey,
  nextPath,
  nextLabelKey,
}: {
  prevPath?: string
  prevLabelKey?: string
  nextPath?: string
  nextLabelKey?: string
}) {
  const { t } = useT()

  return (
    <div
      className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border px-4 py-3"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div>
        {prevPath && prevLabelKey ? (
          <Link
            to={prevPath}
            className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-[var(--surface-muted)]"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--heading)',
            }}
          >
            <ArrowLeft size={14} />
            <span>{t(prevLabelKey)}</span>
          </Link>
        ) : (
          <div />
        )}
      </div>

      <div>
        {nextPath && nextLabelKey ? (
          <Link
            to={nextPath}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors hover:brightness-95"
            style={{ background: 'var(--primary)', boxShadow: 'var(--shadow-xs)' }}
          >
            <span>{t(nextLabelKey)}</span>
            <ArrowRight size={14} />
          </Link>
        ) : (
          <div
            className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-xs font-semibold"
            style={{
              background: 'var(--success-bg)',
              borderColor: 'var(--success-border)',
              color: 'var(--success-text)',
            }}
          >
            <CheckCircle2 size={14} />
            <span>{t('Decision Process Complete')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
