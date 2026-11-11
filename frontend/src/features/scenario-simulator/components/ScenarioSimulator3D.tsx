import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Database,
  LineChart,
  SlidersHorizontal,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react'
import {
  cancelTwinSimulationRun,
  compact,
  createTwinScenario,
  deleteTwinScenario,
  downloadTwinRunExport,
  ensureTwinBaseline,
  generateTwinRecommendation,
  getActiveCompanyId,
  getTwinScenario,
  getTwinSimulationRun,
  getTwinWorkspace,
  moneyCompact,
  patchTwinScenarioVariables,
  request,
  retryTwinSimulationRun,
  startTwinSimulationRun,
  updateTwinScenario,
  type Dataset,
  type KPI,
  type Options,
  type Scenario,
  type Session,
  type TwinObjective,
  type TwinScenarioType,
  type TwinSimulationResult,
  type TwinWorkspacePayload,
} from '../../../api'
import { Button, Card, Empty, ErrorState, Loading, Pill, useToast } from '../../../ui'
import { BusinessOverviewTab } from './tabs/BusinessOverviewTab'
import { InventoryScenarioTab } from './tabs/InventoryScenarioTab'
import { MarketingScenarioTab } from './tabs/MarketingScenarioTab'
import { PricingScenarioTab } from './tabs/PricingScenarioTab'
import { DigitalTwinScene3D } from './DigitalTwinScene3D'
import { MultiScenarioComparisonModal } from './MultiScenarioComparisonModal'
import { TwinBottomControls } from './TwinBottomControls'
import { TwinHeaderBar } from './TwinHeaderBar'
import { TwinLeftSidebar, type LeftSidebarTab } from './TwinLeftSidebar'
import { TwinRightInspector, type RightInspectorTab } from './TwinRightInspector'

const SCENARIO_TYPE_OPTIONS: Array<{ value: TwinScenarioType; label: string }> = [
  { value: 'revenue_growth', label: 'Revenue Growth Strategy' },
  { value: 'marketing_optimization', label: 'Marketing Budget Optimization' },
  { value: 'pricing_strategy', label: 'Pricing & Margin Guardrail' },
  { value: 'inventory_optimization', label: 'Inventory Replenishment Plan' },
  { value: 'supply_chain_disruption', label: 'Supply Chain Lead-Time Shock' },
  { value: 'customer_retention', label: 'Customer Retention Sensitivity' },
  { value: 'cost_reduction', label: 'Cost Efficiency & Opex Reduction' },
  { value: 'custom', label: 'Multi-Domain Custom What-if' },
]

