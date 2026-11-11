import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../api'
import { mockDataset, mockOptions } from '../mockData'
import { PreferencesProvider } from '../preferences'
import { ToastProvider } from '../ui'
import { ScenarioSimulator3D } from '../features/scenario-simulator/components/ScenarioSimulator3D'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    request: vi.fn(),
    getTwinWorkspace: vi.fn(),
    getTwinScenario: vi.fn(),
    getTwinSimulationRun: vi.fn(),
    createTwinScenario: vi.fn(),
    deleteTwinScenario: vi.fn(),
    patchTwinScenarioVariables: vi.fn(),
    startTwinSimulationRun: vi.fn(),
    compareTwinScenarios: vi.fn(),
    generateTwinRecommendation: vi.fn(),
    ensureTwinBaseline: vi.fn(),
    updateTwinScenario: vi.fn(),
  }
})

const TEST_SESSION: api.Session = {
  authentication: 'token',
  actor: 'analyst-lead',
  role: 'admin',
  company_ids: ['comp-twin'],
  import_enabled: true,
}

const SAMPLE_ZONES: api.TwinZone[] = [
  {
    id: 'marketing',
    name: 'Marketing Zone',
    department: 'Growth & Demand Generation',
    description: 'Ad spend & ROAS',
    position: [-11.5, 0, -5.5],
    color: '#2563EB',
    accent: '#0284C7',
    node_ids: ['mkt_budget', 'mkt_analytics'],
    baseline: { zone_id: 'marketing', supported: true, metrics: { marketing_budget: 2400 } },
  },
  {
    id: 'customers',
    name: 'Customer Zone',
    department: 'Retention',
    description: 'Active cohorts',
    position: [-4, 0, -7.2],
    color: '#0284C7',
    accent: '#38BDF8',
    node_ids: ['cust_segments'],
    baseline: { zone_id: 'customers', supported: true, metrics: { active_customers: 45 } },
  },
  {
    id: 'sales',
    name: 'Sales Zone',
    department: 'Commercial',
    description: 'Orders & Revenue',
    position: [4.5, 0, -5.5],
    color: '#16A34A',
    accent: '#22C55E',
    node_ids: ['sales_pricing', 'sales_orders', 'sales_revenue'],
    baseline: { zone_id: 'sales', supported: true, metrics: { revenue: 18500 } },
  },
  {
    id: 'supply_chain',
    name: 'Supply Chain Zone',
    department: 'Logistics',
    description: 'Supplier lead times',
    position: [-11.5, 0, 5.5],
    color: '#D97706',
    accent: '#F59E0B',
    node_ids: ['sc_suppliers', 'sc_lead_time'],
    baseline: { zone_id: 'supply_chain', supported: true, metrics: { avg_lead_time_days: 7 } },
  },
  {
    id: 'inventory',
    name: 'Inventory Zone',
    department: 'Warehouse',
    description: 'Stock & Reorder',
    position: [-3.8, 0, 6.2],
    color: '#EA580C',
    accent: '#FB923C',
    node_ids: ['inv_warehouse', 'inv_reorder', 'inv_risk'],
    baseline: { zone_id: 'inventory', supported: true, metrics: { total_stock_on_hand: 340 } },
  },
  {
    id: 'finance_ops',
    name: 'Finance & Operations Zone',
    department: 'FP&A',
    description: 'Revenue, COGS & Profit',
    position: [4.8, 0, 5.5],
    color: '#0F766E',
    accent: '#14B8A6',
    node_ids: ['fin_costs', 'fin_profit', 'fin_margin'],
    baseline: {
      zone_id: 'finance_ops',
      supported: true,
      metrics: { gross_profit: 8500, operating_expenses: null },
      missing_reason: 'Operating expenses missing unless manually entered.',
    },
  },
  {
    id: 'ai_engine',
    name: 'AI & Analytics Engine',
    department: 'Decision Hub',
    description: 'SQL + LightGBM + RAG',
    position: [0, 1.35, 0],
    color: '#1D4ED8',
    accent: '#60A5FA',
    node_ids: ['ai_sql', 'ai_lgbm', 'ai_cls', 'ai_scenario', 'ai_rag', 'ai_llm'],
    baseline: { zone_id: 'ai_engine', supported: true, metrics: { days_observed: 35 } },
  },
  {
    id: 'outcomes',
    name: 'Business Outcomes',
    department: 'Simulation Results',
    description: 'Forecast & Recommendation',
    position: [11.8, 0, 0],
    color: '#2563EB',
    accent: '#16A34A',
    node_ids: ['out_forecast', 'out_recommendation'],
    baseline: { zone_id: 'outcomes', supported: true, metrics: { horizon_days: 30 } },
  },
]

