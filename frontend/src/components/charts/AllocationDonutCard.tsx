import { useMemo, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
} from 'recharts'
import { percent } from '../../api'
import { useT } from '../../preferences'
import { Card, Empty, SectionHeader, Source } from '../../ui'
import {
  computeDonutSegments,
  ENTERPRISE_DONUT_PALETTE,
  type ComputedDonutSegment,
  type DonutSegmentItem,
} from './dashboardDonuts'

export interface AllocationDonutCardProps {
  title: string
  detail?: string
  aside?: ReactNode
  items: DonutSegmentItem[]
  formatValue: (value: number) => string
  centerLabel: string
  emptyText: string
  source?: string
  variant?: 'donut' | 'pie'
  legendTitle?: string
  palette?: readonly string[]
}

const badgeToneStyles: Record<NonNullable<DonutSegmentItem['badgeTone']>, { bg: string; border: string; text: string }> = {
  neutral: {
    bg: 'var(--surface-subtle)',
    border: 'var(--border)',
    text: 'var(--text-secondary)',
  },
  success: {
    bg: 'var(--success-bg)',
    border: 'var(--success-border)',
    text: 'var(--success-text)',
  },
  warning: {
    bg: 'var(--warning-bg)',
    border: 'var(--warning-border)',
    text: 'var(--warning-text)',
  },
  danger: {
    bg: 'var(--danger-bg)',
    border: 'var(--danger-border)',
    text: 'var(--danger-text)',
  },
}

