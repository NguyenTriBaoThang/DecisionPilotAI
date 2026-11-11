import { useId, useMemo, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  Inbox,
  Loader2,
} from 'lucide-react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { compact, decimal, label, percent, shortDate, type Row } from './api'
import { translate, usePreferences } from './preferences'

export { ConfirmDialog } from './components/ui/ConfirmDialog'
export { DashboardSkeleton, SkeletonBlock, TableSkeleton } from './components/ui/LoadingSkeleton'
export { ToastProvider, useToast, type ToastMessage, type ToastTone } from './components/ui/Toast'

export const cn = (...values: ClassValue[]) => twMerge(clsx(values))

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  style,
  type = 'button',
  ...props
}: ButtonProps) {
  const effectiveVariant =
    variant === 'default' && className?.split(/\s+/).includes('primary') ? 'primary' : variant

  const baseStyle: React.CSSProperties =
    effectiveVariant === 'primary'
      ? {
          background: 'var(--primary)',
          color: '#FFFFFF',
          borderColor: 'var(--primary)',
          boxShadow: 'var(--shadow-xs)',
        }
      : effectiveVariant === 'danger'
      ? {
          background: 'var(--danger-bg)',
          color: 'var(--danger-text)',
          borderColor: 'var(--danger-border)',
        }
      : effectiveVariant === 'ghost'
      ? {
          background: 'transparent',
          color: 'var(--text-secondary)',
          borderColor: 'transparent',
        }
      : {
          background: 'var(--surface)',
          color: 'var(--heading)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-xs)',
        }

  return (
    <button
      type={type}
      style={{ ...baseStyle, ...style }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-xs min-h-[32px]' : 'px-3.5 py-2 text-xs min-h-[36px]',
        effectiveVariant === 'primary' && 'hover:brightness-95',
        effectiveVariant === 'default' && 'hover:bg-[var(--surface-muted)]',
        effectiveVariant === 'outline' && 'hover:bg-[var(--surface-muted)]',
        effectiveVariant === 'ghost' && 'hover:bg-[var(--surface-subtle)] hover:text-[var(--heading)]',
        effectiveVariant === 'danger' && 'hover:brightness-95',
        className
      )}
      {...props}
    />
  )
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  className?: string
  padding?: boolean
}

export function Card({
  children,
  className,
  padding = true,
  ...props
}: CardProps) {
  return (
    <section
      className={cn(
        'dp-surface relative overflow-hidden transition-colors duration-150',
        padding && 'p-5',
        className
      )}
      {...props}
    >
      {children}
    </section>
  )
}

export function Breadcrumb({
  items,
}: {
  items: { label: string; to?: string }[]
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
      {items.map((item, idx) => (
        <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
          {idx > 0 && <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
          <span
            className={idx === items.length - 1 ? 'font-semibold' : 'font-medium'}
            style={{ color: idx === items.length - 1 ? 'var(--heading)' : 'var(--text-secondary)' }}
          >
            {item.label}
          </span>
        </span>
      ))}
    </nav>
  )
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  aside,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  aside?: ReactNode
}) {
  const { preferences } = usePreferences()
  return (
    <div
      className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="space-y-1">
        {eyebrow && (
          <div
            className="text-[11px] font-semibold tracking-wider uppercase"
            style={{ color: 'var(--primary-text)' }}
          >
            {translate(eyebrow, preferences.language)}
          </div>
        )}
        <h1
          className="text-2xl sm:text-[26px] font-bold tracking-[-0.02em] leading-tight"
          style={{ color: 'var(--heading)' }}
        >
          {translate(title, preferences.language)}
        </h1>
        {subtitle && (
          <p className="text-[13px] sm:text-sm max-w-3xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {translate(subtitle, preferences.language)}
          </p>
        )}
      </div>
      {aside && <div className="flex-shrink-0 flex items-center gap-2">{aside}</div>}
    </div>
  )
}

export const Heading = PageHeader

export function SectionHeader({
  title,
  detail,
  aside,
}: {
  title: string
  detail?: string
  aside?: ReactNode
}) {
  const { preferences } = usePreferences()
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: 'var(--heading)' }}>
          {translate(title, preferences.language)}
        </h2>
        {detail && (
          <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {detail}
          </p>
        )}
      </div>
      {aside && <div className="flex-shrink-0 flex items-center gap-2">{aside}</div>}
    </div>
  )
}

