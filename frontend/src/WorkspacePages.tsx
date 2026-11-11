import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  History,
  MessageSquareText,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ModelQuality } from './components/ModelQuality'
import { investigateHref } from './investigate'
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
  type Session,
  currencySymbol,
  dateLabel,
  decimal,
  getActiveCompanyId,
  getActiveCurrency,
  integer,
  label,
  money,
  moneyCompact,
  params,
  percent,
  request,
} from './api'
import { alertName } from './Dashboard'
import {
  Button,
  Card,
  Chart,
  ChartCard,
  ConfirmDialog,
  Empty,
  ErrorState,
  FilterBar,
  KPIStatCard,
  Loading,
  PageHeader,
  Pill,
  SectionHeader,
  Select,
  Source,
  StatusBadge,
  Table,
  useToast,
} from './ui'
import { Scenario3DLandscape } from './components/Scenario3DLandscape'
import { useT } from './preferences'
export { ScenarioSimulator3D } from './features/scenario-simulator/components/ScenarioSimulator3D'

function buildSuggestedPrompts(dataset: Dataset, options: Options | undefined, isVi: boolean): string[] {
  const caps = dataset.capabilities || {}
  const firstProduct =
    options?.products?.find((p) => p.product_name === 'SmartDesk Mini')?.product_name ||
    options?.products?.[0]?.product_name
  const topRegions = (options?.regions || []).slice(0, 2)
  const regionClauseEN =
    topRegions.length >= 2
      ? `Compare revenue performance between ${topRegions[0]} and ${topRegions[1]}.`
      : 'Compare revenue performance across regions.'
  const regionClauseVI =
    topRegions.length >= 2
      ? `So sánh doanh thu giữa ${topRegions[0]} và ${topRegions[1]}`
      : 'So sánh doanh thu giữa các khu vực'

  if (isVi) {
    return [
      'Tình hình kinh doanh gần đây thế nào?',
      'Tại sao doanh thu kỳ gần nhất có biến động?',
      caps.has_cost_or_profit !== false
        ? 'Sản phẩm nào mang lại lợi nhuận cao nhất?'
        : 'Sản phẩm nào có doanh thu cao nhất?',
      caps.has_marketing !== false
        ? 'Kênh marketing nào có ROAS thấp nhất?'
        : 'Phân bổ doanh thu theo kênh bán hàng',
      firstProduct
        ? `Dự báo nhu cầu ${firstProduct} trong 30 ngày tới`
        : 'Dự báo doanh thu trong 30 ngày tới',
      regionClauseVI,
    ]
  }

  return [
    'How is our business performing overall?',
    'Why did revenue change recently?',
    caps.has_cost_or_profit !== false
      ? 'Which product generated the highest profit?'
      : 'Which product generated the highest revenue?',
    caps.has_marketing !== false
      ? 'Which marketing channel had the lowest ROAS?'
      : 'Break down revenue across sales channels.',
    firstProduct
      ? `Forecast demand for ${firstProduct} for the next 30 days.`
      : 'Forecast total revenue for the next 30 days.',
    regionClauseEN,
  ]
}

