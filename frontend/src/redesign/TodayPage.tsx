import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compact, dateLabel, decimal, integer, moneyCompact, percent, request, shortDate, type Row, type Alert, type Dataset, type Forecast, type KPI, type Options, type Recommendation } from '../api'
import { investigateHref } from '../investigate'
import { useT } from '../preferences'
import { briefingSentence, roasLabel, tryFirstHref } from './logic'
import { BarList, EmptyState, Illus, NoteCard, PageHero, Panel, SectionLabel, StatCard } from './ui'

const ALERT_TITLE: Record<string, string> = {
  facebook_spend: 'Facebook spend is unusually high',
  facebook_conversion: 'Facebook conversion dropped',
}

export function TodayPage({ dataset, options }: { dataset?: Dataset; options?: Options }) {
  const { t } = useT()
  const ready = Boolean(dataset)
  const kpi = useQuery({ queryKey: ['today-kpi', dataset?.dataset_id], queryFn: () => request<KPI>('/kpi/summary'), enabled: ready })
  const alerts = useQuery({
    queryKey: ['today-alerts', dataset?.dataset_id],
    queryFn: () => request<{ rows: Alert[] }>('/anomalies?limit=6'),
    enabled: ready,
  })
  const recs = useQuery({
    queryKey: ['recommendations', dataset?.dataset_id],
    queryFn: () => request<{ rows: Recommendation[] }>('/recommendations'),
    enabled: ready,
  })
  const forecast = useQuery({
    queryKey: ['today-forecast', dataset?.dataset_id],
    queryFn: () => request<Forecast>('/forecast', { target: 'revenue', horizon: 30 }),
    enabled: ready,
  })

  if (!dataset) {
    return (
      <EmptyState
        title={t('No business data yet')}
        body={t('Upload a sales file to see your daily briefing.')}
        action={{ label: t('Go to Data'), to: '/data-sources' }}
      />
    )
  }

  const s = kpi.data?.summary
  const c = kpi.data?.changes
  const vsPrev = t('vs last period')
  const roas = roasLabel(s?.roas ?? null)
  const alertRows = alerts.data?.rows ?? []
  const topAlert = alertRows.find((a) => a.severity === 'critical' || a.severity === 'high')
  const topRec = (recs.data?.rows ?? [])
    .filter((r) => r.decision === 'pending')
    .map((r) => ({ rec: r, href: options ? tryFirstHref(r, options) : null }))
    .find((x) => x.href)
  const sentence = kpi.data ? briefingSentence(kpi.data, alertRows, t) : ''

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-0 pb-10">
      <PageHero
        tone="today"
        title={
          <>
            {t('Hello,')}
            <br />
            <span className="inline-block bg-gradient-to-r from-amber-200 to-pink-300 bg-clip-text pb-1 leading-[1.2] text-transparent">{t("here is today's briefing")}</span>
          </>
        }
        subtitle={sentence || t('Loading your numbers...')}
      >
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {kpi.data?.range?.[1] && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-bold">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
              {t('Data up to')} {dateLabel(kpi.data.range[1])}
            </span>
          )}
        </div>
        <div className="pointer-events-none absolute right-6 top-5 hidden items-start gap-3 md:flex">
          <div className="max-w-[230px] rounded-2xl bg-white px-3 py-2 text-[13px] text-slate-800 shadow-xl">
            {t('I only use your real shop numbers, never made-up ones.')}
          </div>
          <Illus name="pilot" size={80} />
        </div>
        <div className="h-12" />
      </PageHero>

      <div className="relative -mt-10 grid grid-cols-2 gap-3 px-3 sm:px-6 lg:grid-cols-4">
        {kpi.isError ? (
          <p className="col-span-full rounded-2xl bg-white p-4 text-sm text-rose-700">{t('Could not load your numbers.')}</p>
        ) : (
          <>
            <StatCard illus="moneybag" variant="solid" label={t('Revenue')} value={moneyCompact(s?.revenue)} delta={{ value: c?.revenue, caption: vsPrev }} />
            <StatCard illus="chartup" variant="green" label={t('Gross margin')} value={moneyCompact(s?.gross_profit)} sub={t('Margin rate') + ' ' + percent(s?.margin)} delta={{ value: c?.gross_profit, caption: vsPrev }} />
            <StatCard illus="cart" variant="violet" label={t('Orders')} value={integer(s?.orders)} delta={{ value: c?.orders, caption: vsPrev }} />
            <StatCard
              illus="megaphone"
              variant="rose"
              label={t('Ad payback')}
              value={s?.roas == null ? '—' : decimal(s.roas) + '×'}
              badge={roas ? { text: t(roas.key), kind: roas.kind } : undefined}
              delta={{ value: c?.roas, caption: vsPrev }}
            />
          </>
        )}
      </div>
      {!kpi.isError && (
        <div className="mt-3 grid grid-cols-2 gap-3 px-3 sm:px-6 lg:grid-cols-4">
          <StatCard illus="receipt" variant="amber" label={t('Average order value')} value={moneyCompact(s?.aov)} delta={{ value: c?.aov, caption: vsPrev }} />
          <StatCard
            illus="people"
            variant="teal"
            label={t('Customers')}
            value={integer(s?.customers)}
            sub={s?.new_customers != null ? t('{n} new · {m} returning').replace('{n}', integer(s.new_customers)).replace('{m}', integer(s?.returning_customers)) : undefined}
            delta={{ value: c?.customers, caption: vsPrev }}
          />
          <StatCard illus="megaphone" variant="sky" label={t('Ad spend')} value={moneyCompact(s?.spend)} delta={{ value: c?.spend, caption: vsPrev, upIsGood: false }} />
          <StatCard illus="check" variant="blue" label={t('Conversion rate')} value={percent(s?.conversion)} delta={{ value: c?.conversion, caption: vsPrev }} />
        </div>
      )}

      <div className="px-3 sm:px-6">
        <SectionLabel>{t('WHAT NEEDS YOUR ATTENTION TODAY')}</SectionLabel>
        <div className="grid gap-5 md:grid-cols-3">
          {alerts.isError && <NoteCard color="yellow" illus="warning" title={t('Warnings')} body={t('Could not load warnings')} />}
          {recs.isError && <NoteCard color="green" illus="bulb" title={t('Suggested next step')} body={t('Could not load suggestions')} />}
          {topAlert && (
            <NoteCard
              color="yellow"
              illus="warning"
              title={t(ALERT_TITLE[topAlert.metric] ?? 'Unusual change detected')}
              body={
                topAlert.deviation != null
                  ? t('{pct}% away from normal.').replace('{pct}', String(Math.round(Math.abs(topAlert.deviation) * 100)))
                  : t('Different from what the past suggests.')
              }
              action={{ label: t('See why'), to: investigateHref(topAlert.metric) }}
            />
          )}
          {topRec && (
            <NoteCard
              color="green"
              illus="bulb"
              pin
              title={t('Suggested next step')}
              body={t(topRec.rec.title)}
              action={{ label: t('Try first'), to: topRec.href as string }}
            />
          )}
          <NoteCard
            color="blue"
            illus="crystal"
            title={t('Next 30 days')}
            body={
              forecast.isError
                ? t('Could not load the forecast')
                : forecast.data
                  ? <>{t('Expected revenue about')} <b>{moneyCompact(forecast.data.total)}</b> ({t('estimate')})</>
                  : t('Loading forecast...')
            }
            action={{ label: t('See forecast'), to: '/forecast' }}
          />
        </div>
      </div>

      {kpi.data && (
        <div className="mt-6 flex flex-col gap-4 px-3 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={t('Revenue & gross profit by day')} illus="barchart" className="lg:col-span-2">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kpi.data.trend}>
                    <defs>
                      <linearGradient id="dpRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} /><stop offset="100%" stopColor="#4f46e5" stopOpacity={0} /></linearGradient>
                      <linearGradient id="dpGp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => shortDate(d)} tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis tickFormatter={(v: number) => compact(v)} tick={{ fontSize: 11 }} width={48} />
                    <Tooltip formatter={(v: number) => moneyCompact(v)} labelFormatter={(d: string) => dateLabel(d)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenue" name={t('Revenue')} stroke="#4f46e5" strokeWidth={2} fill="url(#dpRev)" />
                    <Area type="monotone" dataKey="gross_profit" name={t('Gross margin')} stroke="#10b981" strokeWidth={2} fill="url(#dpGp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title={t('Sales channels')} illus="store">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={rowsOf(kpi.data.sales_channels, 'revenue')} dataKey="value" nameKey="name" innerRadius={40} outerRadius={68} paddingAngle={2}>
                      {rowsOf(kpi.data.sales_channels, 'revenue').map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => moneyCompact(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                {rowsOf(kpi.data.sales_channels, 'revenue').map((r, i) => (
                  <li key={r.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{r.name}</span>
                    <span className="tabular-nums text-slate-600">{percent(r.value / Math.max(1, s?.revenue ?? 1))}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={t('Top products')} illus="package">
              <BarList rows={rowsOf(kpi.data.products, 'revenue').slice(0, 6)} format={moneyCompact} color="linear-gradient(90deg,#818cf8,#4f46e5)" />
            </Panel>
            <Panel title={t('Revenue by region')} illus="map">
              <BarList rows={rowsOf(kpi.data.regions, 'revenue')} format={moneyCompact} color="linear-gradient(90deg,#5eead4,#0d9488)" />
            </Panel>
            <Panel title={t('Ad performance by channel')} illus="megaphone">
              <table className="w-full text-[13px]" aria-label={t('Ad performance by channel')}>
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="pb-2 font-semibold">{t('Channel')}</th>
                    <th className="pb-2 text-right font-semibold">{t('Spend')}</th>
                    <th className="pb-2 text-right font-semibold">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.data.marketing_channels.map((m) => {
                    const r = typeof m.roas === 'number' ? m.roas : null
                    const lbl = roasLabel(r)
                    return (
                      <tr key={String(m.name)} className="border-t border-slate-100">
                        <td className="py-2 font-semibold text-slate-800">{String(m.name)}</td>
                        <td className="py-2 text-right tabular-nums text-slate-600">{moneyCompact(typeof m.spend === 'number' ? m.spend : null)}</td>
                        <td className="py-2 text-right">
                          <span className="tabular-nums font-bold">{r == null ? '—' : decimal(r) + '×'}</span>
                          {lbl && <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${ROAS_PILL[lbl.kind]}`}>{t(lbl.key)}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Panel>
          </div>
          {kpi.data.previous_range && (
            <p className="text-xs text-slate-500">
              {t('Compared with')} {dateLabel(kpi.data.previous_range[0])} – {dateLabel(kpi.data.previous_range[1])}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const PALETTE = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9']
const ROAS_PILL = { good: 'bg-emerald-100 text-emerald-800', normal: 'bg-slate-100 text-slate-700', bad: 'bg-rose-100 text-rose-700' } as const

function rowsOf(rows: Row[] | undefined, key: string): { name: string; value: number }[] {
  return (rows ?? [])
    .map((r) => ({ name: String(r.name), value: typeof r[key] === 'number' ? (r[key] as number) : 0 }))
    .sort((a, b) => b.value - a.value)
}
