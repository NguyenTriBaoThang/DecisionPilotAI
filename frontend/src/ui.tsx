import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertCircle, ArrowDownRight, ArrowUpRight, CircleHelp, Database, Inbox, Sparkles } from 'lucide-react'
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { compact, decimal, label, percent, shortDate, type Row } from './api'

export const cn = (...values: ClassValue[]) => twMerge(clsx(values))

export function Button({
  className,
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'outline' | 'ghost' }) {
  return (
    <button
      className={cn(
        'button inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 select-none disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' && 'primary shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 hover:scale-[1.01]',
        variant === 'outline' && 'border border-slate-700 bg-transparent hover:bg-slate-800/60',
        variant === 'ghost' && 'bg-transparent border-transparent hover:bg-slate-800/40',
        className
      )}
      {...props}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'card relative overflow-hidden rounded-2xl border border-indigo-500/15 bg-gradient-to-b from-[#111a30]/80 to-[#070b17]/90 backdrop-blur-md p-5 shadow-xl transition-all duration-200 hover:border-indigo-500/30 hover:shadow-indigo-500/5',
        className
      )}
    >
      {children}
    </section>
  )
}

export function Heading({
  eyebrow,
  title,
  subtitle,
  aside,
}: {
  eyebrow: string
  title: string
  subtitle: string
  aside?: ReactNode
}) {
  return (
    <div className="page-heading flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-indigo-500/10">
      <div>
        <div className="eyebrow flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-cyan-400 mb-1">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400 animate-pulse" />
          <span>{eyebrow}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{title}</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">{subtitle}</p>
      </div>
      {aside && <div className="flex-shrink-0">{aside}</div>}
    </div>
  )
}

export function SectionTitle({
  title,
  detail,
  aside,
}: {
  title: string
  detail?: string
  aside?: ReactNode
}) {
  return (
    <div className="section-heading flex items-center justify-between gap-4 pb-3 mb-2 border-b border-indigo-500/10">
      <div>
        <h2 className="text-base font-bold text-white tracking-tight">{title}</h2>
        {detail && <p className="text-xs text-slate-400 mt-0.5">{detail}</p>}
      </div>
      {aside && <div className="flex-shrink-0">{aside}</div>}
    </div>
  )
}

export function Select({
  label: title,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: (string | [string, string])[]
}) {
  return (
    <label className="field flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-400">{title}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-indigo-500/20 bg-[#0c1224] px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all cursor-pointer"
      >
        {options.map((v) =>
          Array.isArray(v) ? (
            <option value={v[0]} key={v[0]} className="bg-[#0c1224] text-slate-200">
              {v[1]}
            </option>
          ) : (
            <option key={v} value={v} className="bg-[#0c1224] text-slate-200">
              {v}
            </option>
          )
        )}
      </select>
    </label>
  )
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        'pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        tone === 'critical' && 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
        tone === 'high' && 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        tone === 'warning' && 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        tone === 'medium' && 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
        tone === 'success' && 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        tone === 'accent' && 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
        tone === 'muted' && 'bg-slate-800 text-slate-300 border border-slate-700'
      )}
    >
      {children}
    </span>
  )
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4" role="status" aria-label="Loading data">
      <div className="relative flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
        <Sparkles size={16} className="absolute text-cyan-400 animate-pulse" />
      </div>
      <span className="text-xs font-semibold tracking-wider uppercase text-indigo-300">Processing Analytics Stream…</span>
    </div>
  )
}

