import { useState } from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, FileText, Info, RefreshCw, Sparkles } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  compact,
  decimal,
  moneyCompact,
  type Scenario,
  type TwinAIModelInfo,
  type TwinEdge,
  type TwinNode,
  type TwinRecommendation,
  type TwinSimulationEvent,
  type TwinSimulationResult,
  type TwinSimulationRun,
  type TwinZone,
} from '../../../api'
import { Button, ErrorState, Pill } from '../../../ui'
import { RecommendationsTab } from './tabs/RecommendationsTab'

export type RightInspectorTab = 'inspector' | 'charts' | 'recommendations'

interface TwinRightInspectorProps {
  activeTab: RightInspectorTab
  onChangeTab: (t: RightInspectorTab) => void
  currency: string
  zones: TwinZone[]
  nodes: TwinNode[]
  edges: TwinEdge[]
  aiModels: TwinAIModelInfo[]
  selectedZoneId: string | null
  selectedNodeId: string | null
  selectedEdgeId: string | null
  activeRun: TwinSimulationRun | null
  results: TwinSimulationResult[]
  events: TwinSimulationEvent[]
  activeStepIndex: number
  onStepSelect: (idx: number) => void
  onRetryRun: (runId: string) => void
  onCancelRun: (runId: string) => void
  onGenerateRecommendation: (lang: 'en' | 'vi', customFocus?: string) => void
  isGeneratingRec: boolean
  recError?: Error | null
  legacyScenarioData?: Scenario | null
  legacySimPending?: boolean
  legacyRecId?: string
  canEdit: boolean
}

