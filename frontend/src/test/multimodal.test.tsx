import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PreferencesProvider } from '../preferences'
import { ToastProvider } from '../ui'
import { DataSourcesPage } from '../components/DataSourcesPage'
import { MultimodalWorkspacePanel } from '../components/ingestion/MultimodalWorkspacePanel'
import { ConnectorsHub } from '../components/ingestion/ConnectorsHub'
import * as api from '../api'

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../api')>()
  return {
    ...orig,
    request: vi.fn(),
    listEnterpriseDatasets: vi.fn(),
    listMultimodalFiles: vi.fn(),
    listIngestionJobs: vi.fn(),
    listMultimodalInsights: vi.fn(),
    uploadMultimodalFiles: vi.fn(),
    getFileExtractions: vi.fn(),
    patchExtractedRecord: vi.fn(),
    approveImportFile: vi.fn(),
    listConnectors: vi.fn(),
    listDataSources: vi.fn(),
    discoverDataSourceSchema: vi.fn(),
    syncDataSource: vi.fn(),
    listDataSourceSyncLogs: vi.fn(),
  }
})

const adminSession: api.Session = {
  actor: 'admin',
  role: 'admin',
  authentication: 'token',
  import_enabled: true,
}

const dataset: api.Dataset = {
  dataset_id: 'd'.repeat(24),
  kind: 'uploaded',
  start: '2026-08-01',
  end: '2026-08-31',
  title: 'Multimodal Smoke Set',
  counts: { sales_transactions: 10, multimodal_insights: 1 },
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PreferencesProvider>
        <ToastProvider>{ui}</ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'vnd' }))
  vi.mocked(api.request).mockResolvedValue({ model_ready: true, database_dialect: 'sqlite' })
  vi.mocked(api.listEnterpriseDatasets).mockResolvedValue({ company_id: 'comp-default', company_name: 'Default Workspace', active_dataset_id: dataset.dataset_id, items: [] })
  vi.mocked(api.listMultimodalFiles).mockResolvedValue({ company_id: 'comp-default', items: [] })
  vi.mocked(api.listIngestionJobs).mockResolvedValue({ company_id: 'comp-default', items: [] })
  vi.mocked(api.listMultimodalInsights).mockResolvedValue({ company_id: 'comp-default', items: [] })
  vi.mocked(api.listConnectors).mockResolvedValue({ items: [] })
  vi.mocked(api.listDataSources).mockResolvedValue({ company_id: 'comp-default', items: [] })
})

