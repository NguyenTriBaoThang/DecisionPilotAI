import { useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  Layers,
  LineChart,
  Send,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  type Alert,
  type Audit,
  type Dataset,
  type Forecast,
  type Options,
  type QueryResult,
  type Recommendation,
  type Row,
  type Scenario,
  dateLabel,
  decimal,
  integer,
  label,
  money,
  moneyCompact,
  params,
  percent,
  request,
} from './api'
import { alertName } from './Dashboard'
import { Button, Card, Chart, Empty, ErrorState, Heading, Loading, Pill, SectionTitle, Select, Source, Table } from './ui'
import { Scenario3DLandscape } from './components/Scenario3DLandscape'

const prompts = [
  'How is our business performing this month?',
  'Why did revenue decrease this month?',
  'Which product generated the highest profit?',
  'Which marketing channel had the lowest ROAS?',
  'Forecast demand for SmartDesk Mini for the next 30 days.',
  'Compare revenue performance across regions.',
]

function Contribution({
  rows,
  interpretation,
  metric,
}: {
  rows: Record<string, Row[]>
  interpretation?: string
  metric?: string
}) {
  const [dimension, setDimension] = useState('product')
  const format = metric === 'units' ? decimal : moneyCompact

  return (
    <div className="contribution space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <Select
          label="Breakdown Dimension"
          value={dimension}
          onChange={setDimension}
          options={Object.keys(rows).map<[string, string]>((key) => [key, label(key)])}
        />
        <Pill tone="accent">Waterfall Decomposition</Pill>
      </div>
      <Table
        rows={(rows[dimension] || []).slice(0, 8)}
        columns={[
          { key: 'name', title: 'Group / Dimension' },
          { key: 'actual', title: 'Current Period', format },
          { key: 'baseline', title: 'Previous Period', format },
          { key: 'delta', title: 'Absolute Delta', format },
          { key: 'share_of_net_change', title: 'Share of Net Change', format: percent },
        ]}
      />
      <p className="text-xs text-slate-400 italic">
        {interpretation ||
          'Each dimension independently reconciles to 100% of the total observed delta. Contributions are descriptive, not causal claims.'}
      </p>
    </div>
  )
}

const askForm = z.object({
  question: z.string().trim().min(3, 'Enter a question with at least three characters.').max(500),
})

export type ChatMessage = { question: string; result?: QueryResult; error?: string }