const SAMPLE_NODES: api.TwinNode[] = [
  { id: 'mkt_budget', zone_id: 'marketing', label: 'Marketing Budget', kind: 'input' },
  { id: 'mkt_analytics', zone_id: 'marketing', label: 'Marketing Funnel', kind: 'process' },
  { id: 'sales_pricing', zone_id: 'sales', label: 'Pricing Lever', kind: 'input' },
  { id: 'sales_orders', zone_id: 'sales', label: 'Demand Orders', kind: 'process' },
  { id: 'sales_revenue', zone_id: 'sales', label: 'Revenue Output', kind: 'metric' },
  { id: 'inv_warehouse', zone_id: 'inventory', label: 'Warehouse Stock', kind: 'metric' },
  { id: 'inv_risk', zone_id: 'inventory', label: 'Stockout Risk', kind: 'metric' },
  { id: 'fin_profit', zone_id: 'finance_ops', label: 'Profit Calc', kind: 'process' },
  { id: 'ai_sql', zone_id: 'ai_engine', label: 'SQL Engine', kind: 'ai_model' },
  { id: 'ai_lgbm', zone_id: 'ai_engine', label: 'LightGBM', kind: 'ai_model' },
  { id: 'ai_cls', zone_id: 'ai_engine', label: 'Classification (Not Integrated)', kind: 'ai_model' },
  { id: 'ai_scenario', zone_id: 'ai_engine', label: 'What-if Engine', kind: 'ai_model' },
  { id: 'ai_rag', zone_id: 'ai_engine', label: 'RAG Policy', kind: 'ai_model' },
  { id: 'ai_llm', zone_id: 'ai_engine', label: 'LLM Advisor', kind: 'ai_model' },
  { id: 'out_forecast', zone_id: 'outcomes', label: 'Outcome Vector', kind: 'output' },
  { id: 'out_recommendation', zone_id: 'outcomes', label: 'Recommendation', kind: 'output' },
]

const SAMPLE_EDGES: api.TwinEdge[] = [
  { id: 'e_mkt_analytics_sql', source: 'mkt_analytics', target: 'ai_sql', label: 'Ad Attribution' },
  { id: 'e_sql_lgbm', source: 'ai_sql', target: 'ai_lgbm', label: 'Daily Series' },
  { id: 'e_lgbm_scen', source: 'ai_lgbm', target: 'ai_scenario', label: 'Baseline Forecast' },
  { id: 'e_scen_orders', source: 'ai_scenario', target: 'sales_orders', label: 'Simulated Volume' },
  { id: 'e_orders_rev', source: 'sales_orders', target: 'sales_revenue', label: 'Projected Revenue' },
  { id: 'e_rev_profit', source: 'sales_revenue', target: 'fin_profit', label: 'Profit Rollup' },
  { id: 'e_out_rag', source: 'out_forecast', target: 'ai_rag', label: 'Policy Lookup' },
]

const SAMPLE_MODELS: api.TwinAIModelInfo[] = [
  { id: 'ai_sql', name: 'SQL Analytics Engine', version: 'sql-analytics-2.1', status: 'integrated', kind: 'sql_analytics', input: 'SQL', output: 'KPIs', note: 'Grounded SQL' },
  { id: 'ai_lgbm', name: 'LightGBM Forecaster', version: 'short-window-statistical', status: 'degraded', kind: 'forecasting', input: '35d', output: 'Forecast', note: '<201d short window fallback' },
  { id: 'ai_cls', name: 'Classification (Churn / Propensity)', version: null, status: 'not_integrated', kind: 'classification', input: 'None', output: 'Not integrated', note: 'No ML churn classifier installed' },
]

