import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../api'
import { PreferencesProvider } from '../preferences'
import { ToastProvider } from '../ui'
import { EnterpriseKnowledgeMap } from '../components/lineage/EnterpriseKnowledgeMap'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    getLineageGraph: vi.fn(),
    getLineageNodeDetail: vi.fn(),
    getLineageUpstream: vi.fn(),
    getLineageDownstream: vi.fn(),
    getLineageImpact: vi.fn(),
    listLineagePipelines: vi.fn(),
    listPipelineRuns: vi.fn(),
    getPipelineRunEvents: vi.fn(),
    consumeLineageStream: vi.fn().mockResolvedValue(undefined),
  }
})

const TEST_SESSION: api.Session = {
  authentication: 'token',
  actor: 'analyst-lead',
  role: 'admin',
  company_ids: ['comp-lineage'],
  import_enabled: true,
}

function buildSampleGraph(): api.LineageGraphResponse {
  const nodes: api.LineageNode[] = [
    {
      id: 'src-csv',
      company_id: 'comp-lineage',
      external_id: 'ds-1',
      pipeline_id: 'pipe-1',
      dataset_id: 'ds-1',
      name: 'sales_q3.csv',
      node_type: 'data_source',
      sub_type: 'csv',
      status: 'completed',
      owner: 'analyst-lead',
      layer_order: 0,
      metadata: {
        description: 'Primary transactional CSV upload.',
        file_type: 'CSV',
        record_count: 1420,
        file_size_bytes: 94200,
      },
      created_at: '2026-11-11T09:50:00Z',
      updated_at: '2026-11-11T10:00:00Z',
    },
    {
      id: 'proc-clean',
      company_id: 'comp-lineage',
      external_id: 'proc-clean',
      pipeline_id: 'pipe-1',
      dataset_id: 'ds-1',
      name: 'Data Cleaning & Normalization',
      node_type: 'processing',
      sub_type: 'data_cleaning',
      status: 'completed',
      owner: 'system',
      layer_order: 1,
      metadata: {
        description: '5-axis cleanup, deduplication & currency normalization.',
        record_count: 1410,
      },
      updated_at: '2026-11-11T09:55:00Z',
    },
    {
      id: 'store-rel',
      company_id: 'comp-lineage',
      external_id: 'store-rel',
      pipeline_id: 'pipe-1',
      dataset_id: 'ds-1',
      name: 'Relational Analytics DB',
      node_type: 'storage',
      sub_type: 'database',
      status: 'completed',
      owner: 'system',
      layer_order: 2,
      metadata: {
        description: 'Tenant-scoped analytical tables.',
        record_count: 1410,
      },
      updated_at: '2026-11-11T09:57:00Z',
    },
    {
      id: 'ai-lgbm',
      company_id: 'comp-lineage',
      external_id: 'lgbm-v2',
      pipeline_id: 'pipe-1',
      dataset_id: 'ds-1',
      name: 'LightGBM Forecaster',
      node_type: 'ai_model',
      sub_type: 'lightgbm',
      status: 'completed',
      owner: 'system',
      layer_order: 3,
      metadata: {
        description: 'Gradient-boosted demand forecasting model.',
        model_version: 'dp-lgbm-1.2',
      },
      updated_at: '2026-11-11T09:58:00Z',
    },
    {
      id: 'bi-forecast',
      company_id: 'comp-lineage',
      external_id: 'bi-fc',
      pipeline_id: 'pipe-1',
      dataset_id: 'ds-1',
      name: 'Sales Forecast',
      node_type: 'business_intelligence',
      sub_type: 'sales_forecast',
      status: 'completed',
      owner: 'system',
      layer_order: 4,
      metadata: {
        description: '7-30 day demand prediction intervals.',
      },
      updated_at: '2026-11-11T09:59:00Z',
    },
    {
      id: 'out-fc',
      company_id: 'comp-lineage',
      external_id: 'fc:ds-1',
      pipeline_id: 'pipe-1',
      dataset_id: 'ds-1',
      name: 'Revenue Forecast (2026-10)',
      node_type: 'final_output',
      sub_type: 'business_insight',
      status: 'completed',
      owner: 'system',
      layer_order: 5,
      metadata: {
        description: 'Traceable revenue & unit demand forecast output.',
        output_reference: '/forecast',
      },
      updated_at: '2026-11-11T10:00:00Z',
    },
  ]

  const edges: api.LineageEdge[] = [
    {
      id: 'edge-1',
      company_id: 'comp-lineage',
      pipeline_id: 'pipe-1',
      run_id: 'run-1',
      source_node_id: 'src-csv',
      target_node_id: 'proc-clean',
      relationship_type: 'CLEANED_BY',
      status: 'completed',
      data_transferred: '1,420 rows -> 1,410 clean rows',
      record_count: 1410,
      transformation: 'Deduplicate & coerce numeric types',
      metadata: {},
      updated_at: '2026-11-11T09:55:00Z',
    },
    {
      id: 'edge-2',
      company_id: 'comp-lineage',
      pipeline_id: 'pipe-1',
      run_id: 'run-1',
      source_node_id: 'proc-clean',
      target_node_id: 'store-rel',
      relationship_type: 'STORED_IN',
      status: 'completed',
      record_count: 1410,
      transformation: 'Persist canonical tenant order rows',
      metadata: {},
      updated_at: '2026-11-11T09:57:00Z',
    },
    {
      id: 'edge-3',
      company_id: 'comp-lineage',
      pipeline_id: 'pipe-1',
      run_id: 'run-1',
      source_node_id: 'store-rel',
      target_node_id: 'ai-lgbm',
      relationship_type: 'TRAINS_AND_SCORES',
      status: 'completed',
      record_count: 1410,
      transformation: 'Observed time-series matrix & holdout bounds',
      metadata: {},
      updated_at: '2026-11-11T09:58:00Z',
    },
    {
      id: 'edge-4',
      company_id: 'comp-lineage',
      pipeline_id: 'pipe-1',
      run_id: 'run-1',
      source_node_id: 'ai-lgbm',
      target_node_id: 'bi-forecast',
      relationship_type: 'FORECASTS',
      status: 'completed',
      transformation: 'Conformal horizon projection',
      metadata: {},
      updated_at: '2026-11-11T09:59:00Z',
    },
    {
      id: 'edge-5',
      company_id: 'comp-lineage',
      pipeline_id: 'pipe-1',
      run_id: 'run-1',
      source_node_id: 'bi-forecast',
      target_node_id: 'out-fc',
      relationship_type: 'PRODUCES_INSIGHT',
      status: 'completed',
      transformation: 'Generate demand & revenue forecast insight',
      metadata: {},
      updated_at: '2026-11-11T10:00:00Z',
    },
  ]

  const pipeline: api.LineagePipeline = {
    id: 'pipe-1',
    company_id: 'comp-lineage',
    name: 'Enterprise Tabular Decision Pipeline',
    pipeline_type: 'tabular_ingestion',
    description: 'End-to-end CSV validation, storage, forecasting & insight generation.',
    status: 'completed',
    owner: 'analyst-lead',
    metadata: {},
    run_count: 1,
  }

  const events: api.PipelineEventItem[] = [
    {
      id: 'ev-1',
      company_id: 'comp-lineage',
      pipeline_id: 'pipe-1',
      pipeline_run_id: 'run-1',
      node_id: 'src-csv',
      event_type: 'CSV File Uploaded',
      step_order: 1,
      timestamp: '2026-11-11T09:50:00Z',
      duration_ms: 12,
      status: 'completed',
      input_summary: 'sales_q3.csv',
      output_summary: '1,420 raw rows',
      metadata: {},
      incoming_edge_ids: [],
    },
    {
      id: 'ev-2',
      company_id: 'comp-lineage',
      pipeline_id: 'pipe-1',
      pipeline_run_id: 'run-1',
      node_id: 'proc-clean',
      event_type: 'Data Cleaning Completed',
      step_order: 2,
      timestamp: '2026-11-11T09:55:00Z',
      duration_ms: 42,
      status: 'completed',
      input_summary: '1,420 raw rows',
      output_summary: '1,410 validated rows',
      metadata: {},
      incoming_edge_ids: ['edge-1'],
    },
    {
      id: 'ev-3',
      company_id: 'comp-lineage',
      pipeline_id: 'pipe-1',
      pipeline_run_id: 'run-1',
      node_id: 'out-fc',
      event_type: 'Revenue Forecast Generated',
      step_order: 3,
      timestamp: '2026-11-11T10:00:00Z',
      duration_ms: 85,
      status: 'completed',
      input_summary: 'LightGBM dp-lgbm-1.2',
      output_summary: 'Published to /forecast',
      metadata: {},
      incoming_edge_ids: ['edge-5'],
    },
  ]

  return {
    company_id: 'comp-lineage',
    synced_at: '2026-11-11T10:00:00Z',
    summary: {
      total_data_sources: 1,
      processing_pipelines: 1,
      ai_models: 1,
      business_insights: 1,
      data_quality_score: 96.4,
      last_synchronized: '2026-11-11T10:00:00Z',
    },
    nodes,
    edges,
    matched_node_ids: nodes.map((n) => n.id),
    pipelines: [pipeline],
    recent_events: events,
    facets: {
      node_types: ['data_source', 'processing', 'storage', 'ai_model', 'business_intelligence', 'final_output'],
      statuses: ['completed'],
      owners: ['analyst-lead', 'system'],
      sources: [{ id: 'src-csv', name: 'sales_q3.csv', sub_type: 'csv' }],
      models: [{ id: 'ai-lgbm', name: 'LightGBM Forecaster', sub_type: 'lightgbm' }],
    },
    has_active_processing: false,
  }
}

