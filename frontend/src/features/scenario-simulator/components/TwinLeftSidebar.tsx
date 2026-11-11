import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cpu,
  Database,
  History,
  Layers,
  PlusCircle,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import type {
  TwinAIModelInfo,
  TwinDataReadiness,
  TwinScenario,
  TwinScenarioType,
  TwinSimulationRun,
  TwinZone,
} from '../../../api'
import { Button, Pill } from '../../../ui'

export type LeftSidebarTab = 'scenarios' | 'data' | 'variables' | 'departments' | 'models' | 'history'

interface TwinLeftSidebarProps {
  workspaceDatasetTitle?: string
  readiness: TwinDataReadiness
  zones: TwinZone[]
  aiModels: TwinAIModelInfo[]
  scenarios: TwinScenario[]
  recentRuns: TwinSimulationRun[]
  activeScenario: TwinScenario | null
  activeRunId?: string | null
  activeTab?: LeftSidebarTab
  onChangeTab?: (tab: LeftSidebarTab) => void
  variableDrafts: Record<string, { scenario_value: string; baseline_value: string }>
  onChangeVariableDraft: (name: string, field: 'scenario_value' | 'baseline_value', value: string) => void
  onSelectScenario: (id: string) => void
  onCreatePresetScenario: (stype: TwinScenarioType, title: string) => void
  onDeleteScenario: (id: string) => void
  onSelectZone: (zoneId: string) => void
  onSelectRun: (runId: string) => void
  onRefreshBaseline: () => void
  onApplyAndRun: () => void
  canEdit: boolean
  isRunning: boolean
}

const PRESETS: { type: TwinScenarioType; label: string; desc: string }[] = [
  { type: 'revenue_growth', label: 'Revenue Growth Strategy', desc: 'Marketing spend, pricing elasticity & demand expansion' },
  { type: 'marketing_optimization', label: 'Marketing Budget Reallocation', desc: 'Concave spend attribution & funnel sensitivity' },
  { type: 'pricing_strategy', label: 'Pricing & Margin Guardrail', desc: 'Price discount sweep constrained by gross margin' },
  { type: 'inventory_optimization', label: 'Inventory Replenishment', desc: 'Safety stock, PO quantity & stockout prevention' },
  { type: 'supply_chain_disruption', label: 'Supply Chain Disruption', desc: 'Extended supplier lead time & capacity shock test' },
  { type: 'customer_retention', label: 'Customer Retention Shift', desc: 'Cohort retention sensitivity (no ML classifier)' },
  { type: 'cost_reduction', label: 'Cost Efficiency & Opex', desc: 'Direct COGS reduction + optional overhead assumptions' },
]