export function AllocationDonutCard({
  title,
  detail,
  aside,
  items,
  formatValue,
  centerLabel,
  emptyText,
  source,
  variant = 'donut',
  legendTitle,
  palette = ENTERPRISE_DONUT_PALETTE,
}: AllocationDonutCardProps) {
  const { t } = useT()
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { coloredItems, chartData, visibleTotal, shareById, hiddenCount } = useMemo(
    () => computeDonutSegments(items, hiddenIds, palette),
    [items, hiddenIds, palette]
  )

  const activeHighlightId = hoveredId ?? selectedId
  const selectedSegment = useMemo(
    () => chartData.find((item) => item.id === selectedId) ?? null,
    [chartData, selectedId]
  )

  const toggleVisibility = (id: string) => {
    const isCurrentlyHidden = !shareById.has(id)
    if (isCurrentlyHidden) {
      setHiddenIds((prev) => prev.filter((item) => item !== id))
      return
    }
    if (chartData.length <= 1) return
    setHiddenIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    if (selectedId === id) setSelectedId(null)
    if (hoveredId === id) setHoveredId(null)
  }

  const handleSegmentClick = (item: ComputedDonutSegment) => {
    setSelectedId((prev) => (prev === item.id ? null : item.id))
  }

  const renderTooltip = ({ active, payload }: TooltipContentProps<number, string>) => {
    if (!active || !payload?.length) return null
    const datum = payload[0]?.payload as ComputedDonutSegment | undefined
    if (!datum) return null

    return (
      <div
        className="min-w-[215px] max-w-[270px] rounded-xl border p-3 text-xs"
        style={{
          background: 'var(--chart-tooltip-bg)',
          borderColor: 'var(--chart-tooltip-border)',
          color: 'var(--chart-tooltip-text)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ background: datum.color }}
            />
            <span className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
              {datum.name}
            </span>
          </div>
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums flex-shrink-0"
            style={{
              background: 'var(--primary-soft)',
              color: 'var(--primary-text)',
            }}
          >
            {percent(datum.share)}
          </span>
        </div>

        <div className="space-y-1.5">
          {datum.details.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {row.label}
              </span>
              <span
                className={row.highlight ? 'font-bold tabular-nums' : 'font-medium tabular-nums'}
                style={{ color: 'var(--heading)' }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <SectionHeader title={title} detail={detail} aside={aside} />

        {coloredItems.length === 0 || visibleTotal <= 0 ? (
          <Empty text={emptyText} />
        ) : (
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 pt-1">
            {/* Donut / Pie Canvas */}
            <div className="relative w-[196px] h-[196px] sm:w-[204px] sm:h-[204px] flex-shrink-0 select-none">
              <ResponsiveContainer width="100%" height="100%" minWidth={180} minHeight={180}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={variant === 'pie' ? 0 : 58}
                    outerRadius={86}
                    paddingAngle={chartData.length > 1 ? 2 : 0}
                    cornerRadius={variant === 'pie' ? 2 : 4}
                    minAngle={chartData.length > 1 ? 2 : 0}
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                    onMouseEnter={(_, index) => {
                      const target = chartData[index]
                      if (target) setHoveredId(target.id)
                    }}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(_, index) => {
                      const target = chartData[index]
                      if (target) handleSegmentClick(target)
                    }}
                  >
                    {chartData.map((entry) => {
                      const isFocused = activeHighlightId === entry.id
                      const isDimmed = activeHighlightId !== null && !isFocused
                      return (
                        <Cell
                          key={entry.id}
                          fill={entry.color}
                          fillOpacity={isDimmed ? 0.3 : 1}
                          stroke="var(--surface)"
                          strokeWidth={isFocused ? 3 : 2}
                          style={{
                            cursor: 'pointer',
                            outline: 'none',
                            transition: 'fill-opacity 150ms ease, stroke-width 150ms ease',
                          }}
                        />
                      )
                    })}
                  </Pie>
                  <Tooltip content={renderTooltip} wrapperStyle={{ zIndex: 40, pointerEvents: 'none' }} />
                </PieChart>
              </ResponsiveContainer>

              {variant === 'donut' && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="max-w-[106px] px-1 text-center">
                    <span
                      className="block text-[10px] font-semibold uppercase tracking-wider leading-tight line-clamp-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {centerLabel}
                    </span>
                    <strong
                      className="mt-0.5 block text-base sm:text-[17px] font-bold tracking-tight tabular-nums leading-tight"
                      style={{ color: 'var(--heading)' }}
                    >
                      {formatValue(visibleTotal)}
                    </strong>
                    {hiddenCount > 0 && (
                      <span
                        className="mt-0.5 block text-[10px] font-semibold tabular-nums"
                        style={{ color: 'var(--primary-text)' }}
                      >
                        {chartData.length}/{coloredItems.length} {t('active')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Legend */}
            <div className="flex-1 w-full min-w-0 flex flex-col justify-center gap-1.5">
              {(legendTitle || hiddenCount > 0) && (
                <div
                  className="flex items-center justify-between gap-2 pb-1 text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span className="font-medium truncate">{legendTitle ?? ''}</span>
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setHiddenIds([])}
                      className="font-semibold hover:underline flex-shrink-0"
                      style={{ color: 'var(--primary-text)' }}
                    >
                      {t('Show all')}
                    </button>
                  )}
                </div>
              )}

              <ul className="space-y-1.5" aria-label={title}>
                {coloredItems.map((item) => {
                  const share = shareById.get(item.id)
                  const isHidden = share === undefined
                  const isFocused = !isHidden && activeHighlightId === item.id
                  const canHide = isHidden || chartData.length > 1
                  const badgeColors = item.badge
                    ? badgeToneStyles[item.badgeTone ?? 'neutral']
                    : null

                  return (
                    <li
                      key={item.id}
                      onMouseEnter={() => {
                        if (!isHidden) setHoveredId(item.id)
                      }}
                      onMouseLeave={() => {
                        if (hoveredId === item.id) setHoveredId(null)
                      }}
                      className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-colors"
                      style={{
                        background: isFocused ? 'var(--surface-muted)' : 'var(--surface)',
                        borderColor: isFocused ? 'var(--primary-border)' : 'var(--border)',
                        opacity: isHidden ? 0.58 : 1,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleVisibility(item.id)}
                          disabled={!canHide}
                          aria-pressed={!isHidden}
                          aria-label={`${t('Toggle')} ${item.name}`}
                          title={!canHide ? t('Keep at least one segment visible') : `${t('Toggle')} ${item.name}`}
                          className="h-4 w-4 rounded flex items-center justify-center border flex-shrink-0 transition-colors disabled:cursor-not-allowed"
                          style={{
                            background: isHidden ? 'transparent' : item.color,
                            borderColor: isHidden ? 'var(--border-strong)' : item.color,
                            color: '#FFFFFF',
                          }}
                        >
                          {!isHidden && <Check size={10} strokeWidth={3} />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (isHidden) {
                              setHiddenIds((prev) => prev.filter((id) => id !== item.id))
                              setSelectedId(item.id)
                            } else {
                              setSelectedId((prev) => (prev === item.id ? null : item.id))
                            }
                          }}
                          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 text-left flex-1 rounded focus-visible:outline-2"
                          title={item.name}
                        >
                          <span
                            className={`text-xs font-medium leading-snug break-words ${isHidden ? 'line-through' : ''}`}
                            style={{ color: isHidden ? 'var(--text-secondary)' : 'var(--heading)' }}
                          >
                            {item.name}
                          </span>

                          {item.badge && badgeColors && (
                            <span
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums flex-shrink-0 border"
                              style={{
                                background: badgeColors.bg,
                                borderColor: badgeColors.border,
                                color: badgeColors.text,
                              }}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      </div>

                      <div className="flex items-baseline gap-2 flex-shrink-0 tabular-nums text-right">
                        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {formatValue(item.value)}
                        </span>
                        <span
                          className="min-w-[44px] text-xs font-semibold"
                          style={{ color: isHidden ? 'var(--text-muted)' : 'var(--heading)' }}
                        >
                          {isHidden ? '—' : percent(share)}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}

        {/* Segment Detail Inspector on Click */}
        {selectedSegment && (
          <div
            className="mt-3.5 rounded-lg border px-3.5 py-2.5 text-xs"
            style={{
              background: 'var(--surface-muted)',
              borderColor: 'var(--primary-border)',
            }}
          >
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ background: selectedSegment.color }}
                />
                <strong className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
                  {selectedSegment.name}
                </strong>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{
                    background: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                  }}
                >
                  {t('Share')}: {percent(selectedSegment.share)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label={t('Close detail')}
                className="rounded p-0.5 transition-colors hover:bg-[var(--surface-subtle)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={13} />
              </button>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
              {selectedSegment.details.map((row) => (
                <div key={row.label}>
                  <span className="block text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    {row.label}
                  </span>
                  <span
                    className="text-xs font-semibold tabular-nums"
                    style={{ color: row.highlight ? 'var(--primary-text)' : 'var(--heading)' }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {source && <Source>{source}</Source>}
    </Card>
  )
}

