import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { integer, moneyCompact, request, type Dataset, type Options, type Row, type Scenario } from '../api'
import { useT } from '../preferences'
import { parseTryFirstParams, type ScenarioType } from './logic'
import { ActionButton, EmptyState, Illus, PageHero } from './ui'
import type { IllusName } from './illustrations'

type Slider = { min: number; max: number; step: number; initial: number; format: (v: number) => string }

const SLIDERS: Record<ScenarioType, Slider> = {
  marketing: { min: -50, max: 100, step: 5, initial: -15, format: (v) => `${v > 0 ? '+' : ''}${v}%` },
  price: { min: 0, max: 30, step: 1, initial: 10, format: (v) => `${v}%` },
  inventory: { min: 0, max: 300, step: 10, initial: 40, format: (v) => String(v) },
}

const TYPES: { type: ScenarioType; illus: IllusName; title: string; hint: string }[] = [
  { type: 'price', illus: 'moneybag', title: 'Change price', hint: 'Is a discount worth it?' },
  { type: 'marketing', illus: 'megaphone', title: 'Advertising', hint: 'Move money between channels' },
  { type: 'inventory', illus: 'package', title: 'Restock', hint: 'How much is enough?' },
]

function buildRequest(type: ScenarioType, target: string, value: number) {
  if (type === 'marketing') return { type, horizon: 30, objective: 'profit', parameters: { channel: target, changes: [value / 100] } }
  if (type === 'price') return { type, horizon: 30, objective: 'profit', parameters: { product: target, discounts: [value / 100] } }
  return { type, horizon: 30, objective: 'stockout', parameters: { product: target, order_quantities: [value] } }
}

const num = (row: Row | undefined, key: string) => (row && typeof row[key] === 'number' ? (row[key] as number) : null)

function signedMoney(v: number | null) {
  if (v == null) return '—'
  return (v > 0 ? '+' : v < 0 ? '−' : '') + moneyCompact(Math.abs(v))
}