export const SectionTitle = SectionHeader

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('dp-filter-bar', className)}>{children}</div>
}

export function Select({
  label: title,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: (string | [string, string])[]
  className?: string
}) {
  return (
    <label className={cn('dp-field', className)}>
      <span className="dp-field-label">{title}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="dp-select"
      >
        {options.map((v) =>
          Array.isArray(v) ? (
            <option value={v[0]} key={v[0]}>
              {v[1]}
            </option>
          ) : (
            <option key={v} value={v}>
              {v}
            </option>
          )
        )}
      </select>
    </label>
  )
}

const badgeToneMap: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: 'var(--danger-bg)', border: 'var(--danger-border)', text: 'var(--danger-text)' },
  danger: { bg: 'var(--danger-bg)', border: 'var(--danger-border)', text: 'var(--danger-text)' },
  high: { bg: 'var(--orange-bg)', border: 'var(--orange-border)', text: 'var(--orange-text)' },
  warning: { bg: 'var(--warning-bg)', border: 'var(--warning-border)', text: 'var(--warning-text)' },
  medium: { bg: 'var(--warning-bg)', border: 'var(--warning-border)', text: 'var(--warning-text)' },
  info: { bg: 'var(--info-bg)', border: 'var(--info-border)', text: 'var(--info-text)' },
  success: { bg: 'var(--success-bg)', border: 'var(--success-border)', text: 'var(--success-text)' },
  accent: { bg: 'var(--primary-soft)', border: 'var(--primary-border)', text: 'var(--primary-text)' },
  primary: { bg: 'var(--primary-soft)', border: 'var(--primary-border)', text: 'var(--primary-text)' },
  muted: { bg: 'var(--surface-subtle)', border: 'var(--border)', text: 'var(--text-secondary)' },
}

export function StatusBadge({
  children,
  tone = 'muted',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  tone?: string
  className?: string
}) {
  const c = badgeToneMap[tone] || badgeToneMap.muted
  return (
    <span
      {...props}
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        className
      )}
    >
      {children}
    </span>
  )
}

export const Pill = StatusBadge

export function Loading({ labelText = 'Processing Analytics…' }: { labelText?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2.5 py-10 px-4 text-xs font-medium"
      style={{ color: 'var(--text-secondary)' }}
      role="status"
      aria-label="Loading data"
    >
      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--primary)' }} />
      <span>{labelText}</span>
    </div>
  )
}

