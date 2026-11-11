import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  GitBranch,
  History,
  Layers,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type Dataset,
  type Session,
  decimal,
  getActiveCompanyId,
  getActiveCurrency,
  getRecommendationDetail,
  getRecommendationTrace,
  integer,
  moneyCompact,
  percent,
  postRecommendationAction,
  postRecommendationOutcome,
  request,
  shortDate,
} from '../../api'
import { AllocationDonutCard } from '../../components/charts/AllocationDonutCard'
import { ENTERPRISE_DONUT_PALETTE, type DonutSegmentItem } from '../../components/charts/dashboardDonuts'
import { useT } from '../../preferences'
import { Button, Card, ErrorState, KPIStatCard, Loading, Pill, SectionHeader, useToast } from '../../ui'
import { XAIPanels } from './XAIPanels'

function statusTone(s: string): string {
  if (s === 'approved' || s === 'implemented') return 'success'
  if (s === 'rejected') return 'critical'
  if (s === 'review_requested') return 'high'
  return 'muted'
}

export function RecommendationDetailView({ dataset }: { dataset?: Dataset }) {
  const { recId } = useParams<{ recId: string }>()
  const decodedId = recId ? decodeURIComponent(recId) : ''
  const { t, language } = useT()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const companyId = getActiveCompanyId()
  const currency = dataset?.currency || getActiveCurrency()

  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Session>('/session') })
  const detailQuery = useQuery({
    queryKey: ['recommendation-detail', companyId, decodedId],
    queryFn: () => getRecommendationDetail(decodedId),
    enabled: !!decodedId,
  })

  const [traceOpen, setTraceOpen] = useState(false)
  const traceQuery = useQuery({
    queryKey: ['recommendation-trace', companyId, decodedId],
    queryFn: () => getRecommendationTrace(decodedId),
    enabled: traceOpen && !!decodedId,
  })

  // Editable Section I Action Plan state
  const [owner, setOwner] = useState('')
  const [deadline, setDeadline] = useState('')
  const [resources, setResources] = useState('')
  const [trackingKpi, setTrackingKpi] = useState('')
  const [successCriteria, setSuccessCriteria] = useState('')
  const [stopCriteria, setStopCriteria] = useState('')
  const [workflowComment, setWorkflowComment] = useState('')

  // Post-Impl Outcome Form state
  const [evalStatus, setEvalStatus] = useState<'successful' | 'unsuccessful' | 'inconclusive' | 'not_evaluated'>('successful')
  const [kpiName, setKpiName] = useState('')
  const [baselineVal, setBaselineVal] = useState('')
  const [targetVal, setTargetVal] = useState('')
  const [observedVal, setObservedVal] = useState('')
  const [windowDays, setWindowDays] = useState('14')
  const [methodology, setMethodology] = useState('Pre/post observed KPI comparison against baseline window')
  const [evalNotes, setEvalNotes] = useState('')

  const d = detailQuery.data

  useEffect(() => {
    if (!d) return
    const secI = d.section_i_action_plan_and_workflow
    setOwner(secI.owner || '')
    setDeadline(secI.deadline ? secI.deadline.slice(0, 10) : '')
    setResources(secI.resources_needed || '')
    setTrackingKpi(secI.tracking_kpi || '')
    setSuccessCriteria(secI.success_criteria || '')
    setStopCriteria(secI.stop_criteria || '')
    setKpiName(secI.tracking_kpi || d.section_a_summary.title)
  }, [d])

  const actionMutation = useMutation({
    mutationFn: (action: 'approve' | 'reject' | 'request_review' | 'mark_implemented' | 'comment' | 'update_plan') =>
      postRecommendationAction(decodedId, {
        action,
        comment: workflowComment.trim() || undefined,
        owner: owner.trim() || undefined,
        deadline: deadline || undefined,
        resources_needed: resources.trim() || undefined,
        tracking_kpi: trackingKpi.trim() || undefined,
        success_criteria: successCriteria.trim() || undefined,
        stop_criteria: stopCriteria.trim() || undefined,
      }),
    onSuccess: (res) => {
      setWorkflowComment('')
      notify({
        tone: res.status === 'rejected' ? 'info' : 'success',
        title: `${t('Workflow action recorded')}: ${res.action.toUpperCase()}`,
        description: `Status: ${res.status.toUpperCase()} · Hash: ${res.entry_hash.slice(0, 14)}…`,
      })
      void queryClient.invalidateQueries({ queryKey: ['recommendation-detail', companyId, decodedId] })
      void queryClient.invalidateQueries({ queryKey: ['recommendation-trace', companyId, decodedId] })
      void queryClient.invalidateQueries({ queryKey: ['recommendations-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['recommendations'] })
      void queryClient.invalidateQueries({ queryKey: ['audit-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (err) => {
      notify({ tone: 'danger', title: t('Workflow update rejected'), description: err.message })
    },
  })

  const outcomeMutation = useMutation({
    mutationFn: () =>
      postRecommendationOutcome(decodedId, {
        evaluation_status: evalStatus,
        kpi_name: kpiName.trim() || 'Primary Tracking KPI',
        baseline_value: baselineVal.trim() !== '' ? Number(baselineVal) : null,
        target_value: targetVal.trim() !== '' ? Number(targetVal) : null,
        observed_value: observedVal.trim() !== '' ? Number(observedVal) : null,
        observation_window_days: windowDays.trim() !== '' ? Number(windowDays) : null,
        methodology: methodology.trim() || 'Observed pre/post window comparison',
        notes: evalNotes.trim() || undefined,
      }),
    onSuccess: (res) => {
      setEvalNotes('')
      notify({
        tone: 'success',
        title: t('Post-implementation outcome saved'),
        description: `Outcome: ${res.evaluation_status.toUpperCase()} · Hash: ${res.entry_hash.slice(0, 14)}…`,
      })
      void queryClient.invalidateQueries({ queryKey: ['recommendation-detail', companyId, decodedId] })
      void queryClient.invalidateQueries({ queryKey: ['recommendation-trace', companyId, decodedId] })
      void queryClient.invalidateQueries({ queryKey: ['recommendations-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['audit-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (err) => {
      notify({ tone: 'danger', title: t('Outcome logging failed'), description: err.message })
    },
  })

  if (detailQuery.isLoading) return <Loading />
  if (detailQuery.error) return <ErrorState error={detailQuery.error} retry={() => void detailQuery.refetch()} />
  if (!d) return null

  const secA = d.section_a_summary
  const secB = d.section_b_why
  const secC = d.section_c_evidence
  const secE = d.section_e_model_and_confidence
  const secFG = d.section_f_g_impact
  const secH = d.section_h_alternatives
  const secI = d.section_i_action_plan_and_workflow

  const canWrite = !!session.data && session.data.role !== 'viewer'
  const heatmap = secC.heatmap
  const heatCellMap = new Map<string, NonNullable<typeof heatmap>['cells'][number]>()
  heatmap?.cells.forEach((cell) => heatCellMap.set(`${cell.row}::${cell.col}`, cell))

  const mixDonutItems: DonutSegmentItem[] = (secC.mix_chart?.rows || []).map((r, i) => ({
    id: String(r.name || i),
    name: String(r.name || `Segment ${i + 1}`),
    value: Number(r.revenue || 0),
    color: ENTERPRISE_DONUT_PALETTE[i % ENTERPRISE_DONUT_PALETTE.length],
    details: [
      { label: t('Revenue'), value: moneyCompact(Number(r.revenue || 0), currency), highlight: true },
      { label: t('Orders'), value: integer(Number(r.orders || 0)) },
    ],
  }))

  const fcPerf = secE.model_performance?.forecast
  const anomPerf = secE.model_performance?.anomaly
  const rawConf = secE.recommendation_confidence as unknown as Record<string, unknown>
  const confScore = (() => {
    const sp = typeof rawConf?.score_pct === 'number' ? rawConf.score_pct : undefined
    if (sp != null) return sp
    const s = typeof rawConf?.score === 'number' ? rawConf.score : 0
    return s <= 1 ? Math.round(s * 1000) / 10 : s
  })()
  const rawComps = rawConf?.components as unknown
  const confComps = Array.isArray(rawComps)
    ? {
        data_quality_0_100: ((rawComps.find((c: { key?: string }) => c.key === 'data_quality')?.score ?? 0) as number) * 100,
        evidence_completeness_0_100: ((rawComps.find((c: { key?: string }) => c.key === 'evidence_completeness')?.score ?? 0) as number) * 100,
        model_validation_0_100: ((rawComps.find((c: { key?: string }) => c.key === 'model_validation')?.score ?? 0) as number) * 100,
        sensitivity_stability_0_100: ((rawComps.find((c: { key?: string }) => c.key === 'uncertainty_stability')?.score ?? 0) as number) * 100,
      }
    : (secE.recommendation_confidence?.components || {
        data_quality_0_100: 0,
        evidence_completeness_0_100: 0,
        model_validation_0_100: 0,
        sensitivity_stability_0_100: 0,
      })
  const conf = {
    ...secE.recommendation_confidence,
    score: confScore,
    components: confComps,
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb + Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/recommendations"
          className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
          style={{ color: 'var(--primary-text)' }}
        >
          <ArrowLeft size={14} />
          <span>{t('Back to Recommendations & XAI Center')}</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setTraceOpen(true)}>
            <History size={14} />
            <span>{t('View 14-Step Audit Trace')}</span>
          </Button>
          <Link
            to="/knowledge-map"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--heading)' }}
          >
            <GitBranch size={14} style={{ color: 'var(--primary)' }} />
            <span>{t('Trace in Knowledge Map')}</span>
          </Link>
        </div>
      </div>

      {/* SECTION A: EXECUTIVE SUMMARY */}
      <Card className="space-y-4" data-testid="section-a-summary">
        <SectionHeader
          title={secA.title}
          detail={`ID: ${secA.category_label} · ${d.rec_key} · ${t('Created by')}: ${secA.creator}`}
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={secA.priority}>{secA.priority.toUpperCase()}</Pill>
              <Pill tone={statusTone(secA.status)}>STATUS: {secA.status.toUpperCase()}</Pill>
              <Pill tone="muted">
                {conf.level} ({Math.round(conf.score)}/100)
              </Pill>
            </div>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl border p-4 space-y-1" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {t('Section A1 · Detected Problem / Opportunity')}
            </span>
            <p className="leading-relaxed font-medium" style={{ color: 'var(--heading)' }}>
              {secA.problem_statement}
            </p>
          </div>

          <div className="rounded-xl border p-4 space-y-1" style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary-border)' }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
              {t('Section A2 · Proposed Action')}
            </span>
            <p className="leading-relaxed font-semibold" style={{ color: 'var(--heading)' }}>
              {secA.recommended_action}
            </p>
          </div>

          <div className="rounded-xl border p-4 space-y-1" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {t('Section A3 · Business Goal & Window')}
            </span>
            <p className="leading-relaxed" style={{ color: 'var(--text)' }}>
              {secA.goal}
            </p>
            <div className="pt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <Clock size={11} className="inline mr-1" />
              {t('Scope')}: {Array.isArray(secA.data_scope?.date_range) ? (secA.data_scope.date_range as string[]).join(' → ') : d.dataset_id}
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION B: WHY TRIGGERED & INVALIDATION CONDITIONS */}
      <Card className="space-y-4" data-testid="section-b-why">
        <SectionHeader
          title="Section B · Why Triggered & Invalidation Guardrails"
          detail="Quantitative thresholds compared against prior periods or structural limits, plus explicit conditions that invalidate this advice."
        />

        {secB.triggers && secB.triggers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  <th className="py-2 pr-3 font-semibold">{t('Trigger Metric')}</th>
                  <th className="py-2 px-3 font-semibold text-right">{t('Current Value')}</th>
                  <th className="py-2 px-3 font-semibold text-right">{t('Reference / Threshold')}</th>
                  <th className="py-2 px-3 font-semibold text-right">{t('Delta')}</th>
                  <th className="py-2 px-3 font-semibold">{t('Window')}</th>
                  <th className="py-2 pl-3 font-semibold">{t('Detection Method')}</th>
                </tr>
              </thead>
              <tbody>
                {secB.triggers.map((tr, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--heading)' }}>{tr.metric}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{String(tr.current_value ?? '—')}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{String(tr.comparison_value ?? '—')}</td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums" style={{ color: (tr.delta_pct || 0) < 0 ? 'var(--danger-text)' : 'var(--primary-text)' }}>
                      {tr.delta_pct != null ? `${tr.delta_pct >= 0 ? '+' : ''}${tr.delta_pct}%` : '—'}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-secondary)' }}>{tr.window}</td>
                    <td className="py-2.5 pl-3" style={{ color: 'var(--text-secondary)' }}>{tr.detection_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {secB.invalidation_conditions && secB.invalidation_conditions.length > 0 && (
          <div
            className="rounded-xl border p-3.5 text-xs space-y-1.5"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
          >
            <strong className="block font-semibold" style={{ color: 'var(--heading)' }}>
              {t('When This Recommendation Becomes Invalid (Stop / Ignore Conditions):')}
            </strong>
            <ul className="list-disc list-inside space-y-1" style={{ color: 'var(--text-secondary)' }}>
              {secB.invalidation_conditions.map((cond, idx) => (
                <li key={idx}>{cond}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* SECTION C: EVIDENCE CHARTS & REAL SQL HEATMAP */}
      <Card className="space-y-5" data-testid="section-c-evidence">
        <SectionHeader
          title="Section C · Observed Data Evidence & Cross-Tab Heatmap"
          detail={secC.data_timestamp || 'Reconciled SQL transactions'}
          aside={
            <Pill tone="muted">
              {Array.isArray(secC.window) ? secC.window.join(' → ') : ''}
            </Pill>
          }
        />

        {secC.kpi_cards && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KPIStatCard title={t('Revenue')} value={moneyCompact(secC.kpi_cards.revenue, currency)} />
            <KPIStatCard
              title={t('Revenue vs Prior')}
              value={secC.kpi_cards.revenue_change != null ? percent(secC.kpi_cards.revenue_change) : '—'}
            />
            <KPIStatCard title={t('Gross Profit')} value={moneyCompact(secC.kpi_cards.gross_profit, currency)} />
            <KPIStatCard title={t('Gross Margin')} value={percent(secC.kpi_cards.margin)} />
            <KPIStatCard title={t('Orders')} value={integer(secC.kpi_cards.orders)} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Trend Line */}
          <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <h4 className="text-xs font-bold" style={{ color: 'var(--heading)' }}>
              {secC.trend_chart?.title || t('Metric Trend Over Monitoring Window')}
            </h4>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {secC.trend_chart?.interpretation}
            </p>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={secC.trend_chart?.rows || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => shortDate(String(v))} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => moneyCompact(Number(v), currency)} width={64} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Current vs Prior Comparison Bar */}
          <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <h4 className="text-xs font-bold" style={{ color: 'var(--heading)' }}>
              {secC.comparison_chart?.title || t('Group Comparison (Current vs Prior)')}
            </h4>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {secC.comparison_chart?.interpretation}
            </p>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={secC.comparison_chart?.rows || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => moneyCompact(Number(v), currency)} width={64} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="current_revenue" name={t('Current Period')} fill="#2563EB" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="prior_revenue" name={t('Previous Period')} fill="#CBD5E1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Distribution Mix Donut */}
          <AllocationDonutCard
            title={secC.mix_chart?.title || t('Revenue Distribution')}
            detail={secC.mix_chart?.interpretation}
            items={mixDonutItems}
            formatValue={(v) => moneyCompact(v, currency)}
            centerLabel={t('Period Rev')}
            emptyText={t('No channel mix available.')}
          />

          {/* Real SQL Heatmap (Region x Category) */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h4 className="text-xs font-bold" style={{ color: 'var(--heading)' }}>
                {heatmap?.title || t('Region × Category Concentration Matrix')}
              </h4>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {t('Direct SQL cross-tabulation highlighting localized margin or demand concentration')}
              </span>
            </div>
            {heatmap && heatmap.rows.length > 0 && heatmap.cols.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        {heatmap.row_dimension} \ {heatmap.col_dimension}
                      </th>
                      {heatmap.cols.map((col) => (
                        <th key={col} className="p-2 text-center font-semibold" style={{ color: 'var(--heading)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmap.rows.map((rLabel) => (
                      <tr key={rLabel} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="p-2 font-semibold whitespace-nowrap" style={{ color: 'var(--heading)' }}>
                          {rLabel}
                        </td>
                        {heatmap.cols.map((cLabel) => {
                          const cell = heatCellMap.get(`${rLabel}::${cLabel}`)
                          const intensity = cell?.intensity || 0
                          return (
                            <td key={cLabel} className="p-1">
                              <div
                                className="rounded-md px-2 py-1.5 text-center tabular-nums"
                                style={{
                                  background: cell
                                    ? `rgba(37, 99, 235, ${(0.08 + intensity * 0.45).toFixed(2)})`
                                    : 'var(--surface-muted)',
                                  color: intensity > 0.6 ? '#0F172A' : 'var(--heading)',
                                }}
                                title={cell ? `${rLabel} · ${cLabel}: ${moneyCompact(cell.revenue, currency)} (${cell.orders} orders)` : 'No transactions'}
                              >
                                <div className="font-bold">{cell ? moneyCompact(cell.revenue, currency) : '—'}</div>
                                {cell?.margin != null && (
                                  <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                    GM {(cell.margin * 100).toFixed(1)}%
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs p-3 rounded-lg" style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                {t('Insufficient Region × Category dimensions in this dataset.')}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* SECTION D: EXPLAINABLE AI (XAI) */}
      <XAIPanels xai={d.section_d_xai} currency={currency} />

      {/* SECTION E: STRICTLY SEPARATED MODEL PERFORMANCE VS RECOMMENDATION CONFIDENCE */}
      <Card className="space-y-4" data-testid="section-e-separation">
        <SectionHeader
          title="Section E · Model Performance vs. Recommendation Confidence (Strictly Separated)"
          detail="Forecast/Anomaly validation accuracy MUST NEVER be mixed with heuristic recommendation strength or probability calibration."
        />

        <div
          className="rounded-xl border px-4 py-2.5 flex items-center gap-2.5 text-xs"
          style={{ background: 'var(--info-bg)', borderColor: 'var(--info-border)', color: 'var(--info-text)' }}
        >
          <ShieldCheck size={15} className="flex-shrink-0" />
          <span>{secE.strict_separation_note}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card E1: Model Performance */}
          <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--heading)' }}>
                {t('1. Historical Model Validation Performance')}
              </h4>
              <Pill tone={fcPerf?.available ? 'success' : 'muted'}>
                {fcPerf?.selected_model || secE.model_performance?.status_label || 'Model Audit'}
              </Pill>
            </div>

            {fcPerf?.available ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                  <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>Holdout WAPE</span>
                  <strong className="text-sm font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                    {fcPerf.wape != null ? percent(fcPerf.wape) : '—'}
                  </strong>
                </div>
                <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                  <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>Holdout MAE</span>
                  <strong className="text-sm font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                    {decimal(fcPerf.mae)}
                  </strong>
                </div>
                <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                  <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>RMSE</span>
                  <strong className="text-sm font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                    {decimal(fcPerf.rmse)}
                  </strong>
                </div>
                <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                  <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>Forecast Bias</span>
                  <strong className="text-sm font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                    {decimal(fcPerf.bias)}
                  </strong>
                </div>
                <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                  <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>90% Nominal Coverage</span>
                  <strong
                    className="text-sm font-bold tabular-nums"
                    style={{ color: (fcPerf.test_coverage || 0) < 0.85 ? 'var(--warning-text)' : 'var(--success-text)' }}
                  >
                    {fcPerf.test_coverage != null ? percent(fcPerf.test_coverage) : '—'}
                  </strong>
                </div>
                <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                  <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>Pseudo-R²</span>
                  <strong className="text-sm font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                    {(fcPerf.r2_pseudo ?? (fcPerf as { r2?: number | null }).r2) != null
                      ? Number(fcPerf.r2_pseudo ?? (fcPerf as { r2?: number | null }).r2).toFixed(3)
                      : '—'}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border p-3 text-xs" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                <strong>{t('Chưa đủ dữ liệu đánh giá (Forecast Holdout)')}:</strong>{' '}
                {fcPerf?.reason || 'No ML forecast holdout artifact applies directly to this rule.'}
              </div>
            )}

            {anomPerf && (
              <div className="rounded-lg border p-3 text-xs space-y-1" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between font-semibold" style={{ color: 'var(--heading)' }}>
                  <span>{t('Anomaly Detector Benchmark')} ({anomPerf.metric || 'Monitor'})</span>
                  <Pill tone={anomPerf.status === 'evaluated' ? 'success' : 'muted'}>{anomPerf.status || 'limited'}</Pill>
                </div>
                {anomPerf.confusion_matrix ? (
                  <div className="flex flex-wrap gap-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    <span>Precision: <strong style={{ color: 'var(--heading)' }}>{anomPerf.precision != null ? percent(anomPerf.precision) : 'N/A'}</strong></span>
                    <span>Recall: <strong style={{ color: 'var(--heading)' }}>{anomPerf.recall != null ? percent(anomPerf.recall) : 'N/A'}</strong></span>
                    <span>F1: <strong style={{ color: 'var(--heading)' }}>{anomPerf.f1 != null ? percent(anomPerf.f1) : 'N/A'}</strong></span>
                    <span>TP={anomPerf.confusion_matrix.tp}, FP={anomPerf.confusion_matrix.fp}, FN={anomPerf.confusion_matrix.fn}</span>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)' }}>{anomPerf.reason || (anomPerf as { note?: string }).note || t('Chưa đủ dữ liệu đánh giá')}</p>
                )}
              </div>
            )}
          </div>

          {/* Card E2: Weighted Recommendation Confidence (Uncalibrated Heuristic) */}
          <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--heading)' }}>
                {t('2. Recommendation Confidence Breakdown')}
              </h4>
              <div className="flex items-center gap-1.5">
                <Pill tone="muted">is_calibrated: {String(conf.is_calibrated)}</Pill>
                <Pill tone={conf.level === 'High' ? 'success' : conf.level === 'Insufficient Evidence' ? 'critical' : 'medium'}>
                  {conf.level} · {conf.score}/100
                </Pill>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              {[
                { label: t('Data Quality Index (weight 0.30)'), val: conf.components.data_quality_0_100 },
                { label: t('Evidence Completeness (weight 0.25)'), val: conf.components.evidence_completeness_0_100 },
                { label: t('Model Validation Strength (weight 0.25)'), val: conf.components.model_validation_0_100 },
                { label: t('Sensitivity Stability (weight 0.20)'), val: conf.components.sensitivity_stability_0_100 },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                    <strong className="tabular-nums" style={{ color: 'var(--heading)' }}>
                      {row.val != null ? `${row.val.toFixed(1)}/100` : 'N/A'}
                    </strong>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-subtle)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, row.val ?? 0))}%`,
                        background: (row.val ?? 0) >= 75 ? '#059669' : (row.val ?? 0) >= 50 ? '#2563EB' : '#EA580C',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] leading-relaxed rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <strong>{t('Calibration Disclosure')}:</strong> {conf.calibration_note}
            </p>
          </div>
        </div>
      </Card>

      {/* SECTION F & G & H: EXPECTED IMPACT & ALTERNATIVES A/B/C */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="space-y-3" data-testid="section-fg-impact">
          <SectionHeader
            title="Sections F & G · Expected Impact (Baseline vs Scenario)"
            detail={secFG.horizon_days ? `${secFG.horizon_days}-day modeled comparison` : 'Conditional estimate'}
          />
          {secFG.available && secFG.baseline_vs_scenario && secFG.baseline_vs_scenario.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    <th className="py-2 pr-2 font-semibold">{t('Metric')}</th>
                    <th className="py-2 px-2 text-right font-semibold">{t('Baseline')}</th>
                    <th className="py-2 px-2 text-right font-semibold">{t('Scenario')}</th>
                    <th className="py-2 pl-2 text-right font-semibold">{t('Delta')}</th>
                  </tr>
                </thead>
                <tbody>
                  {secFG.baseline_vs_scenario.map((row, idx) => {
                    const isMoney = row.unit === currency || row.unit === 'VND' || row.unit === 'USD'
                    return (
                      <tr key={idx} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2 pr-2 font-medium" style={{ color: 'var(--heading)' }}>{row.metric}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {row.baseline != null ? (isMoney ? moneyCompact(row.baseline, currency) : decimal(row.baseline)) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: 'var(--primary-text)' }}>
                          {row.scenario != null ? (isMoney ? moneyCompact(row.scenario, currency) : decimal(row.scenario)) : '—'}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums font-semibold" style={{ color: (row.delta || 0) >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                          {row.delta != null ? `${row.delta >= 0 ? '+' : ''}${isMoney ? moneyCompact(row.delta, currency) : decimal(row.delta)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border p-3.5 text-xs" style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--warning-text)' }}>
              {secFG.reason || t('Insufficient evidence to fabricate numerical scenario impact.')}
            </div>
          )}
        </Card>

        <Card className="space-y-3" data-testid="section-h-alternatives">
          <SectionHeader
            title="Section H · Evaluated Alternatives (A / B / C)"
            detail={secH.selection_rationale || 'Trade-off matrix'}
          />
          <div className="space-y-2.5">
            {(secH.options || []).map((opt, idx) => (
              <div
                key={idx}
                className="rounded-xl border p-3 text-xs space-y-1"
                style={{
                  background: opt.selected ? 'var(--primary-soft)' : 'var(--surface-muted)',
                  borderColor: opt.selected ? 'var(--primary-border)' : 'var(--border)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong style={{ color: 'var(--heading)' }}>
                    {opt.option} — {opt.name}
                  </strong>
                  <Pill tone={opt.selected ? 'success' : 'muted'}>
                    {opt.selected ? t('SELECTED') : t('ALTERNATIVE')}
                  </Pill>
                </div>
                <div className="flex flex-wrap gap-4 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {opt.profit_delta != null && (
                    <span>Profit Δ: <strong style={{ color: 'var(--heading)' }}>{moneyCompact(opt.profit_delta, currency)}</strong></span>
                  )}
                  {opt.effort && <span>Effort: {opt.effort}</span>}
                </div>
                {opt.risk_note && <p style={{ color: 'var(--text-secondary)' }}>{opt.risk_note}</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* SECTION I: EDITABLE ACTION PLAN, GOVERNED WORKFLOW & POST-IMPLEMENTATION EVALUATION */}
      <Card className="space-y-5" data-testid="section-i-workflow">
        <SectionHeader
          title="Section I · Governed Action Plan, Human Workflow & Post-Implementation Outcome"
          detail="Implemented status NEVER implies Success. Log actual observed KPIs 14–30 days after deployment."
          aside={<Pill tone={statusTone(secA.status)}>CURRENT STATE: {secA.status.toUpperCase()}</Pill>}
        />

        {/* Execution Steps */}
        {secI.execution_steps.length > 0 && (
          <div className="rounded-xl border p-4 space-y-1.5 text-xs" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
            <strong style={{ color: 'var(--heading)' }}>{t('Recommended Execution Checklist:')}</strong>
            <ol className="list-decimal list-inside space-y-1" style={{ color: 'var(--text)' }}>
              {secI.execution_steps.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Action Plan Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <label className="dp-field">
            <span className="dp-field-label">{t('Owner')}</span>
            <input className="dp-input" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!canWrite} />
          </label>
          <label className="dp-field">
            <span className="dp-field-label">{t('Target Deadline')}</span>
            <input type="date" className="dp-input" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!canWrite} />
          </label>
          <label className="dp-field">
            <span className="dp-field-label">{t('Tracking KPI')}</span>
            <input className="dp-input" value={trackingKpi} onChange={(e) => setTrackingKpi(e.target.value)} disabled={!canWrite} />
          </label>
          <label className="dp-field">
            <span className="dp-field-label">{t('Resources Needed')}</span>
            <input className="dp-input" value={resources} onChange={(e) => setResources(e.target.value)} disabled={!canWrite} />
          </label>
          <label className="dp-field">
            <span className="dp-field-label">{t('Success Criteria')}</span>
            <input className="dp-input" value={successCriteria} onChange={(e) => setSuccessCriteria(e.target.value)} disabled={!canWrite} />
          </label>
          <label className="dp-field">
            <span className="dp-field-label">{t('Stop / Revert Criteria')}</span>
            <input className="dp-input" value={stopCriteria} onChange={(e) => setStopCriteria(e.target.value)} disabled={!canWrite} />
          </label>
        </div>

        <label className="dp-field text-xs">
          <span className="dp-field-label">{t('Decision / Audit Rationale Comment')}</span>
          <textarea
            rows={2}
            className="dp-input"
            value={workflowComment}
            onChange={(e) => setWorkflowComment(e.target.value)}
            placeholder={t('Enter review notes, approval justification, or implementation details (logged immutably)…')}
            disabled={!canWrite}
          />
        </label>

        {!canWrite && (
          <div className="text-xs flex items-center gap-2 rounded-lg border px-3 py-2" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <AlertCircle size={14} />
            <span>{t('Viewer role has read-only access. Sign in as Analyst or Admin to execute workflow decisions.')}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <Button
            variant="primary"
            disabled={!canWrite || actionMutation.isPending || secA.status === 'approved' || secA.status === 'implemented'}
            onClick={() => actionMutation.mutate('approve')}
          >
            <Check size={14} />
            <span>{t('Approve')}</span>
          </Button>
          <Button
            variant="outline"
            disabled={!canWrite || actionMutation.isPending}
            onClick={() => actionMutation.mutate('request_review')}
          >
            <Eye size={14} />
            <span>{t('Request Review')}</span>
          </Button>
          <Button
            variant="primary"
            disabled={!canWrite || actionMutation.isPending || secA.status !== 'approved'}
            onClick={() => actionMutation.mutate('mark_implemented')}
            title={secA.status !== 'approved' ? t('Approve the recommendation first before marking as implemented.') : undefined}
          >
            <CheckCircle2 size={14} />
            <span>{t('Mark Implemented')}</span>
          </Button>
          <Button
            variant="danger"
            disabled={!canWrite || actionMutation.isPending || secA.status === 'rejected' || secA.status === 'implemented'}
            onClick={() => actionMutation.mutate('reject')}
          >
            <X size={14} />
            <span>{t('Reject')}</span>
          </Button>
          <Button
            variant="outline"
            disabled={!canWrite || actionMutation.isPending}
            onClick={() => actionMutation.mutate('update_plan')}
          >
            <Send size={14} />
            <span>{t('Save Plan / Add Comment')}</span>
          </Button>
        </div>

        {/* Post-Implementation Outcome Recorder */}
        <div
          className="rounded-xl border p-4 space-y-4"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={16} style={{ color: 'var(--primary)' }} />
              <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--heading)' }}>
                {t('Post-Implementation Outcome Evaluation (Closed-Loop Feedback)')}
              </h4>
            </div>
            <Pill tone={secI.latest_outcome.evaluation_status === 'successful' ? 'success' : secI.latest_outcome.evaluation_status === 'unsuccessful' ? 'critical' : 'muted'}>
              LATEST OUTCOME: {secI.latest_outcome.evaluation_status.toUpperCase()}
            </Pill>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <label className="dp-field">
              <span className="dp-field-label">{t('Outcome Result')}</span>
              <select
                className="dp-select"
                value={evalStatus}
                onChange={(e) => setEvalStatus(e.target.value as typeof evalStatus)}
                disabled={!canWrite}
              >
                <option value="successful">{t('Successful (Target Met)')}</option>
                <option value="unsuccessful">{t('Unsuccessful (Target Missed)')}</option>
                <option value="inconclusive">{t('Inconclusive / Mixed')}</option>
                <option value="not_evaluated">{t('Not Evaluated')}</option>
              </select>
            </label>
            <label className="dp-field sm:col-span-2">
              <span className="dp-field-label">{t('Evaluated KPI Name')}</span>
              <input className="dp-input" value={kpiName} onChange={(e) => setKpiName(e.target.value)} disabled={!canWrite} />
            </label>
            <label className="dp-field">
              <span className="dp-field-label">{t('Baseline Value')}</span>
              <input type="number" step="any" className="dp-input" value={baselineVal} onChange={(e) => setBaselineVal(e.target.value)} disabled={!canWrite} />
            </label>
            <label className="dp-field">
              <span className="dp-field-label">{t('Target Value')}</span>
              <input type="number" step="any" className="dp-input" value={targetVal} onChange={(e) => setTargetVal(e.target.value)} disabled={!canWrite} />
            </label>
            <label className="dp-field">
              <span className="dp-field-label">{t('Observed Value')}</span>
              <input type="number" step="any" className="dp-input" value={observedVal} onChange={(e) => setObservedVal(e.target.value)} disabled={!canWrite} />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="dp-field">
              <span className="dp-field-label">{t('Observation Window (Days)')}</span>
              <input type="number" min={1} max={365} className="dp-input" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} disabled={!canWrite} />
            </label>
            <label className="dp-field sm:col-span-2">
              <span className="dp-field-label">{t('Evaluation Methodology & Notes')}</span>
              <input
                className="dp-input"
                value={methodology}
                onChange={(e) => setMethodology(e.target.value)}
                disabled={!canWrite}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              className="dp-input flex-1 min-w-[240px] text-xs"
              placeholder={t('Outcome summary observations…')}
              value={evalNotes}
              onChange={(e) => setEvalNotes(e.target.value)}
              disabled={!canWrite}
            />
            <Button
              variant="primary"
              disabled={!canWrite || outcomeMutation.isPending || !kpiName.trim()}
              onClick={() => outcomeMutation.mutate()}
            >
              <span>{t('Record Post-Impl Outcome')}</span>
            </Button>
          </div>
        </div>

        {/* History Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <h4 className="font-bold uppercase tracking-wider" style={{ color: 'var(--heading)' }}>
              {t('Action History')} ({secI.action_history.length})
            </h4>
            {secI.action_history.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>{t('No workflow actions recorded yet.')}</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {secI.action_history.map((a) => (
                  <div key={a.id} className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                    <div className="flex justify-between font-semibold" style={{ color: 'var(--heading)' }}>
                      <span>{a.action_type.toUpperCase()} ({a.previous_status} → {a.new_status})</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {a.occurred_at ? new Date(a.occurred_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-GB') : ''}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {t('Actor')}: {a.actor} ({a.actor_role}) {a.comment ? `· "${a.comment}"` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <h4 className="font-bold uppercase tracking-wider" style={{ color: 'var(--heading)' }}>
              {t('Post-Implementation Outcomes')} ({secI.outcome_history.length})
            </h4>
            {secI.outcome_history.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>{t('Chưa đánh giá hiệu quả hậu triển khai.')}</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {secI.outcome_history.map((o, idx) => (
                  <div key={o.id || idx} className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                    <div className="flex justify-between font-semibold" style={{ color: 'var(--heading)' }}>
                      <span>{o.kpi_name} — {o.evaluation_status.toUpperCase()}</span>
                      {o.observed_delta_pct != null && <span>{o.observed_delta_pct >= 0 ? '+' : ''}{o.observed_delta_pct}%</span>}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Base: {o.baseline_value ?? '—'} · Target: {o.target_value ?? '—'} · Observed: {o.observed_value ?? '—'}
                    </div>
                    {o.notes && <p className="mt-0.5" style={{ color: 'var(--text)' }}>{o.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 14-STEP DECISION TRACE DRAWER */}
      {traceOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="14-Step Decision Audit Trace"
          className="fixed inset-0 z-[90] flex justify-end"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
          onClick={() => setTraceOpen(false)}
        >
          <div
            data-testid="decision-trace-drawer"
            className="w-full max-w-xl h-full overflow-y-auto border-l p-6 space-y-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <Layers size={18} style={{ color: 'var(--primary)' }} />
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                    {t('14-Step End-to-End Decision Trace')}
                  </h3>
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {d.rec_key} · Dataset {d.dataset_id}
                  </span>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setTraceOpen(false)}>
                <X size={16} />
              </Button>
            </div>

            {traceQuery.isLoading && <Loading />}
            {traceQuery.error && <ErrorState error={traceQuery.error} />}
            {traceQuery.data && (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <Link
                    to={traceQuery.data.knowledge_map_url || '/knowledge-map'}
                    className="inline-flex items-center gap-1.5 font-semibold hover:underline"
                    style={{ color: 'var(--primary-text)' }}
                  >
                    <GitBranch size={14} />
                    <span>{t('Inspect Pipeline Graph in Enterprise Knowledge Map')}</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

                {traceQuery.data.steps.map((st) => (
                  <div
                    key={st.step}
                    className="rounded-xl border p-3 text-xs space-y-1"
                    style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold" style={{ color: 'var(--primary-text)' }}>
                        Step {st.step}: {language === 'vi' ? st.stage_vi : st.stage}
                      </span>
                    </div>
                    <div className="font-semibold" style={{ color: 'var(--heading)' }}>
                      {st.value}
                    </div>
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
