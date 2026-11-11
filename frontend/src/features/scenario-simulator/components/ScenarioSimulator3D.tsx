import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  LineChart,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  params,
  request,
  type KPI,
  type Options,
  type Recommendation,
  type Scenario,
} from '../../../api'
import { Button, Card, ErrorState, Heading, Loading, Pill } from '../../../ui'
import type { InteractionMode, SimulatorTab, TabConfig } from '../types'
import { HolographicAIDataSphere } from './HolographicAIDataSphere'
import { HolographicPanel } from './HolographicPanel'
import { BusinessOverviewTab } from './tabs/BusinessOverviewTab'
import { PricingScenarioTab } from './tabs/PricingScenarioTab'
import { MarketingScenarioTab } from './tabs/MarketingScenarioTab'
import { InventoryScenarioTab } from './tabs/InventoryScenarioTab'
import { RecommendationsTab } from './tabs/RecommendationsTab'
import { ComparisonModeView } from './ComparisonModeView'
import { useT } from '../../../preferences'
import { WorkflowNavigationFooter } from '../../../components/EndToEndStepper'

const tabConfigs: TabConfig[] = [
  {
    id: 'overview',
    title: 'Business Overview',
    subtitle: 'Financial baseline & 8 core KPIs',
    iconName: 'LineChart',
    glowColor: '#22d3ee',
  },
  {
    id: 'pricing',
    title: 'Pricing & Discount',
    subtitle: 'Price elasticity simulation (0-20%)',
    iconName: 'CircleDollarSign',
    glowColor: '#6366f1',
  },
  {
    id: 'marketing',
    title: 'Marketing Budget',
    subtitle: 'ROAS & channel spend reallocation',
    iconName: 'Zap',
    glowColor: '#f59e0b',
  },
  {
    id: 'inventory',
    title: 'Inventory Planning',
    subtitle: 'Lead-time & stockout risk prevention',
    iconName: 'Boxes',
    glowColor: '#10b981',
  },
  {
    id: 'recommendations',
    title: 'AI Recommendations',
    subtitle: 'Synthesized actions & human approval',
    iconName: 'Sparkles',
    glowColor: '#8b5cf6',
  },
]