function Contribution({
  rows,
  interpretation,
  metric,
}: {
  rows: Record<string, Row[]>
  interpretation?: string
  metric?: string
}) {
  const keys = Object.keys(rows)
  const [dimension, setDimension] = useState(keys[0] || 'product')
  const activeKey = rows[dimension] ? dimension : keys[0] || 'product'
  const activeRows = (rows[activeKey] || []).slice(0, 8)
  const format = metric === 'units' ? decimal : moneyCompact

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="w-full sm:max-w-xs">
          <Select
            label="Breakdown Dimension"
            value={activeKey}
            onChange={setDimension}
            options={keys.map<[string, string]>((key) => [key, label(key)])}
          />
        </div>
        <StatusBadge tone="accent">Waterfall Variance Decomposition</StatusBadge>
      </div>

      {activeRows.length > 0 && (
        <div
          className="rounded-xl border p-3.5"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
            Variance Contribution by {label(activeKey)}
          </div>
          <Chart
            data={activeRows}
            x="name"
            horizontal
            height={Math.max(170, activeRows.length * 32)}
            format={format}
            series={[{ key: 'delta', name: 'Absolute Delta', kind: 'bar', color: '#2563EB' }]}
          />
        </div>
      )}

      <Table
        rows={activeRows}
        columns={[
          { key: 'name', title: 'Group / Dimension' },
          { key: 'actual', title: 'Current Period', format, align: 'right' },
          { key: 'baseline', title: 'Previous Period', format, align: 'right' },
          { key: 'delta', title: 'Absolute Delta', format, align: 'right' },
          { key: 'share_of_net_change', title: 'Share of Net Change', format: percent, align: 'right' },
        ]}
      />
      <p className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>
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
  options,
  messages,
  setMessages,
}: {
  dataset: Dataset
  options?: Options
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const { t, language } = useT()
  const isVi = language === 'vi'
  const prompts = useMemo(() => buildSuggestedPrompts(dataset, options, isVi), [dataset, options, isVi])

  const form = useForm<z.infer<typeof askForm>>({
    resolver: zodResolver(askForm),
    defaultValues: { question: '' },
  })

  const [thinkingStep, setThinkingStep] = useState<string | null>(null)

  const query = useMutation({
    mutationFn: async (question: string) => {
      setThinkingStep(isVi ? 'Đang phân tích ý định câu hỏi…' : 'Parsing natural language intent…')
      const t1 = window.setTimeout(
        () => setThinkingStep(isVi ? 'Truy vấn các bảng dữ liệu đã kiểm thực…' : 'Querying verified business tables…'),
        400
      )
      const t2 = window.setTimeout(
        () => setThinkingStep(isVi ? 'Tổng hợp bằng chứng và biểu đồ phân tích…' : 'Synthesizing evidence and chart artifacts…'),
        800
      )
      try {
        return await request<QueryResult>('/query', { question })
      } finally {
        window.clearTimeout(t1)
        window.clearTimeout(t2)
        setThinkingStep(null)
      }
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

  const [search, setSearch] = useSearchParams()
  const autoSent = useRef(false)
  useEffect(() => {
    const q = search.get('q')
    if (q && !autoSent.current) {
      autoSent.current = true
      setSearch({}, { replace: true })
      send(q)
    }
  }, [])

  const recentQuestions = useMemo(() => {
    const seen = new Set<string>()
    return messages
      .map((m) => m.question)
      .reverse()
      .filter((q) => {
        if (seen.has(q)) return false
        seen.add(q)
        return true
      })
      .slice(0, 5)
  }, [messages])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isVi ? 'TRỢ LÝ PHÂN TÍCH KINH DOANH' : 'CONVERSATIONAL BUSINESS INTELLIGENCE'}
        title="Ask Business Data"
        subtitle={
          isVi
            ? 'Đặt câu hỏi phân tích kinh doanh bằng ngôn ngữ tự nhiên; kiểm tra công cụ truy vấn, công thức, giới hạn dữ liệu và căn cứ thực chứng.'
            : 'Ask complex business questions in natural language. Inspect executed analytics tools, formulas, data bounds and evidence.'
        }
        aside={
          <StatusBadge tone="accent">
            <ShieldCheck size={12} />
            <span>{isVi ? 'Truy vấn SQL Kiểm thực · Không ảo giác' : 'Verified Deterministic Analytics'}</span>
          </StatusBadge>
        }
      />

      {/* Analytical Copilot Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Main BI Workspace */}
        <div className="lg:col-span-8 space-y-5">
          {/* Prominent Query Composer Card */}
          <Card>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                <MessageSquareText size={15} style={{ color: 'var(--primary)' }} />
                <span>{isVi ? 'Đặt câu hỏi cho Trợ lý Phân tích' : 'Ask the Analytical Copilot'}</span>
              </div>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {(isVi ? 'Dữ liệu cập nhật đến ' : 'Snapshot through ') + dateLabel(dataset.end)}
              </span>
            </div>

            <form
              className="flex flex-col sm:flex-row gap-2.5"
              onSubmit={form.handleSubmit(({ question }) => send(question))}
            >
              <input
                aria-label={isVi ? 'Câu hỏi kinh doanh' : 'Business question'}
                placeholder={
                  isVi
                    ? 'Hỏi về doanh thu, biên lợi nhuận SKU, hiệu quả ROAS hoặc dự báo nhu cầu…'
                    : 'Ask about revenue, SKU margins, marketing ROAS, or demand forecasts…'
                }
                maxLength={500}
                className="dp-input flex-1 h-10"
                {...form.register('question')}
              />
              <Button variant="primary" type="submit" disabled={query.isPending} className="h-10 px-5">
                <Send size={14} />
                <span>{isVi ? 'Gửi' : 'Send'}</span>
              </Button>
            </form>
            {form.formState.errors.question && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--danger-text)' }}>
                {form.formState.errors.question.message}
              </p>
            )}
          </Card>

          {/* Analytical Stream / Structured Report Cards */}
          <Card className="min-h-[420px] flex flex-col">
            <SectionHeader
              title={isVi ? 'Báo cáo & Phiên Phân tích' : 'Analysis Conversation'}
              detail={
                isVi
                  ? 'Câu trả lời có căn cứ từ dữ liệu thực, kèm biểu đồ và nhật ký kiểm tra công thức'
                  : 'Grounded responses sourced directly from verified database queries and trained models'
              }
            />

            {!messages.length && !query.isPending && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 space-y-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl border"
                  style={{
                    background: 'var(--primary-soft)',
                    borderColor: 'var(--primary-border)',
                    color: 'var(--primary)',
                  }}
                >
                  <MessageSquareText size={22} />
                </div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--heading)' }}>
                  {isVi ? 'Bạn muốn tìm hiểu điều gì?' : 'What would you like to understand?'}
                </h3>
                <p className="text-xs max-w-md leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {isVi
                    ? 'Hỏi về xu hướng doanh thu, áp lực biên lợi nhuận, hiệu quả sản phẩm, ROAS tiếp thị hoặc chạy dự báo 30 ngày.'
                    : 'Ask about revenue trends, margin pressure, product popularity, marketing ROAS or run a 30-day forecast.'}
                </p>
              </div>
            )}

            <div className="space-y-6" aria-live="polite">
              {messages.map(({ question, result, error }, i) => (
                <div
                  key={i}
                  className="space-y-4 pb-6 border-b last:border-b-0 last:pb-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {/* Prompt Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="rounded-lg border px-3.5 py-2 text-xs font-semibold"
                      style={{
                        background: 'var(--primary-soft)',
                        borderColor: 'var(--primary-border)',
                        color: 'var(--primary-text)',
                      }}
                    >
                      {question}
                    </div>
                    {result && (
                      <StatusBadge tone="muted">
                        {isVi ? 'Công cụ:' : 'Tool:'} {result.trace.tool}
                      </StatusBadge>
                    )}
                  </div>

                  {error && <ErrorState error={new Error(error)} />}

                  {/* Structured Analytical Report */}
                  {result && (
                    <div
                      className="rounded-xl border p-4 sm:p-5 space-y-4"
                      style={{
                        background: 'var(--surface-muted)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      {/* Executive Summary Section */}
                      <div>
                        <div
                          className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {isVi ? 'Tóm tắt điều hành' : 'Executive Summary'}
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--heading)' }}>
                          {result.answer}
                        </p>
                      </div>

                      {/* Key Chart Findings */}
                      {result.chart && (
                        <div
                          className="rounded-xl border p-4"
                          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                        >
                          <div
                            className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {isVi ? 'Biểu đồ trực quan' : 'Key Findings Visualization'}
                          </div>
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
                                color: '#2563EB',
                              },
                            ]}
                          />
                        </div>
                      )}

                      {/* Supporting Breakdown */}
                      {result.evidence.contributions && (
                        <div
                          className="rounded-xl border p-4"
                          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                        >
                          <Contribution rows={result.evidence.contributions} />
                        </div>
                      )}

                      {/* Contextual Recommended Next Steps */}
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {isVi ? 'Bước tiếp theo đề xuất:' : 'Recommended next steps:'}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to="/scenarios"
                            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-medium hover:bg-[var(--surface)] transition-colors"
                            style={{ borderColor: 'var(--border-strong)', color: 'var(--heading)' }}
                          >
                            <SlidersHorizontal size={12} />
                            <span>{t('Simulate Scenarios')}</span>
                          </Link>
                          <Link
                            to="/recommendations"
                            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-medium hover:bg-[var(--surface)] transition-colors"
                            style={{ borderColor: 'var(--border-strong)', color: 'var(--primary-text)' }}
                          >
                            <span>{t('Recommendations')}</span>
                            <ArrowRight size={12} />
                          </Link>
                        </div>
                      </div>

                      {/* Grounded Trace & Calculation Provenance */}
                      <details
                        className="rounded-lg border p-3 text-xs"
                        style={{
                          background: 'var(--surface)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <summary
                          className="cursor-pointer font-semibold select-none"
                          style={{ color: 'var(--primary-text)' }}
                        >
                          {isVi
                            ? 'Xem Nguồn dữ liệu, Phạm vi & Công thức thực thi'
                            : 'View Sources, Data Bounds & Executed Formulas'}
                        </summary>
                        <div
                          className="mt-2.5 pt-2.5 border-t space-y-1.5 text-[11px] font-mono"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <div>
                            <strong style={{ color: 'var(--heading)' }}>
                              {isVi ? 'Nguồn dữ liệu:' : 'Data Sources:'}
                            </strong>{' '}
                            {result.trace.sources?.join(' · ') ||
                              (isVi ? 'Phân tích Đã kiểm thực' : 'Verified Analytics')}
                          </div>
                          {result.trace.range && (
                            <div>
                              <strong style={{ color: 'var(--heading)' }}>
                                {isVi ? 'Khoảng thời gian:' : 'Range:'}
                              </strong>{' '}
                              {result.trace.range.join(' to ')}
                            </div>
                          )}
                          {Object.values(result.trace.formulas).map((formula, idx) => (
                            <div key={idx} style={{ color: 'var(--primary-text)' }}>
                              <strong>{isVi ? 'Công thức:' : 'Formula:'}</strong> {formula}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              ))}

              {query.isPending && (
                <div
                  className="flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium"
                  style={{
                    background: 'var(--primary-soft)',
                    borderColor: 'var(--primary-border)',
                    color: 'var(--primary-text)',
                  }}
                >
                  <Activity size={15} className="animate-spin" />
                  <span>
                    {thinkingStep ||
                      (isVi ? 'Đang phân tích chuỗi dữ liệu kinh doanh…' : 'Analyzing business intelligence streams…')}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Panel: Suggested & Recent Queries */}
        <div className="lg:col-span-4 space-y-5">
          <Card>
            <SectionHeader
              title={isVi ? 'Câu hỏi Gợi ý' : 'Suggested Queries'}
              detail={isVi ? 'Dựa trên tập dữ liệu đang kích hoạt' : 'Grounded in active workspace dataset'}
              aside={<Zap size={15} style={{ color: 'var(--primary)' }} />}
            />
            <div className="space-y-2">
              {prompts.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => send(text)}
                  disabled={query.isPending}
                  className="w-full text-left rounded-lg border px-3 py-2.5 text-xs transition-colors flex items-center justify-between gap-2 hover:bg-[var(--surface-muted)]"
                  style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  <span className="font-medium leading-snug">{text}</span>
                  <ChevronRight size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}
            </div>
            <Source>
              {isVi
                ? 'Phân tích Xác định · Công cụ Kiểm thực CSDL'
                : 'Deterministic Analytics · Fixed Read-Only Tools'}
            </Source>
          </Card>

          {recentQuestions.length > 0 && (
            <Card>
              <SectionHeader
                title={isVi ? 'Truy vấn gần đây' : 'Recent Session Queries'}
                aside={<History size={15} style={{ color: 'var(--text-secondary)' }} />}
              />
              <div className="space-y-1.5">
                {recentQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={query.isPending}
                    className="w-full text-left rounded-lg px-2.5 py-2 text-xs truncate hover:bg-[var(--surface-muted)] transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    title={q}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
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
  const { t } = useT()
  const [severity, setSeverity] = useState('')
  const [window, setWindow] = useState({
    start: [dataset.end.slice(0, 7) + '-01', dataset.start].sort()[1],
    end: dataset.end,
  })
  const [search, setSearch] = useSearchParams()
  const alertId = search.get('alert')
  const range = params(window)

  const list = useQuery({
    queryKey: ['alerts', dataset.dataset_id, range, severity],
    queryFn: () => request<{ rows: Alert[] }>('/anomalies?' + params({ ...window, severity })),
  })

  const detail = useQuery({
    queryKey: ['alert', dataset.dataset_id, alertId, range],
    queryFn: () => request<Alert>('/anomalies/' + encodeURIComponent(alertId || '') + '?' + range),
    enabled: !!alertId,
  })

  const selected = detail.data
  const allAlerts = list.data?.rows || []
  const criticalCount = allAlerts.filter((a) => a.severity === 'critical').length
  const highCount = allAlerts.filter((a) => a.severity === 'high').length
  const mediumCount = allAlerts.filter((a) => a.severity === 'medium').length

  const timelineRows = useMemo(
    () =>
      allAlerts.map((a) => ({
        date: a.end,
        label: alertName[a.metric] || label(a.metric),
        score: a.score,
      })),
    [allAlerts]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="RISK RADAR & ANOMALY DETECTION"
        title="Anomaly Center"
        subtitle="Monitor sudden revenue contractions, ad spend spikes, margin pressure and stockout risks detected via Hybrid Isolation Forest & Rolling Z-Scores."
      />

      {/* Severity Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIStatCard title="Total Detected Anomalies" value={integer(allAlerts.length)} icon={<Activity size={16} />} />
        <Card className="p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('Critical Alerts')}
            </span>
            <StatusBadge tone="critical">CRITICAL</StatusBadge>
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--danger-text)' }}>
            {criticalCount}
          </div>
        </Card>
        <Card className="p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('High Priority Alerts')}
            </span>
            <StatusBadge tone="high">HIGH</StatusBadge>
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--orange-text)' }}>
            {highCount}
          </div>
        </Card>
        <Card className="p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('Medium Priority Alerts')}
            </span>
            <StatusBadge tone="medium">MEDIUM</StatusBadge>
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--warning-text)' }}>
            {mediumCount}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <FilterBar>
        <label className="dp-field">
          <span className="dp-field-label">{t('From')}</span>
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
        <label className="dp-field">
          <span className="dp-field-label">{t('To')}</span>
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
      </FilterBar>

      {/* Anomaly Timeline + Detection Table */}
      {timelineRows.length > 0 && (
        <ChartCard
          title="Anomaly Severity Timeline"
          detail="Chronological risk score (0–100) across detected operational shifts"
          data={timelineRows}
          x="date"
          date
          height={200}
          series={[{ key: 'score', name: 'Severity Score', kind: 'bar', color: '#DC2626' }]}
          format={integer}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Ranked Detection Queue & Table */}
        <Card className="lg:col-span-5">
          <SectionHeader
            title="Ranked Anomalies"
            detail="Sorted by severity & deviation"
            aside={<Bell size={16} style={{ color: 'var(--danger)' }} />}
          />
          <ErrorState error={list.error} retry={() => void list.refetch()} />
          {list.isLoading && <Loading />}
          {allAlerts.length === 0 && !list.isLoading && <Empty text="No alerts match the selected filters." />}
          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {allAlerts.map((row) => {
              const isSelected = row.id === alertId
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSearch({ alert: row.id })}
                  style={{
                    background: isSelected ? 'var(--primary-soft)' : 'var(--surface)',
                    borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                  }}
                  className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-[var(--surface-muted)] flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <strong className="block font-semibold truncate" style={{ color: 'var(--heading)' }}>
                      {t(alertName[row.metric] || label(row.metric))}
                    </strong>
                    <span className="text-[11px] block truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {row.scope} · {dateLabel(row.end)} · {alertFormat(row.metric)(row.actual)} vs{' '}
                      {alertFormat(row.metric)(row.baseline)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge tone={row.severity}>{row.severity}</StatusBadge>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Root Cause & Evidence Detail Panel */}
        <Card className="lg:col-span-7">
          <ErrorState error={detail.error} retry={() => void detail.refetch()} />
          {detail.isLoading && <Loading />}
          {!alertId && (
            <Empty text="Select an anomaly card from the left panel to inspect root causes and charts." />
          )}

          {selected && (
            <div className="space-y-5">
              <SectionHeader
                title={alertName[selected.metric] || label(selected.metric)}
                detail={`${selected.scope} · ${dateLabel(selected.start)} – ${dateLabel(selected.end)}`}
                aside={
                  <StatusBadge tone={selected.severity}>
                    {selected.severity.toUpperCase()} · SCORE {selected.score}/100
                  </StatusBadge>
                }
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  className="rounded-lg border p-3 text-xs"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                >
                  <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Observed Value
                  </span>
                  <strong className="text-base font-bold tabular-nums" style={{ color: 'var(--danger-text)' }}>
                    {alertFormat(selected.metric)(selected.actual)}
                  </strong>
                </div>
                <div
                  className="rounded-lg border p-3 text-xs"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                >
                  <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Historical Baseline
                  </span>
                  <strong className="text-base font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                    {alertFormat(selected.metric)(selected.baseline)}
                  </strong>
                </div>
                <div
                  className="rounded-lg border p-3 text-xs"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                >
                  <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Deviation Rate
                  </span>
                  <strong className="text-base font-bold tabular-nums" style={{ color: 'var(--warning-text)' }}>
                    {percent(selected.deviation)}
                  </strong>
                </div>
              </div>

              <div
                className="rounded-xl border p-3.5"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <Chart
                  data={selected.chart}
                  x="date"
                  date
                  height={240}
                  format={alertFormat(selected.metric)}
                  series={[
                    {
                      key: 'actual',
                      name: 'Observed',
                      kind: selected.chart.length === 1 ? 'bar' : 'line',
                      color: '#2563EB',
                    },
                    {
                      key: 'baseline',
                      name: 'Baseline',
                      kind: selected.chart.length === 1 ? 'bar' : 'line',
                      dashed: true,
                      color: '#64748B',
                    },
                  ]}
                />
              </div>

              <div
                className="rounded-xl border p-4 flex items-start gap-3 text-xs"
                style={{
                  background: 'var(--primary-soft)',
                  borderColor: 'var(--primary-border)',
                }}
              >
                <CircleAlert size={17} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
                <div>
                  <strong className="block font-semibold mb-1" style={{ color: 'var(--heading)' }}>
                    Recommended Action:
                  </strong>
                  <p className="leading-relaxed" style={{ color: 'var(--text)' }}>
                    {selected.action}
                  </p>
                  <Link
                    to={investigateHref(selected.metric)}
                    className="inline-flex items-center gap-1.5 mt-2.5 font-semibold hover:underline"
                    style={{ color: 'var(--primary-text)' }}
                  >
                    <span>Investigate with AI Copilot</span>
                    <ArrowRight size={13} />
                  </Link>
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

      {/* All Anomalies Structured Table */}
      {allAlerts.length > 0 && (
        <Card>
          <SectionHeader title="Anomaly Detection Log" detail="Full tabular breakdown of flagged deviations" />
          <Table
            rows={allAlerts.map((a) => ({
              id: a.id,
              date: dateLabel(a.end),
              metricLabel: alertName[a.metric] || label(a.metric),
              scope: a.scope,
              actualFormatted: alertFormat(a.metric)(a.actual),
              baselineFormatted: alertFormat(a.metric)(a.baseline),
              deviation: a.deviation,
              severity: a.severity,
              score: a.score,
            }))}
            pageSize={8}
            columns={[
              { key: 'date', title: 'Date' },
              { key: 'metricLabel', title: 'Metric' },
              { key: 'scope', title: 'Scope' },
              { key: 'actualFormatted', title: 'Observed', align: 'right' },
              { key: 'baselineFormatted', title: 'Expected', align: 'right' },
              { key: 'deviation', title: 'Deviation', format: percent, align: 'right' },
              {
                key: 'severity',
                title: 'Severity',
                render: (r) => <StatusBadge tone={String(r.severity)}>{String(r.severity).toUpperCase()}</StatusBadge>,
              },
              {
                key: 'action',
                title: 'Inspect',
                sortable: false,
                render: (r) => (
                  <Button size="sm" onClick={() => setSearch({ alert: String(r.id) })}>
                    Inspect
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      <ModelQuality datasetId={dataset.dataset_id} />
    </div>
  )
}

export function ForecastPage({ dataset, options }: { dataset?: Dataset; options: Options }) {
  const [target, setTarget] = useState('revenue')
  const [scope, setScope] = useState('')
  const [horizon, setHorizon] = useState('30')
  const currencyCode = dataset?.currency || getActiveCurrency()
  const currencySym = currencySymbol(currencyCode)

  const mutation = useMutation({
    mutationFn: (values: unknown) => request<Forecast>('/forecast', values),
  })

  useEffect(() => {
    if (!scope) return
    const valid =
      scope.startsWith('p:')
        ? options.products.some((p) => p.product_id === scope.slice(2))
        : scope.startsWith('c:')
          ? options.categories.includes(scope.slice(2))
          : false
    if (!valid) setScope('')
  }, [options, scope])

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

  // Auto-generate initial baseline projection on load
  const initialized = useRef(false)
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      run()
    }
  }, [])

  const result = mutation.data
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
  const driverRows = result
    ? Object.entries(result.drivers)
        .map(([name, value]) => ({ name, value: Number(value) || 0 }))
        .sort((a, b) => b.value - a.value)
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="PREDICTIVE INTELLIGENCE"
        title="Forecast Center"
        subtitle="Compare baseline and LightGBM forecasts using historical holdout errors and empirical prediction intervals."
      />

      <FilterBar>
        <Select
          label="Target Metric"
          value={target}
          onChange={(value) => {
            setTarget(value)
            mutation.reset()
          }}
          options={[
            ['revenue', `Revenue (${currencySym} ${currencyCode})`],
            ['orders', 'Order Volume'],
            ['demand', 'Demand Units'],
          ]}
        />
        <Select
          label="Scope"
          value={scope}
          onChange={(value) => {
            setScope(value)
            mutation.reset()
          }}
          options={[
            ['', 'Entire Business'],
            ...options.categories.map<[string, string]>((c) => ['c:' + c, 'Category · ' + c]),
            ...options.products.map<[string, string]>((p) => ['p:' + p.product_id, p.product_name]),
          ]}
        />
        <Select
          label="Forecast Horizon"
          value={horizon}
          onChange={(value) => {
            setHorizon(value)
            mutation.reset()
          }}
          options={[
            ['7', '7 Days Forward'],
            ['30', '30 Days Forward'],
          ]}
        />
        <Button variant="primary" onClick={run} disabled={mutation.isPending}>
          <span>Run Forecast</span>
          <ArrowRight size={14} />
        </Button>
      </FilterBar>

      <ErrorState error={mutation.error} />
      {mutation.isPending && <Loading />}

      {!result && !mutation.isPending && !mutation.error && (
        <Card>
          <Empty text="Configure the forecast parameters above and click Run Forecast to generate projections." />
        </Card>
      )}

      {result && (
        <div className="space-y-6">
          {/* Forecast KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPIStatCard
              title="Cumulative Forecast Total"
              value={format(result.total)}
              icon={<TrendingUp size={16} />}
            />
            <KPIStatCard
              title="Forecast Horizon"
              value={`${result.horizon} Days`}
              subtitle={result.scope}
            />
            <KPIStatCard
              title="Selected Model Test WAPE"
              value={percent(result.metrics.test[result.metrics.selected]?.wape)}
              subtitle={`Model: ${result.metrics.selected === 'lightgbm' ? 'LightGBM 4.6.0' : label(result.metrics.selected)}`}
            />
            <Card className="p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Test Set Interval Coverage
                </span>
                <StatusBadge tone={result.metrics.test_coverage < 0.9 ? 'warning' : 'success'}>
                  Nominal 90%
                </StatusBadge>
              </div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{
                  color: result.metrics.test_coverage < 0.9 ? 'var(--warning-text)' : 'var(--success-text)',
                }}
              >
                {percent(result.metrics.test_coverage)}
              </div>
            </Card>
          </div>

          <Card>
            <SectionHeader
              title={`${label(result.target)} Multi-Day Projection`}
              detail={`${result.horizon} Days Horizon · ${result.scope} · Artifact: ${result.model_version}`}
              aside={
                <StatusBadge tone="accent">
                  Selected Model: {result.metrics.selected === 'lightgbm' ? 'LightGBM 4.6.0' : label(result.metrics.selected)}
                </StatusBadge>
              }
            />

            <div className="flex flex-wrap items-center gap-5 text-xs pb-2" style={{ color: 'var(--text-secondary)' }}>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm inline-block bg-[#2563EB]" />
                <span>Historical Observations</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-4 inline-block border-t-2 border-dashed border-[#D97706]" />
                <span>Predicted Mean</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm inline-block bg-[#2563EB]/20 border border-[#2563EB]/40" />
                <span>90% nominal daily prediction band · verify observed coverage above</span>
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
                { key: 'observed', name: 'Observed', color: '#2563EB' },
                { key: 'projected', name: 'Forecast', dashed: true, color: '#D97706' },
              ]}
            />

            <div
              className="mt-4 rounded-lg border px-3.5 py-2.5 flex items-start gap-2.5 text-xs leading-relaxed"
              style={{
                background: 'var(--info-bg)',
                borderColor: 'var(--info-border)',
                color: 'var(--info-text)',
              }}
            >
              <CircleAlert size={15} className="flex-shrink-0 mt-0.5" />
              <span>{result.stockout_note}</span>
            </div>
          </Card>

          {result.warnings?.length > 0 && (
            <Card>
              <SectionHeader title="Forecast reliability" detail={result.interval_method} />
              <ul
                className="list-disc list-inside text-xs space-y-1.5 leading-relaxed"
                style={{ color: 'var(--warning-text)' }}
              >
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Holdout Comparison & Feature Drivers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <SectionHeader
                title="Holdout Model Performance Comparison"
                detail="LightGBM must beat the better baseline by >2% validation MAE to be chosen"
              />
              <Table
                rows={metrics}
                columns={[
                  { key: 'model', title: 'Model' },
                  { key: 'mae', title: 'MAE', format, align: 'right' },
                  { key: 'rmse', title: 'RMSE', format, align: 'right' },
                  { key: 'wape', title: 'WAPE', format: percent, align: 'right' },
                  { key: 'bias', title: 'Forecast Bias', format, align: 'right' },
                ]}
              />
            </Card>

            <Card>
              <SectionHeader title="Model Feature Drivers" detail="Global feature importance gain" />
              {driverRows.length > 0 && (
                <div className="mb-4">
                  <Chart
                    data={driverRows.slice(0, 8)}
                    x="name"
                    horizontal
                    height={210}
                    series={[{ key: 'value', name: 'Gain Importance', kind: 'bar', color: '#0284C7' }]}
                  />
                </div>
              )}
              <Table
                rows={driverRows}
                pageSize={6}
                columns={[
                  { key: 'name', title: 'Feature Driver' },
                  { key: 'value', title: 'Gain Importance', align: 'right' },
                ]}
              />
              <Source>Sales Transactions · Versioned Artifact Bundle {result.model_version}</Source>
            </Card>
          </div>
        </div>
      )}
    </div>
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
      'Enter up to eight comma-separated ' +
        (whole ? 'whole numbers' : 'numbers') +
        ' between ' +
        min +
        ' and ' +
        max +
        '.'
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="SIGNATURE DECISION SIMULATOR"
        title="Scenario Simulator"
        subtitle="Simulate business strategies, understand trade-offs and choose the path that fits your goals before taking action."
      />

      <div className="flex flex-wrap gap-2">
        {Object.entries(scenarioTitles).map(([key, title]) => (
          <Button
            key={key}
            variant={key === kind ? 'primary' : 'outline'}
            disabled={mutation.isPending}
            onClick={() => setType(key)}
          >
            {title}
          </Button>
        ))}
      </div>

      <Card>
        <SectionHeader
          title={scenarioTitles[kind]}
          detail="Adjust parameters to simulate market elasticity and fulfillment bottlenecks"
        />
        <form className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" onSubmit={form.handleSubmit(run)}>
          <label className="dp-field">
            <span className="dp-field-label">{kind === 'marketing' ? 'Marketing Channel' : 'Product SKU'}</span>
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

          <label className="dp-field">
            <span className="dp-field-label">Objective Function</span>
            <select {...form.register('objective')}>
              <option value="profit">Maximize Contribution Profit</option>
              <option value="revenue">Maximize Revenue</option>
              {kind !== 'marketing' && <option value="stockout">Minimize Stockout Risk</option>}
              <option value="balanced">Balance Risk &amp; Return</option>
            </select>
          </label>

          <label className="dp-field">
            <span className="dp-field-label">Horizon</span>
            <select {...form.register('horizon')}>
              <option value="7">7 Days</option>
              <option value="30">30 Days</option>
            </select>
          </label>

          <label className="dp-field">
            <span className="dp-field-label">
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
              <label className="dp-field">
                <span className="dp-field-label">Confirmed Incoming Units</span>
                <input type="number" min="0" {...form.register('incoming')} />
              </label>
              <label className="dp-field">
                <span className="dp-field-label">Confirmed Arrival Day</span>
                <input type="number" min="1" max="90" {...form.register('arrival')} />
              </label>
              <label className="dp-field">
                <span className="dp-field-label">Safety Stock Threshold</span>
                <input type="number" min="0" {...form.register('safety')} />
              </label>
            </>
          ) : (
            <label className="dp-field">
              <span className="dp-field-label">
                {kind === 'price' ? 'Price Elasticity (Optional)' : 'Diminishing Returns Exponent'}
              </span>
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
            <Button type="submit" variant="primary" disabled={mutation.isPending}>
              <span>Run Scenario Simulation</span>
              <ArrowRight size={14} />
            </Button>
          </div>
        </form>
      </Card>

      <ErrorState error={localError || mutation.error} />
      {mutation.isPending && <Loading />}

      {data && (
        <div className="space-y-6">
          <Scenario3DLandscape
            variants={variants}
            recommendedName={String(data.recommended.name)}
            metricKey="profit"
          />

          <Card>
            <SectionHeader
              title="Simulation Outcome Comparison Matrix"
              detail={`Recommended variant: ${String(data.recommended.name)} for objective: ${label(data.objective)}`}
              aside={<StatusBadge tone="success">Validated Optimization</StatusBadge>}
            />

            <div
              className="rounded-xl border p-4 flex items-start gap-3 text-xs mb-4"
              style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}
            >
              <Check size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
              <div>
                <strong className="block font-semibold text-sm" style={{ color: 'var(--heading)' }}>
                  Recommended: {String(data.recommended.name)}
                </strong>
                <p className="mt-0.5" style={{ color: 'var(--text)' }}>
                  Projected contribution profit difference vs baseline:{' '}
                  <strong className="font-bold tabular-nums" style={{ color: 'var(--success-text)' }}>
                    {money(Number(data.recommended.profit_delta))}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <Table
              rows={variants}
              columns={[
                { key: 'name', title: 'Scenario Variant' },
                { key: 'demand', title: 'Simulated Demand', format: decimal, align: 'right' },
                { key: 'fulfilled', title: 'Fulfillment Capacity', format: decimal, align: 'right' },
                { key: 'revenue', title: 'Projected Revenue', format: moneyCompact, align: 'right' },
                { key: 'profit', title: 'Contribution Profit', format: moneyCompact, align: 'right' },
                { key: 'margin', title: 'Gross Margin', format: percent, align: 'right' },
                { key: 'risk', title: 'Unfulfilled Stockout Units', format: integer, align: 'right' },
              ]}
            />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <SectionHeader title="Sensitivity Analysis" detail="Outcomes tested under alternate elasticity paths" />
              <div className="space-y-3">
                {data.sensitivity.map((group, i) => (
                  <details key={i} className="text-xs" style={{ color: 'var(--text)' }}>
                    <summary className="cursor-pointer font-semibold py-1" style={{ color: 'var(--primary-text)' }}>
                      {group.name}
                    </summary>
                    <Table
                      rows={group.alternatives.map((item) => ({
                        case: String(item.elasticity ?? item.exponent ?? item.demand_path),
                        ...item.result,
                      }))}
                      columns={[
                        { key: 'case', title: 'Assumed Value' },
                        { key: 'profit', title: 'Profit', format: moneyCompact, align: 'right' },
                        { key: 'revenue', title: 'Revenue', format: moneyCompact, align: 'right' },
                        { key: 'risk', title: 'Unfulfilled Risk', format: integer, align: 'right' },
                      ]}
                    />
                  </details>
                ))}
              </div>
            </Card>

            <Card>
              <SectionHeader title="Explicit Model Assumptions & Evidence" detail="Mathematical boundaries" />
              <ul className="space-y-2 text-xs list-disc list-inside" style={{ color: 'var(--text)' }}>
                {data.assumptions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
              <Source>Microeconomic Elasticity Formulation · Lead-Time Capping</Source>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

export function Recommendations({ dataset }: { dataset?: Dataset }) {
  const client = useQueryClient()
  const { notify } = useToast()
  const companyId = getActiveCompanyId()
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Session>('/session') })
  const [auditBefore, setAuditBefore] = useState<string | undefined>()
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [confirmState, setConfirmState] = useState<{
    row: Recommendation
    decision: 'accepted' | 'rejected'
  } | null>(null)

  const data = useQuery({
    queryKey: ['recommendations', companyId, dataset?.dataset_id],
    queryFn: () => request<{ rows: Recommendation[]; dataset_id: string }>('/recommendations'),
  })

  const audit = useQuery({
    queryKey: ['audit', companyId, dataset?.dataset_id, auditBefore],
    queryFn: () =>
      request<{ rows: Audit[]; next_before: number | null }>('/audit?' + params({ kind: 'decisions', before: auditBefore })),
  })

  const feedback = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      request('/recommendations/feedback', {
        recommendation_id: id,
        decision,
        dataset_id: data.data?.dataset_id,
      }),
    onSuccess: (_res, vars) => {
      setConfirmState(null)
      notify({
        tone: vars.decision === 'accepted' ? 'success' : 'info',
        title: 'Recommendation decision saved',
        description: `Status: ${vars.decision.toUpperCase()} · Executive sign-off logged to the append-only decision audit trail.`,
      })
      void client.invalidateQueries({ queryKey: ['recommendations'] })
      void client.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (err) => {
      notify({
        tone: 'danger',
        title: 'Failed to record decision',
        description: err.message,
      })
    },
  })

  const allRows = data.data?.rows || []
  const filteredRows = allRows.filter((row) => {
    const matchPriority =
      priorityFilter === 'all' ||
      (priorityFilter === 'high' ? row.priority === 'critical' || row.priority === 'high' : row.priority === priorityFilter)
    const matchStatus = statusFilter === 'all' || row.decision === statusFilter
    return matchPriority && matchStatus
  })

  const pendingCount = allRows.filter((r) => r.decision === 'pending').length
  const acceptedCount = allRows.filter((r) => r.decision === 'accepted').length
  const auditEvents = audit.data?.rows.filter((r) => r.kind.endsWith('_feedback')) || []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="HUMAN-IN-THE-LOOP DECISION INTELLIGENCE"
        title="Recommendations & Decision Audit"
        subtitle="Review business evidence and record decisions against the active dataset. Decision history is protected against ordinary database updates and deletes."
      />

      {/* Governance Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIStatCard title="Active Recommendations" value={integer(allRows.length)} />
        <KPIStatCard title="Pending Human Review" value={integer(pendingCount)} />
        <KPIStatCard title="Accepted Decisions" value={integer(acceptedCount)} />
        <KPIStatCard title="Audit Log Entries" value={integer(auditEvents.length)} />
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide mr-1" style={{ color: 'var(--text-secondary)' }}>
            Priority:
          </span>
          {[
            ['all', 'All'],
            ['high', 'Critical & High'],
            ['medium', 'Medium'],
          ].map(([key, labelText]) => (
            <Button
              key={key}
              size="sm"
              variant={priorityFilter === key ? 'primary' : 'outline'}
              onClick={() => setPriorityFilter(key)}
            >
              {labelText}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <span className="text-[11px] font-semibold uppercase tracking-wide mr-1" style={{ color: 'var(--text-secondary)' }}>
            Status:
          </span>
          {[
            ['all', 'All'],
            ['pending', 'Pending'],
            ['accepted', 'Accepted'],
            ['rejected', 'Rejected'],
          ].map(([key, labelText]) => (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? 'primary' : 'outline'}
              onClick={() => setStatusFilter(key)}
            >
              {labelText}
            </Button>
          ))}
        </div>
      </FilterBar>

      <ErrorState error={data.error || feedback.error} retry={data.error ? () => void data.refetch() : undefined} />
      {data.isLoading && <Loading />}
      {!data.isLoading && allRows.length === 0 && <Empty text="No active recommendations for the current snapshot." />}
      {!data.isLoading && allRows.length > 0 && filteredRows.length === 0 && (
        <Empty text="No recommendations match the current priority or status filter." />
      )}

      <div className="space-y-4">
        {filteredRows.map((row) => (
          <Card key={row.id} className="space-y-4">
            <SectionHeader
              title={row.title}
              detail={row.context}
              aside={
                <div className="flex items-center gap-2">
                  <Pill tone={row.priority}>{row.priority.toUpperCase()}</Pill>
                  <Pill tone={row.decision === 'accepted' ? 'success' : row.decision === 'rejected' ? 'critical' : 'muted'}>
                    STATUS: {row.decision.toUpperCase()}
                  </Pill>
                </div>
              }
            />

            <div
              className="rounded-lg border p-3.5 text-xs"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
            >
              <strong className="block font-semibold mb-1" style={{ color: 'var(--heading)' }}>
                Proposed Action:
              </strong>
              <p className="leading-relaxed" style={{ color: 'var(--text)' }}>
                {row.action}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {row.expected_impact ? (
                Object.entries(row.expected_impact).map(([k, val]) => (
                  <div
                    key={k}
                    className="rounded-lg border p-3"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                  >
                    <span className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
                      {label((dataset?.currency || getActiveCurrency()) === 'VND' ? k : k.replace(/_vnd$/, ''))}
                    </span>
                    <strong className="text-sm font-bold tabular-nums mt-0.5 block" style={{ color: 'var(--heading)' }}>
                      {k.endsWith('vnd') || k.includes('profit') || k.includes('revenue') || k.includes('spend') || k === 'purchase_commitment'
                        ? moneyCompact(val)
                        : decimal(val)}
                    </strong>
                  </div>
                ))
              ) : (
                <div
                  className="rounded-lg border p-3 col-span-2"
                  style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}
                >
                  <span className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--warning-text)' }}>
                    Estimated Impact
                  </span>
                  <strong className="text-xs font-semibold" style={{ color: 'var(--warning-text)' }}>
                    Insufficient evidence
                  </strong>
                </div>
              )}
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {row.uncertainty}
            </p>

            <details className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--primary-text)' }}>
                Review Assumptions, Risks and Supporting Evidence
              </summary>
              <div
                className="mt-2.5 space-y-2 rounded-lg border p-3.5"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <div>
                  <strong style={{ color: 'var(--heading)' }}>Business Risk:</strong>{' '}
                  <span style={{ color: 'var(--text)' }}>{row.risk}</span>
                </div>
                <ul className="list-disc list-inside space-y-1">
                  {row.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </details>

            <div className="pt-2 border-t flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--border)' }}>
              {row.id === 'marketing:facebook' && (
                <Link
                  to={'/scenarios?tab=marketing&channel=Facebook%20Ads&autorun=1&rec=' + encodeURIComponent(row.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-[var(--primary-soft)]"
                  style={{
                    borderColor: 'var(--primary-border)',
                    background: 'var(--surface)',
                    color: 'var(--primary-text)',
                  }}
                >
                  <SlidersHorizontal size={14} />
                  <span>Try first in simulator</span>
                </Link>
              )}

              <Button
                variant="primary"
                disabled={
                  feedback.isPending || row.decision === 'accepted' || !session.data || session.data.role === 'viewer'
                }
                onClick={() => setConfirmState({ row, decision: 'accepted' })}
              >
                <Check size={14} />
                <span>Accept Recommendation</span>
              </Button>

              <Button
                variant="danger"
                disabled={
                  feedback.isPending || row.decision === 'rejected' || !session.data || session.data.role === 'viewer'
                }
                onClick={() => setConfirmState({ row, decision: 'rejected' })}
              >
                <X size={14} />
                <span>Reject</span>
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Decision Audit Trail */}
      <Card>
        <SectionHeader
          title="Decision Audit Trail"
          detail="Append-only record of executive human decisions. Times in Asia/Ho_Chi_Minh (UTC+7)"
          aside={<Database size={16} style={{ color: 'var(--primary)' }} />}
        />
        <ErrorState error={audit.error} />
        {audit.isLoading && <Loading />}
        <div className="flex gap-2 mb-3">
          <Button size="sm" disabled={!auditBefore} onClick={() => setAuditBefore(undefined)}>
            Latest events
          </Button>
          <Button
            size="sm"
            disabled={!audit.data?.next_before}
            onClick={() => setAuditBefore(String(audit.data?.next_before))}
          >
            Older events
          </Button>
        </div>
        {audit.data && (
          <Table
            pageSize={10}
            rows={auditEvents.map((r) => ({
              actor: String(r.payload.actor || 'Legacy local event'),
              kind: r.kind,
              time: new Date(r.occurred_at).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }),
              subject: r.subject,
              decision: r.payload.decision,
            }))}
            columns={[
              { key: 'time', title: 'Timestamp' },
              { key: 'subject', title: 'Decision subject' },
              { key: 'actor', title: 'Actor' },
              { key: 'kind', title: 'Decision type' },
              { key: 'decision', title: 'Recorded Human Decision' },
            ]}
          />
        )}
      </Card>

      <ConfirmDialog
        open={!!confirmState}
        tone={confirmState?.decision === 'rejected' ? 'danger' : 'primary'}
        title={
          confirmState?.decision === 'accepted'
            ? 'Confirm Recommendation Approval'
            : 'Confirm Recommendation Rejection'
        }
        description={
          confirmState
            ? `Record "${confirmState.decision}" for "${confirmState.row.title}" into the immutable audit trail?`
            : ''
        }
        detail={
          confirmState ? (
            <div className="space-y-1">
              <div>
                <strong>Action:</strong> {confirmState.row.action}
              </div>
              <div>
                <strong>Risk note:</strong> {confirmState.row.risk}
              </div>
            </div>
          ) : null
        }
        confirmLabel={confirmState?.decision === 'accepted' ? 'Accept Recommendation' : 'Reject Recommendation'}
        isPending={feedback.isPending}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (confirmState) {
            feedback.mutate({ id: confirmState.row.id, decision: confirmState.decision })
          }
        }}
      />
    </div>
  )
}