export function TwinLeftSidebar({
  workspaceDatasetTitle,
  readiness,
  zones,
  aiModels,
  scenarios,
  recentRuns,
  activeScenario,
  activeRunId,
  activeTab: controlledTab,
  onChangeTab: onControlledTabChange,
  variableDrafts,
  onChangeVariableDraft,
  onSelectScenario,
  onCreatePresetScenario,
  onDeleteScenario,
  onSelectZone,
  onSelectRun,
  onRefreshBaseline,
  onApplyAndRun,
  canEdit,
  isRunning,
}: TwinLeftSidebarProps) {
  const [internalTab, setInternalTab] = useState<LeftSidebarTab>('variables')
  const tab = controlledTab ?? internalTab
  const setTab = (next: LeftSidebarTab) => {
    setInternalTab(next)
    onControlledTabChange?.(next)
  }

  const navTabs: { id: LeftSidebarTab; label: string; icon: typeof SlidersHorizontal }[] = [
    { id: 'scenarios', label: 'Scenarios', icon: Layers },
    { id: 'data', label: 'Data & Score', icon: Database },
    { id: 'variables', label: 'Variables', icon: SlidersHorizontal },
    { id: 'departments', label: 'Zones', icon: Boxes },
    { id: 'models', label: 'AI Models', icon: Cpu },
    { id: 'history', label: 'History', icon: History },
  ]

  const modelTone = (status: TwinAIModelInfo['status']) => {
    if (status === 'integrated') return 'success'
    if (status === 'partial' || status === 'degraded') return 'warning'
    return 'critical'
  }

  return (
    <div
      className="dp-surface p-3.5 space-y-3 h-full flex flex-col"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Compact 6-section tab grid */}
      <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Simulator Controls Navigation">
        {navTabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className="flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold border transition-colors"
              style={{
                background: active ? 'var(--primary)' : 'var(--surface-muted)',
                color: active ? '#fff' : 'var(--heading)',
                borderColor: active ? 'var(--primary)' : 'var(--border)',
              }}
            >
              <Icon size={12} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* SECTION A: Scenario Library */}
      {tab === 'scenarios' && (
        <div className="space-y-3 text-xs overflow-y-auto pr-1 max-h-[540px]">
          <div className="font-semibold" style={{ color: 'var(--heading)' }}>
            Saved &amp; Baseline Scenarios ({scenarios.length})
          </div>
          <div className="space-y-2">
            {scenarios.map((s) => {
              const selected = activeScenario?.id === s.id
              return (
                <div
                  key={s.id}
                  className="rounded-xl border p-2.5 space-y-1 transition-colors"
                  style={{
                    background: selected ? 'var(--primary-soft)' : 'var(--surface-muted)',
                    borderColor: selected ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectScenario(s.id)}
                      className="text-left font-semibold truncate flex-1 hover:underline"
                      style={{ color: 'var(--heading)' }}
                    >
                      {s.name}
                    </button>
                    <div className="flex items-center gap-1">
                      {s.is_baseline && <Pill tone="muted">BASELINE</Pill>}
                      {!s.is_baseline && canEdit && (
                        <button
                          type="button"
                          aria-label={`Delete scenario ${s.name}`}
                          onClick={() => onDeleteScenario(s.id)}
                          className="p-1 rounded hover:bg-red-100 text-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                    <span>{s.scenario_type.replaceAll('_', ' ')} · {s.horizon_days}d</span>
                    <span>Obj: {s.objective}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
            <div className="font-semibold" style={{ color: 'var(--heading)' }}>
              Quick Create What-if Preset
            </div>
            {PRESETS.map((p) => (
              <button
                key={p.type}
                type="button"
                disabled={!canEdit}
                onClick={() => onCreatePresetScenario(p.type, p.label)}
                className="w-full text-left rounded-lg border p-2 hover:border-[var(--primary)] transition-colors disabled:opacity-50"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between font-semibold text-[11px]" style={{ color: 'var(--primary-text)' }}>
                  <span>{p.label}</span>
                  <PlusCircle size={12} />
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {p.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SECTION B: Data Sources & Honest Readiness */}
      {tab === 'data' && (
        <div className="space-y-3 text-xs overflow-y-auto pr-1 max-h-[540px]" data-testid="twin-data-readiness-panel">
          <div
            className="rounded-xl border p-3 space-y-2"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: 'var(--heading)' }}>
                Data Readiness Score
              </span>
              <Pill tone={readiness.tier === 'high' ? 'success' : readiness.tier === 'moderate' ? 'warning' : 'critical'}>
                {readiness.score}/100 ({readiness.tier.toUpperCase()})
              </Pill>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, readiness.score))}%`,
                  background: readiness.tier === 'high' ? '#16A34A' : readiness.tier === 'moderate' ? '#D97706' : '#DC2626',
                }}
              />
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {readiness.disclaimer}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/data-sources"
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--surface-muted)]"
              style={{ borderColor: 'var(--primary-border)', color: 'var(--primary-text)' }}
            >
              <UploadCloud size={12} />
              <span>Upload CSV / XLSX / Multimodal</span>
            </Link>
            <Button size="sm" variant="outline" disabled={!canEdit} onClick={onRefreshBaseline}>
              <span>Rebuild Baseline</span>
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="font-semibold" style={{ color: 'var(--heading)' }}>
              Active Dataset: {workspaceDatasetTitle || 'None'} ({readiness.days_observed}d observed)
            </div>
            {readiness.checks.map((chk, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                {chk.passed ? (
                  <CheckCircle2 size={13} style={{ color: 'var(--success)' }} className="flex-shrink-0" />
                ) : (
                  <AlertTriangle size={13} style={{ color: 'var(--warning)' }} className="flex-shrink-0" />
                )}
                <span style={{ color: 'var(--text)' }}>{chk.name}</span>
              </div>
            ))}
          </div>

          {readiness.unsupported_reasons.length > 0 && (
            <div
              className="rounded-xl border p-2.5 space-y-1 text-[11px]"
              style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--warning-text)' }}
            >
              <strong className="block">Truthful Capability Disclosure:</strong>
              {readiness.unsupported_reasons.map((r, i) => (
                <div key={i}>• {r}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION C: Bounded Scenario Variables */}
      {tab === 'variables' && (
        <div className="space-y-3 text-xs overflow-y-auto pr-1 max-h-[540px]">
          <div className="flex items-center justify-between">
            <strong style={{ color: 'var(--heading)' }}>
              Scenario Levers ({activeScenario?.variables?.length || 0})
            </strong>
            {activeScenario?.is_baseline && <Pill tone="muted">LOCKED BASELINE</Pill>}
          </div>

          {(!activeScenario || activeScenario.variables.length === 0) && (
            <div
              className="rounded-xl border p-3 text-[11px]"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {activeScenario?.is_baseline
                ? 'The canonical Baseline Scenario mirrors observed historical SQL metrics. Switch to or create a What-if Scenario above to adjust pricing, marketing, supply chain, or demand levers.'
                : 'Select a What-if Scenario to configure input assumptions.'}
            </div>
          )}

          {activeScenario?.variables.map((v) => {
            const draft = variableDrafts[v.variable_name] ?? {
              scenario_value: v.scenario_value != null ? String(v.scenario_value) : '',
              baseline_value: v.baseline_value != null ? String(v.baseline_value) : '',
            }
            const parsed = draft.scenario_value === '' ? null : Number(draft.scenario_value)
            const outOfRange =
              parsed !== null &&
              !Number.isNaN(parsed) &&
              ((v.min_value != null && parsed < v.min_value) || (v.max_value != null && parsed > v.max_value))

            return (
              <div
                key={v.variable_name}
                className="rounded-xl border p-2.5 space-y-1.5"
                style={{
                  background: 'var(--surface-muted)',
                  borderColor: outOfRange ? '#DC2626' : 'var(--border)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={`twin-var-${v.variable_name}`}
                    className="font-semibold text-[11px]"
                    style={{ color: 'var(--heading)' }}
                  >
                    {v.label}
                  </label>
                  <Pill tone={v.supported ? 'info' : 'warning'}>{v.unit}</Pill>
                </div>

                {!v.supported && (
                  <div className="text-[10px]" style={{ color: 'var(--warning-text)' }}>
                    Missing baseline column — requires explicit operator baseline &amp; scenario input:
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Baseline
                    <input
                      type="number"
                      aria-label={`${v.label} baseline value`}
                      value={draft.baseline_value}
                      disabled={activeScenario.is_baseline || (v.supported && v.baseline_value != null) || !canEdit}
                      onChange={(e) => onChangeVariableDraft(v.variable_name, 'baseline_value', e.target.value)}
                      className="dp-input py-1 text-xs mt-0.5 disabled:opacity-65"
                    />
                  </label>
                  <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Scenario ({v.min_value ?? '—'}..{v.max_value ?? '—'})
                    <input
                      id={`twin-var-${v.variable_name}`}
                      type="number"
                      step={v.unit === 'ratio' || v.unit === 'elasticity' ? '0.05' : '1'}
                      min={v.min_value ?? undefined}
                      max={v.max_value ?? undefined}
                      value={draft.scenario_value}
                      disabled={activeScenario.is_baseline || !canEdit}
                      onChange={(e) => onChangeVariableDraft(v.variable_name, 'scenario_value', e.target.value)}
                      className="dp-input py-1 text-xs mt-0.5 font-semibold"
                    />
                  </label>
                </div>

                {v.min_value != null && v.max_value != null && !activeScenario.is_baseline && (
                  <input
                    type="range"
                    aria-label={`${v.label} slider`}
                    min={v.min_value}
                    max={Math.min(v.max_value, v.min_value + 5000)}
                    step={v.unit === 'ratio' || v.unit === 'elasticity' ? 0.05 : 1}
                    value={parsed ?? v.min_value}
                    disabled={!canEdit}
                    onChange={(e) => onChangeVariableDraft(v.variable_name, 'scenario_value', e.target.value)}
                    className="w-full accent-[#2563EB] cursor-pointer"
                  />
                )}

                {outOfRange && (
                  <div className="text-[10px] font-semibold text-red-600">
                    Out of valid range [{v.min_value} .. {v.max_value} {v.unit}]
                  </div>
                )}

                <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {v.source_or_assumption}
                </div>
              </div>
            )
          })}

          {activeScenario && !activeScenario.is_baseline && (
            <Button
              variant="primary"
              className="w-full justify-center"
              disabled={!canEdit || isRunning}
              onClick={onApplyAndRun}
              data-testid="twin-apply-run-btn"
            >
              <span>{isRunning ? 'Executing Pipeline…' : 'Save Levers & Execute Simulation'}</span>
            </Button>
          )}
        </div>
      )}

      {/* SECTION D: 8 Business Departments / 3D Zones */}
      {tab === 'departments' && (
        <div className="space-y-2 text-xs overflow-y-auto pr-1 max-h-[540px]">
          <div className="font-semibold" style={{ color: 'var(--heading)' }}>
            Interactive 3D Business Zones ({zones.length})
          </div>
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => onSelectZone(z.id)}
              className="w-full text-left rounded-xl border p-2.5 space-y-1 hover:border-[var(--primary)] transition-colors"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold" style={{ color: 'var(--heading)' }}>
                  {z.name}
                </span>
                <Pill tone={z.baseline?.supported === false ? 'warning' : 'success'}>
                  {z.baseline?.supported === false ? 'PARTIAL/UNMAPPED' : 'ACTIVE'}
                </Pill>
              </div>
              <div className="text-[10px]" style={{ color: 'var(--primary-text)' }}>
                {z.department}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {z.description}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* SECTION E: Honest AI Model Inventory */}
      {tab === 'models' && (
        <div className="space-y-2 text-xs overflow-y-auto pr-1 max-h-[540px]" data-testid="twin-ai-models-panel">
          <div className="font-semibold" style={{ color: 'var(--heading)' }}>
            System AI &amp; Analytics Modules (Verified Status)
          </div>
          {aiModels.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border p-2.5 space-y-1"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold" style={{ color: 'var(--heading)' }}>
                  {m.name}
                </span>
                <Pill tone={modelTone(m.status)}>{m.status.replaceAll('_', ' ').toUpperCase()}</Pill>
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                Version: <span className="font-mono">{m.version || 'N/A'}</span> · Kind: {m.kind}
              </div>
              <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text)' }}>
                {m.note}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SECTION F: Simulation History */}
      {tab === 'history' && (
        <div className="space-y-2 text-xs overflow-y-auto pr-1 max-h-[540px]">
          <div className="font-semibold" style={{ color: 'var(--heading)' }}>
            Simulation Run History ({recentRuns.length})
          </div>
          {recentRuns.length === 0 && (
            <div className="text-[11px] p-3 rounded-xl border" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
              No simulation runs recorded yet. Click Run Simulation above.
            </div>
          )}
          {recentRuns.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectRun(r.id)}
              className="w-full text-left rounded-xl border p-2.5 space-y-1 transition-colors hover:border-[var(--primary)]"
              style={{
                background: activeRunId === r.id ? 'var(--primary-soft)' : 'var(--surface-muted)',
                borderColor: activeRunId === r.id ? 'var(--primary)' : 'var(--border)',
              }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--heading)' }}>
                  {r.id}
                </span>
                <Pill tone={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'critical' : 'warning'}>
                  {r.status.toUpperCase()}
                </Pill>
              </div>
              <div className="text-[10px] flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                <span>{r.duration_ms != null ? `${r.duration_ms} ms` : 'pending'}</span>
                <span>{r.started_at ? new Date(r.started_at).toLocaleString() : ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
