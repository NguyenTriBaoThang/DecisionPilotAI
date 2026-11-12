import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { illus, type IllusName } from './illustrations'

export type Tone = 'today' | 'ask' | 'try' | 'decide' | 'neutral'

const HERO_GRADIENT: Record<Tone, string> = {
  today: 'linear-gradient(120deg,#1d3a8a 0%,#4a2a8f 55%,#8a2a6a 100%)',
  ask: 'linear-gradient(120deg,#4c1d95 0%,#7c3aed 60%,#db2777 100%)',
  try: 'linear-gradient(120deg,#9a3412 0%,#ea580c 60%,#f59e0b 100%)',
  decide: 'linear-gradient(120deg,#065f46 0%,#059669 60%,#0ea5e9 100%)',
  neutral: 'linear-gradient(120deg,#14306b 0%,#1d4ed8 60%,#0ea5e9 100%)',
}

export const TONE_COLOR: Record<Tone | 'muted', string> = {
  today: '#1d4ed8',
  ask: '#7c3aed',
  try: '#ea580c',
  decide: '#059669',
  neutral: '#1d4ed8',
  muted: '#64748b',
}

export function Illus({ name, size = 40, className = '' }: { name: IllusName; size?: number; className?: string }) {
  return <img src={illus(name)} alt="" aria-hidden="true" width={size} height={size} className={className} loading="lazy" />
}