export function ScenarioSimulator3D({ options }: { options: Options }) {
  const { t, language } = useT()
  const isVi = language === 'vi'
  // Deep link from a recommendation: /scenarios?tab=marketing&channel=...&autorun=1&rec=<recommendation id>
  const [search] = useSearchParams()
  const [preset] = useState(() =>
    search.get('autorun') === '1' && search.get('tab') === 'marketing' && search.get('channel')
      ? { channel: search.get('channel') as string, pct: -15, changes: [-0.15, 0.15, 0.3] }
      : null,
  )
  const [recId] = useState(() => search.get('rec') || undefined)
  const [activeTab, setActiveTab] = useState<SimulatorTab>(preset ? 'marketing' : 'pricing')
  const [mode, setMode] = useState<InteractionMode>('focus')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // 1. Fetch real Baseline KPI data
  const kpiQuery = useQuery({
    queryKey: ['simulator-baseline-kpi'],
    queryFn: () => request<KPI>('/kpi/summary?grain=daily'),
  })

  const simulateMutation = useMutation({
    mutationFn: (values: unknown) => request<Scenario>('/simulate', values),
  })

  // Default initial simulation on mount
  useEffect(() => {
    const defaultProduct =
      options.products.find((p) => p.product_name === 'SmartDesk Mini')?.product_id ||
      options.products[0]?.product_id ||
      'P001'

    if (preset) {
      // Same inputs as the recommendation card, so both screens show the same numbers.
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

  // Deep-linked runs scroll the result into view (the 3D sphere fills the first screen).
  useEffect(() => {
    if (preset && simulateMutation.data) {
      document.getElementById('sim-panel-' + activeTab)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [simulateMutation.data?.simulation_id])

  // Navigation handlers
  const tabIndex = tabConfigs.findIndex((t) => t.id === activeTab)
  const handlePrevTab = () => {
    const nextIdx = (tabIndex - 1 + tabConfigs.length) % tabConfigs.length
    setActiveTab(tabConfigs[nextIdx].id)
    if (mode === 'overview') setMode('focus')
  }
  const handleNextTab = () => {
    const nextIdx = (tabIndex + 1) % tabConfigs.length
    setActiveTab(tabConfigs[nextIdx].id)
    if (mode === 'overview') setMode('focus')
  }

  const handleSelectTab = (tabId: SimulatorTab) => {
    setActiveTab(tabId)
    setMode('focus')
  }

  // Real Simulation triggers
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


  return (
    <div
      className={`relative space-y-6 ${
        isFullscreen ? 'fixed inset-0 z-50 bg-[#070b17] overflow-y-auto p-6' : ''
      }`}
    >
      {/* Page Title & Mission */}
      <Heading
        eyebrow="FUTURISTIC 3D DECISION INTELLIGENCE"
        title="Interactive 3D Scenario Simulator"
        subtitle="Explore Decisions Before Making Them · Holographic AI control center with floating interactive scenario tabs and real microeconomic simulation."
        aside={
          <div className="flex items-center gap-2">
            <Button
              className="px-3 py-1.5 text-xs flex items-center gap-1.5 border border-slate-700 bg-slate-900/60"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen 3D'}</span>
            </Button>
          </div>
        }
      />

      {/* Control Navigation Bar (Mode Switcher & Tab Selector) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-[#0c1224] to-[#070b17] shadow-xl">
        {/* Interaction Mode Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
            Mode:
          </span>
          <button
            onClick={() => setMode('overview')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              mode === 'overview'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                : 'bg-slate-900/60 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Eye size={14} />
            <span>Overview Mode</span>
          </button>

          <button
            onClick={() => setMode('focus')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              mode === 'focus'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-500/25'
                : 'bg-slate-900/60 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>Focus Mode</span>
          </button>

          <button
            onClick={() => setMode('comparison')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              mode === 'comparison'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25'
                : 'bg-slate-900/60 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Layers size={14} />
            <span>Compare Scenarios</span>
          </button>
        </div>

        {/* Previous / Next Tab Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevTab}
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-indigo-400 transition-colors"
            aria-label="Previous holographic tab"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Quick Tab Select Chips */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-md py-1">
            {tabConfigs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.title}
              </button>
            ))}
          </div>

          <button
            onClick={handleNextTab}
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-indigo-400 transition-colors"
            aria-label="Next holographic tab"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <ErrorState error={simulateMutation.error} />

      {/* ========================================================
          MODE 3: COMPARISON MODE
          ======================================================== */}
      {mode === 'comparison' ? (
        <ComparisonModeView scenarioData={simulateMutation.data} />
      ) : (
        /* ========================================================
            MODES 1 & 2: OVERVIEW & FOCUS 3D HOLOGRAPHIC ENVIRONMENT
            ======================================================== */
        <div className="relative rounded-3xl border border-indigo-500/20 bg-gradient-to-b from-[#090e1f] via-[#070b17] to-[#040710] p-4 sm:p-6 shadow-2xl overflow-hidden min-h-[700px]">
          {/* Ambient Lighting & Hologram Background Grid */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-gradient-to-tr from-indigo-600/15 via-violet-600/10 to-cyan-400/10 blur-[140px] pointer-events-none" />

          {/* Centered Holographic 3D AI Data Sphere */}
          <div className="relative z-10 flex flex-col items-center justify-center my-2 pointer-events-none">
            <HolographicAIDataSphere activeTab={activeTab} mode={mode} className="max-w-[420px] max-h-[380px]" />
          </div>

          {/* Interactive Floating Holographic Panels */}
          <div
            className={`relative z-20 gap-5 ${
              mode === 'overview'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'max-w-3xl mx-auto'
            }`}
          >
            {/* Tab 1: Business Overview */}
            <HolographicPanel
              id="overview"
              title="Business Overview"
              subtitle="Baseline KPI health & operations"
              icon={<LineChart size={18} />}
              activeTab={activeTab}
              mode={mode}
              onClickTab={handleSelectTab}
            >
              <BusinessOverviewTab kpiData={kpiQuery.data} />
            </HolographicPanel>

            {/* Tab 2: Pricing & Discount Simulator */}
            <HolographicPanel
              id="pricing"
              title="Pricing & Discount"
              subtitle="Elasticity slider (0–20%)"
              icon={<CircleDollarSign size={18} />}
              activeTab={activeTab}
              mode={mode}
              onClickTab={handleSelectTab}
            >
              <PricingScenarioTab
                options={options}
                onSimulatePrice={handleSimulatePrice}
                isLoading={simulateMutation.isPending}
                scenarioData={simulateMutation.data?.type === 'price' ? simulateMutation.data : undefined}
              />
            </HolographicPanel>

            {/* Tab 3: Marketing Budget Simulator */}
            <HolographicPanel
              id="marketing"
              title="Marketing Budget"
              subtitle="Channel spend & diminishing returns"
              icon={<Zap size={18} />}
              activeTab={activeTab}
              mode={mode}
              onClickTab={handleSelectTab}
            >
              <MarketingScenarioTab
                options={options}
                onSimulateMarketing={handleSimulateMarketing}
                preset={preset ?? undefined}
                isLoading={simulateMutation.isPending}
                scenarioData={simulateMutation.data?.type === 'marketing' ? simulateMutation.data : undefined}
              />
            </HolographicPanel>

            {/* Tab 4: Inventory Planning */}
            <HolographicPanel
              id="inventory"
              title="Inventory Planning"
              subtitle="Lead-time & safety stock risk"
              icon={<Boxes size={18} />}
              activeTab={activeTab}
              mode={mode}
              onClickTab={handleSelectTab}
            >
              <InventoryScenarioTab
                options={options}
                onSimulateInventory={handleSimulateInventory}
                isLoading={simulateMutation.isPending}
                scenarioData={simulateMutation.data?.type === 'inventory' ? simulateMutation.data : undefined}
              />
            </HolographicPanel>

            {/* Tab 5: AI Recommendations */}
            <HolographicPanel
              id="recommendations"
              title="AI Recommendations"
              subtitle="Optimized action & human approval"
              icon={<Sparkles size={18} />}
              activeTab={activeTab}
              mode={mode}
              onClickTab={handleSelectTab}
            >
              <RecommendationsTab
                scenarioData={simulateMutation.data}
                key={simulateMutation.data?.simulation_id || 'empty'}
                recommendationId={recId}
                isSimulating={simulateMutation.isPending || simulateMutation.isError}
              />
            </HolographicPanel>
          </div>
        </div>
      )}

      {/* Step 3 End-to-End Workflow Navigation Footer */}
      <WorkflowNavigationFooter
        prevPath="/ask"
        prevLabelKey="Back to AI Copilot Investigation"
        nextPath="/recommendations"
        nextLabelKey="Next: Review & Approve AI Recommendations"
      />
    </div>
  )
}