export function Ask({
  dataset,
  messages,
  setMessages,
}: {
  dataset: Dataset
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const form = useForm<z.infer<typeof askForm>>({
    resolver: zodResolver(askForm),
    defaultValues: { question: '' },
  })

  const [thinkingStep, setThinkingStep] = useState<string | null>(null)

  const query = useMutation({
    mutationFn: async (question: string) => {
      setThinkingStep('Parsing natural language intent…')
      setTimeout(() => setThinkingStep('Querying verified business tables…'), 400)
      setTimeout(() => setThinkingStep('Synthesizing evidence and chart artifacts…'), 800)
      const res = await request<QueryResult>('/query', { question })
      setThinkingStep(null)
      return res
    },
    onSuccess: (result, question) => {
      setThinkingStep(null)
      setMessages((rows) => [...rows, { question, result }])
    },
    onError: (error, question) => {
      setThinkingStep(null)
      setMessages((rows) => [...rows, { question, error: error.message }])
    },
  })

  const send = (question: string) => {
    if (!query.isPending) {
      form.reset()
      query.mutate(question)
    }
  }

  return (
    <>
      <Heading
        eyebrow="CONVERSATIONAL BUSINESS INTELLIGENCE"
        title="Ask Business Data"
        subtitle="Ask complex business questions in natural language. Inspect executed analytics tools, formulas, data bounds and evidence."
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3 chat flex flex-col min-h-[580px]">
          <SectionTitle
            title="Analysis Conversation"
            detail={'Connected snapshot through ' + dateLabel(dataset.end)}
            aside={
              <span className="p-2 rounded-xl bg-indigo-500/10 text-cyan-400">
                <Sparkles size={18} />
              </span>
            }
          />

          {!messages.length && !query.isPending && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner">
                <Sparkles size={32} />
              </div>
              <h2 className="text-xl font-bold text-white">What would you like to understand?</h2>
              <p className="text-xs text-slate-400 max-w-md">
                Ask about revenue trends, margin pressure, product popularity, marketing ROAS or run a 30-day forecast.
              </p>
            </div>
          )}

          <div className="messages flex-1 overflow-y-auto space-y-6 pr-2" aria-live="polite">
            {messages.map(({ question, result, error }, i) => (
              <div key={i} className="space-y-3">
                {/* User Message */}
                <div className="flex justify-end">
                  <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-md max-w-xl">
                    {question}
                  </div>
                </div>

                {error && <ErrorState error={new Error(error)} />}

                {/* Assistant Grounded Message */}
                {result && (
                  <div className="rounded-2xl border border-indigo-500/20 bg-slate-900/60 p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-indigo-500/10">
                      <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                        <Sparkles size={16} />
                        <span>DecisionPilot AI</span>
                      </div>
                      <Pill tone="accent">Tool: {result.trace.tool}</Pill>
                    </div>

                    <p className="text-sm text-slate-100 leading-relaxed font-normal">{result.answer}</p>

                    {/* Chart Visualization if present */}
                    {result.chart && (
                      <div className="pt-2">
                        <Chart
                          data={result.chart.rows}
                          x={result.chart.x}
                          date={result.chart.x === 'date'}
                          height={240}
                          series={[
                            {
                              key: result.chart.y,
                              name: label(result.chart.y),
                              kind: result.chart.type === 'bar' ? 'bar' : 'line',
                            },
                          ]}
                        />
                      </div>
                    )}

                    {/* Multi-dimensional Contribution Breakdown if present */}
                    {result.evidence.contributions && (
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <Contribution rows={result.evidence.contributions} />
                      </div>
                    )}

                    {/* Grounded Trace & Verification Drawer */}
                    <details className="text-xs text-slate-400 pt-2 border-t border-indigo-500/10">
                      <summary className="cursor-pointer font-semibold text-indigo-300 hover:text-indigo-200 py-1">
                        View Sources, Data Bounds & Executed Formulas
                      </summary>
                      <div className="mt-2 space-y-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono">
                        <div>
                          <strong className="text-slate-300">Data Sources:</strong>{' '}
                          {result.trace.sources?.join(' · ') || 'Verified Analytics'}
                        </div>
                        {result.trace.range && (
                          <div>
                            <strong className="text-slate-300">Range:</strong> {result.trace.range.join(' to ')}
                          </div>
                        )}
                        {Object.values(result.trace.formulas).map((formula, idx) => (
                          <div key={idx} className="text-cyan-400">
                            <strong>Formula:</strong> {formula}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            ))}

            {query.isPending && (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/40 text-xs font-semibold text-cyan-300 animate-pulse">
                <Sparkles size={16} />
                <span>{thinkingStep || 'Analyzing business intelligence streams…'}</span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form
            className="pt-4 border-t border-indigo-500/10 flex gap-2"
            onSubmit={form.handleSubmit(({ question }) => send(question))}
          >
            <input
              aria-label="Business question"
              placeholder="Ask about revenue, SKU margins, marketing ROAS, or demand forecasts…"
              maxLength={500}
              className="flex-1 rounded-xl border border-indigo-500/20 bg-[#0c1224] px-4 py-3 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all"
              {...form.register('question')}
            />
            <Button className="primary px-5 py-3 text-xs flex items-center gap-2" type="submit" disabled={query.isPending}>
              <Send size={15} />
              <span>Send</span>
            </Button>
          </form>
          {form.formState.errors.question && (
            <p className="text-xs text-rose-400 mt-1">{form.formState.errors.question.message}</p>
          )}
        </Card>

        {/* Suggested Business Questions Sidebar */}
        <Card className="prompts space-y-4">
          <SectionTitle
            title="Suggested Queries"
            detail="Grounded in active workspace dataset"
            aside={<Zap size={16} className="text-cyan-400" />}
          />
          <div className="space-y-2">
            {prompts.map((text) => (
              <button
                key={text}
                onClick={() => send(text)}
                disabled={query.isPending}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-indigo-950/30 hover:border-indigo-500/30 text-xs text-slate-300 transition-all flex items-center justify-between group"
              >
                <span>{text}</span>
                <ChevronRight size={14} className="text-slate-500 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
          <Source>Deterministic Analytics · AST Validated Tools</Source>
        </Card>
      </div>
    </>
  )
}

const alertFormat = (metric: string) =>
  metric.includes('roas')
    ? (v: number) => decimal(v) + '×'
    : metric.includes('conversion') || metric === 'margin'
    ? percent
    : metric === 'revenue' || metric.includes('spend')
    ? moneyCompact
    : decimal

export function Alerts({ dataset }: { dataset: Dataset }) {
  const [severity, setSeverity] = useState('')
  const [window, setWindow] = useState({
    start: [dataset.end.slice(0, 7) + '-01', dataset.start].sort()[1],
    end: dataset.end,
  })
  const [search, setSearch] = useSearchParams()
  const alertId = search.get('alert')
  const range = params(window)

  const list = useQuery({
    queryKey: ['alerts', range, severity],
    queryFn: () => request<{ rows: Alert[] }>('/anomalies?' + params({ ...window, severity })),
  })

  const detail = useQuery({
    queryKey: ['alert', alertId, range],
    queryFn: () => request<Alert>('/anomalies/' + encodeURIComponent(alertId || '') + '?' + range),
    enabled: !!alertId,
  })

  const selected = detail.data
  const allAlerts = list.data?.rows || []
  const criticalCount = allAlerts.filter((a) => a.severity === 'critical').length
  const highCount = allAlerts.filter((a) => a.severity === 'high').length
  const mediumCount = allAlerts.filter((a) => a.severity === 'medium').length

  return (
    <>
      <Heading
        eyebrow="RISK RADAR & ANOMALY DETECTION"
        title="Anomaly Center"
        subtitle="Monitor sudden revenue contractions, ad spend spikes, margin pressure and stockout risks detected via Hybrid Isolation Forest & Rolling Z-Scores."
      />

      {/* Anomaly Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-indigo-500/20">
          <small className="text-xs text-slate-400">Total Detected Anomalies</small>
          <div className="text-2xl font-black text-white font-mono mt-1">{allAlerts.length}</div>
        </Card>
        <Card className="border-rose-500/20">
          <small className="text-xs text-rose-300">Critical Alerts</small>
          <div className="text-2xl font-black text-rose-400 font-mono mt-1">{criticalCount}</div>
        </Card>
        <Card className="border-amber-500/20">
          <small className="text-xs text-amber-300">High Priority Alerts</small>
          <div className="text-2xl font-black text-amber-400 font-mono mt-1">{highCount}</div>
        </Card>
        <Card className="border-blue-500/20">
          <small className="text-xs text-blue-300">Medium Priority Alerts</small>
          <div className="text-2xl font-black text-blue-400 font-mono mt-1">{mediumCount}</div>
        </Card>
      </div>

      <Card className="filters">
        <label className="field">
          <span>From</span>
          <input
            type="date"
            min={dataset.start}
            max={window.end}
            value={window.start}
            onChange={(e) => {
              setWindow({ ...window, start: e.target.value })
              setSearch({})
            }}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            type="date"
            min={window.start}
            max={dataset.end}
            value={window.end}
            onChange={(e) => {
              setWindow({ ...window, end: e.target.value })
              setSearch({})
            }}
          />
        </label>
        <Select
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={[
            ['', 'All Severities'],
            ['critical', 'Critical Alerts'],
            ['high', 'High Priority'],
            ['medium', 'Medium Priority'],
          ]}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <SectionTitle
            title="Ranked Anomalies"
            detail="Sorted by severity & deviation"
            aside={<Bell size={18} className="text-rose-400" />}
          />
          <ErrorState error={list.error} retry={() => void list.refetch()} />
          {list.isLoading && <Loading />}
          {allAlerts.length === 0 && <Empty text="No alerts match the selected filters." />}
          <div className="space-y-2 pt-1 max-h-[520px] overflow-y-auto pr-1">
            {allAlerts.map((row) => (
              <button
                key={row.id}
                className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between text-xs ${
                  row.id === alertId
                    ? 'border-indigo-500 bg-indigo-950/40 shadow-lg'
                    : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/40'
                }`}
                onClick={() => setSearch({ alert: row.id })}
              >
                <div>
                  <strong className="block text-slate-200">{alertName[row.metric] || label(row.metric)}</strong>
                  <span className="text-[11px] text-slate-400">
                    {row.scope} · {dateLabel(row.end)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={row.severity}>{row.severity}</Pill>
                  <ChevronRight size={15} className="text-slate-500" />
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Detail Inspection Card */}
        <Card className="lg:col-span-2">
          <ErrorState error={detail.error} retry={() => void detail.refetch()} />
          {detail.isLoading && <Loading />}
          {!alertId && <Empty text="Select an anomaly card from the left panel to inspect root causes and charts." />}

          {selected && (
            <div className="space-y-5">
              <SectionTitle
                title={alertName[selected.metric] || label(selected.metric)}
                detail={selected.scope + ' · ' + dateLabel(selected.start) + ' – ' + dateLabel(selected.end)}
                aside={<Pill tone={selected.severity}>{selected.severity.toUpperCase()} · SCORE {selected.score}/100</Pill>}
              />

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                  <span className="text-slate-400 block text-[11px]">Observed Value</span>
                  <strong className="text-base text-rose-400 font-mono">
                    {alertFormat(selected.metric)(selected.actual)}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                  <span className="text-slate-400 block text-[11px]">Historical Baseline</span>
                  <strong className="text-base text-slate-200 font-mono">
                    {alertFormat(selected.metric)(selected.baseline)}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                  <span className="text-slate-400 block text-[11px]">Deviation Rate</span>
                  <strong className="text-base text-amber-400 font-mono">{percent(selected.deviation)}</strong>
                </div>
              </div>

              {/* Observed vs Baseline Chart */}
              <div>
                <Chart
                  data={selected.chart}
                  x="date"
                  date
                  height={240}
                  format={alertFormat(selected.metric)}
                  series={[
                    { key: 'actual', name: 'Observed', kind: selected.chart.length === 1 ? 'bar' : 'line' },
                    { key: 'baseline', name: 'Baseline', kind: selected.chart.length === 1 ? 'bar' : 'line', dashed: true },
                  ]}
                />
              </div>

              {/* Actionable Recommendation Callout */}
              <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/30 flex items-start gap-3 text-xs">
                <CircleAlert size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-semibold mb-0.5">Recommended Action:</strong>
                  <p className="text-slate-300 leading-relaxed">{selected.action}</p>
                </div>
              </div>

              {selected.contributing_factors && (
                <Contribution
                  rows={selected.contributing_factors.contributions}
                  interpretation={selected.contributing_factors.interpretation}
                  metric={selected.contributing_factors.metric}
                />
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

export function ForecastPage({ options }: { options: Options }) {
  const [target, setTarget] = useState('revenue')
  const [scope, setScope] = useState('')
  const [horizon, setHorizon] = useState('30')

  const mutation = useMutation({
    mutationFn: (values: unknown) => request<Forecast>('/forecast', values),
  })

  const result = mutation.data
  const run = () =>
    mutation.mutate({
      target,
      horizon: Number(horizon),
      ...(scope.startsWith('p:')
        ? { product: scope.slice(2) }
        : scope.startsWith('c:')
        ? { category: scope.slice(2) }
        : {}),
    })

  const format = result?.target === 'revenue' ? moneyCompact : decimal
  const chart = result
    ? [
        ...result.history.map((r, i) => ({
          ...r,
          observed: r.value,
          projected: i === result.history.length - 1 ? r.value : null,
        })),
        ...result.prediction.map((r) => ({ ...r, observed: null, projected: r.value })),
      ]
    : []

  const metrics = result ? Object.entries(result.metrics.test).map(([model, m]) => ({ model, ...m })) : []

  return (
    <>
      <Heading
        eyebrow="PREDICTIVE INTELLIGENCE"
        title="Forecast Center"
        subtitle="Forecast demand, revenue and orders using LightGBM gradient boosting trees, point-in-time lag features and 90% confidence bands."
      />

      <Card className="filters">
        <Select
          label="Target Metric"
          value={target}
          onChange={setTarget}
          options={[
            ['revenue', 'Revenue (₫ VND)'],
            ['orders', 'Order Volume'],
            ['demand', 'Demand Units'],
          ]}
        />
        <Select
          label="Scope"
          value={scope}
          onChange={setScope}
          options={[
            ['', 'Entire Business'],
            ...options.categories.map<[string, string]>((c) => ['c:' + c, 'Category · ' + c]),
            ...options.products.map<[string, string]>((p) => ['p:' + p.product_id, p.product_name]),
          ]}
        />
        <Select
          label="Forecast Horizon"
          value={horizon}
          onChange={setHorizon}
          options={[
            ['7', '7 Days Forward'],
            ['30', '30 Days Forward'],
          ]}
        />
        <Button className="primary px-5 py-2.5 text-xs flex items-center gap-2" onClick={run} disabled={mutation.isPending}>
          <span>Run Forecast</span>
          <ArrowRight size={15} />
        </Button>
      </Card>

      <ErrorState error={mutation.error} />
      {mutation.isPending && <Loading />}

      {!result && !mutation.isPending && !mutation.error && (
        <Card>
          <Empty text="Configure the forecast parameters above and click Run Forecast to generate projections." />
        </Card>
      )}

      {result && (
        <div className="space-y-6">
          <Card>
            <SectionTitle
              title={label(result.target) + ' Multi-Day Projection'}
              detail={result.horizon + ' Days Horizon · ' + result.scope + ' · Model: ' + result.model_version}
              aside={
                <Pill tone="accent">
                  Selected Model: {result.metrics.selected === 'lightgbm' ? 'LightGBM 4.6.0' : label(result.metrics.selected)}
                </Pill>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <span className="text-slate-400 block text-[11px]">Cumulative Forecast Total</span>
                <strong className="text-lg text-white font-mono">{format(result.total)}</strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <span className="text-slate-400 block text-[11px]">Test Set Interval Coverage</span>
                <strong className="text-lg text-emerald-400 font-mono">{percent(result.metrics.test_coverage)}</strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <span className="text-slate-400 block text-[11px]">Selected Model Test WAPE</span>
                <strong className="text-lg text-cyan-300 font-mono">
                  {percent(result.metrics.test[result.metrics.selected]?.wape)}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs text-slate-300 py-1">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-indigo-500 shadow-sm" />
                <span>Historical Observations</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-sm" />
                <span>Predicted Mean</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-violet-500/40 shadow-sm" />
                <span>90% Confidence Band</span>
              </span>
            </div>

            <Chart
              data={chart}
              x="date"
              date
              band
              height={320}
              format={format}
              series={[
                { key: 'observed', name: 'Observed' },
                { key: 'projected', name: 'Forecast', dashed: true },
              ]}
            />

            <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-center gap-2.5 text-xs text-slate-300">
              <CircleAlert size={16} className="text-cyan-400 flex-shrink-0" />
              <span>{result.stockout_note}</span>
            </div>
          </Card>

          {/* Model Comparison & Feature Drivers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <SectionTitle
                title="Holdout Model Performance Comparison"
                detail="LightGBM must beat the better baseline by >2% validation MAE to be chosen"
              />
              <Table
                rows={metrics}
                columns={[
                  { key: 'model', title: 'Model' },
                  { key: 'mae', title: 'MAE', format },
                  { key: 'rmse', title: 'RMSE', format },
                  { key: 'wape', title: 'WAPE', format: percent },
                  { key: 'bias', title: 'Forecast Bias', format },
                ]}
              />
            </Card>

            <Card>
              <SectionTitle title="Model Feature Drivers" detail="Global feature importance gain" />
              <Table
                rows={Object.entries(result.drivers).map(([name, value]) => ({ name, value }))}
                columns={[
                  { key: 'name', title: 'Feature Driver' },
                  { key: 'value', title: 'Gain Importance' },
                ]}
              />
              <Source>Sales Transactions · Versioned Artifact Bundle dp-1.0</Source>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

const scenarioTitles: Record<string, string> = {
  price: 'Pricing & Discount Optimization',
  marketing: 'Marketing Budget Reallocation',
  inventory: 'Inventory & Lead-Time Planning',
}

const scenarioForm = z.object({
  objective: z.enum(['profit', 'revenue', 'stockout', 'balanced']),
  horizon: z.enum(['7', '30']),
  subject: z.string().min(1, 'Choose a product or channel.'),
  variants: z.string().max(80),
  assumption: z.string(),
  incoming: z.string(),
  arrival: z.string(),
  safety: z.string(),
})
type FormValues = z.infer<typeof scenarioForm>

function valuesOf(raw: string, min: number, max: number, whole = false) {
  if (!raw.trim()) return []
  const parts = raw.split(',').map((x) => x.trim())
  const values = parts.map(Number)
  if (
    parts.length > 8 ||
    parts.some((x) => !x) ||
    values.some((x) => !Number.isFinite(x) || x < min || x > max || (whole && !Number.isInteger(x)))
  )
    throw new Error(
      'Enter up to eight comma-separated ' + (whole ? 'whole numbers' : 'numbers') + ' between ' + min + ' and ' + max + '.'
    )
  return values
}

export function Simulator({ options }: { options: Options }) {
  const [kind, setKind] = useState('price')
  const [localError, setLocalError] = useState<Error | null>(null)
  const products = kind === 'inventory' ? options.products.filter((p) => p.is_physical) : options.products
  const defaultProduct = (items: Options['products']) =>
    items.find((p) => p.product_name === 'SmartDesk Mini')?.product_id || items[0]?.product_id || ''

  const form = useForm<FormValues>({
    resolver: zodResolver(scenarioForm),
    defaultValues: {
      objective: 'profit',
      horizon: '30',
      subject: defaultProduct(options.products),
      variants: '0, 5, 10',
      assumption: '',
      incoming: '0',
      arrival: '1',
      safety: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: unknown) => request<Scenario>('/simulate', values),
  })

  const setType = (value: string) => {
    setKind(value)
    setLocalError(null)
    mutation.reset()
    form.reset({
      objective: value === 'inventory' ? 'stockout' : 'profit',
      horizon: '30',
      subject:
        value === 'marketing'
          ? options.marketing_channels[0] || ''
          : defaultProduct(value === 'inventory' ? options.products.filter((p) => p.is_physical) : options.products),
      variants: value === 'marketing' ? '-15, 15, 30' : value === 'price' ? '0, 5, 10' : '',
      assumption: '',
      incoming: '0',
      arrival: '1',
      safety: '',
    })
  }

  const run = (formData: FormValues) => {
    try {
      const numeric = (str: string) => Number(str)
      const v = valuesOf(
        formData.variants,
        kind === 'marketing' ? -100 : 0,
        kind === 'price' ? 50 : kind === 'marketing' ? 200 : 1_000_000,
        kind === 'inventory'
      )
      if (!v.length && kind !== 'inventory') throw new Error('Enter at least one alternative.')

      const parameters =
        kind === 'price'
          ? {
              product: formData.subject,
              discounts: v.map((x) => x / 100),
              ...(formData.assumption ? { elasticity: numeric(formData.assumption) } : {}),
            }
          : kind === 'marketing'
          ? {
              channel: formData.subject,
              changes: v.map((x) => x / 100),
              ...(formData.assumption ? { response_exponent: numeric(formData.assumption) } : {}),
            }
          : {
              product: formData.subject,
              order_quantities: v,
              incoming_stock: numeric(formData.incoming),
              arrival_day: numeric(formData.arrival),
              ...(formData.safety ? { safety_stock: numeric(formData.safety) } : {}),
            }

      setLocalError(null)
      mutation.mutate({ type: kind, horizon: numeric(formData.horizon), objective: formData.objective, parameters })
    } catch (error) {
      setLocalError(error instanceof Error ? error : new Error('Check scenario inputs.'))
    }
  }

  const data = mutation.data
  const variants = data ? [data.baseline, ...data.alternatives] : []

  return (
    <>
      <Heading
        eyebrow="SIGNATURE DECISION SIMULATOR"
        title="Scenario Simulator"
        subtitle="Simulate business strategies, understand trade-offs and choose the path that fits your goals before taking action."
      />

      {/* Scenario Type Selection Tabs */}
      <div className="flex flex-wrap gap-2 pt-2">
        {Object.entries(scenarioTitles).map(([key, title]) => (
          <Button
            key={key}
            className={`px-4 py-2 text-xs font-semibold ${
              key === kind ? 'primary' : 'border border-slate-800 bg-slate-900/40 text-slate-300'
            }`}
            disabled={mutation.isPending}
            onClick={() => setType(key)}
          >
            {title}
          </Button>
        ))}
      </div>

      <Card>
        <SectionTitle
          title={scenarioTitles[kind]}
          detail="Adjust parameters to simulate market elasticity and fulfillment bottlenecks"
        />
        <form className="scenario-form grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" onSubmit={form.handleSubmit(run)}>
          <label className="field">
            <span>{kind === 'marketing' ? 'Marketing Channel' : 'Product SKU'}</span>
            <select {...form.register('subject')}>
              {kind === 'marketing'
                ? options.marketing_channels.map((s) => <option key={s}>{s}</option>)
                : products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_name}
                    </option>
                  ))}
            </select>
          </label>

          <label className="field">
            <span>Objective Function</span>
            <select {...form.register('objective')}>
              <option value="profit">Maximize Contribution Profit</option>
              <option value="revenue">Maximize Revenue</option>
              {kind !== 'marketing' && <option value="stockout">Minimize Stockout Risk</option>}
              <option value="balanced">Balance Risk & Return</option>
            </select>
          </label>

          <label className="field">
            <span>Horizon</span>
            <select {...form.register('horizon')}>
              <option value="7">7 Days</option>
              <option value="30">30 Days</option>
            </select>
          </label>

          <label className="field">
            <span>
              {kind === 'price'
                ? 'Discount Rates (%)'
                : kind === 'marketing'
                ? 'Budget Changes (%)'
                : 'Reorder Quantities (Units)'}
            </span>
            <input
              {...form.register('variants')}
              placeholder={kind === 'inventory' ? 'Auto-select if blank' : 'Comma-separated e.g. 0, 5, 10'}
            />
          </label>

          {kind === 'inventory' ? (
            <>
              <label className="field">
                <span>Confirmed Incoming Units</span>
                <input type="number" min="0" {...form.register('incoming')} />
              </label>
              <label className="field">
                <span>Confirmed Arrival Day</span>
                <input type="number" min="1" max="90" {...form.register('arrival')} />
              </label>
              <label className="field">
                <span>Safety Stock Threshold</span>
                <input type="number" min="0" {...form.register('safety')} />
              </label>
            </>
          ) : (
            <label className="field">
              <span>{kind === 'price' ? 'Price Elasticity (Optional)' : 'Diminishing Returns Exponent'}</span>
              <input
                type="number"
                step="0.01"
                min={kind === 'price' ? -5 : 0.2}
                max={kind === 'price' ? 0 : 0.95}
                {...form.register('assumption')}
                placeholder="Default from catalog"
              />
            </label>
          )}

          <div className="sm:col-span-2 md:col-span-4 flex justify-end pt-2">
            <Button type="submit" className="primary px-6 py-2.5 text-xs flex items-center gap-2" disabled={mutation.isPending}>
              <span>Run Scenario Simulation</span>
              <ArrowRight size={15} />
            </Button>
          </div>
        </form>
      </Card>

      <ErrorState error={localError || mutation.error} />
      {mutation.isPending && <Loading />}

      {data && (
        <div className="space-y-6">
          {/* 3D Scenario Landscape (Signature Interactive Experience) */}
          <Scenario3DLandscape
            variants={variants}
            recommendedName={String(data.recommended.name)}
            metricKey="profit"
          />

          {/* Outcome Comparison Matrix */}
          <Card>
            <SectionTitle
              title="Simulation Outcome Comparison Matrix"
              detail={'Recommended variant: ' + String(data.recommended.name) + ' for objective: ' + label(data.objective)}
              aside={<Pill tone="success">Validated Optimization</Pill>}
            />

            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 flex items-start gap-3 text-xs mb-4">
              <Check size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-white block font-bold text-sm">
                  Recommended: {String(data.recommended.name)}
                </strong>
                <p className="text-slate-300 mt-0.5">
                  Projected contribution profit difference vs baseline:{' '}
                  <strong className="text-emerald-400 font-mono">{money(Number(data.recommended.profit_delta))}</strong>.
                </p>
              </div>
            </div>

            <Table
              rows={variants}
              columns={[
                { key: 'name', title: 'Scenario Variant' },
                { key: 'demand', title: 'Simulated Demand', format: decimal },
                { key: 'fulfilled', title: 'Fulfillment Capacity', format: decimal },
                { key: 'revenue', title: 'Projected Revenue', format: moneyCompact },
                { key: 'profit', title: 'Contribution Profit', format: moneyCompact },
                { key: 'margin', title: 'Gross Margin', format: percent },
                { key: 'risk', title: 'Unfulfilled Stockout Units', format: integer },
              ]}
            />
          </Card>

          {/* Sensitivity Analysis & Explicit Assumptions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <SectionTitle title="Sensitivity Analysis" detail="Outcomes tested under alternate elasticity paths" />
              <div className="space-y-3">
                {data.sensitivity.map((group, i) => (
                  <details key={i} className="text-xs text-slate-300">
                    <summary className="cursor-pointer font-semibold text-indigo-300 hover:text-indigo-200 py-1">
                      {group.name}
                    </summary>
                    <Table
                      rows={group.alternatives.map((item) => ({
                        case: String(item.elasticity ?? item.exponent ?? item.demand_path),
                        ...item.result,
                      }))}
                      columns={[
                        { key: 'case', title: 'Assumed Value' },
                        { key: 'profit', title: 'Profit', format: moneyCompact },
                        { key: 'revenue', title: 'Revenue', format: moneyCompact },
                        { key: 'risk', title: 'Unfulfilled Risk', format: integer },
                      ]}
                    />
                  </details>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle title="Explicit Model Assumptions & Evidence" detail="Mathematical boundaries" />
              <ul className="space-y-2 text-xs text-slate-300 list-disc list-inside">
                {data.assumptions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
              <Source>Microeconomic Elasticity Formulation · Lead-Time Capping</Source>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

export function Recommendations() {
  const client = useQueryClient()
  const data = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => request<{ rows: Recommendation[]; dataset_id: string }>('/recommendations'),
  })

  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => request<{ rows: Audit[] }>('/audit?kind=recommendation_feedback'),
  })

  const feedback = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      request('/recommendations/feedback', {
        recommendation_id: id,
        decision,
        dataset_id: data.data?.dataset_id,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recommendations'] })
      void client.invalidateQueries({ queryKey: ['audit'] })
    },
  })

  return (
    <>
      <Heading
        eyebrow="HUMAN-IN-THE-LOOP DECISION INTELLIGENCE"
        title="Recommendations & Decision Audit"
        subtitle="Review prioritized business actions backed by statistical evidence. Record executive decisions with immutable audit trails."
      />

      <ErrorState error={data.error || feedback.error} retry={data.error ? () => void data.refetch() : undefined} />
      {data.isLoading && <Loading />}
      {data.data?.rows.length === 0 && <Empty text="No active recommendations for the current snapshot." />}

      <div className="space-y-4">
        {data.data?.rows.map((row) => (
          <Card key={row.id} className="space-y-3">
            <SectionTitle
              title={row.title}
              detail={row.context}
              aside={
                <div className="flex items-center gap-2">
                  <Pill tone={row.priority}>{row.priority.toUpperCase()}</Pill>
                  <Pill tone={row.decision === 'accepted' ? 'success' : 'muted'}>
                    STATUS: {row.decision.toUpperCase()}
                  </Pill>
                </div>
              }
            />

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <strong className="text-white block font-semibold mb-1">Proposed Action:</strong>
              <p className="text-slate-300 leading-relaxed">{row.action}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {row.expected_impact ? (
                Object.entries(row.expected_impact).map(([k, val]) => (
                  <div key={k} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">{label(k)}</span>
                    <strong className="text-sm font-mono text-white">
                      {k.endsWith('vnd') || k === 'purchase_commitment' ? moneyCompact(val) : decimal(val)}
                    </strong>
                  </div>
                ))
              ) : (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase">Estimated Impact</span>
                  <strong className="text-xs text-amber-400">Insufficient evidence</strong>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400">{row.uncertainty}</p>

            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer font-semibold text-indigo-300 hover:text-indigo-200">
                Review Assumptions, Risks and Supporting Evidence
              </summary>
              <div className="mt-2 space-y-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <strong className="text-slate-200">Business Risk:</strong> {row.risk}
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  {row.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </details>

            {/* Human Decision Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <Button
                className="primary px-4 py-2 text-xs flex items-center gap-2"
                disabled={feedback.isPending || row.decision === 'accepted'}
                onClick={() => feedback.mutate({ id: row.id, decision: 'accepted' })}
              >
                <Check size={16} />
                <span>Accept Recommendation</span>
              </Button>

              <Button
                className="px-4 py-2 text-xs flex items-center gap-2 border border-slate-700 bg-slate-900/60 hover:bg-rose-950/40 hover:border-rose-500/40 text-rose-300"
                disabled={feedback.isPending || row.decision === 'rejected'}
                onClick={() => feedback.mutate({ id: row.id, decision: 'rejected' })}
              >
                <X size={16} />
                <span>Reject</span>
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Decision Audit Trail Card */}
      <Card>
        <SectionTitle
          title="Decision Audit Trail"
          detail="Append-only record of executive human decisions. Times in Asia/Ho_Chi_Minh (UTC+7)"
          aside={<Database size={18} className="text-cyan-400" />}
        />
        <ErrorState error={audit.error} />
        {audit.isLoading && <Loading />}
        {audit.data && (
          <Table
            rows={audit.data.rows.map((r) => ({
              time: new Date(r.occurred_at).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }),
              subject: r.subject,
              decision: r.payload.decision,
            }))}
            columns={[
              { key: 'time', title: 'Timestamp' },
              { key: 'subject', title: 'Recommendation ID' },
              { key: 'decision', title: 'Recorded Human Decision' },
            ]}
          />
        )}
      </Card>
    </>
  )
}