export function TwinRightInspector({
  activeTab,
  onChangeTab,
  currency,
  zones,
  nodes,
  edges,
  aiModels,
  selectedZoneId,
  selectedNodeId,
  selectedEdgeId,
  activeRun,
  results,
  events,
  activeStepIndex,
  onStepSelect,
  onRetryRun,
  onCancelRun,
  onGenerateRecommendation,
  isGeneratingRec,
  recError,
  legacyScenarioData,
  legacySimPending,
  legacyRecId,
  canEdit,
}: TwinRightInspectorProps) {
  const [recLang, setRecLang] = useState<'en' | 'vi'>('en')
  const [customFocus, setCustomFocus] = useState('')

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) || null
  const selectedModel = selectedNode ? aiModels.find((m) => m.id === selectedNode.id) : null

  const formatMetric = (val: number | null, unit: string) => {
    if (val == null) return 'Unavailable'
    if (unit === currency || ['VND', 'USD', 'EUR', 'GBP'].includes(unit)) return moneyCompact(val, unit)
    if (unit === '%') return `${val.toFixed(1)}%`
    if (unit === 'x') return `${val.toFixed(2)}x`
    return decimal(val)
  }

  const chartData = results
    .filter((r) => ['revenue_forecast', 'profit_forecast', 'cost_forecast', 'marketing_spend'].includes(r.metric_name))
    .map((r) => ({
      name: r.label.replace(' Forecast', '').replace(' (Contribution / Net)', '').replace(' (COGS)', ''),
      Baseline: r.baseline_value ?? 0,
      Scenario: r.scenario_value ?? 0,
    }))

  const rec: TwinRecommendation | null = activeRun?.recommendation ?? null

  return (
    <div
      className="dp-surface p-3.5 space-y-3 h-full flex flex-col"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      data-testid="twin-right-inspector"
    >
      {/* Navigation Buttons (using exact button role so E2E 'AI Recommendations' exact match works cleanly!) */}
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onChangeTab('inspector')}
          className="px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
          style={{
            background: activeTab === 'inspector' ? 'var(--primary)' : 'var(--surface-muted)',
            color: activeTab === 'inspector' ? '#fff' : 'var(--heading)',
            borderColor: activeTab === 'inspector' ? 'var(--primary)' : 'var(--border)',
          }}
        >
          Inspector
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('charts')}
          className="px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
          style={{
            background: activeTab === 'charts' ? 'var(--primary)' : 'var(--surface-muted)',
            color: activeTab === 'charts' ? '#fff' : 'var(--heading)',
            borderColor: activeTab === 'charts' ? 'var(--primary)' : 'var(--border)',
          }}
        >
          Charts &amp; Flow
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('recommendations')}
          className="px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
          style={{
            background: activeTab === 'recommendations' ? 'var(--primary)' : 'var(--surface-muted)',
            color: activeTab === 'recommendations' ? '#fff' : 'var(--heading)',
            borderColor: activeTab === 'recommendations' ? 'var(--primary)' : 'var(--border)',
          }}
        >
          AI Recommendations
        </button>
      </div>

      {/* TAB 1: Selected 3D Zone / Node / Edge Inspector & Simulation Outcome Table */}
      {activeTab === 'inspector' && (
        <div className="space-y-3 text-xs overflow-y-auto pr-1 max-h-[540px]">
          {/* Active Run Failed / Running Control Banner */}
          {activeRun && (activeRun.status === 'failed' || activeRun.status === 'cancelled') && (
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)', color: 'var(--danger-text)' }}
            >
              <div className="flex items-center justify-between">
                <strong>Run {activeRun.status.toUpperCase()}</strong>
                {canEdit && (
                  <Button size="sm" variant="primary" onClick={() => onRetryRun(activeRun.id)}>
                    <RefreshCw size={12} />
                    <span>Retry Run</span>
                  </Button>
                )}
              </div>
              {activeRun.error_details && <div className="text-[11px]">{activeRun.error_details}</div>}
            </div>
          )}

          {activeRun && ['preparing', 'queued', 'running'].includes(activeRun.status) && canEdit && (
            <div className="rounded-xl border p-2.5 flex items-center justify-between" style={{ background: 'var(--info-bg)', borderColor: 'var(--info-border)' }}>
              <span className="font-medium" style={{ color: 'var(--info-text)' }}>
                Simulation currently {activeRun.status}…
              </span>
              <Button size="sm" variant="danger" onClick={() => onCancelRun(activeRun.id)}>
                Cancel
              </Button>
            </div>
          )}

          {/* Selected 3D Object Card */}
          {(selectedEdge || selectedNode || selectedZone) && (
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--primary-border)' }}
              data-testid="twin-selection-detail"
            >
              <div className="flex items-center justify-between gap-2">
                <strong style={{ color: 'var(--heading)' }}>
                  {selectedEdge
                    ? `Flow Edge: ${selectedEdge.label}`
                    : selectedNode
                    ? `Node: ${selectedNode.label}`
                    : selectedZone?.name}
                </strong>
                <Pill tone="accent">
                  {selectedEdge ? 'DATA FLOW' : selectedNode ? selectedNode.kind.toUpperCase() : 'ZONE'}
                </Pill>
              </div>

              {selectedModel && (
                <div className="rounded-lg border p-2 text-[11px] space-y-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="flex justify-between">
                    <span className="font-semibold">Model Status:</span>
                    <Pill tone={selectedModel.status === 'integrated' ? 'success' : selectedModel.status === 'not_integrated' ? 'critical' : 'warning'}>
                      {selectedModel.status.replaceAll('_', ' ').toUpperCase()}
                    </Pill>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>{selectedModel.note}</div>
                </div>
              )}

              {selectedEdge && (
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Route: <span className="font-mono">{selectedEdge.source}</span> → <span className="font-mono">{selectedEdge.target}</span>
                </div>
              )}

              {selectedZone && (
                <div className="space-y-1.5">
                  <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {selectedZone.description}
                  </div>
                  {selectedZone.baseline?.missing_reason && (
                    <div
                      className="rounded-lg border p-2 text-[10px]"
                      style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--warning-text)' }}
                    >
                      {selectedZone.baseline.missing_reason}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {Object.entries(selectedZone.baseline?.metrics || {})
                      .filter(([, v]) => typeof v !== 'object' || v === null)
                      .slice(0, 6)
                      .map(([k, v]) => (
                        <div
                          key={k}
                          className="rounded border px-2 py-1"
                          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                        >
                          <div className="text-[9px] uppercase truncate" style={{ color: 'var(--text-secondary)' }}>
                            {k.replaceAll('_', ' ')}
                          </div>
                          <div className="font-bold tabular-nums text-[11px]" style={{ color: 'var(--heading)' }}>
                            {v == null ? 'Unavailable' : typeof v === 'number' ? compact(v) : String(v)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scenario Outcome Comparison Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <strong style={{ color: 'var(--heading)' }}>Simulation Outcomes vs Baseline</strong>
              {results.length > 0 && <Pill tone="success">{results.length} metrics</Pill>}
            </div>

            {results.length === 0 && (
              <div className="rounded-xl border p-3 text-[11px]" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                Execute a simulation run to inspect quantitative Baseline vs Scenario deltas and uncertainty intervals.
              </div>
            )}

            <div className="space-y-1.5" data-testid="twin-results-list">
              {results.map((r) => {
                const posPct = r.pct_difference != null && r.pct_difference > 0
                const negPct = r.pct_difference != null && r.pct_difference < 0
                const isRisk = r.metric_name === 'inventory_risk_units' || r.metric_name === 'cost_forecast'
                const goodDelta = isRisk ? negPct : posPct
                return (
                  <div
                    key={r.metric_name}
                    className="rounded-xl border p-2.5 space-y-1"
                    style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[11px]" style={{ color: 'var(--heading)' }}>
                        {r.label}
                      </span>
                      {r.pct_difference != null && (
                        <Pill tone={goodDelta ? 'success' : negPct || (isRisk && posPct) ? 'warning' : 'muted'}>
                          {r.pct_difference > 0 ? '+' : ''}
                          {r.pct_difference.toFixed(2)}%
                        </Pill>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums">
                      <div>
                        <span className="block text-[9px]" style={{ color: 'var(--text-secondary)' }}>Baseline</span>
                        <strong>{formatMetric(r.baseline_value, r.unit)}</strong>
                      </div>
                      <div>
                        <span className="block text-[9px]" style={{ color: 'var(--text-secondary)' }}>Scenario</span>
                        <strong style={{ color: 'var(--primary-text)' }}>{formatMetric(r.scenario_value, r.unit)}</strong>
                      </div>
                      <div>
                        <span className="block text-[9px]" style={{ color: 'var(--text-secondary)' }}>Delta</span>
                        <strong>{r.abs_difference != null ? formatMetric(r.abs_difference, r.unit) : '—'}</strong>
                      </div>
                    </div>
                    {r.uncertainty_metadata?.is_available && (
                      <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        90% Band: [{formatMetric(r.uncertainty_metadata.interval_lower, r.unit)} ..{' '}
                        {formatMetric(r.uncertainty_metadata.interval_upper, r.unit)}]
                      </div>
                    )}
                    <div className="text-[9.5px]" style={{ color: 'var(--text-secondary)' }}>
                      {r.evidence_references?.model_name} ({r.evidence_references?.model_version})
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Honest Warnings & Explicit Assumptions */}
          {activeRun && (activeRun.warnings.length > 0 || activeRun.assumptions.length > 0) && (
            <div className="space-y-2 pt-1">
              {activeRun.warnings.map((w, i) => (
                <div
                  key={`w-${i}`}
                  className="rounded-lg border p-2 flex items-start gap-2 text-[11px]"
                  style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--warning-text)' }}
                >
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
              {activeRun.assumptions.length > 0 && (
                <details
                  className="rounded-lg border p-2.5 text-[11px]"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                >
                  <summary className="cursor-pointer font-semibold" style={{ color: 'var(--heading)' }}>
                    Model Assumptions &amp; Limitations ({activeRun.assumptions.length})
                  </summary>
                  <ul className="mt-1.5 list-disc list-inside space-y-1" style={{ color: 'var(--text-secondary)' }}>
                    {activeRun.assumptions.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Charts & Chronological Flow Events */}
      {activeTab === 'charts' && (
        <div className="space-y-4 text-xs overflow-y-auto pr-1 max-h-[540px]">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--heading)' }}>
              <BarChart3 size={14} style={{ color: 'var(--primary)' }} />
              <span>Financial Comparison (Baseline vs Scenario)</span>
            </div>
            {chartData.length > 0 ? (
              <div className="h-[210px] w-full rounded-xl border p-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => compact(Number(v))} tick={{ fontSize: 10 }} width={52} />
                    <Tooltip formatter={(val: unknown) => moneyCompact(Number(val), currency)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Baseline" fill="#64748b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Scenario" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-xl border p-3 text-[11px]" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                Run simulation to plot Baseline vs Scenario financial bars.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="font-semibold" style={{ color: 'var(--heading)' }}>
              Chronological Flow Event Log ({events.length} steps)
            </div>
            {events.map((ev, idx) => {
              const active = idx === activeStepIndex
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onStepSelect(idx)}
                  className="w-full text-left rounded-lg border px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors"
                  style={{
                    background: active ? 'var(--primary-soft)' : 'var(--surface-muted)',
                    borderColor: active ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-[11px]" style={{ color: 'var(--heading)' }}>
                      #{ev.step_order} · {ev.event_type}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      Zone: {ev.zone_id || 'engine'} {ev.duration_ms != null ? `· ${ev.duration_ms} ms` : ''}
                    </div>
                  </div>
                  <Pill tone={ev.status === 'completed' ? 'success' : ev.status === 'degraded' || ev.status === 'warning' ? 'warning' : 'critical'}>
                    {ev.status}
                  </Pill>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Grounded AI Recommendation + Legacy Governance Decision Card */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4 text-xs overflow-y-auto pr-1 max-h-[540px]">
          {/* Digital Twin Grounded AI Recommendation Section */}
          <div
            className="rounded-xl border p-3 space-y-3"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--primary-border)' }}
            data-testid="twin-ai-recommendation-panel"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--heading)' }}>
                <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                <span>Grounded Simulation Decision Advisor</span>
              </div>
              <div className="flex items-center gap-1">
                {(['en', 'vi'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setRecLang(l)}
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border"
                    style={{
                      background: recLang === l ? 'var(--primary)' : 'var(--surface)',
                      color: recLang === l ? '#fff' : 'var(--heading)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Optional focus (e.g. margin guardrail, warehouse SLA)"
                value={customFocus}
                onChange={(e) => setCustomFocus(e.target.value)}
                className="dp-input py-1 text-xs flex-1"
              />
              <Button
                size="sm"
                variant="primary"
                disabled={!canEdit || !activeRun || activeRun.status !== 'completed' || isGeneratingRec}
                onClick={() => onGenerateRecommendation(recLang, customFocus.trim() || undefined)}
                data-testid="twin-generate-rec-btn"
              >
                <span>{isGeneratingRec ? 'Analyzing…' : 'Generate Advice'}</span>
              </Button>
            </div>

            <ErrorState error={recError} />

            {rec && (
              <div className="space-y-2.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                <div
                  className="rounded-lg border p-2.5 space-y-1"
                  style={{ background: 'var(--surface)', borderColor: 'var(--primary-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--primary-text)' }}>
                      Executive Recommendation
                    </span>
                    <Pill tone="info">{rec.synthesis_mode}</Pill>
                  </div>
                  <p className="font-semibold leading-relaxed" style={{ color: 'var(--heading)' }}>
                    {rec.recommendation}
                  </p>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {rec.summary}
                  </p>
                </div>

                {rec.risks.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-semibold flex items-center gap-1" style={{ color: 'var(--warning-text)' }}>
                      <AlertTriangle size={12} />
                      <span>Identified Risks &amp; Guardrails</span>
                    </div>
                    {rec.risks.map((rk, i) => (
                      <div key={i} className="text-[11px]" style={{ color: 'var(--text)' }}>
                        • {rk}
                      </div>
                    ))}
                  </div>
                )}

                {rec.citations.length > 0 ? (
                  <div className="space-y-1">
                    <div className="font-semibold flex items-center gap-1" style={{ color: 'var(--primary-text)' }}>
                      <FileText size={12} />
                      <span>Hybrid RAG Document Citations ({rec.citations.length})</span>
                    </div>
                    {rec.citations.map((c) => (
                      <div
                        key={c.citation_id}
                        className="rounded border p-2 text-[10.5px]"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        <strong>
                          [{c.citation_id}] {c.source_file}
                        </strong>
                        <p className="mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                          {c.snippet}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10.5px] flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <Info size={12} />
                    <span>No uploaded company policy/SOP documents matched in RAG; advice cites SQL + model outputs only.</span>
                  </div>
                )}

                <details className="text-[11px]">
                  <summary className="cursor-pointer font-semibold" style={{ color: 'var(--heading)' }}>
                    Disclosed Model Limitations ({rec.limitations.length})
                  </summary>
                  <ul className="mt-1 list-disc list-inside space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {rec.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>

          {/* Preserved Legacy Governance Card (Accept scenario / Reject scenario + E2E /recommendations?rec=... link) */}
          <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--heading)' }}>
              <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
              <span>Decision Governance Sign-Off</span>
            </div>
            <RecommendationsTab
              scenarioData={legacyScenarioData}
              key={legacyScenarioData?.simulation_id || 'legacy-empty'}
              recommendationId={legacyRecId}
              isSimulating={legacySimPending}
            />
          </div>
        </div>
      )}
    </div>
  )
}
