import { useQuery } from '@tanstack/react-query'
import { dateLabel, decimal, integer, moneyCompact, percent, request, type Alert, type Dataset, type Forecast, type KPI, type Options, type Recommendation } from '../api'
import { investigateHref } from '../investigate'
import { useT } from '../preferences'
import { briefingSentence, roasLabel, tryFirstHref } from './logic'
import { EmptyState, Illus, NoteCard, PageHero, SectionLabel, StatCard } from './ui'

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
            <StatCard illus="moneybag" variant="solid" label={t('Revenue')} value={moneyCompact(s?.revenue)} />
            <StatCard illus="chartup" variant="green" label={t('Gross margin')} value={percent(s?.margin)} />
            <StatCard illus="cart" variant="violet" label={t('Orders')} value={integer(s?.orders)} />
            <StatCard
              illus="megaphone"
              variant="rose"
              label={t('Ad payback')}
              value={s?.roas == null ? '—' : decimal(s.roas) + '×'}
              badge={roas ? { text: t(roas.key), kind: roas.kind } : undefined}
            />
          </>
        )}
      </div>

      <div className="px-3 sm:px-6">
        <SectionLabel>{t('WHAT NEEDS YOUR ATTENTION TODAY')}</SectionLabel>
        <div className="grid gap-5 md:grid-cols-3">
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
    </div>
  )
}