describe('Multimodal Workspace & HITL Extraction Flow', () => {
  it('switches from Structured Tabular mode to Multimodal & Media Studio without breaking default tab', async () => {
    renderWithProviders(<DataSourcesPage companyId="comp-default" dataset={dataset} session={adminSession} />)

    expect(screen.getByRole('checkbox')).toBeTruthy()
    const mmTab = screen.getByRole('tab', { name: /Multimodal & Media Studio/i })
    fireEvent.click(mmTab)

    await screen.findByText('Multimodal Data & Intelligence Studio')
    expect(screen.getByText('Async Ingestion Queue')).toBeTruthy()
    expect(screen.getByText('Multimodal File Catalog')).toBeTruthy()
  })

  it('queues multi-file upload, enforces mandatory HITL edit + confirm toggle, and promotes to BI', async () => {
    const fileItem: api.MultimodalFile = {
      id: 'mm-1',
      file_id: 'mm-1',
      company_id: 'comp-default',
      dataset_id: 'ds-mm-1',
      data_source_id: 'src-1',
      file_name: 'invoice_08.png',
      mime_type: 'image/png',
      modality: 'image',
      file_format: 'png',
      file_size_bytes: 2048,
      checksum_sha256: 'abc1234567890000',
      upload_timestamp: '2026-08-20T10:00:00Z',
      processing_status: 'awaiting_approval',
      extraction_status: 'completed',
      validation_status: 'needs_review',
      confidence_threshold: 0.85,
      consent_external_ai: false,
      privacy_notice_accepted: true,
      retention_days: 90,
      expires_at: null,
      source_metadata: { warnings: ['Verify OCR amounts before BI promotion.'] },
      extraction_summary: { total_extracted: 1, below_threshold: 1, average_confidence: 0.78 },
      signed_content_url: '/api/v1/files/mm-1/content?subkey=raw&token=sig',
      created_by: 'admin',
      updated_at: '2026-08-20T10:01:00Z',
      imported_at: null,
    }

    vi.mocked(api.listMultimodalFiles).mockResolvedValue({ company_id: 'comp-default', items: [fileItem] })
    vi.mocked(api.uploadMultimodalFiles).mockResolvedValue({
      company_id: 'comp-default',
      dataset_id: 'ds-mm-1',
      files: [fileItem],
      jobs: [
        {
          id: 'job-1',
          company_id: 'comp-default',
          dataset_id: 'ds-mm-1',
          file_id: 'mm-1',
          data_source_id: null,
          job_type: 'multimodal_extract',
          idempotency_key: null,
          status: 'queued',
          stage: 'uploaded',
          progress_pct: 5,
          attempt: 0,
          max_attempts: 3,
          timeout_seconds: 120,
          result_summary: {},
          error_message: null,
          created_by: 'admin',
          created_at: '2026-08-20T10:00:00Z',
          started_at: null,
          finished_at: null,
        },
      ],
    })
    vi.mocked(api.getFileExtractions).mockResolvedValue({
      file: fileItem,
      confidence_threshold: 0.85,
      count: 1,
      below_threshold_count: 1,
      items: [
        {
          id: 'ext-1',
          company_id: 'comp-default',
          dataset_id: 'ds-mm-1',
          file_id: 'mm-1',
          source_id: 'src-1',
          modality: 'image',
          entity_type: 'invoice',
          extraction_timestamp: '2026-08-20T10:01:00Z',
          source_location: { file: 'invoice_08.png', layout_class: 'invoice_or_receipt' },
          raw_payload: {},
          extracted_data: { date: '2026-08-15', product: 'POS Unit', revenue: 1200, cost: 700, quantity: 2 },
          corrected_data: null,
          effective_data: { date: '2026-08-15', product: 'POS Unit', revenue: 1200, cost: 700, quantity: 2 },
          confidence_score: 0.78,
          confidence_threshold: 0.85,
          below_threshold: true,
          extraction_method: 'image_windows_winrt_ocr',
          validation_status: 'needs_review',
          needs_human_review: true,
          reviewed_by: null,
          reviewed_at: null,
          transformation_history: [{ action: 'ocr_numeric_repair' }],
          promoted: false,
        },
      ],
    })
    vi.mocked(api.patchExtractedRecord).mockResolvedValue({
      id: 'ext-1',
      company_id: 'comp-default',
      dataset_id: 'ds-mm-1',
      file_id: 'mm-1',
      source_id: 'src-1',
      modality: 'image',
      entity_type: 'invoice',
      extraction_timestamp: '2026-08-20T10:01:00Z',
      source_location: { file: 'invoice_08.png' },
      raw_payload: {},
      extracted_data: { date: '2026-08-15', product: 'POS Unit', revenue: 1200, cost: 700, quantity: 2 },
      corrected_data: { revenue: 1500 },
      effective_data: { date: '2026-08-15', product: 'POS Unit', revenue: 1500, cost: 700, quantity: 2 },
      confidence_score: 0.78,
      confidence_threshold: 0.85,
      below_threshold: true,
      extraction_method: 'image_windows_winrt_ocr',
      validation_status: 'edited',
      needs_human_review: false,
      reviewed_by: 'admin',
      reviewed_at: '2026-08-20T10:02:00Z',
      transformation_history: [{ action: 'human_correction' }],
      promoted: false,
    })
    vi.mocked(api.approveImportFile).mockResolvedValue({
      approved: true,
      file_id: 'mm-1',
      dataset_id: 'ds-mm-1',
      promoted_financial_rows: 1,
      promoted_insights: 1,
      counts: { sales_transactions: 1, multimodal_insights: 1 },
      activated: true,
      model_ready: false,
      currency: 'USD',
    })

    renderWithProviders(<MultimodalWorkspacePanel companyId="comp-default" session={adminSession} />)

    // Queue a batch of 2 files
    const imgFile = new File(['pngdata'], 'invoice_08.png', { type: 'image/png' })
    const pdfFile = new File(['pdfdata'], 'brief.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Multimodal batch files'), { target: { files: [imgFile, pdfFile] } })
    fireEvent.click(screen.getByRole('button', { name: /Upload & Queue Extraction Job/i }))
    await waitFor(() => expect(api.uploadMultimodalFiles).toHaveBeenCalledTimes(1))

    // Open HITL Workbench
    await screen.findByText('invoice_08.png')
    fireEvent.click(screen.getByRole('button', { name: /Review & Approve/i }))

    await screen.findByText(/Human-in-the-Loop Verification: invoice_08.png/i)
    await screen.findByText(/fall below the/i)

    // Edit revenue inline
    fireEvent.click(screen.getByRole('button', { name: /Edit Fields/i }))
    fireEvent.change(screen.getByLabelText('Edit revenue for ext-1'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Correction/i }))
    await waitFor(() =>
      expect(api.patchExtractedRecord).toHaveBeenCalledWith('ext-1', expect.objectContaining({ validation_status: 'edited' }))
    )

    // Import button stays disabled until explicit confirmation switch is toggled
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Import to BI/i }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    fireEvent.click(screen.getByRole('switch', { name: /Confirm extracted data is verified/i }))
    expect(confirmBtn.disabled).toBe(false)
    fireEvent.click(confirmBtn)

    await waitFor(() =>
      expect(api.approveImportFile).toHaveBeenCalledWith('mm-1', expect.objectContaining({ confirmed: true, activate: true }))
    )
  })

  it('supports schema discovery and incremental sync in ConnectorsHub', async () => {
    vi.mocked(api.listConnectors).mockResolvedValue({
      items: [
        {
          connector_type: 'rest_api',
          display_name: 'REST API / Webhook',
          category: 'api',
          description: 'Live REST endpoint connector',
          status: 'extensible',
          supported_formats: ['json'],
          config_fields: [],
        },
      ],
    })
    vi.mocked(api.listDataSources).mockResolvedValue({
      company_id: 'comp-default',
      items: [
        {
          id: 'src-rest-1',
          company_id: 'comp-default',
          name: 'ERP REST Orders',
          source_type: 'rest_api',
          config: { base_url: 'https://erp.example.com/orders', api_token: '***redacted***' },
          status: 'active',
          has_encrypted_secrets: true,
          sync_watermark: '2026-09-01T00:00:00Z',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    })
    vi.mocked(api.discoverDataSourceSchema).mockResolvedValue({
      source_id: 'src-rest-1',
      source_type: 'rest_api',
      columns: [
        { column_name: 'order_date', data_type: 'date_or_timestamp', sample: '2026-09-01' },
        { column_name: 'revenue', data_type: 'number', sample: 400 },
      ],
      sample_count: 2,
      sample_rows: [],
    })
    vi.mocked(api.syncDataSource).mockResolvedValue({
      sync_log_id: 1,
      source_id: 'src-rest-1',
      dataset_id: 'ds-sync-1',
      sync_mode: 'incremental',
      records_fetched: 3,
      watermark_before: '2026-09-01T00:00:00Z',
      watermark_after: '2026-09-02T00:00:00Z',
    })

    renderWithProviders(<ConnectorsHub companyId="comp-default" session={adminSession} />)
    await screen.findByText('ERP REST Orders')
    expect(screen.getByText('ENCRYPTED')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Discover Schema/i }))
    await screen.findByText(/Discovered Schema/i)
    expect(screen.getByText(/order_date: date_or_timestamp/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Sync Now/i }))
    await waitFor(() =>
      expect(api.syncDataSource).toHaveBeenCalledWith(
        'src-rest-1',
        expect.any(Object)
      )
    )
  })
})
