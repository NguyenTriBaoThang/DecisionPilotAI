import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  BellRing,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  Info,
  Percent,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  UsersRound,
  Wallet,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  dateLabel,
  decimal,
  integer,
  moneyCompact,
  params,
  percent,
  request,
  type Alert,
  type Dataset,
  type Filters,
  type KPI,
  type Options,
} from './api'
import {
  Button,
  Card,
  ChartCard,
  DashboardSkeleton,
  Empty,
  ErrorState,
  FilterBar,
  KPIStatCard,
  Loading,
  PageHeader,
  SectionHeader,
  Select,
  Source,
  StatusBadge,
} from './ui'
import { AllocationDonutCard } from './components/charts/AllocationDonutCard'
import {
  buildMarketingSpendSegments,
  buildRegionSegments,
  buildSalesChannelSegments,
  buildTopProductSegments,
  type SalesChannelMetric,
} from './components/charts/dashboardDonuts'
import { useT } from './preferences'
import { investigateHref } from './investigate'

export const alertName: Record<string, string> = {
  revenue: 'Revenue decline',
  margin: 'Gross margin pressure',
  units: 'Unusual sales volume',
  facebook_spend: 'Facebook Ads spend spike',
  facebook_roas: 'Facebook Ads ROAS drop',
  facebook_conversion: 'Facebook Ads conversion drop',
  marketing_spend: 'Marketing spend anomaly',
  marketing_roas: 'Marketing ROAS drop',
  marketing_conversion: 'Marketing conversion drop',
  stockout_risk: 'Stockout risk detected',
}