function setupSampleMocks() {
  const sample = buildSampleGraph()
  const run: api.LineageRun = {
    id: 'run-1',
    company_id: 'comp-lineage',
    pipeline_id: 'pipe-1',
    dataset_id: 'ds-1',
    status: 'completed',
    trigger_type: 'user_import',
    actor: 'analyst-lead',
    input_references: ['sales_q3.csv'],
    output_references: ['Revenue Forecast (2026-10)'],
    model_version: 'dp-lgbm-1.2',
    started_at: '2026-11-11T09:50:00Z',
    completed_at: '2026-11-11T10:00:00Z',
    duration_ms: 139,
    metadata: {},
  }

  vi.mocked(api.getLineageGraph).mockResolvedValue(sample)
  vi.mocked(api.listPipelineRuns).mockResolvedValue({
    company_id: 'comp-lineage',
    pipeline: sample.pipelines[0],
    items: [run],
  })
  vi.mocked(api.getPipelineRunEvents).mockResolvedValue({
    company_id: 'comp-lineage',
    run,
    items: sample.recent_events,
  })
  vi.mocked(api.getLineageUpstream).mockImplementation(async (nodeId) => ({
    company_id: 'comp-lineage',
    root_node_id: nodeId,
    root_node: sample.nodes.find((n) => n.id === nodeId) || sample.nodes[5],
    direction: 'upstream',
    node_ids: sample.nodes.map((n) => n.id),
    edge_ids: sample.edges.map((e) => e.id),
    depths: { 'out-fc': 0, 'bi-forecast': 1, 'ai-lgbm': 2, 'store-rel': 3, 'proc-clean': 4, 'src-csv': 5 },
    nodes: sample.nodes,
    edges: sample.edges,
  }))
  vi.mocked(api.getLineageDownstream).mockImplementation(async (nodeId) => ({
    company_id: 'comp-lineage',
    root_node_id: nodeId,
    root_node: sample.nodes.find((n) => n.id === nodeId) || sample.nodes[0],
    direction: 'downstream',
    node_ids: sample.nodes.map((n) => n.id),
    edge_ids: sample.edges.map((e) => e.id),
    depths: { 'src-csv': 0, 'proc-clean': 1, 'store-rel': 2, 'ai-lgbm': 3, 'bi-forecast': 4, 'out-fc': 5 },
    nodes: sample.nodes,
    edges: sample.edges,
  }))
  vi.mocked(api.getLineageNodeDetail).mockImplementation(async (nodeId) => {
    const target = sample.nodes.find((n) => n.id === nodeId) || sample.nodes[0]
    return {
      node: target,
      overview: {
        id: target.id,
        external_id: target.external_id,
        name: target.name,
        node_type: target.node_type,
        sub_type: target.sub_type,
        status: target.status,
        description: target.metadata.description || 'Enterprise traceability node.',
        created_at: target.created_at,
        updated_at: target.updated_at,
        owner: target.owner,
      },
      data_information: {
        input_schema: ['date', 'product', 'revenue'],
        output_schema: ['date', 'product', 'forecast_p50'],
        record_count: target.metadata.record_count ?? 1410,
        data_size_bytes: 94200,
        data_format: 'CSV',
        quality_metrics: { overall_score: 96.4 },
      },
      lineage: {
        upstream_nodes: nodeId === 'src-csv' ? [] : [sample.nodes[0]],
        downstream_nodes: nodeId === 'out-fc' ? [] : [sample.nodes[5]],
        related_pipelines: sample.pipelines,
        related_insights: [
          {
            id: 'out-fc',
            name: 'Revenue Forecast (2026-10)',
            sub_type: 'business_insight',
            status: 'completed',
            output_reference: '/forecast',
          },
        ],
      },
      execution: {
        pipeline_run_id: 'run-1',
        execution_time: '2026-11-11T10:00:00Z',
        duration_ms: 85,
        model_version: 'dp-lgbm-1.2',
        logs: sample.recent_events,
      },
      impact: {
        company_id: 'comp-lineage',
        node_id: target.id,
        node: target,
        upstream_sources: [sample.nodes[0]],
        dependent_nodes: sample.nodes.slice(1),
        affected_reports: [
          {
            id: 'out-fc',
            name: 'Revenue Forecast (2026-10)',
            sub_type: 'business_insight',
            status: 'completed',
            output_reference: '/forecast',
          },
        ],
        affected_pipelines: sample.pipelines,
        stored_business_insights_count: 1,
        reprocessing_recommendations: [
          'Re-run LightGBM training & refresh forecast telemetry after uploading corrected source records.',
        ],
        honesty_note:
          'Downstream outputs are candidates for review or re-execution if an upstream node fails or changes; existing persisted outputs remain valid until reprocessed.',
      },
    }
  })
  return sample
}