export function ErrorState({ error, retry }: { error: Error | null | undefined; retry?: () => void }) {
  if (!error) return null
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs"
      style={{
        background: 'var(--danger-bg)',
        borderColor: 'var(--danger-border)',
        color: 'var(--danger-text)',
      }}
      role="alert"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertCircle size={16} className="flex-shrink-0" style={{ color: 'var(--danger)' }} />
        <span className="font-medium leading-relaxed">{error.message}</span>
      </div>
      {retry && (
        <Button size="sm" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  text,
  action,
}: {
  text: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-2.5">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl border"
        style={{
          background: 'var(--surface-muted)',
          borderColor: 'var(--border)',
          color: 'var(--text-muted)',
        }}
      >
        <Inbox size={20} />
      </div>
      <p className="text-xs font-medium max-w-md" style={{ color: 'var(--text-secondary)' }}>
        {text}
      </p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

export const Empty = EmptyState

export function Source({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-1.5 text-[11px] pt-3 mt-3 border-t"
      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
    >
      <Database size={12} style={{ color: 'var(--text-muted)' }} />
      <span>{children}</span>
    </div>
  )
}

function MiniSparkline({ values, positive }: { values: number[]; positive?: boolean }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 68
  const h = 24
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const stroke = positive === false ? 'var(--danger)' : positive === true ? 'var(--success)' : 'var(--primary)'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible flex-shrink-0">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

export function KPIStatCard({
  title,
  value,
  change,
  icon,
  formula,
  subtitle,
  sparkline,
}: {
  title: string
  value: string
  change?: number | null
  icon?: ReactNode
  formula?: string
  subtitle?: string
  sparkline?: number[]
}) {
  return (
    <Card className="p-4 flex flex-col justify-between gap-3 group hover:border-[var(--border-strong)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg border flex-shrink-0"
              style={{
                background: 'var(--surface-muted)',
                borderColor: 'var(--border)',
                color: 'var(--primary)',
              }}
            >
              {icon}
            </span>
          )}
          <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
            {title}
          </span>
        </div>

        {formula && (
          <span
            className="relative cursor-help flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
            tabIndex={0}
            aria-label={formula}
          >
            <CircleHelp size={14} />
            <span
              role="tooltip"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text)',
                boxShadow: 'var(--shadow-lg)',
              }}
              className="absolute right-0 top-6 w-56 rounded-lg border p-2.5 text-[11px] leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 font-normal"
            >
              {formula}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div
          className="text-2xl font-bold tracking-tight tabular-nums leading-none"
          style={{ color: 'var(--heading)' }}
        >
          {value}
        </div>
        {sparkline && sparkline.length >= 2 && (
          <MiniSparkline values={sparkline} positive={change == null ? undefined : change >= 0} />
        )}
      </div>

      {(change != null || subtitle) && (
        <div
          className="flex items-center justify-between gap-2 pt-2 border-t text-[11px]"
          style={{ borderColor: 'var(--border)' }}
        >
          {change != null ? (
            <div className="flex items-center gap-1.5">
              <StatusBadge tone={change < 0 ? 'critical' : 'success'}>
                {change < 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                <span>
                  {change < 0 ? '−' : change > 0 ? '+' : ''}
                  {percent(Math.abs(change))}
                </span>
              </StatusBadge>
              <span style={{ color: 'var(--text-muted)' }}>vs prior period</span>
            </div>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>{subtitle}</span>
          )}
        </div>
      )}
    </Card>
  )
}

export const Stat = KPIStatCard

const palette = ['#2563EB', '#0284C7', '#16A34A', '#D97706', '#7C3AED']
export type ChartSeries = { key: string; name: string; color?: string; kind?: 'line' | 'area' | 'bar'; dashed?: boolean }

export function Chart({
  data,
  x,
  series,
  height = 280,
  date = false,
  band,
  format,
  horizontal = false,
}: {
  data: Row[]
  x: string
  series: ChartSeries[]
  height?: number
  date?: boolean
  band?: boolean
  format?: (value: number) => string
  horizontal?: boolean
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
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
        <ComposedChart
          data={plotData}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 10, right: 14, left: horizontal ? 12 : -8, bottom: 4 }}
        >
          <defs>
            <linearGradient id={`areaPrimary-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563EB" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#2563EB" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id={`areaSecondary-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0284C7" stopOpacity={0.16} />
              <stop offset="95%" stopColor="#0284C7" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id={`bandFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0.04} />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="var(--chart-grid)"
            strokeDasharray="3 3"
            vertical={horizontal}
            horizontal={!horizontal}
          />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                tickFormatter={compact}
              />
              <YAxis
                type="category"
                dataKey={x}
                width={118}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                tickFormatter={(value) => String(value).slice(0, 18)}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={x}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                minTickGap={26}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                tickFormatter={(value) => (date ? shortDate(String(value)) : String(value).slice(0, 16))}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={56}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                tickFormatter={compact}
              />
            </>
          )}
          <Tooltip
            contentStyle={{
              background: 'var(--chart-tooltip-bg)',
              border: '1px solid var(--chart-tooltip-border)',
              borderRadius: 10,
              color: 'var(--chart-tooltip-text)',
              boxShadow: 'var(--shadow-md)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--heading)', fontWeight: 600, marginBottom: 4 }}
            formatter={(value, name) => [numeric(value), String(name)]}
          />

          {band && (
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill={`url(#bandFill-${uid})`}
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
                  radius={horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0]}
                  maxBarSize={horizontal ? 22 : 38}
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
                  strokeWidth={2}
                  fill={i === 0 ? `url(#areaPrimary-${uid})` : `url(#areaSecondary-${uid})`}
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
                strokeWidth={2.2}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
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

export function ChartCard({
  title,
  detail,
  aside,
  legend,
  data,
  x,
  series,
  height = 280,
  date,
  band,
  format,
  source,
  horizontal,
}: {
  title: string
  detail?: string
  aside?: ReactNode
  legend?: { label: string; color: string; dashed?: boolean }[]
  data: Row[]
  x: string
  series: ChartSeries[]
  height?: number
  date?: boolean
  band?: boolean
  format?: (value: number) => string
  source?: string
  horizontal?: boolean
}) {
  return (
    <Card>
      <SectionHeader title={title} detail={detail} aside={aside} />
      {legend && legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-5 text-xs pb-2" style={{ color: 'var(--text-secondary)' }}>
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm inline-block"
                style={{
                  background: item.dashed ? 'transparent' : item.color,
                  border: item.dashed ? `2px dashed ${item.color}` : undefined,
                }}
              />
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      )}
      <Chart
        data={data}
        x={x}
        series={series}
        height={height}
        date={date}
        band={band}
        format={format}
        horizontal={horizontal}
      />
      {source && <Source>{source}</Source>}
    </Card>
  )
}

export interface TableColumn {
  key: string
  title?: string
  format?: (v: number) => string
  render?: (row: Row) => ReactNode
  align?: 'left' | 'right'
  sortable?: boolean
}

function resolveCellValue(row: Row, key: string) {
  return (
    row[key] ??
    (key === 'name'
      ? (row.product_name ?? row.channel ?? row.region ?? row.category)
      : key === 'gross_profit'
      ? row.profit
      : key === 'units'
      ? (row.orders ?? row.quantity)
      : undefined)
  )
}

export function DataTable({
  rows,
  columns,
  sortable = true,
  pageSize,
  emptyText = 'No records found.',
}: {
  rows: Row[]
  columns: TableColumn[]
  sortable?: boolean
  pageSize?: number
  emptyText?: string
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)

  const sortedRows = useMemo(() => {
    if (!rows || !sortKey) return rows || []
    return [...rows].sort((a, b) => {
      const av = resolveCellValue(a, sortKey)
      const bv = resolveCellValue(b, sortKey)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const totalPages = pageSize && pageSize > 0 ? Math.max(1, Math.ceil(sortedRows.length / pageSize)) : 1
  const currentPage = Math.min(page, totalPages - 1)
  const visibleRows =
    pageSize && pageSize > 0
      ? sortedRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
      : sortedRows

  if (!rows || !rows.length) return <Empty text={emptyText} />

  const toggleSort = (key: string) => {
    setPage(0)
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto w-full rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-left text-xs border-collapse" style={{ color: 'var(--text)' }}>
          <thead>
            <tr
              className="border-b text-[11px] font-semibold tracking-wide uppercase"
              style={{
                background: 'var(--surface-muted)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              {columns.map((col) => {
                const canSort = sortable && col.sortable !== false && !col.render
                const isSorted = sortKey === col.key
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('py-2.5 px-3 whitespace-nowrap', col.align === 'right' && 'text-right')}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 font-semibold hover:text-[var(--heading)] transition-colors',
                          col.align === 'right' && 'flex-row-reverse'
                        )}
                      >
                        <span>{col.title || label(col.key)}</span>
                        {isSorted ? (
                          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40" />
                        )}
                      </button>
                    ) : (
                      <span>{col.title || label(col.key)}</span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr
                key={i}
                className="border-b last:border-b-0 transition-colors hover:bg-[var(--surface-muted)]"
                style={{ borderColor: 'var(--border)' }}
              >
                {columns.map((col) => {
                  if (col.render) {
                    return (
                      <td key={col.key} className={cn('py-2.5 px-3', col.align === 'right' && 'text-right')}>
                        {col.render(row)}
                      </td>
                    )
                  }
                  const cellVal = resolveCellValue(row, col.key)
                  const isNumeric = typeof cellVal === 'number'
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'py-2.5 px-3',
                        isNumeric && 'tabular-nums font-medium',
                        col.align === 'right' && 'text-right'
                      )}
                      style={{ color: isNumeric ? 'var(--heading)' : 'var(--text)' }}
                    >
                      {isNumeric
                        ? (col.format || decimal)(cellVal)
                        : cellVal == null
                        ? '—'
                        : String(cellVal)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageSize && pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>
            Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, sortedRows.length)} of{' '}
            {sortedRows.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              size="sm"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export const Table = DataTable
