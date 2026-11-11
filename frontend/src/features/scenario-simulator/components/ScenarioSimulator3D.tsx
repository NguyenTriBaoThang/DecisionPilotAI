import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Boxes,
  CircleDollarSign,
  Layers,
  LineChart,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react'
import {
  decimal,
  integer,
  label,
  moneyCompact,
  percent,
  request,
  type KPI,
  type Options,
  type Row,
  type Scenario,
} from '../../../api'
import {
  Button,
  Card,
  Chart,
  ErrorState,
  Loading,
  PageHeader,
  SectionHeader,
  Source,
  StatusBadge,
  Table,
} from '../../../ui'
import type { SimulatorTab } from '../types'
import { Scenario3DLandscape } from '../../../components/Scenario3DLandscape'
import { BusinessOverviewTab } from './tabs/BusinessOverviewTab'
import { PricingScenarioTab } from './tabs/PricingScenarioTab'
import { MarketingScenarioTab } from './tabs/MarketingScenarioTab'
import { InventoryScenarioTab } from './tabs/InventoryScenarioTab'
import { RecommendationsTab } from './tabs/RecommendationsTab'
import { ComparisonModeView } from './ComparisonModeView'

const tabList: { id: SimulatorTab; title: string; icon: typeof CircleDollarSign }[] = [
  { id: 'pricing', title: 'Pricing & Discount', icon: CircleDollarSign },
  { id: 'marketing', title: 'Marketing Budget', icon: Zap },
  { id: 'inventory', title: 'Inventory Planning', icon: Boxes },
  { id: 'overview', title: 'Business Overview', icon: LineChart },
  { id: 'recommendations', title: 'AI Recommendations', icon: Sparkles },
]