function mountKnowledgeMap(companyId = 'comp-lineage') {
  localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'vnd' }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/knowledge-map']}>
            <EnterpriseKnowledgeMap companyId={companyId} session={TEST_SESSION} />
          </MemoryRouter>
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('Enterprise Knowledge Map & Data Traceability UI', () => {
  it('renders 6 live KPI cards, grounded models only, and zero idle particle animations', async () => {
    setupSampleMocks()
    const { container } = mountKnowledgeMap()

    expect(await screen.findByText('Enterprise Data Traceability')).toBeTruthy()
    expect(await screen.findByText('96.4%')).toBeTruthy()
    expect(screen.getByText('Total Data Sources')).toBeTruthy()
    expect(screen.getByText('Processing Pipelines')).toBeTruthy()
    expect(screen.getByText('AI Models')).toBeTruthy()
    expect(screen.getByText('Business Insights')).toBeTruthy()
    expect(screen.getByText('Data Quality Score')).toBeTruthy()
    expect(screen.getByText('Last Synchronized')).toBeTruthy()

    const modelNode = await screen.findByTestId('lineage-node-ai-lgbm')
    expect(modelNode).toBeTruthy()
    expect(modelNode.textContent).toContain('LightGBM Forecaster')
    expect(screen.queryByText(/Churn Prediction/i)).toBeNull()
    expect(screen.queryByText(/Classification Model/i)).toBeNull()

    // Idle graph with completed status renders ZERO <animateMotion> particles
    expect(container.querySelectorAll('animateMotion').length).toBe(0)
  })

  it('traces upstream on final_output click, opens 5-tab Inspector with honest Impact policy, and traces downstream on Data Source click', async () => {
    setupSampleMocks()
    const { container } = mountKnowledgeMap()

    const insightNode = await screen.findByTestId('lineage-node-out-fc')
    fireEvent.click(insightNode)

    await waitFor(() => expect(api.getLineageUpstream).toHaveBeenCalledWith('out-fc'))
    expect(await screen.findByTestId('node-detail-inspector')).toBeTruthy()

    // All 5 tabs present
    for (const tabLabel of ['Overview', 'Data', 'Lineage', 'Execution', 'Impact']) {
      expect(screen.getByRole('tab', { name: tabLabel })).toBeTruthy()
    }

    // Traced path turns on smooth particle motion
    await waitFor(() => expect(container.querySelectorAll('animateMotion').length).toBeGreaterThan(0))

    // Open Impact tab and check honesty note & affected reports
    fireEvent.click(screen.getByRole('tab', { name: 'Impact' }))
    expect(await screen.findByText(/Impact Trace & Review Policy/i)).toBeTruthy()
    expect(screen.getByText(/candidates for review or re-execution/i)).toBeTruthy()
    expect(screen.getByText(/Reprocessing Guidance/i)).toBeTruthy()

    // Click Data Source node -> triggers getLineageDownstream
    const srcNode = screen.getByTestId('lineage-node-src-csv')
    fireEvent.click(srcNode)
    await waitFor(() => expect(api.getLineageDownstream).toHaveBeenCalledWith('src-csv'))
  })

  it('opens Edge Detail Inspector on SVG edge click and focuses node on Timeline event click', async () => {
    setupSampleMocks()
    mountKnowledgeMap()

    const edgeGroup = await screen.findByTestId('lineage-edge-edge-1')
    const clickPath = edgeGroup.querySelector('path')
    expect(clickPath).toBeTruthy()
    fireEvent.click(clickPath!)

    const edgeInspector = await screen.findByLabelText('Edge Detail Inspector')
    expect(edgeInspector).toBeTruthy()
    expect(screen.getByText('CLEANED BY')).toBeTruthy()
    expect(screen.getByText('Deduplicate & coerce numeric types')).toBeTruthy()

    // Click Timeline event -> focuses & opens corresponding node in Node Detail Inspector
    const timelineEvent = screen.getByTestId('timeline-event-ev-2')
    fireEvent.click(timelineEvent)
    await waitFor(() => expect(api.getLineageNodeDetail).toHaveBeenCalledWith('proc-clean'))
    expect(await screen.findByTestId('node-detail-inspector')).toBeTruthy()
  })

  it('plays historical pipeline events step-by-step and honors Reduce Motion + JSON/SVG export', async () => {
    setupSampleMocks()
    const createObjectUrlSpy = vi.fn().mockReturnValue('blob:mock-lineage')
    const revokeObjectUrlSpy = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectUrlSpy })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectUrlSpy })

    const { container } = mountKnowledgeMap()

    await waitFor(() => expect(api.getPipelineRunEvents).toHaveBeenCalledWith('run-1'))
    const stepForwardBtn = await screen.findByRole('button', { name: 'Step Forward' })
    await waitFor(() => expect((stepForwardBtn as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(stepForwardBtn)
    expect(await screen.findByText('Step 1 / 3')).toBeTruthy()
    fireEvent.click(stepForwardBtn)
    expect(await screen.findByText('Step 2 / 3')).toBeTruthy()
    await waitFor(() => expect(container.querySelectorAll('animateMotion').length).toBeGreaterThan(0))

    // Toggle Reduce Motion on -> pill appears and live particles halt immediately
    fireEvent.click(screen.getByRole('button', { name: 'Reduce Motion' }))
    expect(await screen.findByText('Reduce Motion On')).toBeTruthy()
    await waitFor(() => expect(container.querySelectorAll('animateMotion').length).toBe(0))

    // Export JSON & SVG use client serialization cleanly
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export SVG' }))
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2)
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Reset Flow' }))
    expect(await screen.findByText('Step 0 / 3')).toBeTruthy()
  })

  it('renders honest empty state with zero synthetic placeholder nodes on an empty workspace', async () => {
    vi.mocked(api.getLineageGraph).mockResolvedValue({
      company_id: 'comp-empty',
      synced_at: '2026-11-11T10:00:00Z',
      summary: {
        total_data_sources: 0,
        processing_pipelines: 0,
        ai_models: 0,
        business_insights: 0,
        data_quality_score: null,
        last_synchronized: null,
      },
      nodes: [],
      edges: [],
      matched_node_ids: [],
      pipelines: [],
      recent_events: [],
      facets: { node_types: [], statuses: [], owners: [], sources: [], models: [] },
      has_active_processing: false,
    })

    mountKnowledgeMap('comp-empty')

    expect(await screen.findByTestId('empty-lineage-state')).toBeTruthy()
    expect(screen.getByText('No Real Data Lineage Recorded Yet')).toBeTruthy()
    expect(screen.queryByTestId(/lineage-node-/)).toBeNull()
  })
})
