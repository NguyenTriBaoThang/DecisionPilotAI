import { Link, useLocation } from 'react-router-dom'
import { CircleGauge, MessageSquareText, SlidersHorizontal, Compass, ArrowRight, CheckCircle2 } from 'lucide-react'
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

  // Determine current active step
  const currentStep = WORKFLOW_STEPS.find((s) => s.path === pathname)?.step || (pathname.startsWith('/ask') ? 2 : pathname.startsWith('/scenarios') ? 3 : pathname.startsWith('/recommendations') ? 4 : 1)

  return (
    <div className="w-full rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-[#0d1428]/95 via-[#0b1020]/90 to-[#070b17]/95 p-3.5 sm:p-4 backdrop-blur-xl shadow-xl shadow-indigo-950/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-indigo-500/15">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-400">
            {t('End-to-End Decision Flow')}
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          {t('Step')} <strong className="text-cyan-300">{currentStep}</strong> / 4
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        {WORKFLOW_STEPS.map((s) => {
          const Icon = s.icon
          const isActive = s.step === currentStep
          const isPassed = s.step < currentStep

          return (
            <Link
              key={s.path}
              to={s.path}
              className={`group relative flex items-center gap-3 p-2.5 sm:p-3 rounded-xl border transition-all text-left ${
                isActive
                  ? 'bg-gradient-to-tr from-indigo-900/60 to-violet-900/40 border-cyan-400/50 shadow-lg shadow-indigo-500/20 ring-1 ring-cyan-400/40'
                  : isPassed
                  ? 'bg-slate-900/40 border-emerald-500/30 hover:border-emerald-500/60 text-slate-300'
                  : 'bg-slate-900/30 border-slate-800 hover:border-indigo-500/30 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? 'bg-cyan-400/20 text-cyan-300'
                    : isPassed
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-slate-800/80 text-slate-400 group-hover:text-slate-200'
                }`}
              >
                {isPassed ? <CheckCircle2 size={18} /> : <Icon size={18} />}
              </div>

              <div className="min-w-0 flex-1">
                <span
                  className={`block text-xs font-bold truncate ${
                    isActive ? 'text-white' : isPassed ? 'text-slate-200' : 'text-slate-400 group-hover:text-slate-300'
                  }`}
                >
                  {t(s.titleKey)}
                </span>
                <span className="block text-[10px] text-slate-400 truncate">
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
    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-slate-900/60 via-[#0e162c]/60 to-slate-900/60 backdrop-blur-md">
      <div>
        {prevPath && prevLabelKey ? (
          <Link
            to={prevPath}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800/60 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-700/60 hover:text-white transition-all"
          >
            <span>&larr; {t(prevLabelKey)}</span>
          </Link>
        ) : (
          <div />
        )}
      </div>

      <div>
        {nextPath && nextLabelKey ? (
          <Link
            to={nextPath}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-xs sm:text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:shadow-cyan-500/25 hover:scale-[1.02] transition-all"
          >
            <span>{t(nextLabelKey)}</span>
            <ArrowRight size={16} />
          </Link>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-400">
            <CheckCircle2 size={16} />
            <span>{t('Decision Process Complete')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