function buildRun(id: string, scenId: string): api.TwinSimulationRun {
  return {
    id,
    company_id: 'comp-twin',
    scenario_id: scenId,
    scenario_name: 'Q4 Growth What-if',
    scenario_type: 'revenue_growth',
    dataset_id: 'ds-demo',
    status: 'completed',
    started_at: '2026-11-12T03:00:00Z',
    completed_at: '2026-11-12T03:00:01Z',
    duration_ms: 42.5,
    model_versions: { sql_analytics: 'sql-analytics-2.1', classification: 'not_integrated' },
    input_references: {},
    output_references: { currency: 'USD', revenue_forecast: 22400 },
    data_readiness: {
      score: 82,
      tier: 'moderate',
      days_observed: 35,
      quality_score: 94,
      missing_capabilities: ['opex'],
      supported_scenarios: ['revenue_growth', 'pricing_strategy'],
      unsupported_reasons: ['No external Opex column'],
      checks: [{ name: 'Revenue, Date & Transactions Present', passed: true, category: 'core' }],
      disclaimer: 'Data Readiness measures field & sample coverage only (NOT forecast accuracy).',
    },
    warnings: ['Dataset <201d uses short-window baseline.'],
    assumptions: ['Deterministic sensitivity equation only; not causal inference.'],
    recommendation: null,
    error_details: null,
    pipeline_graph: { nodes: SAMPLE_NODES, edges: SAMPLE_EDGES },
    events: [
      {
        id: 'evt-1',
        company_id: 'comp-twin',
        simulation_run_id: id,
        step_order: 1,
        event_type: 'Flow: Ad Attribution',
        zone_id: 'ai_engine',
        node_id: 'ai_sql',
        source_node_id: 'mkt_analytics',
        target_node_id: 'ai_sql',
        edge_id: 'e_mkt_analytics_sql',
        timestamp: '2026-11-12T03:00:00Z',
        duration_ms: 5,
        status: 'completed',
        record_count: 140,
        metadata: {},
      },
      {
        id: 'evt-2',
        company_id: 'comp-twin',
        simulation_run_id: id,
        step_order: 2,
        event_type: 'Flow: Simulated Volume',
        zone_id: 'sales',
        node_id: 'sales_orders',
        source_node_id: 'ai_scenario',
        target_node_id: 'sales_orders',
        edge_id: 'e_scen_orders',
        timestamp: '2026-11-12T03:00:01Z',
        duration_ms: 8,
        status: 'completed',
        record_count: 30,
        metadata: {},
      },
    ],
    results: [
      {
        id: 'res-1',
        simulation_run_id: id,
        metric_name: 'revenue_forecast',
        domain: 'sales',
        label: 'Revenue Forecast',
        baseline_value: 18500,
        scenario_value: 22400,
        abs_difference: 3900,
        pct_difference: 21.08,
        unit: 'USD',
        uncertainty_metadata: { is_available: false, interval_lower: null, interval_upper: null },
        evidence_references: { model_name: 'LightGBM + Scenario Engine', model_version: 'short-window-statistical' },
      },
      {
        id: 'res-2',
        simulation_run_id: id,
        metric_name: 'profit_forecast',
        domain: 'finance_ops',
        label: 'Profit Forecast (Contribution / Net)',
        baseline_value: 8500,
        scenario_value: 10200,
        abs_difference: 1700,
        pct_difference: 20.0,
        unit: 'USD',
        uncertainty_metadata: { is_available: false, interval_lower: null, interval_upper: null },
        evidence_references: { model_name: 'SQL Analytics + Scenario Engine', model_version: 'counterfactual-1.0' },
      },
      {
        id: 'res-3',
        simulation_run_id: id,
        metric_name: 'gross_margin_pct',
        domain: 'finance_ops',
        label: 'Gross Margin',
        baseline_value: 45.9,
        scenario_value: 45.5,
        abs_difference: -0.4,
        pct_difference: -0.87,
        unit: '%',
        uncertainty_metadata: { is_available: false, interval_lower: null, interval_upper: null },
        evidence_references: { model_name: 'SQL Analytics', model_version: 'sql-analytics-2.1' },
      },
      {
        id: 'res-4',
        simulation_run_id: id,
        metric_name: 'inventory_risk_units',
        domain: 'inventory',
        label: 'Unfulfilled / Stockout Risk',
        baseline_value: 0,
        scenario_value: 0,
        abs_difference: 0,
        pct_difference: null,
        unit: 'units',
        uncertainty_metadata: { is_available: false, interval_lower: null, interval_upper: null },
        evidence_references: { model_name: 'Lead-Time Inventory Model', model_version: 'inventory-replenish-1.0' },
      },
    ],
    created_by: 'analyst-lead',
  }
}

