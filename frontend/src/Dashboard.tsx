import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  Percent,
  ShoppingBag,
  Sparkles,
  TrendingDown,
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
import { Card, Chart, Empty, ErrorState, Heading, Loading, Pill, SectionTitle, Select, Source, Stat, Table } from './ui'
import { AIIntelligenceCore } from './components/AIIntelligenceCore'
import { useT } from './preferences'
import { investigateHref } from './investigate'
import { WorkflowNavigationFooter } from './components/EndToEndStepper'

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

  const [filters, setFilters] = useState<Filters>({
    start: [dataset.end.slice(0, 7) + '-01', dataset.start].sort()[1],
    end: dataset.end,
  })

  const data = useQuery({
    queryKey: ['dashboard', dataset.dataset_id, filters],
    queryFn: () => request<KPI>('/kpi/summary?' + params(filters)),
  })

  const alerts = useQuery({
    queryKey: ['dashboard-alerts', dataset.dataset_id],
    queryFn: () => request<{ rows: Alert[] }>('/anomalies?limit=6'),
  })

  const update = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }))

  const result = data.data

  const stats = result
    ? [
        {
          key: 'revenue',
          title: t('Total Revenue'),
          value: moneyCompact(result.summary.revenue),
          icon: <CircleDollarSign size={20} />,
          change: result.changes.revenue,
          formula: result.definitions.revenue,
        },
        {
          key: 'gross_profit',
          title: t('Gross Profit'),
          value: moneyCompact(result.summary.gross_profit),
          icon: <Wallet size={19} />,
          change: result.changes.gross_profit,
          formula: result.definitions.gross_profit,
        },
        {
          key: 'margin',
          title: t('Gross Margin'),
          value: percent(result.summary.margin),
          icon: <Percent size={18} />,
          change: result.changes.margin,
          formula: result.definitions.margin,
        },
        {
          key: 'orders',
          title: t('Total Orders'),
          value: integer(result.summary.orders),
          icon: <ShoppingBag size={18} />,
          change: result.changes.orders,
          formula: result.definitions.orders,
        },
        {
          key: 'customers',
          title: t('Active Customers'),
          value: integer(result.summary.customers),
          icon: <UsersRound size={20} />,
          change: result.changes.customers,
          formula: result.definitions.customers,
        },
        {
          key: 'roas',
          title: t('Marketing ROAS'),
          value: result.summary.roas != null ? decimal(result.summary.roas) + '×' : '—',
          icon: <Zap size={18} />,
          change: result.changes.roas,
          formula: result.definitions.roas,
        },
      ]
    : []

  // Dynamic AI Observation derived from real data
  const revenueChange = result?.changes.revenue ?? 0
  const isRevenueDown = revenueChange < -0.02
  const criticalAlertsCount = alerts.data?.rows.filter((a) => a.severity === 'critical').length ?? 0

  return (
    <>
      {/* Hero Section with Interactive 3D AI Intelligence Core */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-r from-[#0c1224] via-[#0e162c] to-[#070b17] p-6 sm:p-8 shadow-2xl">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="space-y-3 flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-3.5 py-1 text-xs font-bold text-cyan-300">
              <Sparkles size={14} className="text-cyan-400" />
              <span>{t('DECISION INTELLIGENCE PLATFORM')}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
              {t('Your Business, Understood.')}
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
              {t('Turn complex business data into clear insights, accurate forecasts, and confident decisions.')}
            </p>

            {/* AI Generated Executive Insight Banner */}
            {result && (
              <div className="mt-4 p-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/30 backdrop-blur-md flex items-start gap-3 text-left">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-cyan-400 mt-0.5">
                  <Sparkles size={16} />
                </div>
                <div className="text-xs space-y-1">
                  <span className="font-bold text-indigo-300 uppercase tracking-wider block">
                    {t('Executive Intelligence Summary')}
                  </span>
                  <p className="text-slate-200 leading-relaxed">
                    {isRevenueDown ? (
                      isVi ? (
                        <>
                          Ghi nhận mức <strong className="text-rose-400">sụt giảm doanh thu {percent(Math.abs(revenueChange))}</strong>{' '}
                          so với kỳ trước. Biên lợi nhuận hiện tại đạt{' '}
                          <strong className="text-white">{percent(result.summary.margin)}</strong>. Phát hiện{' '}
                          <strong className="text-amber-400">{criticalAlertsCount} cảnh báo vận hành nghiêm trọng</strong> cần xử lý.
                        </>
                      ) : (
                        <>
                          Observed a <strong className="text-rose-400">{percent(Math.abs(revenueChange))} revenue contraction</strong>{' '}
                          compared to prior period. Active margin sits at{' '}
                          <strong className="text-white">{percent(result.summary.margin)}</strong>. Identified{' '}
                          <strong className="text-amber-400">{criticalAlertsCount} critical operational alerts</strong> requiring review.
                        </>
                      )
                    ) : (
                      isVi ? (
                        <>
                          Hiệu quả kinh doanh duy trì ổn định với tổng doanh thu đạt{' '}
                          <strong className="text-emerald-400">{moneyCompact(result.summary.revenue)}</strong> và biên lợi nhuận gộp vững chắc{' '}
                          <strong className="text-white">{percent(result.summary.margin)}</strong>. Tỷ lệ sẵn có kho hàng đạt{' '}
                          <strong className="text-cyan-300">{percent(result.summary.inventory_availability)}</strong>.
                        </>
                      ) : (
                        <>
                          Business performance is steady with total revenue of{' '}
                          <strong className="text-emerald-400">{moneyCompact(result.summary.revenue)}</strong> and healthy gross margin of{' '}
                          <strong className="text-white">{percent(result.summary.margin)}</strong>. Inventory availability stands at{' '}
                          <strong className="text-cyan-300">{percent(result.summary.inventory_availability)}</strong>.
                        </>
                      )
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-wrap gap-3 justify-center lg:justify-start">
              <Link
                to="/ask"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:scale-[1.02] transition-all"
              >
                <span>{t('Ask Business Data')}</span>
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/scenarios"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <span>{t('Simulate Scenarios')}</span>
              </Link>
            </div>
          </div>

          {/* 3D Holographic Core in Hero */}
          <div className="hidden sm:flex flex-col items-center justify-center p-2">
            <AIIntelligenceCore size={260} />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-300/70 mt-1">
              {t('AI Core Active · Realtime')}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <Card className="filters">
        <div className="filter-intro flex items-center gap-2 text-xs font-bold text-slate-300">
          <CalendarDays size={16} className="text-cyan-400" />
          <span>{t('Reporting Scope:')}</span>
        </div>
        <label className="field">
          <span>{t('From')}</span>
          <input
            type="date"
            value={filters.start}
            min={dataset.start}
            max={filters.end}
            onChange={(e) => update('start', e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t('To')}</span>
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
      </Card>

      <ErrorState error={data.error} retry={() => void data.refetch()} />
      {data.isLoading && <Loading />}

      {result && (
        <>
          {/* KPI Stat Cards Grid (6 Refined Cards) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {stats.map((s) => (
              <Stat
                key={s.key}
                title={s.title}
                value={s.value}
                icon={s.icon}
                change={s.change}
                formula={s.formula}
              />
            ))}
          </div>

          {/* Revenue Analytics & Priority Signals Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2">
              <SectionTitle
                title={t('Revenue & Gross Profit Trend')}
                detail={dateLabel(result.range[0]) + ' – ' + dateLabel(result.range[1])}
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
              />
              <div className="flex items-center gap-6 text-xs text-slate-300 py-1">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500" />
                  <span>{t('Revenue')}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                  <span>{t('Gross Profit')}</span>
                </span>
              </div>
              <Chart
                data={result.trend}
                x="date"
                date
                series={[
                  { key: 'revenue', name: t('Revenue'), kind: 'area' },
                  { key: 'gross_profit', name: t('Gross Profit') },
                ]}
                format={moneyCompact}
              />
              <Source>{isVi ? 'Giao dịch Bán hàng · Tiền tệ Đồng (₫ VND Integer)' : 'Sales Transactions · Local Currency (₫ VND Integer)'}</Source>
            </Card>

            {/* Priority Anomaly Radar Card */}
            <Card>
              <SectionTitle
                title={t('Active Anomaly Radar')}
                detail={t('Ranked by severity & business impact')}
                aside={
                  <span className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                    <BellRing size={18} />
                  </span>
                }
              />
              <ErrorState error={alerts.error} />
              {alerts.isLoading && <Loading />}
              {alerts.data?.rows.length === 0 && <Empty text={isVi ? 'Không phát hiện bất thường trong giai đoạn này.' : 'No active anomalies in the selected period.'} />}
              <div className="space-y-2.5 pt-1">
                {alerts.data?.rows.map((a) => (
                  <Link
                    to={'/anomalies?alert=' + encodeURIComponent(a.id)}
                    key={a.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-indigo-950/30 hover:border-indigo-500/30 transition-all text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                          a.severity === 'critical'
                            ? 'bg-rose-500 animate-ping'
                            : a.severity === 'high'
                            ? 'bg-amber-400'
                            : 'bg-blue-400'
                        }`}
                      />
                      <div>
                        <strong className="block text-slate-200">{t(a.metric)}</strong>
                        <span className="text-[11px] text-slate-400">
                          {a.scope} · {dateLabel(a.end)}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-rose-300">
                      {a.deviation != null ? percent(a.deviation) : '—'}
                    </span>
                  </Link>
                ))}
              </div>
              <div className="pt-3">
                <Link
                  to={investigateHref(alerts.data?.rows[0]?.metric ?? '')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <span>{isVi ? 'Điều tra nguyên nhân cùng Trợ lý AI' : 'Investigate causes with AI Copilot'}</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </Card>
          </div>

          {/* Product Performance & Marketing Efficiency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <SectionTitle
                title={t('Product Performance')}
                detail={t('Top revenue generating SKUs')}
                aside={<ChartNoAxesCombined size={18} className="text-indigo-400" />}
              />
              <Table
                rows={result.products}
                columns={[
                  { key: 'name', title: t('Product SKU') },
                  { key: 'revenue', title: t('Revenue'), format: moneyCompact },
                  { key: 'gross_profit', title: t('Gross Profit'), format: moneyCompact },
                  { key: 'units', title: t('Units Sold'), format: integer },
                ]}
              />
              <Source>{isVi ? 'Danh mục 50 SKU · Hàng vật lý & Dịch vụ' : '50 SKUs Catalog · Physical & Services'}</Source>
            </Card>

            <Card>
              <SectionTitle
                title={t('Marketing Campaign Efficiency')}
                detail={result.market_scope}
                aside={<Zap size={18} className="text-amber-400" />}
              />
              <Table
                rows={result.marketing_channels}
                columns={[
                  { key: 'name', title: t('Marketing Channel') },
                  { key: 'spend', title: t('Ad Spend'), format: moneyCompact },
                  { key: 'roas', title: t('ROAS'), format: (v) => decimal(v) + '×' },
                ]}
              />
              <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-indigo-500/10 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">{t('Gross Margin')}</span>
                  <strong className="text-base text-white font-mono">{percent(result.summary.margin)}</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">{t('Physical Stock Availability')}</span>
                  <strong className="text-base text-cyan-300 font-mono">
                    {percent(result.summary.inventory_availability)}
                  </strong>
                </div>
              </div>
            </Card>
          </div>

          {/* Regional & Sales Channel Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <SectionTitle title={t('Revenue by Region')} detail={t('HCMC, Hanoi and Danang distribution')} />
              <Table
                rows={result.regions}
                columns={[
                  { key: 'name', title: t('Region') },
                  { key: 'revenue', title: t('Revenue'), format: moneyCompact },
                  { key: 'orders', title: t('Orders'), format: integer },
                ]}
              />
            </Card>

            <Card>
              <SectionTitle title={t('Revenue by Sales Channel')} detail={t('Online, Retail and B2B channels')} />
              <Table
                rows={result.sales_channels}
                columns={[
                  { key: 'name', title: t('Channel') },
                  { key: 'revenue', title: t('Revenue'), format: moneyCompact },
                  { key: 'orders', title: t('Orders'), format: integer },
                ]}
              />
              <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-indigo-500/10 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">{t('New Customers')}</span>
                  <strong className="text-base text-emerald-400 font-mono">
                    {integer(result.summary.new_customers)}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">{t('Returning Customers')}</span>
                  <strong className="text-base text-indigo-300 font-mono">
                    {integer(result.summary.returning_customers)}
                  </strong>
                </div>
              </div>
            </Card>
          </div>

          {/* Step 1 End-to-End Workflow Navigation Footer */}
          <WorkflowNavigationFooter
            nextPath="/ask"
            nextLabelKey="Next: Investigate Root Causes with AI Copilot"
          />
        </>
      )}
    </>
  )
}