export function PageHero({
  tone,
  title,
  subtitle,
  illus: art,
  children,
}: {
  tone: Tone
  title: ReactNode
  subtitle?: ReactNode
  illus?: IllusName
  children?: ReactNode
}) {
  return (
    <section className="dp-hero relative overflow-hidden rounded-[22px] px-6 py-6 text-white sm:px-8" style={{ background: HERO_GRADIENT[tone] }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-[60ch] text-[15px] text-white/85">{subtitle}</p>}
        </div>
        {art && <Illus name={art} size={72} className="shrink-0 drop-shadow-lg" />}
      </div>
      {children}
    </section>
  )
}

const BADGE: Record<'good' | 'normal' | 'bad', string> = {
  good: 'bg-emerald-100 text-emerald-800',
  normal: 'bg-slate-100 text-slate-700',
  bad: 'bg-rose-600 text-white',
}

const STAT_VARIANT = {
  solid: { card: 'text-white', bg: 'linear-gradient(135deg,#1e40af,#1d2f6f)', icon: 'bg-white/20', value: 'text-white', label: 'text-blue-100', blob: '#60a5fa' },
  green: { card: 'bg-white', bg: '', icon: 'bg-emerald-100', value: 'text-emerald-700', label: 'text-slate-500', blob: '#22c55e' },
  violet: { card: 'bg-white', bg: '', icon: 'bg-violet-100', value: 'text-violet-700', label: 'text-slate-500', blob: '#a855f7' },
  rose: { card: 'bg-white', bg: '', icon: 'bg-rose-100', value: 'text-rose-600', label: 'text-slate-500', blob: '#fb7185' },
  amber: { card: 'bg-white', bg: '', icon: 'bg-amber-100', value: 'text-amber-700', label: 'text-slate-500', blob: '#fbbf24' },
  teal: { card: 'bg-white', bg: '', icon: 'bg-teal-100', value: 'text-teal-700', label: 'text-slate-500', blob: '#2dd4bf' },
  sky: { card: 'bg-white', bg: '', icon: 'bg-sky-100', value: 'text-sky-700', label: 'text-slate-500', blob: '#38bdf8' },
  blue: { card: 'bg-white', bg: '', icon: 'bg-blue-100', value: 'text-blue-700', label: 'text-slate-500', blob: '#60a5fa' },
} as const

export function StatCard({
  illus: art,
  label,
  value,
  badge,
  variant = 'blue',
  delta,
  sub,
}: {
  illus: IllusName
  label: string
  value: string
  badge?: { text: string; kind: 'good' | 'normal' | 'bad' }
  variant?: keyof typeof STAT_VARIANT
  /** Change vs previous period; `upIsGood=false` colours an increase red (e.g. ad spend). */
  delta?: { value: number | null | undefined; caption: string; upIsGood?: boolean }
  sub?: string
}) {
  const v = STAT_VARIANT[variant]
  return (
    <div className={`relative overflow-hidden rounded-[18px] p-4 shadow-[0_12px_30px_rgba(20,40,90,0.12)] ${v.card}`} style={v.bg ? { background: v.bg } : undefined}>
      <span aria-hidden="true" className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-20" style={{ background: v.blob }} />
      {badge && <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${BADGE[badge.kind]}`}>{badge.text}</span>}
      <div className={`grid h-12 w-12 place-items-center rounded-2xl ${v.icon}`}>
        <Illus name={art} size={32} />
      </div>
      <div className={`mt-3 text-2xl font-extrabold tabular-nums ${v.value}`}>{value}</div>
      <div className={`text-[13px] ${v.label}`}>{label}</div>
      {sub && <div className={`mt-0.5 text-[12px] ${v.label}`}>{sub}</div>}
      {delta && delta.value != null && (
        <div className={`mt-1 text-[12px] font-bold ${variant === 'solid' ? 'text-white/90' : (delta.value >= 0) === (delta.upIsGood ?? true) ? 'text-emerald-700' : 'text-rose-600'}`}>
          {delta.value >= 0 ? '▲' : '▼'} {Math.abs(delta.value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%{' '}
          <span className="font-medium opacity-80">{delta.caption}</span>
        </div>
      )}
    </div>
  )
}

/** Card frame for charts and tables on the dashboard. */
export function Panel({ title, illus: art, children, className = '' }: { title: string; illus?: IllusName; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[18px] bg-white p-4 shadow-sm ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-slate-900">
        {art && <Illus name={art} size={22} />}
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Horizontal bar list: name, bar scaled to the max, formatted value. */
export function BarList({ rows, format, color }: { rows: { name: string; value: number }[]; format: (v: number) => string; color: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.name} className="text-[13px]">
          <div className="flex justify-between gap-3">
            <span className="truncate font-semibold text-slate-800">{r.name}</span>
            <span className="shrink-0 tabular-nums text-slate-600">{format(r.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full" style={{ width: `${Math.max(4, (r.value / max) * 100)}%`, background: color }} />
        </li>
      ))}
    </ul>
  )
}

const NOTE: Record<'yellow' | 'green' | 'blue', { bg: string; tape: string; btn: string; tilt: string }> = {
  yellow: { bg: '#fef3c7', tape: '#fbbf24', btn: '#b45309', tilt: '-rotate-1' },
  green: { bg: '#dcfce7', tape: '', btn: '#15803d', tilt: 'rotate-1' },
  blue: { bg: '#dbeafe', tape: '#93c5fd', btn: '#1d4ed8', tilt: '-rotate-[0.6deg]' },
}

export function NoteCard({
  color,
  illus: art,
  title,
  body,
  action,
  pin,
}: {
  color: 'yellow' | 'green' | 'blue'
  illus: IllusName
  title: string
  body: ReactNode
  action?: { label: string; to: string }
  pin?: boolean
}) {
  const n = NOTE[color]
  return (
    <div className={`relative rounded-md px-4 pb-4 pt-5 shadow-[0_8px_18px_rgba(20,40,90,0.1)] motion-safe:transition-transform motion-safe:hover:rotate-0 ${n.tilt}`} style={{ background: n.bg }}>
      {n.tape && !pin && <span aria-hidden="true" className="absolute -top-2 left-[30%] h-4 w-16 -rotate-3 opacity-75" style={{ background: n.tape }} />}
      {pin && <Illus name="pushpin" size={26} className="absolute -top-3 left-1/2" />}
      <div className="flex items-center gap-2 font-extrabold text-slate-900">
        <Illus name={art} size={28} />
        <span>{title}</span>
      </div>
      <div className="mb-3 mt-1.5 text-[13px] text-slate-700">{body}</div>
      {action && (
        <Link to={action.to} className="inline-block rounded-full px-4 py-1.5 text-[13px] font-bold text-white" style={{ background: n.btn }}>
          {action.label}
        </Link>
      )}
    </div>
  )
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${className}`}>{children}</span>
}

export function ActionButton({
  tone,
  onClick,
  to,
  disabled,
  title,
  children,
}: {
  tone: Tone | 'muted'
  onClick?: () => void
  to?: string
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  const cls = 'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
  const style = { background: TONE_COLOR[tone] }
  if (to && !disabled) return <Link to={to} className={cls} style={style} title={title}>{children}</Link>
  return <button type="button" onClick={onClick} disabled={disabled} title={title} className={cls} style={style}>{children}</button>
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: { label: string; to: string } }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] bg-white px-6 py-10 text-center shadow-sm">
      <Illus name="filebox" size={64} />
      <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
      {body && <p className="max-w-[48ch] text-sm text-slate-600">{body}</p>}
      {action && <ActionButton tone="today" to={action.to}>{action.label}</ActionButton>}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-6 text-xs font-extrabold tracking-[0.08em] text-slate-500">{children}</h2>
}

/** Collapsed-by-default block for analyst-level detail, so judges see the headline first. */
export function TechDetails({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group rounded-[18px] border border-slate-200 bg-white/70 p-4">
      <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 font-extrabold text-slate-800">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▶</span>
        {summary}
      </summary>
      <div className="mt-4 space-y-5">{children}</div>
    </details>
  )
}