export function ErrorState({ error, retry }: { error: Error | null; retry?: () => void }) {
  if (!error) return null
  return (
    <div
      className="flex items-center justify-between gap-3 p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-200 text-xs shadow-lg"
      role="alert"
    >
      <div className="flex items-center gap-2">
        <AlertCircle size={18} className="text-rose-400 flex-shrink-0" />
        <span>{error.message}</span>
      </div>
      {retry && (
        <Button className="px-3 py-1 text-xs" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 space-y-2">
      <Inbox size={28} className="text-slate-600" />
      <p className="text-xs font-medium">{text}</p>
    </div>
  )
}

export function Source({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-3 border-t border-indigo-500/10 mt-3">
      <Database size={13} className="text-indigo-400" />
      <span>{children}</span>
    </div>
  )
}

export function Stat({
  title,
  value,
  change,
  icon,
  formula,
}: {
  title: string
  value: string
  change?: number | null
  icon: ReactNode
  formula?: string
}) {
  return (
    <Card className="stat relative group hover:border-indigo-500/40 transition-all duration-300">
      <div className="flex items-start justify-between">
        <span className="p-2.5 rounded-xl bg-indigo-500/10 text-cyan-300 border border-indigo-500/20 shadow-inner group-hover:scale-105 transition-transform">
          {icon}
        </span>
        {formula && (
          <span
            className="formula relative cursor-help text-slate-400 hover:text-indigo-300 transition-colors"
            tabIndex={0}
            aria-label={formula}
          >
            <CircleHelp size={15} />
            <span
              role="tooltip"
              className="absolute right-0 top-6 w-48 p-2 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-300 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
            >
              {formula}
            </span>
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</div>
        <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1 tracking-tight font-mono">{value}</div>
      </div>

      {change != null && (
        <div className="mt-3 flex items-center gap-2 pt-2 border-t border-indigo-500/10 text-xs">
          <Pill tone={change < 0 ? 'critical' : 'success'}>
            {change < 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
            <span>
              {change < 0 ? '−' : change > 0 ? '+' : ''}
              {percent(Math.abs(change))}
            </span>
          </Pill>
          <span className="text-[11px] text-slate-400">vs prior period</span>
        </div>
      )}
    </Card>
  )
}

const palette = ['#6366f1', '#22d3ee', '#f59e0b', '#ec4899', '#10b981']
type Series = { key: string; name: string; color?: string; kind?: 'line' | 'area' | 'bar'; dashed?: boolean }

export function Chart({
  data,
  x,
  series,
  height = 280,
  date = false,
  band,
  format,
}: {
  data: Row[]
  x: string
  series: Series[]
  height?: number
  date?: boolean
  band?: boolean
  format?: (value: number) => string
}) {
  if (!data || !data.length) return <Empty text="No values match this selection." />

  const numeric = (value: unknown) => (typeof value === 'number' ? (format ? format(value) : decimal(value)) : '—')
  const plotData = band
    ? data.map((row) => ({
        ...row,
        band: typeof row.lower === 'number' && typeof row.upper === 'number' ? [row.lower, row.upper] : null,
      }))
    : data

  return (
    <div className="chart w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={plotData} margin={{ top: 12, right: 12, left: -10, bottom: 4 }}>
          <defs>
            <linearGradient id="areaGradientPrimary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="areaGradientCyan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.06} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="rgba(99, 102, 241, 0.1)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={x}
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            minTickGap={24}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(value) => (date ? shortDate(String(value)) : String(value).slice(0, 15))}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={58}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={compact}
          />
          <Tooltip
            contentStyle={{
              background: '#0c1224',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: 12,
              color: '#f8fafc',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
              fontSize: 12,
            }}
            formatter={(value, name) => [numeric(value), String(name)]}
          />

          {band && (
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill="url(#bandGradient)"
              tooltipType="none"
              isAnimationActive={false}
            />
          )}

          {series.map((s, i) => {
            const color = s.color || palette[i % palette.length]

            if (s.kind === 'bar') {
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={color}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={false}
                />
              )
            }

            if (s.kind === 'area') {
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={color}
                  strokeWidth={2.5}
                  fill={i === 0 ? 'url(#areaGradientPrimary)' : 'url(#areaGradientCyan)'}
                  isAnimationActive={false}
                />
              )
            }

            return (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2.5}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Table({
  rows,
  columns,
}: {
  rows: Row[]
  columns: { key: string; title?: string; format?: (v: number) => string }[]
}) {
  if (!rows || !rows.length) return <Empty text="No records found." />

  return (
    <div className="table-wrap overflow-x-auto w-full">
      <table className="w-full text-left text-xs text-slate-300 border-collapse">
        <thead>
          <tr className="border-b border-indigo-500/15 text-slate-400 font-semibold tracking-wider uppercase text-[10px]">
            {columns.map((col) => (
              <th key={col.key} scope="col" className="py-2.5 px-3">
                {col.title || label(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-indigo-500/5">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-indigo-500/5 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="py-2.5 px-3">
                  {typeof row[col.key] === 'number'
                    ? (col.format || decimal)(row[col.key] as number)
                    : row[col.key] == null
                    ? '—'
                    : String(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