function buildSampleWorkspace(): api.TwinWorkspacePayload {
  const baseRun = buildRun('run-base', 'scen-base')
  const growthRun = buildRun('run-growth', 'scen-growth')
  const baseScen: api.TwinScenario = {
    id: 'scen-base',
    company_id: 'comp-twin',
    dataset_id: 'ds-demo',
    scenario_type: 'baseline',
    name: 'Baseline (Current Business)',
    description: 'Observed SQL baseline',
    baseline_reference: null,
    objective: 'balanced',
    horizon_days: 30,
    is_baseline: true,
    constraints: {},
    configuration: {},
    data_sources: {},
    models: SAMPLE_MODELS,
    created_by: 'system',
    created_at: '2026-11-12T03:00:00Z',
    updated_at: '2026-11-12T03:00:00Z',
    variables: [],
    latest_run: baseRun,
  }
  const growthScen: api.TwinScenario = {
    id: 'scen-growth',
    company_id: 'comp-twin',
    dataset_id: 'ds-demo',
    scenario_type: 'revenue_growth',
    name: 'Q4 Growth What-if',
    description: 'Revenue expansion plan',
    baseline_reference: 'scen-base',
    objective: 'balanced',
    horizon_days: 30,
    is_baseline: false,
    constraints: {},
    configuration: {},
    data_sources: {},
    models: SAMPLE_MODELS,
    created_by: 'analyst-lead',
    created_at: '2026-11-12T03:01:00Z',
    updated_at: '2026-11-12T03:01:00Z',
    variables: [
      {
        id: 'var-1',
        domain: 'marketing',
        variable_name: 'marketing_budget_change_pct',
        label: 'Marketing Budget Change (%)',
        baseline_value: 0,
        scenario_value: 15,
        unit: '%',
        min_value: -50,
        max_value: 150,
        validation_rule: '-50..150',
        source_or_assumption: 'Concave spend response (alpha=0.65)',
        supported: true,
      },
    ],
    latest_run: growthRun,
  }

  return {
    company_id: 'comp-twin',
    dataset_ready: true,
    dataset: {
      dataset_id: mockDataset.dataset_id,
      title: mockDataset.title,
      currency: 'USD',
      start: mockDataset.start,
      end: mockDataset.end,
      capabilities: {
        has_product: true,
        has_marketing: true,
        has_inventory: true,
        has_cost_or_profit: true,
        supports_forecast: true,
      },
    },
    data_readiness: growthRun.data_readiness,
    baseline_scenario_id: 'scen-base',
    baseline: null,
    zones: SAMPLE_ZONES,
    nodes: SAMPLE_NODES,
    edges: SAMPLE_EDGES,
    ai_models: SAMPLE_MODELS,
    variable_templates: {},
    scenarios: [baseScen, growthScen],
    recent_runs: [growthRun, baseRun],
  }
}

function mountSimulator(props: { empty?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <ToastProvider>
          <MemoryRouter>
            <ScenarioSimulator3D
              dataset={props.empty ? undefined : { ...mockDataset, currency: 'USD' }}
              options={props.empty ? undefined : mockOptions}
              session={TEST_SESSION}
            />
          </MemoryRouter>
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  )
}

