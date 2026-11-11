import type { ReactNode } from 'react'
import { decimal, integer, moneyCompact, percent, type KPI, type Row } from '../../api'

export const ENTERPRISE_DONUT_PALETTE = [
  '#2563EB', // Primary Blue
  '#38BDF8', // Sky Blue
  '#14B8A6', // Teal
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#F59E0B', // Orange
] as const

export interface DonutDetailRow {
  label: string
  value: string
  highlight?: boolean
}

export interface DonutSegmentItem {
  id: string
  name: string
  value: number
  badge?: string
  badgeTone?: 'neutral' | 'success' | 'warning' | 'danger'
  color?: string
  details: DonutDetailRow[]
}

export type ComputedDonutSegment = DonutSegmentItem & {
  [key: string]: unknown
  color: string
  share: number
}

export type SalesChannelMetric = 'revenue' | 'orders'

export interface AllocationDonutLabels {
  otherProducts: string
  revenue: string
  grossProfit: string
  unitsSold: string
  adSpend: string
  roas: string
  attributedRevenue: string
  orders: string
  share: string
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function rowName(row: Row, fallback: string): string {
  const candidate = row.name ?? row.product_name ?? row.channel ?? row.region ?? row.category
  return typeof candidate === 'string' && candidate.trim() ? candidate : fallback
}

export function computeDonutSegments(
  items: DonutSegmentItem[],
  hiddenIds: Iterable<string> = [],
  palette: readonly string[] = ENTERPRISE_DONUT_PALETTE
) {
  const hiddenSet = new Set(hiddenIds)
  const coloredItems = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .map((item, idx) => ({
      ...item,
      color: item.color ?? palette[idx % palette.length],
    }))

  const visibleRaw = coloredItems.filter((item) => !hiddenSet.has(item.id))
  const effectiveVisible = visibleRaw.length > 0 ? visibleRaw : coloredItems.slice(0, 1)
  const visibleTotal = effectiveVisible.reduce((sum, item) => sum + item.value, 0)

  const chartData: ComputedDonutSegment[] = effectiveVisible.map((item) => ({
    ...item,
    share: visibleTotal > 0 ? item.value / visibleTotal : 0,
  }))

  const shareById = new Map(chartData.map((item) => [item.id, item.share]))

  return {
    coloredItems,
    chartData,
    visibleTotal,
    shareById,
    hiddenCount: Math.max(0, coloredItems.length - chartData.length),
  }
}

export function buildTopProductSegments(
  products: Row[],
  summary: KPI['summary'],
  labels: Pick<AllocationDonutLabels, 'otherProducts' | 'revenue' | 'grossProfit' | 'unitsSold'>
): { items: DonutSegmentItem[]; topCount: number; hasOther: boolean } {
  const sorted = [...products]
    .filter((row) => asNumber(row.revenue) > 0)
    .sort((a, b) => asNumber(b.revenue) - asNumber(a.revenue))

  const top5 = sorted.slice(0, 5)
  const top5Revenue = top5.reduce((sum, row) => sum + asNumber(row.revenue), 0)
  const top5Profit = top5.reduce((sum, row) => sum + asNumber(row.gross_profit ?? row.profit), 0)
  const top5Units = top5.reduce((sum, row) => sum + asNumber(row.units ?? row.quantity ?? row.orders), 0)

  const listRevenue = sorted.reduce((sum, row) => sum + asNumber(row.revenue), 0)
  const scopeRevenue = Math.max(listRevenue, asNumber(summary.revenue, listRevenue))
  const scopeProfit = asNumber(summary.gross_profit, sorted.reduce((s, r) => s + asNumber(r.gross_profit ?? r.profit), 0))
  const scopeUnits = Math.max(
    sorted.reduce((s, r) => s + asNumber(r.units ?? r.quantity ?? r.orders), 0),
    asNumber(summary.units, 0)
  )

  const items: DonutSegmentItem[] = top5.map((row, idx) => {
    const name = rowName(row, `SKU ${idx + 1}`)
    const rev = asNumber(row.revenue)
    const rawProfit = row.gross_profit ?? row.profit
    const hasProfit = typeof rawProfit === 'number' && Number.isFinite(rawProfit)
    const units = asNumber(row.units ?? row.quantity ?? row.orders)

    const details: DonutDetailRow[] = [
      { label: labels.revenue, value: moneyCompact(rev), highlight: true },
    ]
    if (hasProfit) {
      details.push({ label: labels.grossProfit, value: moneyCompact(rawProfit) })
    }
    details.push({ label: labels.unitsSold, value: integer(units) })

    return {
      id: `product:${name}`,
      name,
      value: rev,
      details,
    }
  })

  // Backend `/kpi/summary` caps `products` at top 8 SKUs; reconcile residual SKUs against total revenue.
  const otherRevenue = Math.max(0, Math.round(scopeRevenue - top5Revenue))
  const hasOther = otherRevenue > 0 && (sorted.length > 5 || scopeRevenue > listRevenue)

  if (hasOther) {
    const otherProfit = Math.round(scopeProfit - top5Profit)
    const otherUnits = Math.max(0, Math.round(scopeUnits - top5Units))
    const hasSummaryProfit = typeof summary.gross_profit === 'number' && Number.isFinite(summary.gross_profit)
    const otherDetails: DonutDetailRow[] = [
      { label: labels.revenue, value: moneyCompact(otherRevenue), highlight: true },
    ]
    if (hasSummaryProfit) {
      otherDetails.push({ label: labels.grossProfit, value: moneyCompact(otherProfit) })
    }
    otherDetails.push({ label: labels.unitsSold, value: integer(otherUnits) })

    items.push({
      id: 'product:__other__',
      name: labels.otherProducts,
      value: otherRevenue,
      color: ENTERPRISE_DONUT_PALETTE[5],
      details: otherDetails,
    })
  }

  return { items, topCount: top5.length, hasOther }
}

export function buildMarketingSpendSegments(
  channels: Row[],
  labels: Pick<AllocationDonutLabels, 'adSpend' | 'roas' | 'attributedRevenue' | 'orders'>
): DonutSegmentItem[] {
  return [...channels]
    .filter((row) => asNumber(row.spend) > 0)
    .sort((a, b) => asNumber(b.spend) - asNumber(a.spend))
    .map((row, idx) => {
      const name = rowName(row, `Channel ${idx + 1}`)
      // Strictly slice by ad spend — never use ROAS as budget allocation size.
      const spend = asNumber(row.spend)
      const roas = typeof row.roas === 'number' && Number.isFinite(row.roas) ? row.roas : null
      const attributed =
        typeof row.attributed_revenue === 'number'
          ? row.attributed_revenue
          : typeof row.revenue === 'number'
          ? row.revenue
          : null
      const orders = typeof row.orders === 'number' ? row.orders : null

      const badgeTone: DonutSegmentItem['badgeTone'] =
        roas == null ? 'neutral' : roas >= 3 ? 'success' : roas >= 1.5 ? 'warning' : 'danger'

      const details: DonutDetailRow[] = [
        { label: labels.adSpend, value: moneyCompact(spend), highlight: true },
        { label: labels.roas, value: roas != null ? `${decimal(roas)}×` : '—' },
      ]
      if (attributed != null) {
        details.push({ label: labels.attributedRevenue, value: moneyCompact(attributed) })
      }
      if (orders != null) {
        details.push({ label: labels.orders, value: integer(orders) })
      }

      return {
        id: `marketing:${name}`,
        name,
        value: spend,
        badge: roas != null ? `ROAS ${decimal(roas)}×` : undefined,
        badgeTone,
        details,
      }
    })
}

export function buildRegionSegments(
  regions: Row[],
  labels: Pick<AllocationDonutLabels, 'revenue' | 'orders' | 'grossProfit'>
): DonutSegmentItem[] {
  return [...regions]
    .filter((row) => asNumber(row.revenue) > 0)
    .sort((a, b) => asNumber(b.revenue) - asNumber(a.revenue))
    .map((row, idx) => {
      const name = rowName(row, `Region ${idx + 1}`)
      const revenue = asNumber(row.revenue)
      const orders = asNumber(row.orders)
      const profit =
        typeof row.gross_profit === 'number'
          ? row.gross_profit
          : typeof row.profit === 'number'
          ? row.profit
          : null

      const details: DonutDetailRow[] = [
        { label: labels.revenue, value: moneyCompact(revenue), highlight: true },
        { label: labels.orders, value: integer(orders) },
      ]
      if (profit != null) {
        details.push({ label: labels.grossProfit, value: moneyCompact(profit) })
      }

      return {
        id: `region:${name}`,
        name,
        value: revenue,
        details,
      }
    })
}

export function buildSalesChannelSegments(
  salesChannels: Row[],
  metric: SalesChannelMetric,
  labels: Pick<AllocationDonutLabels, 'revenue' | 'orders' | 'grossProfit'>
): DonutSegmentItem[] {
  return [...salesChannels]
    .filter((row) => asNumber(row[metric]) > 0)
    .sort((a, b) => asNumber(b[metric]) - asNumber(a[metric]))
    .map((row, idx) => {
      const name = rowName(row, `Sales Channel ${idx + 1}`)
      const revenue = asNumber(row.revenue)
      const orders = asNumber(row.orders)
      const profit =
        typeof row.gross_profit === 'number'
          ? row.gross_profit
          : typeof row.profit === 'number'
          ? row.profit
          : null

      const details: DonutDetailRow[] =
        metric === 'orders'
          ? [
              { label: labels.orders, value: integer(orders), highlight: true },
              { label: labels.revenue, value: moneyCompact(revenue) },
            ]
          : [
              { label: labels.revenue, value: moneyCompact(revenue), highlight: true },
              { label: labels.orders, value: integer(orders) },
            ]

      if (profit != null) {
        details.push({ label: labels.grossProfit, value: moneyCompact(profit) })
      }

      return {
        id: `sales-channel:${name}`,
        name,
        value: metric === 'orders' ? orders : revenue,
        details,
      }
    })
}

export function formatShareLabel(share: number): string {
  return percent(share)
}

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  aside?: ReactNode
}
