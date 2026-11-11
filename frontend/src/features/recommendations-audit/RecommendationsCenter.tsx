import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  Database,
  FileSearch,
  Filter,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  type Audit,
  type Dataset,
  type Session,
  type XAIRecommendationSummary,
  decimal,
  getActiveCompanyId,
  getActiveCurrency,
  getRecommendationsOverview,
  integer,
  label,
  moneyCompact,
  params,
  percent,
  request,
} from '../../api'
import { AllocationDonutCard } from '../../components/charts/AllocationDonutCard'
import { ENTERPRISE_DONUT_PALETTE, type DonutSegmentItem } from '../../components/charts/dashboardDonuts'
import { useT } from '../../preferences'
import {
  Button,
  Card,
  ConfirmDialog,
  Empty,
  ErrorState,
  FilterBar,
  KPIStatCard,
  Loading,
  PageHeader,
  Pill,
  SectionHeader,
  Table,
  useToast,
} from '../../ui'

function statusTone(status: string): string {
  if (status === 'approved' || status === 'implemented' || status === 'accepted') return 'success'
  if (status === 'rejected') return 'critical'
  if (status === 'review_requested') return 'high'
  return 'muted'
}

function confidenceTone(level: string): string {
  if (level === 'High') return 'success'
  if (level === 'Medium') return 'medium'
  if (level === 'Low') return 'high'
  return 'critical'
}