describe('Interactive 3D Business Scenario Simulator (Digital Twin)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows honest 0/100 Data Readiness empty state when workspace has no dataset', async () => {
    vi.mocked(api.getTwinWorkspace).mockResolvedValue({
      company_id: 'comp-empty',
      dataset_ready: false,
      dataset: null,
      data_readiness: {
        score: 0,
        tier: 'not_ready',
        days_observed: 0,
        quality_score: null,
        missing_capabilities: ['dataset'],
        supported_scenarios: [],
        unsupported_reasons: ['No dataset uploaded'],
        checks: [],
        disclaimer: 'Data Readiness measures field completeness only (NOT forecast accuracy). Zero fake KPIs.',
      },
      baseline: null,
      zones: SAMPLE_ZONES.map((z) => ({ ...z, baseline: { zone_id: z.id, supported: false, metrics: {} } })),
      nodes: SAMPLE_NODES,
      edges: SAMPLE_EDGES,
      ai_models: [],
      variable_templates: {},
      scenarios: [],
      recent_runs: [],
    })

    mountSimulator({ empty: true })

    await expect(screen.findByTestId('twin-empty-workspace-state')).resolves.toBeTruthy()
    expect(screen.getByTestId('empty-readiness-badge').textContent).toContain('0/100')
    expect(screen.getByRole('link', { name: /Upload Business Data/i })).toBeTruthy()
  })

  it('renders Digital Twin studio with 2D WebGL fallback, honest model statuses, step playback, comparison & grounded advisor', async () => {
    const ws = buildSampleWorkspace()
    let growthRun = buildRun('run-growth', 'scen-growth')

    vi.mocked(api.getTwinWorkspace).mockResolvedValue(ws)
    vi.mocked(api.getTwinScenario).mockResolvedValue(ws.scenarios[1])
    vi.mocked(api.getTwinSimulationRun).mockImplementation(async () => growthRun)
    vi.mocked(api.patchTwinScenarioVariables).mockResolvedValue(ws.scenarios[1])
    vi.mocked(api.startTwinSimulationRun).mockResolvedValue(growthRun)
    vi.mocked(api.compareTwinScenarios).mockResolvedValue({
      company_id: 'comp-twin',
      objective: 'balanced',
      constraints: { min_margin: 0.4 },
      ranking_method: 'Feasible scenarios ranked strictly before infeasible ones.',
      recommended_scenario_id: 'scen-growth',
      comparison: [
        {
          rank: 1,
          scenario_id: 'scen-growth',
          name: 'Q4 Growth What-if',
          scenario_type: 'revenue_growth',
          is_baseline: false,
          run_id: 'run-growth',
          revenue: 22400,
          profit: 10200,
          cost: 12200,
          margin_pct: 45.5,
          demand: 240,
          closing_inventory: 100,
          stockout_risk: 0,
          customers: 48,
          marketing_spend: 2760,
          fulfillment_pct: 100,
          feasible: true,
          violations: [],
          warnings: [],
        },
        {
          rank: 2,
          scenario_id: 'scen-base',
          name: 'Baseline (Current Business)',
          scenario_type: 'baseline',
          is_baseline: true,
          run_id: 'run-base',
          revenue: 18500,
          profit: 8500,
          cost: 10000,
          margin_pct: 45.9,
          demand: 200,
          closing_inventory: 140,
          stockout_risk: 0,
          customers: 45,
          marketing_spend: 2400,
          fulfillment_pct: 100,
          feasible: true,
          violations: [],
          warnings: [],
        },
      ],
      sensitivity: {
        scenario_id: 'scen-growth',
        variable_name: 'marketing_budget_change_pct',
        points: [
          { parameter: 'marketing_budget_change_pct', label: '-5 %', delta_step: -20, estimated_revenue: 19200, estimated_profit: 8900 },
          { parameter: 'marketing_budget_change_pct', label: '+15 %', delta_step: 0, estimated_revenue: 22400, estimated_profit: 10200 },
        ],
      },
    })
    const generatedRec: api.TwinRecommendation = {
      run_id: 'run-growth',
      scenario_id: 'scen-growth',
      scenario_name: 'Q4 Growth What-if',
      scenario_type: 'revenue_growth',
      language: 'en',
      synthesis_mode: 'deterministic_grounded',
      recommendation: 'Prioritize controlled rollout of Q4 Growth What-if (+21.08% revenue).',
      summary: 'Grounded on SQL baseline and short-window forecast.',
      supporting_metrics: [],
      supporting_data: {},
      related_models: SAMPLE_MODELS,
      risks: ['Monitor CPA saturation past +20% ad spend.'],
      assumptions: ['Concave spend multiplier alpha=0.65'],
      limitations: ['Classification ML model NOT integrated.'],
      citations: [
        {
          citation_id: 'C1',
          document_id: 'doc-1',
          source_file: 'Growth_Policy.txt',
          snippet: 'Keep gross margin above 42%.',
          rerank_score: 0.91,
        },
      ],
      generated_at: '2026-11-12T03:02:00Z',
    }
    vi.mocked(api.generateTwinRecommendation).mockImplementation(async () => {
      growthRun = { ...growthRun, recommendation: generatedRec }
      return generatedRec
    })
    vi.mocked(api.request).mockResolvedValue({
      simulation_id: 'sim-leg',
      dataset_id: mockDataset.dataset_id,
      decision: 'pending',
      type: 'price',
      objective: 'profit',
      baseline: {},
      alternatives: [],
      recommended: { name: '0% Discount', profit_delta: 0, margin: 0.45, risk: 0 },
      assumptions: ['Baseline assumption'],
      evidence: {},
      sensitivity: [],
    })

    mountSimulator()

    // Studio loads & falls back cleanly to 2D SVG canvas in jsdom
    await expect(screen.findByTestId('digital-twin-studio')).resolves.toBeTruthy()
    await expect(screen.findByTestId('digital-twin-canvas-2d')).resolves.toBeTruthy()

    // Inspect Honest AI Models Tab (Classification explicitly NOT INTEGRATED)
    fireEvent.click(screen.getByRole('tab', { name: 'AI Models' }))
    expect(screen.getByTestId('twin-ai-models-panel').textContent).toContain('NOT INTEGRATED')
    expect(screen.getByTestId('twin-ai-models-panel').textContent).toContain('DEGRADED')

    // Click Step Forward flow control -> increments step counter from 0 / 2 to 1 / 2
    expect(screen.getByTestId('twin-step-counter').textContent).toContain('Step 0 / 2')
    fireEvent.click(screen.getByRole('button', { name: 'Step Forward Flow' }))
    expect(screen.getByTestId('twin-step-counter').textContent).toContain('Step 1 / 2')

    // Edit variable & Execute Simulation
    fireEvent.click(screen.getByRole('tab', { name: 'Variables' }))
    const mktInput = screen.getByLabelText('Marketing Budget Change (%)') as HTMLInputElement
    fireEvent.change(mktInput, { target: { value: '25' } })
    fireEvent.click(screen.getByTestId('twin-apply-run-btn'))
    await waitFor(() => {
      expect(api.patchTwinScenarioVariables).toHaveBeenCalledWith(
        'scen-growth',
        expect.arrayContaining([expect.objectContaining({ variable_name: 'marketing_budget_change_pct', scenario_value: 25 })])
      )
      expect(api.startTwinSimulationRun).toHaveBeenCalled()
    })

    // Open Multi-Scenario Comparison modal
    fireEvent.click(screen.getByTestId('open-multi-compare-btn'))
    await expect(screen.findByTestId('multi-scenario-compare-modal')).resolves.toBeTruthy()
    await expect(screen.findByText(/TOP PICK:/i)).resolves.toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close comparison dialog' }))

    // Switch to exact 'AI Recommendations' button & generate Digital Twin RAG recommendation
    fireEvent.click(screen.getByRole('button', { name: /^AI Recommendations$/ }))
    fireEvent.click(screen.getByTestId('twin-generate-rec-btn'))
    await expect(screen.findByText(/Growth_Policy\.txt/i)).resolves.toBeTruthy()
    expect(screen.getByText(/Classification ML model NOT integrated/i)).toBeTruthy()
  }, 30_000)
})
