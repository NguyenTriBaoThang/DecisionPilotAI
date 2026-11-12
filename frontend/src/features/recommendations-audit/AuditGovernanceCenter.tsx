import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Download,
  FileJson,
  GitBranch,
  History,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type AuditEventRow,
  type AuditIntegrityReport,
  type Dataset,
  type Session,
  downloadAuditExport,
  getActiveCompanyId,
  getAuditEvents,
  getAuditIntegrity,
  getAuditModels,
  getAuditOverview,
  getAuditRisks,
  getRecommendationTrace,
  integer,
  percent,
  postResolveAuditRisk,
  request,
} from '../../api'
import { AllocationDonutCard } from '../../components/charts/AllocationDonutCard'
import { ENTERPRISE_DONUT_PALETTE, type DonutSegmentItem } from '../../components/charts/dashboardDonuts'
import { useT } from '../../preferences'
import { PageHero, TechDetails } from '../../redesign/ui'
import { Button, Card, ErrorState, KPIStatCard, Loading, PageHeader, Pill, SectionHeader, useToast } from '../../ui'

function riskTone(sev: string): string {
  if (sev === 'critical') return 'critical'
  if (sev === 'high') return 'high'
  if (sev === 'medium') return 'medium'
  return 'muted'
}

export function AuditGovernanceCenter({ dataset }: { dataset?: Dataset }) {
  const { t, language } = useT()
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const companyId = getActiveCompanyId()

  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Session>('/session') })
  const overview = useQuery({
    queryKey: ['audit-overview', companyId, dataset?.dataset_id],
    queryFn: getAuditOverview,
  })

  const [tab, setTab] = useState<'events' | 'models' | 'risks'>('events')
  const [kindFilter, setKindFilter] = useState<string>('')
  const [beforeCursor, setBeforeCursor] = useState<number | undefined>()
  const [riskStatusFilter, setRiskStatusFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all')
  const [integrityOverride, setIntegrityOverride] = useState<AuditIntegrityReport | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRow | null>(null)
  const [traceRecId, setTraceRecId] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null)

  const eventsQuery = useQuery({
    queryKey: ['audit-events', companyId, kindFilter, beforeCursor],
    queryFn: () => getAuditEvents({ kind: kindFilter || undefined, limit: 25, before: beforeCursor }),
  })

  const modelsQuery = useQuery({
    queryKey: ['audit-models', companyId, dataset?.dataset_id],
    queryFn: getAuditModels,
    enabled: tab === 'models',
  })

  const risksQuery = useQuery({
    queryKey: ['audit-risks', companyId, riskStatusFilter],
    queryFn: () => getAuditRisks(riskStatusFilter),
    enabled: tab === 'risks',
  })

  const traceQuery = useQuery({
    queryKey: ['audit-trace-lookup', companyId, traceRecId],
    queryFn: () => getRecommendationTrace(traceRecId || ''),
    enabled: !!traceRecId,
  })

  const verifyMutation = useMutation({
    mutationFn: getAuditIntegrity,
    onSuccess: (rep) => {
      setIntegrityOverride(rep)
      notify({
        tone: rep.chain_valid ? 'success' : 'danger',
        title: rep.chain_valid ? t('SHA-256 Hash-Chain Verified') : t('Hash-Chain Integrity Mismatch Detected!'),
        description: `${rep.chained_events}/${rep.total_audit_events} events verified · Latest seq #${rep.latest_seq_no ?? 0}`,
      })
    },
    onError: (err) => notify({ tone: 'danger', title: t('Integrity verification failed'), description: err.message }),
  })

  const riskMutation = useMutation({
    mutationFn: ({ riskId, status }: { riskId: string; status: 'acknowledged' | 'resolved' }) =>
      postResolveAuditRisk(riskId, { status, note: resolutionNote.trim() || undefined }),
    onSuccess: (res) => {
      setResolutionNote('')
      notify({
        tone: 'success',
        title: t('Risk alert status updated'),
        description: `Status: ${res.status.toUpperCase()} · Logged to audit hash-chain`,
      })
      void queryClient.invalidateQueries({ queryKey: ['audit-risks', companyId] })
      void queryClient.invalidateQueries({ queryKey: ['audit-overview', companyId] })
      void queryClient.invalidateQueries({ queryKey: ['audit-events', companyId] })
    },
    onError: (err) => notify({ tone: 'danger', title: t('Risk update failed'), description: err.message }),
  })

  const handleExport = async (fmt: 'csv' | 'json') => {
    try {
      await downloadAuditExport(fmt, kindFilter || undefined)
      notify({ tone: 'success', title: `${fmt.toUpperCase()} Export Ready`, description: t('Formula-safe & secret-redacted audit bundle downloaded.') })
    } catch (err) {
      notify({ tone: 'danger', title: t('Export failed'), description: err instanceof Error ? err.message : String(err) })
    }
  }

  const canWrite = !!session.data && session.data.role !== 'viewer'
  const ov = overview.data
  const integrity = integrityOverride || ov?.integrity

  const toDonutItems = (
    slices?: { key: string; label: string; label_vi?: string; count: number; share: number }[],
    palette: readonly string[] = ENTERPRISE_DONUT_PALETTE
  ): DonutSegmentItem[] =>
    (slices || []).map((s, idx) => ({
      id: s.key,
      name: language === 'vi' && s.label_vi ? s.label_vi : s.label,
      value: s.count,
      color: palette[idx % palette.length],
      details: [
        { label: t('Count'), value: integer(s.count), highlight: true },
        { label: t('Share'), value: percent(s.share) },
      ],
    }))

  const isRecommendationTraceable = (ev: AuditEventRow) =>
    ev.kind.startsWith('recommendation_') || ev.subject.includes(':') || Boolean((ev.payload as Record<string, unknown>)?.rec_key || (ev.payload as Record<string, unknown>)?.recommendation_id)

  const resolveRecIdentifier = (ev: AuditEventRow) => {
    const p = ev.payload as Record<string, unknown>
    return String(p?.recommendation_id || p?.rec_key || ev.subject)
  }

  return (
    <div className="space-y-6">
      <PageHero tone="neutral" illus="clipboard" title={t('Audit trail')} subtitle={t('Every decision and model change, recorded in order and checked for tampering.')}>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              to="/recommendations"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--heading)' }}
            >
              <span>{t('Recommendations & XAI')}</span>
              <ArrowRight size={13} />
            </Link>
            <Button size="sm" variant="outline" onClick={() => void handleExport('csv')}>
              <Download size={14} />
              <span>Export CSV</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleExport('json')}>
              <FileJson size={14} />
              <span>Export JSON</span>
            </Button>
          </div>
      </PageHero>

      <ErrorState error={overview.error} retry={() => void overview.refetch()} />
      {overview.isLoading && <Loading />}

      {/* SHA-256 Hash-Chain Integrity Banner */}
      {integrity && (
        <Card
          data-testid="hash-chain-banner"
          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: integrity.chain_valid ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: integrity.chain_valid ? 'var(--success-text)' : 'var(--danger-text)',
              }}
            >
              {integrity.chain_valid ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                  {integrity.chain_valid ? t('SHA-256 Hash-Chain Verified') : t('Audit Hash-Chain Tampering Detected')}
                </strong>
                <Pill tone={integrity.chain_valid ? 'success' : 'critical'}>
                  {integrity.chain_valid ? 'CHAIN VALID' : 'BROKEN LINK'}
                </Pill>
                <Pill tone="muted">
                  <Lock size={10} className="inline mr-1" />
                  SQL Append-Only Triggers Active
                </Pill>
              </div>
              <p style={{ color: 'var(--text-secondary)' }}>
                {t('Verified Chained Events')}: <strong>{integrity.chained_events}</strong> / {integrity.total_audit_events}
                {integrity.latest_seq_no != null && ` · Latest Seq #${integrity.latest_seq_no}`}
                {integrity.latest_hash && (
                  <>
                    {' · '}Head Hash: <code className="text-[11px]">{integrity.latest_hash.slice(0, 16)}…</code>
                  </>
                )}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            disabled={verifyMutation.isPending}
            onClick={() => verifyMutation.mutate()}
          >
            <RefreshCw size={13} className={verifyMutation.isPending ? 'animate-spin' : ''} />
            <span>{t('Verify Hash-Chain Integrity')}</span>
          </Button>
        </Card>
      )}

      {!overview.isLoading && ov?.empty_workspace && (
        <Card data-testid="audit-empty-state" className="p-6 space-y-3">
          <SectionHeader
            title="Empty Governance Ledger"
            detail="No datasets imported and zero audit events recorded for this tenant workspace."
          />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('Audit events, model drift metrics, data quality charts, and recommendations populate strictly from real activity inside this company tenant.')}
          </p>
          <div>
            <Link
              to="/data-sources"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white"
              style={{ background: 'var(--primary)' }}
            >
              <span>{t('Upload Dataset in Data Sources')}</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </Card>
      )}

      {!overview.isLoading && ov && !ov.empty_workspace && (
        <>
          {/* 10 Audit Governance KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KPIStatCard title={t('Total Audited Events')} value={integer(ov.kpis.total_ai_decisions)} />
            <KPIStatCard title={t('Model / Tool Runs')} value={integer(ov.kpis.total_model_runs)} />
            <KPIStatCard title={t('Recs Generated')} value={integer(ov.kpis.recommendations_generated)} />
            <KPIStatCard title={t('Approved')} value={integer(ov.kpis.approved_count)} />
            <KPIStatCard title={t('Implemented')} value={integer(ov.kpis.implemented_count)} />
            <KPIStatCard title={t('Rejected')} value={integer(ov.kpis.rejected_count)} />
            <KPIStatCard title={t('Blocked / Guardrail Stops')} value={integer(ov.kpis.failed_or_blocked_runs)} />
            <KPIStatCard title={t('Data Quality Warnings')} value={integer(ov.kpis.data_quality_warnings)} />
            <KPIStatCard title={t('Open Model Alerts')} value={integer(ov.kpis.model_alerts)} />
            <KPIStatCard title={t('Insufficient Evidence')} value={integer(ov.kpis.insufficient_evidence_decisions)} />
          </div>

          {/* 6 MANDATORY AUDIT VISUALIZATIONS */}
          <TechDetails summary={t('Charts: events, model quality, data quality and outcomes')}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" data-testid="audit-charts-grid">
            {/* 1. Event Distribution Donut */}
            <AllocationDonutCard
              title={t('1. Audit Event Distribution (8 Buckets)')}
              detail={t('Mutually exclusive audit ledger activity')}
              items={toDonutItems(ov.charts.event_distribution)}
              formatValue={integer}
              centerLabel={t('Events')}
              emptyText={t('No audit events recorded yet.')}
            />

            {/* 2. Decision Workflow Status Donut */}
            <AllocationDonutCard
              title={t('2. Decision Workflow Status')}
              detail={t('Mutually exclusive lifecycle state distribution')}
              items={toDonutItems(ov.charts.decision_status, ['#D97706', '#EA580C', '#2563EB', '#059669', '#DC2626', '#64748B'])}
              formatValue={integer}
              centerLabel={t('Decisions')}
              emptyText={t('No decisions recorded yet.')}
            />

            {/* 3. Model Performance Trend (Strictly Separated Forecast WAPE vs Anomaly Metrics) */}
            <Card className="space-y-3" data-testid="chart-model-performance-trend">
              <SectionHeader
                title={t('3. Model Performance Trend (Forecast WAPE vs Baseline)')}
                detail={t('Strictly separated from Anomaly Precision/Recall/F1')}
                aside={<Cpu size={16} style={{ color: 'var(--primary)' }} />}
              />
              {ov.charts.model_performance_trend.forecast_available ? (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ov.charts.model_performance_trend.forecast_series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis unit="%" width={45} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Line type="monotone" dataKey="wape_pct" name="Selected WAPE %" stroke="#2563EB" strokeWidth={2.5} isAnimationActive={false} />
                      <Line type="monotone" dataKey="baseline_wape_pct" name="Seasonal Naive %" stroke="#EA580C" strokeDasharray="4 4" strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-lg border p-3 text-xs" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {t('Chưa đủ dữ liệu đánh giá (Forecast model artifact unavailable).')}
                </div>
              )}

              {/* Separate Anomaly Sub-panel */}
              <div className="rounded-lg border p-2.5 text-[11px] flex flex-wrap items-center justify-between gap-2" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                <span className="font-semibold" style={{ color: 'var(--heading)' }}>
                  {t('Anomaly Detector Benchmark (Separate Metric Family)')}:
                </span>
                {ov.charts.model_performance_trend.anomaly_available ? (
                  <div className="flex flex-wrap gap-2">
                    {ov.charts.model_performance_trend.anomaly_series.map((a) => (
                      <Pill key={a.metric} tone={a.f1_pct != null ? 'success' : 'muted'}>
                        {a.metric}: {a.f1_pct != null ? `F1 ${a.f1_pct}%` : 'Unverified'}
                      </Pill>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>{t('Chưa đủ dữ liệu đánh giá (Limited Ground Truth)')}</span>
                )}
              </div>
            </Card>

            {/* 4. Data Quality Partition Donut */}
            <AllocationDonutCard
              title={t('4. Data Quality Partition (Non-Overlapping)')}
              detail={`${t('Source')}: ${ov.charts.data_quality.source}`}
              items={toDonutItems(ov.charts.data_quality.slices, ['#059669', '#DC2626', '#D97706', '#6366F1'])}
              formatValue={integer}
              centerLabel={t('Rows')}
              emptyText={t('No data quality metrics yet.')}
            />

            {/* 5. Risk Severity Distribution Donut */}
            <AllocationDonutCard
              title={t('5. Risk & Compliance Severity Distribution')}
              detail={t('Active rule-based drift, quality and calibration warnings')}
              items={toDonutItems(ov.charts.risk_distribution, ['#DC2626', '#EA580C', '#D97706', '#2563EB'])}
              formatValue={integer}
              centerLabel={t('Alerts')}
              emptyText={t('Zero active risk alerts detected.')}
            />

            {/* 6. Recommendation Outcome Comparison Bar Chart */}
            <Card className="space-y-3" data-testid="chart-outcome-comparison">
              <SectionHeader
                title={t('6. Recommendation Funnel vs Post-Impl Outcome')}
                detail={t('Implemented status is strictly separated from Verified Success')}
              />
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ov.charts.outcome_comparison.map((c) => ({
                      ...c,
                      displayStage: language === 'vi' && c.stage_vi ? c.stage_vi : c.stage,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="displayStage" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" name={t('Count')} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {ov.charts.outcome_comparison.map((entry, idx) => (
                        <Cell
                          key={entry.stage}
                          fill={
                            entry.stage === 'Successful'
                              ? '#059669'
                              : entry.stage === 'Unsuccessful'
                                ? '#DC2626'
                                : entry.stage === 'Not Evaluated'
                                  ? '#94A3B8'
                                  : ENTERPRISE_DONUT_PALETTE[idx % ENTERPRISE_DONUT_PALETTE.length]
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
          </TechDetails>
        </>
      )}

      {/* OPERATIONAL TABS: AUDIT EVENTS / MODEL GOVERNANCE / RISK ALERTS */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'events', label: t('Decision & System Audit Log'), icon: History },
              { key: 'models', label: t('Model Governance & PSI Drift'), icon: Cpu },
              { key: 'risks', label: t('Risk & Compliance Alerts'), icon: AlertTriangle },
            ].map(({ key, label: lbl, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key as typeof tab)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors"
                style={
                  tab === key
                    ? { background: 'var(--primary-soft)', borderColor: 'var(--primary-border)', color: 'var(--primary-text)' }
                    : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                }
              >
                <Icon size={14} />
                <span>{lbl}</span>
              </button>
            ))}
          </div>
        </div>

        {/* TAB 1: AUDIT EVENTS */}
        {tab === 'events' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Filter audit events by kind"
                  value={kindFilter}
                  onChange={(e) => {
                    setKindFilter(e.target.value)
                    setBeforeCursor(undefined)
                  }}
                  className="dp-select"
                >
                  <option value="">{t('All Event Kinds')}</option>
                  <option value="decisions">{t('All Human Decisions')}</option>
                  <option value="recommendation_generated">recommendation_generated</option>
                  <option value="recommendation_action">recommendation_action</option>
                  <option value="recommendation_feedback">recommendation_feedback</option>
                  <option value="recommendation_outcome">recommendation_outcome</option>
                  <option value="scenario_feedback">scenario_feedback</option>
                  <option value="query">query</option>
                  <option value="dataset_loaded">dataset_loaded</option>
                  <option value="risk_resolved">risk_resolved</option>
                </select>
                {beforeCursor && (
                  <Button size="sm" onClick={() => setBeforeCursor(undefined)}>
                    {t('Latest events')}
                  </Button>
                )}
              </div>
              {eventsQuery.data?.next_before && (
                <Button size="sm" onClick={() => setBeforeCursor(eventsQuery.data?.next_before || undefined)}>
                  {t('Older events')}
                </Button>
              )}
            </div>

            {eventsQuery.isLoading && <Loading />}
            {eventsQuery.error && <ErrorState error={eventsQuery.error} />}
            {eventsQuery.data && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b text-left" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      <th className="py-2 pr-3 font-semibold">Timestamp (UTC+7)</th>
                      <th className="py-2 px-3 font-semibold">Kind / Bucket</th>
                      <th className="py-2 px-3 font-semibold">Subject</th>
                      <th className="py-2 px-3 font-semibold">Actor</th>
                      <th className="py-2 px-3 font-semibold">SHA-256 Chain</th>
                      <th className="py-2 pl-3 font-semibold text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsQuery.data.rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                          {t('No matching audit events in this workspace.')}
                        </td>
                      </tr>
                    ) : (
                      eventsQuery.data.rows.map((ev) => (
                        <tr key={ev.id} className="border-b hover:bg-[var(--surface-muted)]" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                            {ev.occurred_at ? new Date(ev.occurred_at).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold block" style={{ color: 'var(--heading)' }}>{ev.kind}</span>
                            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{ev.bucket}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">{ev.subject}</td>
                          <td className="py-2.5 px-3">{ev.actor}</td>
                          <td className="py-2.5 px-3">
                            {ev.hash_chain ? (
                              <span className="font-mono text-[10px] rounded px-1.5 py-0.5" style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}>
                                #{ev.hash_chain.seq_no} · {ev.hash_chain.entry_hash.slice(0, 10)}…
                              </span>
                            ) : (
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Pre-chain</span>
                            )}
                          </td>
                          <td className="py-2.5 pl-3 text-right space-x-1.5 whitespace-nowrap">
                            {isRecommendationTraceable(ev) && (
                              <Button size="sm" variant="outline" onClick={() => setTraceRecId(resolveRecIdentifier(ev))}>
                                {t('14-Step Trace')}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(ev)}>
                              JSON
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MODEL GOVERNANCE & PSI DRIFT */}
        {tab === 'models' && (
          <div className="space-y-4">
            {modelsQuery.isLoading && <Loading />}
            {modelsQuery.error && <ErrorState error={modelsQuery.error} />}
            {modelsQuery.data?.models.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('No model evaluations logged for current dataset.')}</p>
            ) : (
              <div className="space-y-3">
                {modelsQuery.data?.models.map((m) => {
                  const drift = m.drift_status_json || {}
                  const expanded = expandedModelId === m.id
                  return (
                    <div key={m.id} className="rounded-xl border p-4 space-y-2 text-xs" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong className="text-sm font-bold" style={{ color: 'var(--heading)' }}>{m.model_name}</strong>
                          <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Version: <code>{m.model_version}</code> · Task: {m.task_type} · Window: {m.train_date_start || '—'} → {m.train_date_end || '—'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={drift.drift_detected ? 'high' : 'success'}>
                            <Activity size={11} className="inline mr-1" />
                            {drift.psi != null ? `PSI=${drift.psi} · Z=${drift.mean_z_shift}` : drift.status || 'No Drift Telemetry'}
                          </Pill>
                          <Button size="sm" variant="outline" onClick={() => setExpandedModelId(expanded ? null : m.id)}>
                            {expanded ? t('Hide Feature Schema') : `${t('Feature Schema')} (${m.feature_schema_json.length})`}
                          </Button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="pt-2 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" style={{ borderColor: 'var(--border)' }}>
                          {m.feature_schema_json.map((f) => (
                            <div key={f.name} className="rounded-lg border px-2.5 py-1.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                              <code className="font-semibold" style={{ color: 'var(--primary-text)' }}>{f.name}</code>
                              <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>{f.label} ({f.dtype})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: RISK & COMPLIANCE ALERTS */}
        {tab === 'risks' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {(['all', 'open', 'acknowledged', 'resolved'] as const).map((s) => (
                  <Button key={s} size="sm" variant={riskStatusFilter === s ? 'primary' : 'outline'} onClick={() => setRiskStatusFilter(s)}>
                    {s.toUpperCase()}
                  </Button>
                ))}
              </div>
              <input
                className="dp-input max-w-[260px] text-xs"
                placeholder={t('Resolution / triage note (optional)…')}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                disabled={!canWrite}
              />
            </div>

            {risksQuery.isLoading && <Loading />}
            {risksQuery.error && <ErrorState error={risksQuery.error} />}
            {risksQuery.data?.items.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('No governance risk alerts in this filter.')}</p>
            ) : (
              <div className="space-y-3">
                {risksQuery.data?.items.map((rk) => (
                  <div key={rk.id} className="rounded-xl border p-4 space-y-2 text-xs" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Pill tone={riskTone(rk.severity)}>{rk.severity.toUpperCase()}</Pill>
                        <strong style={{ color: 'var(--heading)' }}>{rk.title}</strong>
                      </div>
                      <Pill tone={rk.status === 'resolved' ? 'success' : rk.status === 'acknowledged' ? 'medium' : 'critical'}>
                        {rk.status.toUpperCase()}
                      </Pill>
                    </div>
                    <p style={{ color: 'var(--text)' }}>{rk.description}</p>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      <strong>{t('Remediation')}:</strong> {rk.remediation}
                    </div>
                    {rk.resolved_by && (
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Updated by {rk.resolved_by} {rk.resolution_note ? `— "${rk.resolution_note}"` : ''}
                      </div>
                    )}
                    {rk.status !== 'resolved' && (
                      <div className="flex items-center gap-2 pt-1">
                        {rk.status === 'open' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canWrite || riskMutation.isPending}
                            onClick={() => riskMutation.mutate({ riskId: rk.id, status: 'acknowledged' })}
                          >
                            {t('Acknowledge')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!canWrite || riskMutation.isPending}
                          onClick={() => riskMutation.mutate({ riskId: rk.id, status: 'resolved' })}
                        >
                          <CheckCircle2 size={13} />
                          <span>{t('Mark Resolved')}</span>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* PAYLOAD INSPECTOR MODAL */}
      {selectedEvent && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)' }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border p-5 space-y-3 text-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              <strong style={{ color: 'var(--heading)' }}>
                Audit Event #{selectedEvent.id} — {selectedEvent.kind} (Secrets Redacted)
              </strong>
              <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(null)}>
                <X size={15} />
              </Button>
            </div>
            {selectedEvent.hash_chain && (
              <div className="font-mono text-[11px] rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                <div>Seq #: {selectedEvent.hash_chain.seq_no}</div>
                <div>Entry Hash: {selectedEvent.hash_chain.entry_hash}</div>
                <div>Prev Hash: {selectedEvent.hash_chain.prev_hash}</div>
              </div>
            )}
            <pre className="rounded-lg border p-3 overflow-x-auto text-[11px]" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
              {JSON.stringify(selectedEvent.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* 14-STEP TRACE DRAWER */}
      {traceRecId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[90] flex justify-end"
          style={{ background: 'rgba(15, 23, 42, 0.45)' }}
          onClick={() => setTraceRecId(null)}
        >
          <div
            data-testid="audit-trace-drawer"
            className="w-full max-w-xl h-full overflow-y-auto border-l p-6 space-y-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <strong className="text-sm" style={{ color: 'var(--heading)' }}>
                {t('14-Step Decision Audit Trace')} ({traceRecId})
              </strong>
              <Button size="sm" variant="ghost" onClick={() => setTraceRecId(null)}>
                <X size={15} />
              </Button>
            </div>
            {traceQuery.isLoading && <Loading />}
            {traceQuery.error && <ErrorState error={traceQuery.error} />}
            {traceQuery.data && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <Link
                    to={`/recommendations/${encodeURIComponent(traceQuery.data.rec_key)}`}
                    className="font-semibold hover:underline"
                    style={{ color: 'var(--primary-text)' }}
                  >
                    {t('Open Full XAI Recommendation Detail')}
                  </Link>
                  <Link
                    to={traceQuery.data.knowledge_map_url || '/knowledge-map'}
                    className="inline-flex items-center gap-1 font-semibold hover:underline"
                    style={{ color: 'var(--heading)' }}
                  >
                    <GitBranch size={13} />
                    <span>Knowledge Map</span>
                  </Link>
                </div>
                {traceQuery.data.steps.map((st) => (
                  <div key={st.step} className="rounded-xl border p-3 text-xs space-y-1" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                    <div className="font-bold" style={{ color: 'var(--primary-text)' }}>
                      Step {st.step}: {language === 'vi' ? st.stage_vi : st.stage}
                    </div>
                    <div className="font-semibold" style={{ color: 'var(--heading)' }}>{st.value}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{st.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