export function RecommendationsCenter({ dataset }: { dataset?: Dataset }) {
  const { t, language } = useT()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const companyId = getActiveCompanyId()
  const currencyCode = dataset?.currency || getActiveCurrency()

  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Session>('/session') })

  const overview = useQuery({
    queryKey: ['recommendations-overview', companyId, dataset?.dataset_id],
    queryFn: () => getRecommendationsOverview(),
  })

  const [auditBefore, setAuditBefore] = useState<string | undefined>()
  const audit = useQuery({
    queryKey: ['audit', companyId, dataset?.dataset_id, auditBefore],
    queryFn: () =>
      request<{ rows: Audit[]; next_before: number | null }>(
        '/audit?' + params({ kind: 'decisions', before: auditBefore })
      ),
  })

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [confidenceFilter, setConfidenceFilter] = useState('all')

  const [confirmState, setConfirmState] = useState<{
    row: XAIRecommendationSummary
    decision: 'accepted' | 'rejected'
  } | null>(null)

  const feedback = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      request('/recommendations/feedback', {
        recommendation_id: id,
        decision,
        dataset_id: overview.data?.dataset_id || dataset?.dataset_id,
      }),
    onSuccess: (_res, vars) => {
      setConfirmState(null)
      notify({
        tone: vars.decision === 'accepted' ? 'success' : 'info',
        title: t('Recommendation decision saved'),
        description: `Status: ${vars.decision.toUpperCase()} · ${t('Logged to the cryptographic append-only decision audit trail.')}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['recommendations'] })
      void queryClient.invalidateQueries({ queryKey: ['recommendations-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['recommendation-detail'] })
      void queryClient.invalidateQueries({ queryKey: ['audit-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (err) => {
      notify({
        tone: 'danger',
        title: t('Failed to record decision'),
        description: err.message,
      })
    },
  })

  const allRows = overview.data?.rows || []
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows.filter((row) => {
      const matchCategory = categoryFilter === 'all' || row.category_code === categoryFilter
      const matchPriority =
        priorityFilter === 'all' ||
        (priorityFilter === 'critical_high'
          ? row.priority === 'critical' || row.priority === 'high'
          : row.priority === priorityFilter)
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'accepted' ? row.decision === 'accepted' : row.workflow_status === statusFilter)
      const matchConfidence = confidenceFilter === 'all' || row.confidence_level === confidenceFilter
      const matchSearch =
        !q ||
        row.title.toLowerCase().includes(q) ||
        row.context.toLowerCase().includes(q) ||
        row.action.toLowerCase().includes(q) ||
        row.rec_key.toLowerCase().includes(q)
      return matchCategory && matchPriority && matchStatus && matchConfidence && matchSearch
    })
  }, [allRows, search, categoryFilter, priorityFilter, statusFilter, confidenceFilter])

  const kpis = overview.data?.kpis
  const charts = overview.data?.charts

  const buildDonutItems = (slices?: { key: string; label: string; label_vi?: string; count: number; share: number }[]): DonutSegmentItem[] =>
    (slices || []).map((s, idx) => ({
      id: s.key,
      name: language === 'vi' && s.label_vi ? s.label_vi : s.label,
      value: s.count,
      color: ENTERPRISE_DONUT_PALETTE[idx % ENTERPRISE_DONUT_PALETTE.length],
      details: [
        { label: t('Count'), value: integer(s.count), highlight: true },
        { label: t('Share'), value: percent(s.share) },
      ],
    }))

  const categorySlices = charts?.by_category || []
  const statusSlices = charts?.by_status || []
  const prioritySlices = charts?.by_priority || []
  const confidenceSlices = charts?.by_confidence || []

  const auditEvents = (audit.data?.rows || []).filter(
    (r) => r.kind.endsWith('_feedback') || r.kind.startsWith('recommendation_')
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ENTERPRISE EXPLAINABLE AI DECISION INTELLIGENCE"
        title="Recommendations & Decision Intelligence"
        subtitle="Inspect machine learning & anomaly evidence, TreeSHAP feature attribution, confidence factors, counterfactual sweeps, and approve governed actions with cryptographic audit logging."
        aside={
          <Link
            to="/audit"
            className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-[var(--surface-muted)]"
            style={{
              borderColor: 'var(--primary-border)',
              background: 'var(--surface)',
              color: 'var(--primary-text)',
            }}
          >
            <ShieldCheck size={15} />
            <span>{t('Open Audit & Governance Center')}</span>
            <ArrowRight size={13} />
          </Link>
        }
      />

      <ErrorState
        error={overview.error || feedback.error}
        retry={overview.error ? () => void overview.refetch() : undefined}
      />
      {overview.isLoading && <Loading />}

      {!overview.isLoading && overview.data?.empty_workspace && (
        <Card data-testid="recs-empty-state" className="p-6 space-y-3">
          <SectionHeader
            title="No Dataset Imported Yet"
            detail="Explainable AI recommendations require verified business transactions, inventory, or marketing records."
          />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('This company workspace currently contains zero active datasets. Upload CSV/XLSX business records or run Ingestion to generate strictly grounded XAI recommendations.')}
          </p>
          <div>
            <Link
              to="/data-sources"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white"
              style={{ background: 'var(--primary)' }}
            >
              <span>{t('Go to Data Sources')}</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </Card>
      )}

      {!overview.isLoading && overview.data && !overview.data.empty_workspace && (
        <>
          {/* 8 Enterprise Governance & Post-Impl KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <KPIStatCard title={t('Total Recs')} value={integer(kpis?.total_recommendations)} />
            <KPIStatCard title={t('New')} value={integer(kpis?.new_count)} />
            <KPIStatCard title={t('Pending Review')} value={integer(kpis?.pending_review_count)} />
            <KPIStatCard title={t('Approved')} value={integer(kpis?.approved_count)} />
            <KPIStatCard title={t('Implemented')} value={integer(kpis?.implemented_count)} />
            <KPIStatCard title={t('Rejected')} value={integer(kpis?.rejected_count)} />
            <KPIStatCard
              title={t('% Sufficient Evidence')}
              value={kpis?.sufficient_evidence_pct != null ? `${kpis.sufficient_evidence_pct}%` : '—'}
            />
            <KPIStatCard
              title={t('% Post-Impl Effective')}
              value={
                kpis?.evaluated_implemented_count && kpis.post_impl_effective_pct != null
                  ? `${kpis.post_impl_effective_pct}%`
                  : t('Chưa đánh giá')
              }
              subtitle={
                kpis?.evaluated_implemented_count
                  ? `${kpis.evaluated_implemented_count} evaluated`
                  : t('Separate from Implemented')
              }
            />
          </div>

          {/* 4 Mandatory Overview Donut Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AllocationDonutCard
              title={t('Recommendations by Category')}
              detail={t('7 enterprise domains (Sales, Cost, Marketing, Customer, Inventory, Ops, Risk)')}
              items={buildDonutItems(categorySlices)}
              formatValue={integer}
              centerLabel={t('Active Recs')}
              emptyText={t('No recommendations in current dataset.')}
              source={`XAI Sync · Inactive categories: ${categorySlices.filter((c) => c.count === 0).map((c) => (language === 'vi' && c.label_vi ? c.label_vi : c.label)).join(', ') || 'None'}`}
            />

            <AllocationDonutCard
              title={t('Recommendations by Workflow Status')}
              detail={t('Pending, Review Requested, Approved, Implemented, Rejected, Expired')}
              items={buildDonutItems(statusSlices)}
              formatValue={integer}
              centerLabel={t('Status')}
              emptyText={t('No recommendations in current dataset.')}
              source="Workflow state machine · Implemented != Successful"
            />

            <AllocationDonutCard
              title={t('Recommendations by Priority')}
              detail={t('Critical, High, Medium and Low severity triage')}
              items={buildDonutItems(prioritySlices)}
              formatValue={integer}
              centerLabel={t('Triage')}
              emptyText={t('No recommendations in current dataset.')}
              palette={['#DC2626', '#EA580C', '#D97706', '#2563EB']}
            />

            <AllocationDonutCard
              title={t('Recommendations by Confidence Level')}
              detail={t('High, Medium, Low & Insufficient Evidence (Uncalibrated multi-factor index)')}
              items={buildDonutItems(confidenceSlices)}
              formatValue={integer}
              centerLabel={t('Confidence')}
              emptyText={t('No recommendations in current dataset.')}
              palette={['#059669', '#2563EB', '#EA580C', '#DC2626']}
            />
          </div>

          {/* Multi-Filter Toolbar */}
          <FilterBar>
            <div className="flex flex-wrap items-center gap-2.5 w-full">
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                <Filter size={14} />
                <span>{t('Filter')}:</span>
              </div>

              <input
                type="search"
                aria-label="Search recommendations"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search title, SKU, channel, ID…')}
                className="dp-input max-w-[230px]"
              />

              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="dp-select"
              >
                <option value="all">{t('All categories')}</option>
                {categorySlices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {language === 'vi' && c.label_vi ? c.label_vi : c.label} ({c.count})
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by workflow status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="dp-select"
              >
                <option value="all">{t('All statuses')}</option>
                <option value="pending">{t('Pending')}</option>
                <option value="review_requested">{t('Review Requested')}</option>
                <option value="approved">{t('Approved')}</option>
                <option value="accepted">{t('Accepted (Approved/Implemented)')}</option>
                <option value="implemented">{t('Implemented')}</option>
                <option value="rejected">{t('Rejected')}</option>
              </select>

              <select
                aria-label="Filter by confidence level"
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value)}
                className="dp-select"
              >
                <option value="all">{t('All confidence levels')}</option>
                {confidenceSlices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {language === 'vi' && c.label_vi ? c.label_vi : c.label} ({c.count})
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-1 ml-auto">
                {[
                  ['all', 'All'],
                  ['critical_high', 'Critical & High'],
                  ['medium', 'Medium'],
                  ['low', 'Low'],
                ].map(([key, lbl]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={priorityFilter === key ? 'primary' : 'outline'}
                    onClick={() => setPriorityFilter(key)}
                  >
                    {t(lbl)}
                  </Button>
                ))}
              </div>
            </div>
          </FilterBar>

          {allRows.length === 0 && <Empty text="No active recommendations for the current snapshot." />}
          {allRows.length > 0 && filteredRows.length === 0 && (
            <Empty text="No recommendations match the current filters." />
          )}

          {/* Recommendation Decision Cards */}
          <div className="space-y-4">
            {filteredRows.map((row) => (
              <Card key={row.id} className="space-y-4" data-testid={`rec-card-${row.id}`}>
                <SectionHeader
                  title={row.title}
                  detail={row.context}
                  aside={
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Pill tone="muted">{row.category_label}</Pill>
                      <Pill tone={row.priority}>{row.priority.toUpperCase()}</Pill>
                      <Pill tone={confidenceTone(row.confidence_level)}>
                        {row.confidence_level}
                        {row.confidence_score != null ? ` (${Math.round(row.confidence_score)}/100)` : ''}
                      </Pill>
                      <Pill tone={row.shap_available ? 'success' : 'muted'}>
                        <Sparkles size={11} className="inline mr-1" />
                        {row.shap_available ? 'TreeSHAP' : 'Rule / Stats'}
                      </Pill>
                      <Pill tone={statusTone(row.decision)}>STATUS: {row.decision.toUpperCase()}</Pill>
                      {row.workflow_status === 'implemented' && (
                        <Pill tone="success">IMPLEMENTED · OUTCOME: {(row.outcome_status || 'not_evaluated').toUpperCase()}</Pill>
                      )}
                      {row.workflow_status === 'review_requested' && (
                        <Pill tone="high">REVIEW REQUESTED</Pill>
                      )}
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
                          {label(currencyCode === 'VND' ? k : k.replace(/_vnd$/, ''))}
                        </span>
                        <strong className="text-sm font-bold tabular-nums mt-0.5 block" style={{ color: 'var(--heading)' }}>
                          {k.endsWith('vnd') || k.includes('profit') || k.includes('revenue') || k.includes('spend') || k === 'purchase_commitment'
                            ? moneyCompact(val, currencyCode)
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

                  {row.tracking_kpi && (
                    <div
                      className="rounded-lg border p-3"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                      <span className="block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
                        {t('Tracking KPI')}
                      </span>
                      <strong className="text-xs font-semibold mt-0.5 block" style={{ color: 'var(--heading)' }}>
                        {row.tracking_kpi}
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

                <div className="pt-2 border-t flex items-center gap-2.5 flex-wrap" style={{ borderColor: 'var(--border)' }}>
                  <Link
                    to={`/recommendations/${encodeURIComponent(row.id)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors hover:brightness-95"
                    style={{
                      background: 'var(--primary-soft)',
                      borderColor: 'var(--primary-border)',
                      color: 'var(--primary-text)',
                    }}
                  >
                    <FileSearch size={14} />
                    <span>{t('Inspect XAI Detail (A–I)')}</span>
                    <ArrowRight size={13} />
                  </Link>

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
                      feedback.isPending ||
                      row.decision === 'rejected' ||
                      row.workflow_status === 'implemented' ||
                      !session.data ||
                      session.data.role === 'viewer'
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
        </>
      )}

      {/* Decision Audit Trail (preserved for inline workflow visibility & E2E) */}
      <Card>
        <SectionHeader
          title="Decision Audit Trail"
          detail="Append-only record of executive human decisions. Times in Asia/Ho_Chi_Minh (UTC+7)"
          aside={
            <div className="flex items-center gap-2">
              <Link
                to="/audit"
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--primary-text)' }}
              >
                {t('Open Full Audit Center')}
              </Link>
              <Database size={16} style={{ color: 'var(--primary)' }} />
            </div>
          }
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
              decision: String(r.payload.decision || r.payload.new_status || r.payload.evaluation_status || 'recorded'),
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