export function ScenarioSimulator3D({ options }: { options: Options }) {
  const [search] = useSearchParams()
  const [preset] = useState(() =>
    search.get('autorun') === '1' && search.get('tab') === 'marketing' && search.get('channel')
      ? { channel: search.get('channel') as string, pct: -15, changes: [-0.15, 0.15, 0.3] }
      : null
  )
  const [recId] = useState(() => search.get('rec') || undefined)
  const [activeTab, setActiveTab] = useState<SimulatorTab>(preset ? 'marketing' : 'pricing')
  const [controlTab, setControlTab] = useState<'overview' | 'pricing' | 'marketing' | 'inventory'>(
    preset ? 'marketing' : 'pricing'
  )
  const [viewMode, setViewMode] = useState<'studio' | 'comparison'>('studio')
  const [metricKey, setMetricKey] = useState<'profit' | 'revenue' | 'demand'>('profit')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const kpiQuery = useQuery({
    queryKey: ['simulator-baseline-kpi'],
    queryFn: () => request<KPI>('/kpi/summary?grain=daily'),
  })

  const simulateMutation = useMutation({
    mutationFn: (values: unknown) => request<Scenario>('/simulate', values),
  })

  useEffect(() => {
    const defaultProduct =
      options.products.find((p) => p.product_name === 'SmartDesk Mini')?.product_id ||
      options.products[0]?.product_id ||
      'P001'

    if (preset) {
      simulateMutation.mutate({
        type: 'marketing',
        horizon: 30,
        objective: 'profit',
        parameters: { channel: preset.channel, changes: preset.changes },
      })
      return
    }
    simulateMutation.mutate({
      type: 'price',
      horizon: 30,
      objective: 'profit',
      parameters: {
        product: defaultProduct,
        discounts: [0, 0.05, 0.1],
      },
    })
  }, [])

  const handleSelectTab = (tabId: SimulatorTab) => {
    setActiveTab(tabId)
    setViewMode('studio')
    if (tabId === 'recommendations') {
      document.getElementById('sim-panel-recommendations')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } else {
      setControlTab(tabId)
    }
  }

  const handleSimulatePrice = (params: {
    product: string
    discounts: number[]
    elasticity?: number
    objective: string
    horizon: number
  }) => {
    simulateMutation.mutate({
      type: 'price',
      horizon: params.horizon,
      objective: params.objective,
      parameters: {
        product: params.product,
        discounts: params.discounts,
        ...(params.elasticity !== undefined ? { elasticity: params.elasticity } : {}),
      },
    })
  }

  const handleSimulateMarketing = (params: {
    channel: string
    changes: number[]
    responseExponent?: number
    objective: string
    horizon: number
  }) => {
    simulateMutation.mutate({
      type: 'marketing',
      horizon: params.horizon,
      objective: params.objective,
      parameters: {
        channel: params.channel,
        changes: params.changes,
        ...(params.responseExponent ? { response_exponent: params.responseExponent } : {}),
      },
    })
  }

  const handleSimulateInventory = (params: {
    product: string
    orderQuantities: number[]
    incomingStock: number
    arrivalDay: number
    safetyStock?: number
    horizon: number
    objective: string
  }) => {
    simulateMutation.mutate({
      type: 'inventory',
      horizon: params.horizon,
      objective: params.objective,
      parameters: {
        product: params.product,
        order_quantities: params.orderQuantities,
        incoming_stock: params.incomingStock,
        arrival_day: params.arrivalDay,
        ...(params.safetyStock !== undefined ? { safety_stock: params.safetyStock } : {}),
      },
    })
  }

  const data = simulateMutation.data
  const variants: Row[] = data ? [data.baseline, ...data.alternatives] : []

  return (
    <div
      style={isFullscreen ? { background: 'var(--bg)' } : undefined}
      className={`space-y-6 ${isFullscreen ? 'fixed inset-0 z-50 overflow-y-auto p-6' : ''}`}
    >
      <PageHeader
        eyebrow="DECISION SCENARIO STUDIO"
        title="Interactive 3D Scenario Simulator"
        subtitle="Test pricing elasticity, marketing budget shifts, and inventory replenishment plans with interactive 3D comparison and human governance."
        aside={
          <Button size="sm" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen 3D'}</span>
          </Button>
        }
      />

      {/* Domain & Studio Mode Strip */}
      <div
        className="dp-surface p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {tabList.map((tab) => {
            const Icon = tab.icon
            const isActive = viewMode === 'studio' && activeTab === tab.id
            return (
              <Button
                key={tab.id}
                size="sm"
                variant={isActive ? 'primary' : 'outline'}
                onClick={() => handleSelectTab(tab.id)}
              >
                <Icon size={14} />
                <span>{tab.title}</span>
              </Button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
            <Button
              size="sm"
              variant={viewMode === 'studio' ? 'primary' : 'ghost'}
              onClick={() => setViewMode('studio')}
            >
              <SlidersHorizontal size={13} />
              <span>Planning Studio</span>
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'comparison' ? 'primary' : 'ghost'}
              onClick={() => setViewMode('comparison')}
            >
              <Layers size={13} />
              <span>Compare Scenarios</span>
            </Button>
          </div>
        </div>
      </div>

      <ErrorState error={simulateMutation.error} />

      {viewMode === 'comparison' ? (
        <ComparisonModeView scenarioData={data} />
      ) : (
        <div className="space-y-6">
          {/* 3-Column Planning Studio */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left: Interactive Simulation Parameters */}
            <Card className="lg:col-span-4 space-y-4">
              <SectionHeader
                title={tabList.find((t) => t.id === controlTab)?.title || 'Scenario Controls'}
                detail={
                  controlTab === 'pricing'
                    ? 'Price elasticity simulation (0–20%)'
                    : controlTab === 'marketing'
                    ? 'ROAS & channel spend reallocation'
                    : controlTab === 'inventory'
                    ? 'Lead-time & stockout risk prevention'
                    : 'Financial baseline & core KPIs'
                }
              />

              {controlTab === 'overview' && <BusinessOverviewTab kpiData={kpiQuery.data} />}
              {controlTab === 'pricing' && (
                <PricingScenarioTab
                  options={options}
                  onSimulatePrice={handleSimulatePrice}
                  isLoading={simulateMutation.isPending}
                  scenarioData={data?.type === 'price' ? data : undefined}
                />
              )}
              {controlTab === 'marketing' && (
                <MarketingScenarioTab
                  options={options}
                  onSimulateMarketing={handleSimulateMarketing}
                  preset={preset ?? undefined}
                  isLoading={simulateMutation.isPending}
                  scenarioData={data?.type === 'marketing' ? data : undefined}
                />
              )}
              {controlTab === 'inventory' && (
                <InventoryScenarioTab
                  options={options}
                  onSimulateInventory={handleSimulateInventory}
                  isLoading={simulateMutation.isPending}
                  scenarioData={data?.type === 'inventory' ? data : undefined}
                />
              )}
            </Card>

            {/* Center: Interactive 3D WebGL Studio + 2D Baseline vs Simulation Comparison */}
            <div className="lg:col-span-4 space-y-5">
              {variants.length > 0 ? (
                <>
                  <div className="flex items-center justify-end gap-1.5 text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>3D Height:</span>
                    {(['profit', 'revenue', 'demand'] as const).map((m) => (
                      <Button
                        key={m}
                        size="sm"
                        variant={metricKey === m ? 'primary' : 'outline'}
                        onClick={() => setMetricKey(m)}
                        className="capitalize"
                      >
                        {m}
                      </Button>
                    ))}
                  </div>
                  <Scenario3DLandscape
                    variants={variants}
                    recommendedName={data ? String(data.recommended.name) : undefined}
                    metricKey={metricKey}
                  />
                  <Card>
                    <SectionHeader
                      title="Baseline vs. Simulation (2D)"
                      detail="Revenue and Contribution Profit comparison"
                    />
                    <Chart
                      data={variants}
                      x="name"
                      height={220}
                      format={moneyCompact}
                      series={[
                        { key: 'revenue', name: 'Revenue', kind: 'bar', color: '#2563EB' },
                        { key: 'profit', name: 'Contribution Profit', kind: 'bar', color: '#16A34A' },
                      ]}
                    />
                  </Card>
                </>
              ) : (
                <Card>
                  <Loading labelText="Running scenario studio…" />
                </Card>
              )}
            </div>

            {/* Right: Recommended Action & Human Approval Panel */}
            <div
              id="sim-panel-recommendations"
              className="lg:col-span-4"
            >
              <Card
                className={
                  activeTab === 'recommendations'
                    ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)]'
                    : ''
                }
              >
                <SectionHeader
                  title="AI Recommendations"
                  detail="Synthesized action & human approval"
                  aside={<StatusBadge tone="accent">Human-in-the-Loop</StatusBadge>}
                />
                <RecommendationsTab
                  scenarioData={data}
                  key={data?.simulation_id || 'empty'}
                  recommendationId={recId}
                  isSimulating={simulateMutation.isPending || simulateMutation.isError}
                />
              </Card>
            </div>
          </div>

          {/* Bottom: Comparison Matrix, Sensitivity Analysis & Explicit Assumptions */}
          {data && (
            <div className="space-y-5">
              <Card>
                <SectionHeader
                  title="Simulation Outcome Comparison Matrix"
                  detail={`Recommended variant: ${String(data.recommended.name)} for objective: ${label(data.objective)}`}
                  aside={<StatusBadge tone="success">Validated Optimization</StatusBadge>}
                />
                <Table
                  rows={variants}
                  columns={[
                    { key: 'name', title: 'Scenario Variant' },
                    { key: 'demand', title: 'Simulated Demand', format: decimal, align: 'right' },
                    { key: 'fulfilled', title: 'Fulfillment Capacity', format: decimal, align: 'right' },
                    { key: 'revenue', title: 'Projected Revenue', format: moneyCompact, align: 'right' },
                    { key: 'profit', title: 'Contribution Profit', format: moneyCompact, align: 'right' },
                    { key: 'margin', title: 'Gross Margin', format: percent, align: 'right' },
                    { key: 'risk', title: 'Unfulfilled Risk', format: integer, align: 'right' },
                  ]}
                />
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card>
                  <SectionHeader
                    title="Sensitivity Analysis"
                    detail="Outcomes tested under alternate elasticity or response parameters"
                  />
                  <div className="space-y-3">
                    {data.sensitivity.map((group, i) => (
                      <details key={i} className="text-xs" style={{ color: 'var(--text)' }}>
                        <summary
                          className="cursor-pointer font-semibold py-1"
                          style={{ color: 'var(--primary-text)' }}
                        >
                          {group.name}
                        </summary>
                        <div className="pt-2">
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
                        </div>
                      </details>
                    ))}
                  </div>
                </Card>

                <Card>
                  <SectionHeader
                    title="Explicit Model Assumptions & Evidence"
                    detail="Mathematical boundaries & operational constraints"
                  />
                  <ul className="space-y-2 text-xs list-disc list-inside" style={{ color: 'var(--text)' }}>
                    {data.assumptions.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                  <Source>Microeconomic Elasticity Formulation · Lead-Time Capacity Cap</Source>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
