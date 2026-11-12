import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { decimal, moneyCompact, percent, request, type QueryResult } from '../api'
import { useT } from '../preferences'
import { highlightFromChart, scenarioForQuestion } from './logic'
import { Illus, PageHero } from './ui'
import type { IllusName } from './illustrations'

type Turn = { id: number; question: string; result?: QueryResult; error?: boolean }

const CHIPS: { illus: IllusName; text: string }[] = [
  { illus: 'moneybag', text: 'Revenue this month?' },
  { illus: 'package', text: 'Which products sell best?' },
  { illus: 'megaphone', text: 'Which ads are losing money?' },
  { illus: 'crystal', text: 'How much will we sell next month?' },
]

const BAR_COLORS = ['#fb7185', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24']

function formatHighlight(y: string, v: number) {
  if (y === 'roas') return decimal(v) + '×'
  if (y.includes('margin') || y.includes('conversion') || y.includes('share')) return percent(v)
  return moneyCompact(v)
}

export function AskPage(_props: { canEdit: boolean }) {
  const { t } = useT()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const nextId = useRef(0)

  const send = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q) return
    const id = nextId.current++
    setTurns((xs) => [...xs, { id, question: q }])
    setBusy(true)
    try {
      const result = await request<QueryResult>('/query', { question: q })
      setTurns((xs) => xs.map((x) => (x.id === id ? { ...x, result } : x)))
    } catch {
      setTurns((xs) => xs.map((x) => (x.id === id ? { ...x, error: true } : x)))
    } finally {
      setBusy(false)
    }
  }, [])

  // ?q= deep link (from Today's "See why"): send once, then drop the param so a refresh does not resend.
  const [search, setSearch] = useSearchParams()
  const sentFromLink = useRef(false)
  useEffect(() => {
    const q = search.get('q')
    if (q && !sentFromLink.current) {
      sentFromLink.current = true
      setSearch({}, { replace: true })
      void send(q)
    }
  }, [search, setSearch, send])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(draft)
    setDraft('')
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-10">
      <PageHero tone="ask" title={t('Ask AI')} subtitle={t('Ask in plain words. Answers use your real shop numbers.')} illus="robot" />

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.text}
            type="button"
            onClick={() => void send(t(c.text))}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-violet-200 bg-white px-3 text-[13px] font-bold text-slate-800 hover:border-violet-400"
          >
            <Illus name={c.illus} size={20} />
            {t(c.text)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3" aria-live="polite">
        {turns.map((turn) => {
          const hl = turn.result ? highlightFromChart(turn.result.answer, turn.result.chart) : null
          const scenario = scenarioForQuestion(turn.question)
          return (
            <div key={turn.id} className="flex flex-col gap-3">
              <div className="self-end rounded-2xl bg-violet-600 px-4 py-2.5 text-white">{turn.question}</div>
              <div className="flex items-start gap-3">
                <Illus name="pilot" size={36} className="shrink-0" />
                <div className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 shadow-[0_6px_18px_rgba(30,20,80,0.08)]">
                  {turn.error && <p className="text-rose-700">{t('Could not answer right now. Please try again.')}</p>}
                  {!turn.result && !turn.error && <p className="text-slate-500">{t('Thinking...')}</p>}
                  {turn.result && (
                    <>
                      {hl && (
                        <div className="mb-1 flex items-baseline gap-2">
                          <span className="text-2xl font-extrabold text-violet-700">{formatHighlight(hl.y, hl.value)}</span>
                          <span className="text-sm text-slate-500">{hl.name}</span>
                        </div>
                      )}
                      <p className="text-slate-800">{turn.result.answer}</p>
                      {turn.result.chart && turn.result.chart.rows.length > 1 && (
                        <div className="mt-3 h-36">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={turn.result.chart.rows}>
                              <XAxis dataKey={turn.result.chart.x} tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Bar dataKey={turn.result.chart.y} radius={[6, 6, 0, 0]}>
                                {turn.result.chart.rows.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {turn.result.trace?.sources?.length ? (
                        <p className="mt-2 text-xs text-slate-500">
                          {t('Source:')} {turn.result.trace.sources.join(', ')}
                        </p>
                      ) : null}
                      {scenario && (
                        <Link to={`/scenarios?type=${scenario}`} className="mt-2 inline-block text-sm font-extrabold text-orange-700 hover:underline">
                          {t('Try first')} →
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={submit} className="sticky bottom-3 flex items-center gap-2 rounded-2xl border-2 border-violet-300 bg-white p-2 shadow-lg">
        <label className="sr-only" htmlFor="ask-input">{t('Your question')}</label>
        <input
          id="ask-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('Ask anything about your shop...')}
          className="min-h-[44px] flex-1 bg-transparent px-2 text-slate-900 outline-none"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="grid h-11 w-11 place-items-center rounded-xl bg-pink-600 text-lg font-extrabold text-white disabled:opacity-50"
        >
          <span aria-hidden="true">→</span>
          <span className="sr-only">{t('Send')}</span>
        </button>
      </form>
    </div>
  )
}