export function ScenarioSimulator3D({
  dataset,
  options,
  session: sessionProp,
}: {
  dataset?: Dataset
  options?: Options
  session?: Session
}) {
  const [search] = useSearchParams()
  const queryClient = useQueryClient()
  const { notify } = useToast()

  const [preset] = useState(() =>
    search.get('autorun') === '1' && search.get('tab') === 'marketing' && search.get('channel')
      ? { channel: search.get('channel') as string, pct: -15, changes: [-0.15, 0.15, 0.3] }
      : null
  )
  const [recId] = useState(() => search.get('rec') || undefined)

  // Fetch session only when not supplied by parent (e.g., isolated unit test mounts)
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: () => request<Session>('/session'),
    enabled: !sessionProp,
  })
  const activeSession = sessionProp || sessionQuery.data
  const canEdit = activeSession ? activeSession.role !== 'viewer' : false

  // UI View & Playback State (Enterprise Light Mode default)
  const [horizon, setHorizon] = useState<7 | 30 | 90>(30)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [leftTab, setLeftTab] = useState<LeftSidebarTab>('variables')
  const [rightTab, setRightTab] = useState<RightInspectorTab>('inspector')

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>('ai_engine')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [animateParticles, setAnimateParticles] = useState(true)
  const [showBaselineFlow, setShowBaselineFlow] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  const [cameraPreset, setCameraPreset] = useState<'reset' | 'iso' | 'top' | 'focus_zone' | 'focus_flow'>('iso')
  const [dark3D, setDark3D] = useState(false)
  const [force2D, setForce2D] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [compareOpen, setCompareOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [showLegacyDrawer, setShowLegacyDrawer] = useState(Boolean(preset))
  const [legacyControlTab, setLegacyControlTab] = useState<'overview' | 'pricing' | 'marketing' | 'inventory'>(
    preset ? 'marketing' : options?.products.length ? 'pricing' : options?.marketing_channels.length ? 'marketing' : 'overview'
  )

  const [variableDrafts, setVariableDrafts] = useState<
    Record<string, { scenario_value: string; baseline_value: string }>
  >({})
  const [variableValidationError, setVariableValidationError] = useState<string | null>(null)

  // New What-If Modal Form State
  const [newName, setNewName] = useState('Q4 Revenue Growth Plan')
  const [newType, setNewType] = useState<TwinScenarioType>('revenue_growth')
  const [newObjective, setNewObjective] = useState<TwinObjective>('balanced')
  const [newHorizon, setNewHorizon] = useState<7 | 30 | 90>(30)
  const [newMinMarginPct, setNewMinMarginPct] = useState('')
  const [newMaxStockout, setNewMaxStockout] = useState('')
  const [newMaxSpendIncPct, setNewMaxSpendIncPct] = useState('')

  // Primary Digital Twin Workspace Query
  const workspaceQuery = useQuery({
    queryKey: ['twin-workspace', getActiveCompanyId(), dataset?.dataset_id ?? 'empty', horizon],
    queryFn: () =>
      getTwinWorkspace({
        dataset_id: dataset?.dataset_id,
        horizon_days: horizon,
      }),
  })

  const workspace = workspaceQuery.data
  const scenarios = workspace?.scenarios || []

  // Keep selectedScenarioId synchronized when workspace scenarios change or dataset switches
  useEffect(() => {
    if (!scenarios.length) {
      setSelectedScenarioId(null)
      setSelectedRunId(null)
      return
    }
    const stillExists = scenarios.some((s) => s.id === selectedScenarioId)
    if (!stillExists) {
      const preferred = scenarios.find((s) => !s.is_baseline) || scenarios[0]
      setSelectedScenarioId(preferred.id)
      setSelectedRunId(preferred.latest_run?.id || null)
    }
  }, [scenarios, selectedScenarioId])

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0] || null,
    [scenarios, selectedScenarioId]
  )

  // Fetch active scenario detail (provides exact subgraph topology before first run)
  const scenarioDetailQuery = useQuery({
    queryKey: ['twin-scenario-detail', activeScenario?.id],
    queryFn: () => getTwinScenario(activeScenario!.id),
    enabled: Boolean(activeScenario?.id),
  })

  // Keep variable drafts initialized when switching scenario or after scenario variables update
  useEffect(() => {
    if (!activeScenario) {
      setVariableDrafts({})
      setVariableValidationError(null)
      return
    }
    const nextDrafts: Record<string, { scenario_value: string; baseline_value: string }> = {}
    for (const v of activeScenario.variables) {
      nextDrafts[v.variable_name] = {
        scenario_value: v.scenario_value != null ? String(v.scenario_value) : '',
        baseline_value: v.baseline_value != null ? String(v.baseline_value) : '',
      }
    }
    setVariableDrafts(nextDrafts)
    setVariableValidationError(null)
    if (activeScenario.horizon_days === 7 || activeScenario.horizon_days === 30 || activeScenario.horizon_days === 90) {
      setHorizon(activeScenario.horizon_days)
    }
  }, [activeScenario?.id, activeScenario?.updated_at])

  // Determine effective Run ID to load (explicit selection or scenario latest_run)
  const effectiveRunId = selectedRunId || activeScenario?.latest_run?.id || null

  const runDetailQuery = useQuery({
    queryKey: ['twin-run', effectiveRunId],
    queryFn: () => getTwinSimulationRun(effectiveRunId!),
    enabled: Boolean(effectiveRunId),
    refetchInterval: (q) => {
      const status = q.state.data?.status
      return status && ['preparing', 'queued', 'running'].includes(status) ? 600 : false
    },
  })

  const activeRun = runDetailQuery.data || activeScenario?.latest_run || null
  const runEvents = activeRun?.events || []
  const runResults = activeRun?.results || []

  const resultsMap = useMemo(() => {
    const map: Record<string, TwinSimulationResult> = {}
    for (const r of runResults) map[r.metric_name] = r
    return map
  }, [runResults])

  // Active edges for 3D pipeline highlight
  const activeEdgeIds = useMemo(() => {
    if (activeRun?.pipeline_graph?.edges?.length) {
      return activeRun.pipeline_graph.edges.map((e) => e.id)
    }
    if (scenarioDetailQuery.data?.pipeline_graph?.edges?.length) {
      return scenarioDetailQuery.data.pipeline_graph.edges.map((e) => e.id)
    }
    if (runEvents.length > 0) {
      return Array.from(new Set(runEvents.map((e) => e.edge_id).filter((id): id is string => Boolean(id))))
    }
    return (workspace?.edges || []).slice(0, 12).map((e) => e.id)
  }, [activeRun, scenarioDetailQuery.data, runEvents, workspace?.edges])

  // Chronological step timer when Play Flow is active
  useEffect(() => {
    if (!isPlaying || reducedMotion || runEvents.length === 0) return
    const intervalMs = Math.max(220, Math.round(850 / playbackSpeed))
    const timer = window.setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev >= runEvents.length - 1) {
          setIsPlaying(false)
          return runEvents.length - 1
        }
        return prev + 1
      })
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [isPlaying, reducedMotion, runEvents.length, playbackSpeed])

  // Preserved Legacy /kpi/summary + /simulate Bridge for RecommendationsTab & quick What-If drawer
  const kpiQuery = useQuery({
    queryKey: ['simulator-baseline-kpi', dataset?.dataset_id],
    queryFn: () => request<KPI>('/kpi/summary?grain=daily'),
    enabled: Boolean(dataset),
  })

  const legacySimulateMutation = useMutation({
    mutationFn: (values: unknown) => request<Scenario>('/simulate', values),
  })

  useEffect(() => {
    if (!dataset || !options) return
    if (preset) {
      legacySimulateMutation.mutate({
        type: 'marketing',
        horizon: 30,
        objective: 'profit',
        parameters: { channel: preset.channel, changes: preset.changes },
      })
      return
    }
    const defaultProduct =
      options.products.find((p) => p.product_name === 'SmartDesk Mini')?.product_id || options.products[0]?.product_id
    if (defaultProduct) {
      legacySimulateMutation.mutate({
        type: 'price',
        horizon: 30,
        objective: 'profit',
        parameters: { product: defaultProduct, discounts: [0, 0.05, 0.1] },
      })
      return
    }
    const defaultChannel = options.marketing_channels[0]
    if (defaultChannel) {
      legacySimulateMutation.mutate({
        type: 'marketing',
        horizon: 30,
        objective: 'profit',
        parameters: { channel: defaultChannel, changes: [-0.15, 0.15, 0.3] },
      })
    }
  }, [dataset?.dataset_id])

  // Mutations for Digital Twin Lifecycle
  const refreshBaselineMut = useMutation({
    mutationFn: () => ensureTwinBaseline(true),
    onSuccess: (sc) => {
      void queryClient.invalidateQueries({ queryKey: ['twin-workspace'] })
      setSelectedScenarioId(sc.id)
      setSelectedRunId(sc.latest_run?.id || null)
      notify({ tone: 'success', title: 'Baseline refreshed', description: 'Baseline snapshot rebuilt from latest SQL metrics.' })
    },
  })

  const workspaceCacheKey = ['twin-workspace', getActiveCompanyId(), dataset?.dataset_id ?? 'empty', horizon] as const

  const createScenarioMut = useMutation({
    mutationFn: createTwinScenario,
    onSuccess: (sc) => {
      queryClient.setQueryData(workspaceCacheKey, (old: TwinWorkspacePayload | undefined) =>
        old ? { ...old, scenarios: [...old.scenarios.filter((x) => x.id !== sc.id), sc] } : old
      )
      void queryClient.invalidateQueries({ queryKey: ['twin-workspace'] })
      setSelectedScenarioId(sc.id)
      setSelectedRunId(sc.latest_run?.id || null)
      setActiveStepIndex(-1)
      setIsPlaying(false)
      setCreateOpen(false)
      setLeftTab('variables')
      notify({ tone: 'success', title: 'Scenario created', description: `${sc.name} ready for parameter tuning & simulation.` })
    },
  })

  const deleteScenarioMut = useMutation({
    mutationFn: deleteTwinScenario,
    onSuccess: (res) => {
      queryClient.setQueryData(workspaceCacheKey, (old: TwinWorkspacePayload | undefined) =>
        old ? { ...old, scenarios: old.scenarios.filter((x) => x.id !== res.scenario_id) } : old
      )
      void queryClient.invalidateQueries({ queryKey: ['twin-workspace'] })
      if (selectedScenarioId === res.scenario_id) {
        setSelectedScenarioId(null)
        setSelectedRunId(null)
      }
      notify({ tone: 'info', title: 'Scenario deleted' })
    },
  })

  const saveVariablesMut = useMutation({
    mutationFn: async (scenarioId: string) => {
      if (!activeScenario) throw new Error('No scenario selected.')
      const payloadVars: Array<{ variable_name: string; scenario_value?: number | null; baseline_value?: number | null }> = []
      for (const v of activeScenario.variables) {
        const d = variableDrafts[v.variable_name]
        if (!d) continue
        const sVal = d.scenario_value === '' ? null : Number(d.scenario_value)
        const bVal = d.baseline_value === '' ? null : Number(d.baseline_value)
        if (sVal !== null) {
          if (!Number.isFinite(sVal)) throw new Error(`Invalid numeric value for ${v.label}.`)
          if (v.min_value != null && sVal < v.min_value) {
            throw new Error(`${v.label} (${sVal}) cannot be below minimum ${v.min_value} ${v.unit}.`)
          }
          if (v.max_value != null && sVal > v.max_value) {
            throw new Error(`${v.label} (${sVal}) cannot exceed maximum ${v.max_value} ${v.unit}.`)
          }
        }
        if (bVal !== null && !Number.isFinite(bVal)) {
          throw new Error(`Invalid baseline value for ${v.label}.`)
        }
        payloadVars.push({
          variable_name: v.variable_name,
          scenario_value: sVal,
          ...(v.baseline_value == null && bVal !== null ? { baseline_value: bVal } : {}),
        })
      }
      setVariableValidationError(null)
      return patchTwinScenarioVariables(scenarioId, payloadVars)
    },
    onError: (err) => {
      setVariableValidationError(err instanceof Error ? err.message : 'Invalid variable assumptions.')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['twin-workspace'] })
      void queryClient.invalidateQueries({ queryKey: ['twin-scenario-detail', activeScenario?.id] })
    },
  })

  const runSimulationMut = useMutation({
    mutationFn: async () => {
      if (!activeScenario) throw new Error('Select a scenario first.')
      if (!activeScenario.is_baseline) {
        await saveVariablesMut.mutateAsync(activeScenario.id)
      }
      return startTwinSimulationRun(activeScenario.id, { execution_mode: 'sync' })
    },
    onSuccess: (run) => {
      setSelectedRunId(run.id)
      queryClient.setQueryData(['twin-run', run.id], run)
      queryClient.setQueryData(workspaceCacheKey, (old: TwinWorkspacePayload | undefined) =>
        old
          ? {
              ...old,
              scenarios: old.scenarios.map((s) => (s.id === run.scenario_id ? { ...s, latest_run: run } : s)),
              recent_runs: [run, ...old.recent_runs.filter((r) => r.id !== run.id)].slice(0, 20),
            }
          : old
      )
      setActiveStepIndex(-1)
      setIsPlaying(false)
      void queryClient.invalidateQueries({ queryKey: ['twin-workspace'] })
      void queryClient.invalidateQueries({ queryKey: ['twin-run', run.id] })
      notify({
        tone: run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'info',
        title: `Simulation ${run.status}`,
        description:
          run.status === 'completed'
            ? `${run.results?.length || 0} outcome metrics and ${run.events?.length || 0} animated flow steps ready.`
            : run.error_details || undefined,
      })
    },
  })

  const cancelRunMut = useMutation({
    mutationFn: cancelTwinSimulationRun,
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['twin-run', run.id] })
      void queryClient.invalidateQueries({ queryKey: ['twin-workspace'] })
    },
  })

  const retryRunMut = useMutation({
    mutationFn: retryTwinSimulationRun,
    onSuccess: (run) => {
      setSelectedRunId(run.id)
      void queryClient.invalidateQueries({ queryKey: ['twin-run', run.id] })
      void queryClient.invalidateQueries({ queryKey: ['twin-workspace'] })
    },
  })

  const recommendMut = useMutation({
    mutationFn: ({ runId, lang, customFocus }: { runId: string; lang: 'en' | 'vi'; customFocus?: string }) =>
      generateTwinRecommendation(runId, { language: lang, custom_focus: customFocus }),
    onSuccess: (rec, vars) => {
      queryClient.setQueryData(['twin-run', vars.runId], (old: unknown) =>
        old && typeof old === 'object' ? { ...(old as Record<string, unknown>), recommendation: rec } : old
      )
      void queryClient.invalidateQueries({ queryKey: ['twin-run', vars.runId] })
    },
  })

  const handleChangeHorizon = (h: 7 | 30 | 90) => {
    setHorizon(h)
    if (activeScenario && !activeScenario.is_baseline && canEdit) {
      void updateTwinScenario(activeScenario.id, { horizon_days: h }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['twin-workspace'] })
      })
    }
  }

  const handleCreatePreset = (stype: TwinScenarioType, title: string) => {
    createScenarioMut.mutate({
      name: `${title} (${horizon}d)`,
      scenario_type: stype,
      horizon_days: horizon,
      objective: stype === 'inventory_optimization' ? 'stockout' : 'balanced',
      dataset_id: workspace?.dataset?.dataset_id,
    })
  }

  const handleCreateModalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createScenarioMut.mutate({
      name: newName.trim() || 'What-If Scenario',
      scenario_type: newType,
      horizon_days: newHorizon,
      objective: newObjective,
      dataset_id: workspace?.dataset?.dataset_id,
      constraints: {
        ...(newMinMarginPct !== '' ? { min_margin: Number(newMinMarginPct) / 100 } : {}),
        ...(newMaxStockout !== '' ? { max_stockout_risk_units: Number(newMaxStockout) } : {}),
        ...(newMaxSpendIncPct !== '' ? { max_spend_increase_pct: Number(newMaxSpendIncPct) } : {}),
      },
    })
  }

  const handleExport = (fmt: 'json' | 'csv') => {
    if (!activeRun) return
    void downloadTwinRunExport(activeRun.id, fmt).catch((err) => {
      notify({ tone: 'danger', title: 'Export failed', description: err instanceof Error ? err.message : 'Unable to export run' })
    })
  }

  const readiness = workspace?.data_readiness
  const zones = workspace?.zones || []
  const nodes = workspace?.nodes || []
  const edges = workspace?.edges || []
  const aiModels = workspace?.ai_models || []
  const currency = workspace?.dataset?.currency || 'VND'

  const revResult = resultsMap.revenue_forecast
  const profResult = resultsMap.profit_forecast
  const marginResult = resultsMap.gross_margin_pct
  const riskResult = resultsMap.inventory_risk_units

  if (workspaceQuery.isLoading) {
    return <Loading labelText="Initializing Enterprise 3D Digital Twin Studio…" />
  }

  if (workspaceQuery.error) {
    return <ErrorState error={workspaceQuery.error} retry={() => void workspaceQuery.refetch()} />
  }

  // Empty Workspace State (No Fake Numbers or Simulated Scenarios)
  if (workspace && !workspace.dataset_ready) {
    return (
      <div className="space-y-5" data-testid="twin-empty-workspace-state">
        <div
          className="dp-surface p-6 space-y-4"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
                DecisionPilot AI · Enterprise Digital Twin
              </div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--heading)' }}>
                Interactive 3D Business Scenario Simulator
              </h1>
            </div>
            <Pill tone="critical" data-testid="empty-readiness-badge">
              Data Readiness: {readiness?.score ?? 0}/100 ({(readiness?.tier || 'not_ready').toUpperCase()})
            </Pill>
          </div>

          <div
            className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--warning-text)' }}
          >
            <div className="flex items-start gap-2.5 text-xs">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <strong className="block">No Transactional Business Dataset Loaded in This Workspace</strong>
                <p>{readiness?.disclaimer || 'Zero fabricated KPIs or simulated projections are shown until real company data is uploaded.'}</p>
              </div>
            </div>
            <Link
              to="/data-sources"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white flex-shrink-0"
              style={{ background: 'var(--primary)' }}
            >
              <UploadCloud size={14} />
              <span>Upload Business Data</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {zones.map((z) => (
              <div
                key={z.id}
                className="rounded-xl border p-3 space-y-1"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between gap-1">
                  <strong style={{ color: 'var(--heading)' }}>{z.name}</strong>
                  <Pill tone="warning">UNMAPPED</Pill>
                </div>
                <p className="text-[10.5px]" style={{ color: 'var(--text-secondary)' }}>
                  {z.department}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={isFullscreen ? { background: 'var(--bg)' } : undefined}
      className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 overflow-y-auto p-5' : ''}`}
      data-testid="digital-twin-studio"
    >
      <TwinHeaderBar
        datasetTitle={workspace?.dataset?.title}
        currency={currency}
        scenarios={scenarios}
        activeScenario={activeScenario}
        activeRun={activeRun}
        horizon={horizon}
        onChangeScenario={(sid) => {
          setSelectedScenarioId(sid)
          const found = scenarios.find((item) => item.id === sid)
          setSelectedRunId(found?.latest_run?.id || null)
          setActiveStepIndex(-1)
          setIsPlaying(false)
        }}
        onChangeHorizon={handleChangeHorizon}
        onOpenNewScenario={() => setCreateOpen(true)}
        onSaveVariables={() => activeScenario && saveVariablesMut.mutate(activeScenario.id)}
        onRunSimulation={() => runSimulationMut.mutate()}
        onExport={handleExport}
        dark3D={dark3D}
        onToggleDark3D={() => setDark3D((v) => !v)}
        force2D={force2D}
        onToggleForce2D={() => setForce2D((v) => !v)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((v) => !v)}
        isSaving={saveVariablesMut.isPending}
        isRunning={runSimulationMut.isPending}
        canEdit={canEdit}
      />

      <ErrorState
        error={
          runSimulationMut.error ||
          createScenarioMut.error ||
          saveVariablesMut.error ||
          deleteScenarioMut.error ||
          refreshBaselineMut.error
        }
      />
      {variableValidationError && (
        <div
          role="alert"
          className="rounded-xl border px-3.5 py-2 text-xs font-medium"
          style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)', color: 'var(--danger-text)' }}
        >
          {variableValidationError}
        </div>
      )}

      {/* Honest Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
        <div className="dp-surface p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Projected Revenue ({horizon}d)
          </div>
          <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: 'var(--heading)' }}>
            {revResult?.scenario_value != null ? moneyCompact(revResult.scenario_value, currency) : '—'}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: revResult?.pct_difference && revResult.pct_difference >= 0 ? '#16A34A' : 'var(--text-secondary)' }}>
            {revResult?.pct_difference != null ? `${revResult.pct_difference > 0 ? '+' : ''}${revResult.pct_difference.toFixed(1)}% vs baseline` : 'Run simulation'}
          </div>
        </div>

        <div className="dp-surface p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Projected Profit
          </div>
          <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: 'var(--primary-text)' }}>
            {profResult?.scenario_value != null ? moneyCompact(profResult.scenario_value, currency) : 'Unavailable'}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: profResult?.pct_difference && profResult.pct_difference >= 0 ? '#16A34A' : 'var(--text-secondary)' }}>
            {profResult?.pct_difference != null ? `${profResult.pct_difference > 0 ? '+' : ''}${profResult.pct_difference.toFixed(1)}% vs baseline` : 'Direct COGS scope'}
          </div>
        </div>

        <div className="dp-surface p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Gross Margin
          </div>
          <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: 'var(--heading)' }}>
            {marginResult?.scenario_value != null ? `${marginResult.scenario_value.toFixed(1)}%` : 'Unavailable'}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {marginResult?.pct_difference != null ? `${marginResult.pct_difference > 0 ? '+' : ''}${marginResult.pct_difference.toFixed(1)}% delta` : 'Awaiting run'}
          </div>
        </div>

        <div className="dp-surface p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Stockout Exposure
          </div>
          <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: riskResult?.scenario_value && riskResult.scenario_value > 0 ? '#EA580C' : '#16A34A' }}>
            {riskResult?.scenario_value != null ? `${compact(riskResult.scenario_value)} units` : 'Unavailable'}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {riskResult?.uncertainty_metadata?.is_available ? '90% uncertainty ready' : 'Lead-time capacity capped'}
          </div>
        </div>

        <div className="dp-surface p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
              Data Readiness
            </span>
            <Database size={12} style={{ color: 'var(--primary)' }} />
          </div>
          <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: 'var(--heading)' }}>
            {readiness?.score ?? 0}/100
          </div>
          <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
            {readiness?.days_observed ?? 0}d observed · Not forecast accuracy
          </div>
        </div>
      </div>

      {/* Main 3-Column Enterprise Digital Twin Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-3">
          {readiness && (
            <TwinLeftSidebar
              workspaceDatasetTitle={workspace?.dataset?.title}
              readiness={readiness}
              zones={zones}
              aiModels={aiModels}
              scenarios={scenarios}
              recentRuns={workspace?.recent_runs || []}
              activeScenario={activeScenario}
              activeRunId={activeRun?.id}
              activeTab={leftTab}
              onChangeTab={setLeftTab}
              variableDrafts={variableDrafts}
              onChangeVariableDraft={(name, field, value) => {
                setVariableDrafts((prev) => ({
                  ...prev,
                  [name]: {
                    scenario_value: prev[name]?.scenario_value ?? '',
                    baseline_value: prev[name]?.baseline_value ?? '',
                    [field]: value,
                  },
                }))
              }}
              onSelectScenario={(sid) => {
                setSelectedScenarioId(sid)
                const found = scenarios.find((s) => s.id === sid)
                setSelectedRunId(found?.latest_run?.id || null)
                setActiveStepIndex(-1)
                setIsPlaying(false)
              }}
              onCreatePresetScenario={handleCreatePreset}
              onDeleteScenario={(sid) => deleteScenarioMut.mutate(sid)}
              onSelectZone={(zid) => {
                setSelectedZoneId(zid)
                setSelectedNodeId(null)
                setSelectedEdgeId(null)
                setRightTab('inspector')
              }}
              onSelectRun={(rid) => {
                setSelectedRunId(rid)
                setActiveStepIndex(-1)
                setIsPlaying(false)
                setRightTab('inspector')
              }}
              onRefreshBaseline={() => refreshBaselineMut.mutate()}
              onApplyAndRun={() => runSimulationMut.mutate()}
              canEdit={canEdit}
              isRunning={runSimulationMut.isPending}
            />
          )}
        </div>

        <div className="xl:col-span-5 space-y-3 flex flex-col">
          <DigitalTwinScene3D
            zones={zones}
            nodes={nodes}
            edges={edges}
            activeEdgeIds={activeEdgeIds}
            events={runEvents}
            activeStepIndex={activeStepIndex}
            selectedZoneId={selectedZoneId}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onSelectZone={(zid) => {
              setSelectedZoneId(zid)
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
            }}
            onSelectNode={(nid) => {
              setSelectedNodeId(nid)
              const nd = nodes.find((item) => item.id === nid)
              if (nd) setSelectedZoneId(nd.zone_id)
              setSelectedEdgeId(null)
            }}
            onSelectEdge={(eid) => {
              setSelectedEdgeId(eid)
              setSelectedNodeId(null)
            }}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            animateParticles={animateParticles}
            showBaselineFlow={showBaselineFlow}
            reducedMotion={reducedMotion}
            cameraPreset={cameraPreset}
            dark3D={dark3D}
            resultsMap={resultsMap}
            aiModels={aiModels}
            force2D={force2D}
          />

          <TwinBottomControls
            events={runEvents}
            activeStepIndex={activeStepIndex}
            onStepChange={(idx) => {
              setIsPlaying(false)
              setActiveStepIndex(idx)
              const ev = runEvents[idx]
              if (ev?.zone_id) setSelectedZoneId(ev.zone_id)
              if (ev?.node_id) setSelectedNodeId(ev.node_id)
              if (ev?.edge_id) setSelectedEdgeId(ev.edge_id)
            }}
            isPlaying={isPlaying}
            onTogglePlay={() => {
              if (!isPlaying && (activeStepIndex < 0 || activeStepIndex >= runEvents.length - 1)) {
                setActiveStepIndex(0)
              }
              setIsPlaying((v) => !v)
            }}
            onStop={() => {
              setIsPlaying(false)
              setActiveStepIndex(-1)
            }}
            onReplay={() => {
              setActiveStepIndex(0)
              setIsPlaying(true)
            }}
            onReset={() => {
              setIsPlaying(false)
              setActiveStepIndex(-1)
              setSelectedEdgeId(null)
              setSelectedNodeId(null)
              setCameraPreset('reset')
            }}
            playbackSpeed={playbackSpeed}
            onChangeSpeed={setPlaybackSpeed}
            animateParticles={animateParticles}
            onToggleParticles={() => setAnimateParticles((v) => !v)}
            showBaselineFlow={showBaselineFlow}
            onToggleBaselineFlow={() => setShowBaselineFlow((v) => !v)}
            reducedMotion={reducedMotion}
            onToggleReducedMotion={() => setReducedMotion((v) => !v)}
            cameraPreset={cameraPreset}
            onChangeCameraPreset={setCameraPreset}
            onOpenCompare={() => setCompareOpen(true)}
            scenarioCount={scenarios.length}
          />
        </div>

        <div className="xl:col-span-4">
          <TwinRightInspector
            activeTab={rightTab}
            onChangeTab={setRightTab}
            currency={currency}
            zones={zones}
            nodes={nodes}
            edges={edges}
            aiModels={aiModels}
            selectedZoneId={selectedZoneId}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            activeRun={activeRun}
            results={runResults}
            events={runEvents}
            activeStepIndex={activeStepIndex}
            onStepSelect={(idx) => {
              setIsPlaying(false)
              setActiveStepIndex(idx)
              const ev = runEvents[idx]
              if (ev?.zone_id) setSelectedZoneId(ev.zone_id)
            }}
            onRetryRun={(rid) => retryRunMut.mutate(rid)}
            onCancelRun={(rid) => cancelRunMut.mutate(rid)}
            onGenerateRecommendation={(lang, customFocus) => {
              if (activeRun?.id) {
                recommendMut.mutate({ runId: activeRun.id, lang, customFocus })
              }
            }}
            isGeneratingRec={recommendMut.isPending}
            recError={recommendMut.error as Error | null}
            legacyScenarioData={legacySimulateMutation.data}
            legacySimPending={legacySimulateMutation.isPending || legacySimulateMutation.isError}
            legacyRecId={recId}
            canEdit={canEdit}
          />
        </div>
      </div>

      {/* Preserved Legacy Quick Parameter Simulator Drawer (auto-opened for ?autorun=1 recommendations) */}
      {dataset && options && (
        <div
          className="dp-surface p-3.5 space-y-3"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <strong style={{ color: 'var(--heading)' }}>Quick Channel &amp; SKU Micro-Simulator (/simulate)</strong>
              {legacySimulateMutation.data?.recommended && (
                <Pill tone="info">Selected: {String(legacySimulateMutation.data.recommended.name)}</Pill>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowLegacyDrawer((v) => !v)}>
              {showLegacyDrawer ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{showLegacyDrawer ? 'Hide Quick Micro-Simulator' : 'Open Quick Micro-Simulator'}</span>
            </Button>
          </div>

          {showLegacyDrawer && (
            <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'pricing' as const, label: 'Pricing & Discount', icon: CircleDollarSign },
                  { id: 'marketing' as const, label: 'Marketing Budget', icon: Zap },
                  { id: 'inventory' as const, label: 'Inventory Planning', icon: Boxes },
                  { id: 'overview' as const, label: 'Business Overview', icon: LineChart },
                ].map((t) => {
                  const Icon = t.icon
                  return (
                    <Button
                      key={t.id}
                      size="sm"
                      variant={legacyControlTab === t.id ? 'primary' : 'outline'}
                      onClick={() => setLegacyControlTab(t.id)}
                    >
                      <Icon size={13} />
                      <span>{t.label}</span>
                    </Button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <Card>
                  {legacyControlTab === 'overview' && <BusinessOverviewTab kpiData={kpiQuery.data} />}
                  {legacyControlTab === 'pricing' && (
                    <PricingScenarioTab
                      options={options}
                      isLoading={legacySimulateMutation.isPending}
                      scenarioData={legacySimulateMutation.data?.type === 'price' ? legacySimulateMutation.data : undefined}
                      onSimulatePrice={(p) =>
                        legacySimulateMutation.mutate({
                          type: 'price',
                          horizon: p.horizon,
                          objective: p.objective,
                          parameters: {
                            product: p.product,
                            discounts: p.discounts,
                            ...(p.elasticity !== undefined ? { elasticity: p.elasticity } : {}),
                          },
                        })
                      }
                    />
                  )}
                  {legacyControlTab === 'marketing' && (
                    <MarketingScenarioTab
                      options={options}
                      preset={preset ?? undefined}
                      isLoading={legacySimulateMutation.isPending}
                      scenarioData={legacySimulateMutation.data?.type === 'marketing' ? legacySimulateMutation.data : undefined}
                      onSimulateMarketing={(p) =>
                        legacySimulateMutation.mutate({
                          type: 'marketing',
                          horizon: p.horizon,
                          objective: p.objective,
                          parameters: {
                            channel: p.channel,
                            changes: p.changes,
                            ...(p.responseExponent ? { response_exponent: p.responseExponent } : {}),
                          },
                        })
                      }
                    />
                  )}
                  {legacyControlTab === 'inventory' && (
                    <InventoryScenarioTab
                      options={options}
                      isLoading={legacySimulateMutation.isPending}
                      scenarioData={legacySimulateMutation.data?.type === 'inventory' ? legacySimulateMutation.data : undefined}
                      onSimulateInventory={(p) =>
                        legacySimulateMutation.mutate({
                          type: 'inventory',
                          horizon: p.horizon,
                          objective: p.objective,
                          parameters: {
                            product: p.product,
                            order_quantities: p.orderQuantities,
                            incoming_stock: p.incomingStock,
                            arrival_day: p.arrivalDay,
                            ...(p.safetyStock !== undefined ? { safety_stock: p.safetyStock } : {}),
                          },
                        })
                      }
                    />
                  )}
                </Card>
                <Card>
                  {legacySimulateMutation.data ? (
                    <div className="space-y-2 text-xs">
                      <strong style={{ color: 'var(--heading)' }}>Explicit Model Assumptions</strong>
                      <ul className="list-disc list-inside space-y-1" style={{ color: 'var(--text-secondary)' }}>
                        {legacySimulateMutation.data.assumptions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <Empty text="Run a micro-simulation to inspect assumptions." />
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New What-If Scenario Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create What-if Scenario"
          data-testid="create-twin-scenario-modal"
        >
          <form
            onSubmit={handleCreateModalSubmit}
            className="w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4 text-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={15} style={{ color: 'var(--primary)' }} />
                <h2 className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                  Create What-if Digital Twin Scenario
                </h2>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)} aria-label="Close new scenario modal">
                <X size={15} />
              </Button>
            </div>

            <div className="space-y-3">
              <label className="dp-field">
                <span className="dp-field-label">Scenario Name</span>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="dp-input text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="dp-field">
                  <span className="dp-field-label">Scenario Type</span>
                  <select
                    value={newType}
                    onChange={(e) => {
                      const next = e.target.value as TwinScenarioType
                      setNewType(next)
                      const opt = SCENARIO_TYPE_OPTIONS.find((o) => o.value === next)
                      if (opt) setNewName(`${opt.label} (${newHorizon}d)`)
                    }}
                    className="dp-select text-xs"
                  >
                    {SCENARIO_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="dp-field">
                  <span className="dp-field-label">Objective</span>
                  <select
                    value={newObjective}
                    onChange={(e) => setNewObjective(e.target.value as TwinObjective)}
                    className="dp-select text-xs"
                  >
                    <option value="balanced">Balanced (Profit + Growth)</option>
                    <option value="profit">Maximize Profit</option>
                    <option value="revenue">Maximize Revenue</option>
                    <option value="margin">Maximize Margin</option>
                    <option value="stockout">Minimize Stockout Risk</option>
                    <option value="resilience">Supply Chain Resilience</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <label className="dp-field">
                  <span className="dp-field-label">Horizon</span>
                  <select
                    value={newHorizon}
                    onChange={(e) => setNewHorizon(Number(e.target.value) as 7 | 30 | 90)}
                    className="dp-select text-xs"
                  >
                    <option value={7}>7 Days</option>
                    <option value={30}>30 Days</option>
                    <option value={90}>90 Days</option>
                  </select>
                </label>
                <label className="dp-field">
                  <span className="dp-field-label">Min Margin %</span>
                  <input
                    type="number"
                    placeholder="20"
                    value={newMinMarginPct}
                    onChange={(e) => setNewMinMarginPct(e.target.value)}
                    className="dp-input text-xs"
                  />
                </label>
                <label className="dp-field">
                  <span className="dp-field-label">Max Stockout</span>
                  <input
                    type="number"
                    placeholder="50"
                    value={newMaxStockout}
                    onChange={(e) => setNewMaxStockout(e.target.value)}
                    className="dp-input text-xs"
                  />
                </label>
                <label className="dp-field">
                  <span className="dp-field-label">Max Spend +%</span>
                  <input
                    type="number"
                    placeholder="35"
                    value={newMaxSpendIncPct}
                    onChange={(e) => setNewMaxSpendIncPct(e.target.value)}
                    className="dp-input text-xs"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)}>
                <span>Cancel</span>
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={createScenarioMut.isPending}
                data-testid="submit-create-twin-scenario"
              >
                <span>{createScenarioMut.isPending ? 'Creating…' : 'Create Scenario'}</span>
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Multi-Scenario Comparison Studio Modal */}
      <MultiScenarioComparisonModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        scenarios={scenarios}
        currency={currency}
      />
    </div>
  )
}