export function TryFirstPage({ dataset, options, canEdit }: { dataset?: Dataset; options: Options; canEdit: boolean }) {
  const { t } = useT()
  const [search] = useSearchParams()
  const linked = useMemo(() => parseTryFirstParams(search), [search])
  const [type, setType] = useState<ScenarioType>(linked.type)
  const defaultTarget = (ty: ScenarioType) =>
    ty === 'marketing'
      ? (linked.type === ty && linked.channel) || options.marketing_channels[0] || ''
      : (linked.type === ty && linked.product) || options.products.find((p) => p.is_physical)?.product_id || options.products[0]?.product_id || ''
  const [target, setTarget] = useState(() => defaultTarget(linked.type))
  const initialValue = linked.type === 'marketing' && linked.change != null ? Math.round(linked.change * 100) : SLIDERS[linked.type].initial
  const [value, setValue] = useState(initialValue)
  const [rec, setRec] = useState(linked.rec)

  const client = useQueryClient()
  const simulate = useMutation({ mutationFn: (body: unknown) => request<Scenario>('/simulate', body) })
  const feedback = useMutation({
    mutationFn: (decision: 'accepted' | 'rejected') =>
      request<{ decision: string; id: number }>('/scenarios/feedback', {
        simulation_id: simulate.data?.simulation_id,
        dataset_id: simulate.data?.dataset_id,
        decision,
        ...(rec ? { recommendation_id: rec } : {}),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recommendations'] })
      void client.invalidateQueries({ queryKey: ['audit'] })
    },
  })

  const run = (ty = type, tg = target, v = value) => {
    if (!tg) return
    feedback.reset()
    simulate.mutate(buildRequest(ty, tg, v))
  }
  const autoRan = useRef(false)
  useEffect(() => {
    if (linked.autorun && !autoRan.current && dataset) {
      autoRan.current = true
      run(linked.type, target, value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset])

  if (!dataset) {
    return <EmptyState title={t('No business data yet')} body={t('Upload a sales file to see your daily briefing.')} action={{ label: t('Go to Data'), to: '/data-sources' }} />
  }

  const pickType = (ty: ScenarioType) => {
    const tg = defaultTarget(ty)
    setType(ty)
    setTarget(tg)
    setValue(SLIDERS[ty].initial)
    setRec(undefined)
    simulate.reset()
  }

  const result = simulate.data
  const base = result?.baseline
  const alt = result ? result.alternatives.find((a) => a.name !== base?.name) ?? result.recommended : undefined
  const third = (() => {
    if (!alt) return null
    if (type === 'marketing') {
      const b = num(base, 'spend'), a = num(alt, 'spend')
      return { label: t('Ad spend'), text: b != null && a != null ? signedMoney(a - b) : '—', good: a != null && b != null && a <= b }
    }
    if (type === 'price') {
      const b = num(base, 'fulfilled'), a = num(alt, 'fulfilled')
      const d = b != null && a != null ? Math.round(a - b) : null
      return { label: t('Units sold'), text: d == null ? '—' : (d > 0 ? '+' : '') + integer(d), good: (d ?? 0) >= 0 }
    }
    const day = alt.first_stockout_day
    return { label: t('First stock-out'), text: day == null ? t('No stock-out') : t('Day {n}').replace('{n}', String(day)), good: day == null }
  })()
  const slider = SLIDERS[type]
  const revenueDelta = num(alt, 'revenue_delta')
  const profitDelta = num(alt, 'profit_delta')
  const decided = feedback.data?.decision

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-10">
      <PageHero tone="try" title={t('Try first')} subtitle={t('Change it on paper, see the result, then decide.')} illus="testtube" />

      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('What do you want to try?')}>
        {TYPES.map((x) => (
          <button
            key={x.type}
            type="button"
            role="radio"
            aria-checked={type === x.type}
            onClick={() => pickType(x.type)}
            className={`flex items-center gap-3 rounded-[18px] border-2 bg-white p-4 text-left transition ${type === x.type ? 'border-orange-500 bg-orange-50' : 'border-transparent hover:border-orange-200'}`}
          >
            <Illus name={x.illus} size={40} />
            <span>
              <span className="block font-extrabold text-slate-900">{t(x.title)}</span>
              <span className="block text-xs text-slate-500">{t(x.hint)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-[18px] bg-white p-5 shadow-sm">
        <label className="block text-sm font-bold text-slate-700">
          {type === 'marketing' ? t('Channel') : t('Product')}
          <select
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value)
              setRec(undefined)
              run(type, e.target.value, value)
            }}
          >
            {type === 'marketing'
              ? options.marketing_channels.map((c) => <option key={c} value={c}>{c}</option>)
              : options.products.map((p) => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
          </select>
        </label>
        <label className="mt-4 block">
          <span className="font-extrabold text-slate-900">
            {type === 'marketing' ? t('Budget change') : type === 'price' ? t('Discount') : t('Units to order')}: {slider.format(value)}
          </span>
          <input
            type="range"
            className="mt-3 w-full accent-orange-600"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            onPointerUp={() => run()}
            onKeyUp={() => run()}
          />
        </label>
        <p className="mt-1 text-xs text-slate-500">{t('Drag to change, the result updates when you let go.')}</p>
      </div>

      {simulate.isError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{t('Could not run this scenario.')}</p>}
      {simulate.isPending && <p className="text-sm text-slate-500">{t('Calculating...')}</p>}

      {alt && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <ResultCard label={t('Revenue')} text={signedMoney(revenueDelta)} good={(revenueDelta ?? 0) >= 0} />
            {third && <ResultCard label={third.label} text={third.text} good={third.good} />}
            <ResultCard label={t('Profit')} text={signedMoney(profitDelta)} good={(profitDelta ?? 0) >= 0} />
          </div>
          <div className="-rotate-[0.4deg] rounded-md bg-amber-100 px-4 py-3 text-[13px] text-amber-950 shadow-sm">
            {t('This is an estimate from past data, not a promise. Try it small for a week first.')}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton tone="decide" disabled={!canEdit || feedback.isPending || Boolean(decided)} title={canEdit ? undefined : t('Viewers cannot record decisions')} onClick={() => feedback.mutate('accepted')}>
              {t('Choose')}
            </ActionButton>
            <ActionButton tone="muted" disabled={!canEdit || feedback.isPending || Boolean(decided)} title={canEdit ? undefined : t('Viewers cannot record decisions')} onClick={() => feedback.mutate('rejected')}>
              {t('Skip')}
            </ActionButton>
            {decided && (
              <span className="text-sm font-bold text-emerald-700">
                {t('Recorded:')} {t(decided === 'accepted' ? 'Choose' : 'Skip')}. <Link className="underline" to="/decisions">{t('See decisions')}</Link>
              </span>
            )}
            {feedback.isError && <span className="text-sm text-rose-700">{t('Could not save the decision.')}</span>}
          </div>
        </>
      )}

      <Link to="/advanced/simulator-3d" className="self-start text-sm font-bold text-orange-700 underline">
        {t('Open the 3D version')}
      </Link>
    </div>
  )
}

function ResultCard({ label, text, good }: { label: string; text: string; good: boolean }) {
  return (
    <div className="rounded-[18px] bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-extrabold tabular-nums ${good ? 'text-emerald-700' : 'text-rose-600'}`}>{text}</div>
    </div>
  )
}
