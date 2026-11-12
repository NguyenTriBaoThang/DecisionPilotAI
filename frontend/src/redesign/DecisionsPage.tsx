import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dateLabel, request, type Audit, type Dataset, type Options, type Recommendation } from '../api'
import { useT } from '../preferences'
import { decisionBucket, tryFirstHref } from './logic'
import { ActionButton, EmptyState, Illus, PageHero, Pill, SectionLabel } from './ui'
import type { IllusName } from './illustrations'

const ICON_BY_PREFIX: Record<string, IllusName> = { marketing: 'megaphone', price: 'moneybag', inventory: 'package' }
const iconFor = (id: string): IllusName => ICON_BY_PREFIX[id.split(':')[0]] ?? 'bulb'

const STATUS = {
  chosen: { key: 'Chosen', cls: 'bg-emerald-100 text-emerald-800' },
  skipped: { key: 'Skipped', cls: 'bg-slate-100 text-slate-700' },
  pending: { key: 'Waiting', cls: 'bg-amber-100 text-amber-800' },
} as const

function auditTitle(row: Audit): string {
  const rec = row.payload.recommendation as unknown as { title?: string } | undefined
  return rec?.title ?? row.subject
}

export function DecisionsPage({ dataset, options, canEdit }: { dataset?: Dataset; options?: Options; canEdit: boolean }) {
  const { t } = useT()
  const client = useQueryClient()
  const recs = useQuery({
    queryKey: ['recommendations', dataset?.dataset_id],
    queryFn: () => request<{ rows: Recommendation[] }>('/recommendations'),
    enabled: Boolean(dataset),
  })
  const log = useQuery({
    queryKey: ['audit', 'decisions', dataset?.dataset_id],
    queryFn: () => request<{ rows: Audit[]; next_before: number | null }>('/audit?kind=decisions'),
    enabled: Boolean(dataset),
  })
  const feedback = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accepted' | 'rejected' }) =>
      request('/recommendations/feedback', { recommendation_id: id, decision, dataset_id: dataset?.dataset_id }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recommendations'] })
      void client.invalidateQueries({ queryKey: ['audit'] })
    },
  })

  if (!dataset) {
    return <EmptyState title={t('No business data yet')} body={t('Upload a sales file to see your daily briefing.')} action={{ label: t('Go to Data'), to: '/data-sources' }} />
  }

  const pending = (recs.data?.rows ?? []).filter((r) => decisionBucket(r.decision) === 'pending')
  // A Try-first decision on a recommendation writes scenario_feedback + recommendation_feedback with the same
  // simulation_id; show it once (the recommendation row carries the title).
  const linkedSims = new Set(
    (log.data?.rows ?? []).filter((r) => r.kind === 'recommendation_feedback' && r.payload.simulation_id).map((r) => String(r.payload.simulation_id))
  )
  const logRows = (log.data?.rows ?? []).filter((r) => !(r.kind === 'scenario_feedback' && linkedSims.has(String(r.payload.simulation_id))))
  const count = (b: 'chosen' | 'skipped') => logRows.filter((r) => decisionBucket(String(r.payload.decision ?? '')) === b).length
  const stats: { id: 'chosen' | 'skipped' | 'pending'; illus: IllusName; label: string; value: number; bg: string; fg: string }[] = [
    { id: 'chosen', illus: 'check', label: t('Chosen'), value: count('chosen'), bg: '#dcfce7', fg: '#15803d' },
    { id: 'skipped', illus: 'filebox', label: t('Skipped'), value: count('skipped'), bg: '#f1f5f9', fg: '#475569' },
    { id: 'pending', illus: 'bulb', label: t('Suggestions waiting'), value: pending.length, bg: '#fef3c7', fg: '#b45309' },
  ]

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-10">
      <PageHero tone="decide" title={t('Decisions')} subtitle={t('Every choose or skip is recorded: who, when and based on what.')} illus="clipboard" />

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.id} data-testid={`count-${s.id}`} className="flex items-center gap-3 rounded-[18px] p-4" style={{ background: s.bg }}>
            <Illus name={s.illus} size={36} />
            <div>
              <div className="text-2xl font-extrabold" style={{ color: s.fg }}>{recs.isLoading || log.isLoading ? '—' : s.value}</div>
              <div className="text-sm text-slate-700">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {(recs.isError || log.isError) && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{t('Could not load decisions.')}</p>}

      {pending.length > 0 && (
        <section>
          <SectionLabel>{t('WAITING FOR YOU')}</SectionLabel>
          <ul className="flex flex-col gap-3">
            {pending.map((r) => {
              const href = options ? tryFirstHref(r, options) : null
              return (
                <li key={r.id} data-testid={`rec-${r.id}`} className="flex flex-wrap items-center gap-3 rounded-[18px] bg-white p-4 shadow-sm">
                  <Illus name={iconFor(r.id)} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-slate-900">{t(r.title)}</div>
                    {r.action && <div className="text-xs text-slate-500">{r.action}</div>}
                  </div>
                  <Pill className={STATUS.pending.cls}>{t(STATUS.pending.key)}</Pill>
                  <div className="flex flex-wrap gap-2">
                    {href && <ActionButton tone="try" to={href}>{t('Try first')}</ActionButton>}
                    <ActionButton tone="decide" disabled={!canEdit || feedback.isPending} title={canEdit ? undefined : t('Viewers cannot record decisions')} onClick={() => feedback.mutate({ id: r.id, decision: 'accepted' })}>
                      {t('Choose')}
                    </ActionButton>
                    <ActionButton tone="muted" disabled={!canEdit || feedback.isPending} title={canEdit ? undefined : t('Viewers cannot record decisions')} onClick={() => feedback.mutate({ id: r.id, decision: 'rejected' })}>
                      {t('Skip')}
                    </ActionButton>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <SectionLabel>{t('DECISION LOG')}</SectionLabel>
        {logRows.length === 0 && !log.isLoading ? (
          <p className="rounded-[18px] bg-white p-4 text-sm text-slate-500">{t('No decisions yet. Choose or skip a suggestion to start the log.')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {logRows.map((row) => {
              const bucket = decisionBucket(String(row.payload.decision ?? ''))
              const st = STATUS[bucket]
              const recId = (row.payload.recommendation as unknown as { id?: string } | undefined)?.id ?? row.subject
              return (
                <li key={row.id} data-testid={`log-${row.id}`} className="flex flex-wrap items-center gap-3 rounded-[18px] bg-white p-4 shadow-sm">
                  <Illus name={row.kind === 'scenario_feedback' ? 'testtube' : iconFor(recId)} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-slate-900">{t(auditTitle(row))}</div>
                    <div className="text-xs text-slate-500">
                      {String(row.payload.actor ?? 'local-workspace')} · {dateLabel(row.occurred_at.slice(0, 10))} · {row.kind}
                    </div>
                  </div>
                  <Pill className={st.cls}>{t(bucket === 'chosen' ? 'Chosen' : bucket === 'skipped' ? 'Skipped' : 'Waiting')}</Pill>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