export function Dashboard({ dataset, options }: { dataset: Dataset; options: Options }) {
  const { t, language } = useT()
  const isVi = language === 'vi'

  const defaultStart = [dataset.end.slice(0, 7) + '-01', dataset.start].sort()[1]
  const [filters, setFilters] = useState<Filters>({
    start: defaultStart,
    end: dataset.end,
    grain: 'daily',
  })
  const [salesChannelMetric, setSalesChannelMetric] = useState<SalesChannelMetric>('revenue')

  const data = useQuery({
    queryKey: ['dashboard', dataset.dataset_id, filters],
    queryFn: () => request<KPI>('/kpi/summary?' + params(filters)),
  })

  const alerts = useQuery({
    queryKey: ['anomalies-radar', dataset.dataset_id],
    queryFn: () => request<{ rows: Alert[] }>('/anomalies?limit=6'),
  })

  const update = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }))

  const hasDimensionFilter =
    Boolean(filters.category) ||
    Boolean(filters.region) ||
    Boolean(filters.channel) ||
    Boolean(filters.product)

  const hasCustomFilters =
    filters.start !== defaultStart ||
    filters.end !== dataset.end ||
    hasDimensionFilter

  const resetFilters = () =>
    setFilters({
      start: defaultStart,
      end: dataset.end,
      grain: filters.grain || 'daily',
    })

  const result = data.data
  const revenueChange = result?.changes.revenue ?? 0
  const isRevenueDown = revenueChange < -0.02
  const criticalAlertsCount = alerts.data?.rows.filter((a) => a.severity === 'critical').length ?? 0

  const aov =
    result?.summary.revenue != null && result?.summary.orders
      ? result.summary.revenue / result.summary.orders
      : null

  const revenueSparkline =
    result?.trend.map((r) => (typeof r.revenue === 'number' ? r.revenue : 0)).slice(-14) ?? []
  const profitSparkline =
    result?.trend.map((r) => (typeof r.gross_profit === 'number' ? r.gross_profit : 0)).slice(-14) ?? []
  const ordersSparkline =
    result?.trend.map((r) => (typeof r.orders === 'number' ? r.orders : 0)).slice(-14) ?? []

  const stockAvailability = result?.summary.inventory_availability
  const stockBadgeTone =
    stockAvailability == null ? 'muted' : stockAvailability >= 0.9 ? 'success' : stockAvailability >= 0.8 ? 'warning' : 'critical'
  const stockStatusLabel =
    stockAvailability == null
      ? '—'
      : stockAvailability >= 0.9
      ? t('Healthy Stock')
      : stockAvailability >= 0.8
      ? t('Low Buffer')
      : t('Stockout Risk')

  const donutLabels = useMemo(
    () => ({
      otherProducts: t('Other Products'),
      revenue: t('Revenue'),
      grossProfit: t('Gross Profit'),
      unitsSold: t('Units Sold'),
      adSpend: t('Ad Spend'),
      roas: t('ROAS'),
      attributedRevenue: t('Attributed Revenue'),
      orders: t('Orders'),
      share: t('Share'),
    }),
    [language]
  )

  const topProductsData = useMemo(
    () => buildTopProductSegments(result?.products ?? [], result?.summary ?? {}, donutLabels),
    [result?.products, result?.summary, donutLabels]
  )

  const marketingSegments = useMemo(
    () => buildMarketingSpendSegments(result?.marketing_channels ?? [], donutLabels),
    [result?.marketing_channels, donutLabels]
  )

  const regionSegments = useMemo(
    () => buildRegionSegments(result?.regions ?? [], donutLabels),
    [result?.regions, donutLabels]
  )

  const salesChannelSegments = useMemo(
    () => buildSalesChannelSegments(result?.sales_channels ?? [], salesChannelMetric, donutLabels),
    [result?.sales_channels, salesChannelMetric, donutLabels]
  )

  const activeCustomers = result?.summary.customers ?? 0
  const newCustomers = result?.summary.new_customers ?? 0
  const returningCustomers = result?.summary.returning_customers ?? 0
  const newCustomerRate = activeCustomers > 0 ? newCustomers / activeCustomers : 0
  const returningCustomerRate = activeCustomers > 0 ? returningCustomers / activeCustomers : 0

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <PageHeader
        eyebrow="EXECUTIVE OVERVIEW & DIAGNOSTICS"
        title="Executive Dashboard"
        subtitle={
          result
            ? `${dateLabel(result.range[0])} – ${dateLabel(result.range[1])} · ${t('Reconciled financial performance, demand signals, and operational risk radar.')}`
            : t('Reconciled financial performance, demand signals, and operational risk radar.')
        }
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/ask"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-[var(--surface-muted)]"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--heading)',
              }}
            >
              <span>{t('Ask Business Data')}</span>
            </Link>
            <Link
              to="/scenarios"
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:brightness-95"
              style={{ background: 'var(--primary)' }}
            >
              <span>{t('Simulate Scenarios')}</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      {/* Executive Readout Callout Strip */}
      {result && (
        <div
          className="rounded-xl border px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
          style={{
            background: isRevenueDown ? 'var(--warning-bg)' : 'var(--info-bg)',
            borderColor: isRevenueDown ? 'var(--warning-border)' : 'var(--info-border)',
            color: 'var(--heading)',
          }}
        >
          <div className="flex items-start md:items-center gap-2.5">
            <Info
              size={16}
              className="flex-shrink-0 mt-0.5 md:mt-0"
              style={{ color: isRevenueDown ? 'var(--warning)' : 'var(--info)' }}
            />
            <p className="leading-relaxed">
              {isRevenueDown ? (
                isVi ? (
                  <>
                    <strong>Tóm tắt điều hành:</strong> Doanh thu giảm{' '}
                    <strong style={{ color: 'var(--danger-text)' }}>{percent(Math.abs(revenueChange))}</strong> so với kỳ trước.
                    Biên lợi nhuận gộp đạt <strong>{percent(result.summary.margin)}</strong> và có{' '}
                    <strong>{criticalAlertsCount} cảnh báo nghiêm trọng</strong> đang chờ kiểm tra.
                  </>
                ) : (
                  <>
                    <strong>Executive summary:</strong> Revenue declined{' '}
                    <strong style={{ color: 'var(--danger-text)' }}>{percent(Math.abs(revenueChange))}</strong> vs prior
                    period. Active gross margin stands at <strong>{percent(result.summary.margin)}</strong> with{' '}
                    <strong>{criticalAlertsCount} critical operational alerts</strong> flagged.
                  </>
                )
              ) : isVi ? (
                <>
                  <strong>Tóm tắt điều hành:</strong> Doanh thu đạt <strong>{moneyCompact(result.summary.revenue)}</strong> với
                  biên lợi nhuận gộp <strong>{percent(result.summary.margin)}</strong> và tỷ lệ sẵn có tồn kho{' '}
                  <strong>{percent(result.summary.inventory_availability)}</strong>.
                </>
              ) : (
                <>
                  <strong>Executive summary:</strong> Revenue reached{' '}
                  <strong>{moneyCompact(result.summary.revenue)}</strong> at a gross margin of{' '}
                  <strong>{percent(result.summary.margin)}</strong>, with physical stock availability at{' '}
                  <strong>{percent(result.summary.inventory_availability)}</strong>.
                </>
              )}
            </p>
          </div>
          <Link
            to="/anomalies"
            className="inline-flex items-center gap-1 font-semibold whitespace-nowrap hover:underline flex-shrink-0"
            style={{ color: 'var(--primary-text)' }}
          >
            <span>{t('Open Anomaly Center')}</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* Filter Control Bar */}
      <FilterBar>
        <div
          className="flex items-center gap-1.5 text-xs font-semibold pr-2 self-center"
          style={{ color: 'var(--heading)' }}
        >
          <CalendarDays size={15} style={{ color: 'var(--primary)' }} />
          <span>{t('Reporting Scope:')}</span>
        </div>

        <label className="dp-field">
          <span className="dp-field-label">{t('From')}</span>
          <input
            type="date"
            value={filters.start}
            min={dataset.start}
            max={filters.end}
            onChange={(e) => update('start', e.target.value)}
          />
        </label>

        <label className="dp-field">
          <span className="dp-field-label">{t('To')}</span>
          <input
            type="date"
            value={filters.end}
            min={filters.start}
            max={dataset.end}
            onChange={(e) => update('end', e.target.value)}
          />
        </label>

        <Select
          label={t('Category')}
          value={filters.category || ''}
          onChange={(value) => setFilters((c) => ({ ...c, category: value, product: '' }))}
          options={[['', t('All categories')], ...options.categories]}
        />

        <Select
          label={t('Region')}
          value={filters.region || ''}
          onChange={(value) => update('region', value)}
          options={[['', t('All regions')], ...options.regions]}
        />

        <Select
          label={t('Sales Channel')}
          value={filters.channel || ''}
          onChange={(value) => update('channel', value)}
          options={[['', t('All channels')], ...options.channels]}
        />

        <Select
          label={t('Product')}
          value={filters.product || ''}
          onChange={(value) => update('product', value)}
          options={[
            ['', t('All products')],
            ...options.products
              .filter((p) => !filters.category || p.category === filters.category)
              .map<[string, string]>((p) => [p.product_id, p.product_name]),
          ]}
        />

        {hasCustomFilters && (
          <Button size="sm" variant="ghost" onClick={resetFilters} title="Reset filters">
            <RotateCcw size={13} />
            <span>{t('Reset')}</span>
          </Button>
        )}
      </FilterBar>

      <ErrorState error={data.error} retry={() => void data.refetch()} />
      {data.isLoading && !result && <DashboardSkeleton />}

      {result && (
        <>
          {/* Row 1: 4 Primary Financial & Demand KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPIStatCard
              title={t('Total Revenue')}
              value={moneyCompact(result.summary.revenue)}
              icon={<CircleDollarSign size={16} />}
              change={result.changes.revenue}
              formula={result.definitions.revenue}
              sparkline={revenueSparkline}
            />
            <KPIStatCard
              title={t('Gross Profit')}
              value={moneyCompact(result.summary.gross_profit)}
              icon={<Wallet size={16} />}
              change={result.changes.gross_profit}
              formula={result.definitions.gross_profit}
              sparkline={profitSparkline}
            />
            <KPIStatCard
              title={t('Gross Margin')}
              value={percent(result.summary.margin)}
              icon={<Percent size={16} />}
              change={result.changes.margin}
              formula={result.definitions.margin}
            />
            <KPIStatCard
              title={t('Total Orders')}
              value={integer(result.summary.orders)}
              icon={<ShoppingBag size={16} />}
              change={result.changes.orders}
              formula={result.definitions.orders}
              sparkline={ordersSparkline}
            />
          </div>

          {/* Row 2: 3 Secondary Operational & Efficiency KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPIStatCard
              title={t('Average Order Value')}
              value={moneyCompact(aov)}
              icon={<TrendingUp size={16} />}
              formula="Gross Revenue divided by Total Orders across the selected window."
              subtitle={`${t('Active Customers')}: ${integer(result.summary.customers)}`}
            />
            <KPIStatCard
              title={t('Marketing ROAS')}
              value={result.summary.roas != null ? decimal(result.summary.roas) + '×' : '—'}
              icon={<Zap size={16} />}
              change={result.changes.roas}
              formula={result.definitions.roas}
            />
            <Card className="p-4 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg border"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border)',
                      color: 'var(--primary)',
                    }}
                  >
                    <Boxes size={16} />
                  </span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {t('Inventory Status')}
                  </span>
                </div>
                <StatusBadge tone={stockBadgeTone}>{stockStatusLabel}</StatusBadge>
              </div>
              <div
                className="text-2xl font-bold tracking-tight tabular-nums leading-none"
                style={{ color: 'var(--heading)' }}
              >
                {percent(stockAvailability)}
              </div>
              <div
                className="flex items-center justify-between pt-2 border-t text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <span>{t('Physical Stock Availability')}</span>
                <Link to="/scenarios" className="font-semibold hover:underline" style={{ color: 'var(--primary-text)' }}>
                  {t('Plan reorder')}
                </Link>
              </div>
            </Card>
          </div>

          {/* Primary Trend + Anomaly Radar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <ChartCard
                title={t('Revenue & Gross Profit Trend')}
                detail={`${dateLabel(result.range[0])} – ${dateLabel(result.range[1])}`}
                aside={
                  <Select
                    label={t('Grain')}
                    value={filters.grain || 'daily'}
                    onChange={(v) => update('grain', v)}
                    options={[
                      ['daily', t('Daily Grain')],
                      ['weekly', t('Weekly Grain')],
                      ['monthly', t('Monthly Grain')],
                    ]}
                  />
                }
                legend={[
                  { label: t('Revenue'), color: '#2563EB' },
                  { label: t('Gross Profit'), color: '#16A34A' },
                ]}
                data={result.trend}
                x="date"
                date
                height={300}
                series={[
                  { key: 'revenue', name: t('Revenue'), kind: 'area', color: '#2563EB' },
                  { key: 'gross_profit', name: t('Gross Profit'), kind: 'line', color: '#16A34A' },
                ]}
                format={moneyCompact}
                source={
                  isVi
                    ? 'Giao dịch Bán hàng · Tiền tệ Đồng (₫ VND)'
                    : 'Sales Transactions · Local Currency (₫ VND Integer)'
                }
              />
            </div>

            {/* Active Anomaly Radar */}
            <Card className="flex flex-col justify-between">
              <div>
                <SectionHeader
                  title={t('Active Anomaly Radar')}
                  detail={t('Ranked by severity & business impact')}
                  aside={
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg border"
                      style={{
                        background: 'var(--danger-bg)',
                        borderColor: 'var(--danger-border)',
                        color: 'var(--danger)',
                      }}
                    >
                      <BellRing size={15} />
                    </span>
                  }
                />

                <ErrorState error={alerts.error} />
                {alerts.isLoading && <Loading />}
                {alerts.data?.rows.length === 0 && (
                  <Empty
                    text={
                      isVi
                        ? 'Không phát hiện bất thường trong giai đoạn này.'
                        : 'No active anomalies in the selected period.'
                    }
                  />
                )}

                <div className="space-y-2 pt-1">
                  {alerts.data?.rows.map((a) => {
                    const dotColor =
                      a.severity === 'critical'
                        ? 'var(--danger)'
                        : a.severity === 'high'
                        ? 'var(--orange)'
                        : 'var(--warning)'
                    return (
                      <Link
                        to={'/anomalies?alert=' + encodeURIComponent(a.id)}
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-xs transition-colors hover:bg-[var(--surface-muted)]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ background: dotColor }}
                          />
                          <div className="min-w-0">
                            <strong className="block font-semibold truncate" style={{ color: 'var(--heading)' }}>
                              {t(alertName[a.metric] || a.metric)}
                            </strong>
                            <span className="text-[11px] truncate block" style={{ color: 'var(--text-secondary)' }}>
                              {a.scope} · {dateLabel(a.end)}
                            </span>
                          </div>
                        </div>
                        <StatusBadge tone={a.severity}>
                          {a.deviation != null ? percent(a.deviation) : a.severity}
                        </StatusBadge>
                      </Link>
                    )
                  })}
                </div>
              </div>

              <div
                className="pt-3 mt-3 border-t flex items-center justify-between gap-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <Link
                  to={investigateHref(alerts.data?.rows[0]?.metric ?? '')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                  style={{ color: 'var(--primary-text)' }}
                >
                  <span>{isVi ? 'Điều tra nguyên nhân cùng Trợ lý AI' : 'Investigate causes with AI Copilot'}</span>
                  <ArrowRight size={13} />
                </Link>
                <Link
                  to="/anomalies"
                  className="text-[11px] font-medium hover:underline"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('All')}
                </Link>
              </div>
            </Card>
          </div>

          {/* Order Volume Trend & Customer Retention Mix */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8">
              <ChartCard
                title={t('Sales Performance (Order Volume)')}
                detail={`${t('Orders fulfilled over time')} · ${integer(result.summary.orders)} ${t('total')}`}
                aside={<Activity size={16} style={{ color: 'var(--primary)' }} />}
                data={result.trend}
                x="date"
                date
                height={240}
                series={[{ key: 'orders', name: t('Orders'), kind: 'bar', color: '#0284C7' }]}
                format={integer}
              />
            </div>

            <Card className="lg:col-span-4 flex flex-col justify-between">
              <div>
                <SectionHeader
                  title={t('Customer Mix & Retention')}
                  detail={t('Active customer acquisition and repeat retention')}
                  aside={<UsersRound size={16} style={{ color: 'var(--primary)' }} />}
                />

                <div className="space-y-4 pt-1">
                  <div
                    className="rounded-lg border p-3.5"
                    style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                  >
                    <span className="block text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {t('Active Customers')}
                    </span>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <strong className="text-2xl font-bold tracking-tight tabular-nums" style={{ color: 'var(--heading)' }}>
                        {integer(activeCustomers)}
                      </strong>
                      <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--primary-text)' }}>
                        {percent(returningCustomerRate)} {t('Returning Customers').toLowerCase()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-medium">{t('Retention Split')}</span>
                      <span className="tabular-nums font-semibold" style={{ color: 'var(--heading)' }}>
                        {percent(newCustomerRate)} / {percent(returningCustomerRate)}
                      </span>
                    </div>
                    <div
                      className="h-2.5 w-full rounded-full overflow-hidden flex"
                      style={{ background: 'var(--surface-subtle)' }}
                      aria-label={t('Retention Split')}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${(newCustomerRate * 100).toFixed(1)}%`,
                          background: '#14B8A6',
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${(returningCustomerRate * 100).toFixed(1)}%`,
                          background: '#2563EB',
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div
                      className="rounded-lg border p-3"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: '#14B8A6' }} />
                        <span className="truncate">{t('New Customers')}</span>
                      </div>
                      <strong className="mt-1 block text-base font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                        {integer(newCustomers)}
                      </strong>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {percent(newCustomerRate)}
                      </span>
                    </div>

                    <div
                      className="rounded-lg border p-3"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: '#2563EB' }} />
                        <span className="truncate">{t('Returning Customers')}</span>
                      </div>
                      <strong className="mt-1 block text-base font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                        {integer(returningCustomers)}
                      </strong>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--primary-text)' }}>
                        {percent(returningCustomerRate)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Source>
                {`${dateLabel(result.range[0])} – ${dateLabel(result.range[1])}`}
              </Source>
            </Card>
          </div>

          {/* A. Top Products by Revenue & B. Marketing Channel Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AllocationDonutCard
              title={t('Top Products by Revenue')}
              detail={
                topProductsData.hasOther
                  ? t('Top 5 SKUs and remaining catalog revenue share')
                  : t('Revenue share across active SKUs')
              }
              aside={
                <StatusBadge tone="muted">
                  {result.products.length} {t('Top SKUs')}
                </StatusBadge>
              }
              items={topProductsData.items}
              formatValue={moneyCompact}
              centerLabel={t('Total Revenue')}
              emptyText={t('No product revenue recorded in this selection.')}
              source={
                isVi
                  ? 'Danh mục 50 SKU · Đối soát với Tổng doanh thu kỳ chọn'
                  : '50 SKUs Catalog · Reconciled to selected Total Revenue'
              }
            />

            <AllocationDonutCard
              title={t('Marketing Channel Distribution')}
              detail={
                result.market_scope === 'Unavailable for filtered sales scope'
                  ? t('Unavailable for filtered sales scope')
                  : t('Ad spend share across channels · ROAS shown for efficiency context')
              }
              aside={
                result.summary.roas != null ? (
                  <StatusBadge tone="accent">
                    {t('Blended ROAS')}: {decimal(result.summary.roas)}×
                  </StatusBadge>
                ) : (
                  <Zap size={16} style={{ color: 'var(--warning)' }} />
                )
              }
              items={marketingSegments}
              formatValue={moneyCompact}
              centerLabel={t('Total Ad Spend')}
              emptyText={
                hasDimensionFilter
                  ? t('Marketing campaign spend is tracked business-wide and unavailable when filtered by sales dimensions.')
                  : t('No marketing spend recorded in this selection.')
              }
              source={
                isVi
                  ? 'Phân bổ theo Chi tiêu Quảng cáo · ROAS là chỉ số hiệu quả bổ sung'
                  : 'Sized strictly by Ad Spend · ROAS shown as supplemental metric'
              }
            />
          </div>

          {/* C. Revenue by Region & D. Sales Channel Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AllocationDonutCard
              title={t('Revenue by Region')}
              detail={t('Regional revenue contribution across Vietnam markets')}
              aside={
                <StatusBadge tone="muted">
                  {result.regions.length} {t('Regions')}
                </StatusBadge>
              }
              items={regionSegments}
              formatValue={moneyCompact}
              centerLabel={t('Total Revenue')}
              emptyText={t('No regional revenue recorded in this selection.')}
              source={
                isVi
                  ? 'Tổng hợp giao dịch theo khu vực · Đơn vị ₫ VND'
                  : 'Regional sales allocation · Local Currency (₫ VND)'
              }
            />

            <AllocationDonutCard
              title={t('Sales Channel Distribution')}
              detail={
                salesChannelMetric === 'orders'
                  ? t('Order volume share across Online, Retail and B2B')
                  : t('Revenue share across Online, Retail and B2B')
              }
              aside={
                <div
                  role="group"
                  aria-label={t('Channel metric toggle')}
                  className="inline-flex items-center rounded-lg border p-0.5 text-xs"
                  style={{
                    background: 'var(--surface-muted)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSalesChannelMetric('revenue')}
                    aria-pressed={salesChannelMetric === 'revenue'}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                    style={
                      salesChannelMetric === 'revenue'
                        ? {
                            background: 'var(--surface)',
                            color: 'var(--primary-text)',
                            boxShadow: 'var(--shadow-xs)',
                          }
                        : { color: 'var(--text-secondary)' }
                    }
                  >
                    {t('Revenue')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesChannelMetric('orders')}
                    aria-pressed={salesChannelMetric === 'orders'}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                    style={
                      salesChannelMetric === 'orders'
                        ? {
                            background: 'var(--surface)',
                            color: 'var(--primary-text)',
                            boxShadow: 'var(--shadow-xs)',
                          }
                        : { color: 'var(--text-secondary)' }
                    }
                  >
                    {t('Orders')}
                  </button>
                </div>
              }
              items={salesChannelSegments}
              formatValue={salesChannelMetric === 'orders' ? integer : moneyCompact}
              centerLabel={salesChannelMetric === 'orders' ? t('Total Orders') : t('Total Revenue')}
              emptyText={t('No sales channel activity recorded in this selection.')}
              source={
                isVi
                  ? 'Chuyển đổi giữa Doanh thu và Số đơn hàng theo kênh'
                  : 'Switchable between Revenue and Order volume contribution'
              }
            />
          </div>
        </>
      )}
    </div>
  )
}
