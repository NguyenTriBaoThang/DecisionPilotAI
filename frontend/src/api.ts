import { readPreferences } from './preferences'
import {
  generateMockScenario,
  mockAlerts,
  mockDataset,
  mockForecast,
  mockKPI,
  mockOptions,
  mockQueryResponse,
  mockRecommendations,
  mockSession,
} from './mockData'

function resolveMockFallback<T>(path: string, body?: unknown): T | undefined {
  const cleanPath = path.split('?')[0]
  if (cleanPath === '/session') return mockSession as T
  if (cleanPath === '/dataset') return mockDataset as T
  if (cleanPath === '/options') return mockOptions as T
  if (cleanPath === '/health') {
    return {
      status: 'ok',
      database: 'ok',
      dataset_ready: true,
      model_ready: true,
      model_version: '1.0.0-demo',
    } as T
  }
  if (cleanPath === '/kpi/summary') return mockKPI as T
  if (cleanPath === '/anomalies') return mockAlerts as T
  if (cleanPath === '/forecast') return mockForecast as T
  if (cleanPath === '/simulate') return generateMockScenario(body as Record<string, unknown>) as T
  if (cleanPath === '/recommendations') return mockRecommendations as T
  if (cleanPath === '/query') return mockQueryResponse as T
  if (cleanPath === '/recommendations/feedback') {
    return {
      status: 'success',
      audit_id: 101,
      decision: 'approved',
      timestamp: new Date().toISOString(),
    } as T
  }
  if (cleanPath === '/audit') {
    return {
      rows: [
        {
          id: 1,
          occurred_at: new Date().toISOString(),
          kind: 'recommendation_feedback',
          subject: 'REC-2026-10-15-01',
          payload: { decision: 'approved', actor: 'Executive Demo' },
        },
      ],
    } as T
  }
  if (cleanPath === '/v1/companies') {
    return {
      items: [
        {
          id: 'comp-default',
          name: 'Default Workspace',
          slug: 'default',
          status: 'active',
          active_dataset_id: mockDataset.dataset_id,
          dataset_count: 1,
        },
      ],
    } as T
  }
  return undefined
}
export type Scalar = string | number | boolean | null
export type Row = Record<string, Scalar>
export type Filters = { start?: string; end?: string; category?: string; product?: string; region?: string; channel?: string; grain?: string }
export type Product = { product_id: string; product_name: string; category: string; is_physical: boolean }
export type Options = { products: Product[]; regions: string[]; categories: string[]; channels: string[]; marketing_channels: string[] }
export type Dataset = {
  dataset_id: string
  kind: string
  start: string
  end: string
  title: string
  currency?: string
  company_id?: string
  company_name?: string
  capabilities?: Record<string, boolean>
  counts: Record<string, number>
}
export type KPI = {
  currency?: string
  capabilities?: Record<string, boolean>
  summary: Record<string, number | null>; changes: Record<string,number | null>
  range: string[]; previous_range: string[] | null; trend: Row[]; products: Row[]; regions: Row[]
  sales_channels: Row[]; marketing_channels: Row[]; market_scope: string; definitions: Record<string,string>
  multimodal_insights?: MultimodalInsight[]
}
export type Alert = { id: string; metric: string; start: string; end: string; actual: number; baseline: number;
  deviation: number | null; severity: string; score: number; action: string; scope: string; chart: Row[];
  evidence: Record<string,Scalar>; contributing_factors?: {contributions: Record<string,Row[]>; interpretation: string; metric: string} }
export type Metric = { mae: number; rmse: number; wape: number | null; mape: number | null; bias: number }
export type Forecast = { target: string; scope: string; horizon: number; total: number; history: Row[]; prediction: Row[];
  warnings: string[];
  data_as_of: string; model_version: string; stockout_note: string; interval_method: string; drivers: Record<string, Scalar>;
  metrics: { selected: string; test_coverage: number; test: Record<string,Metric>; validation: Record<string,Metric> } }
export type QueryResult = { answer: string; chart: {type: string; x: string; y: string; rows: Row[]} | null;
  trace: {tool: string; provider: string; range?: string[]; sources?: string[]; formulas: Record<string,string>};
  evidence: {contributions?: Record<string,Row[]>; [key:string]:unknown} }
export type Scenario = { simulation_id: string; dataset_id: string; decision: 'pending' | 'accepted' | 'rejected'; type: string; objective: string; baseline: Row; alternatives: Row[]; recommended: Row; assumptions: string[];
  evidence: Record<string,unknown>; sensitivity: {name: string; alternatives: (Record<string,unknown> & {result: Row})[]}[] }
export type Recommendation = { id: string; title: string; context: string; action: string; priority: string;
  decision: string; expected_impact: Record<string,number> | null; assumptions: string[]; risk: string; uncertainty: string; evidence: Record<string,unknown> }
export type Audit = {id: number; occurred_at: string; kind: string; subject: string; payload: Record<string,Scalar>}

export type CurrencyCode = 'VND' | 'USD' | 'EUR' | 'GBP'

const COMPANY_STORAGE_KEY = 'dp-company-id'
const CURRENCY_STORAGE_KEY = 'dp-active-currency'

export function getActiveCompanyId(): string {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(COMPANY_STORAGE_KEY)) || 'comp-default'
  } catch {
    return 'comp-default'
  }
}

export function setActiveCompanyId(companyId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(COMPANY_STORAGE_KEY, companyId || 'comp-default')
    }
  } catch {
    // Ignore storage access errors.
  }
}

export function getActiveCurrency(): CurrencyCode {
  try {
    const raw = (typeof localStorage !== 'undefined' && localStorage.getItem(CURRENCY_STORAGE_KEY)) || 'VND'
    const upper = raw.toUpperCase()
    if (upper === 'USD' || upper === 'EUR' || upper === 'GBP' || upper === 'VND') return upper
    return 'VND'
  } catch {
    return 'VND'
  }
}

export function setActiveCurrency(code?: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    const upper = String(code || 'VND').toUpperCase()
    const normalized: CurrencyCode =
      upper === 'USD' || upper === 'EUR' || upper === 'GBP' || upper === 'VND' ? upper : 'VND'
    localStorage.setItem(CURRENCY_STORAGE_KEY, normalized)
  } catch {
    // Ignore storage access errors.
  }
}

export function currencySymbol(code?: string | null): string {
  const upper = String(code || getActiveCurrency()).toUpperCase()
  if (upper === 'USD') return '$'
  if (upper === 'EUR') return '€'
  if (upper === 'GBP') return '£'
  return '₫'
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export type Session = { actor: string; role: 'viewer' | 'analyst' | 'admin'; authentication: 'local' | 'token'; import_enabled: boolean; company_ids?: string[] }

function buildAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('dp-access-token') : null
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('X-Company-ID')) headers.set('X-Company-ID', getActiveCompanyId())
  return headers
}

export async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = buildAuthHeaders(init.headers)
  if (init.body instanceof FormData) {
    headers.delete('Content-Type')
  }

  const isDemoHost = typeof window !== 'undefined' && (
    window.location.hostname.includes('github.io') ||
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('netlify.app')
  )

  let bodyObj: unknown = undefined
  try {
    if (typeof init.body === 'string') bodyObj = JSON.parse(init.body)
  } catch {}

  try {
    const response = await fetch('/api' + path, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(60_000) })
    if (response.ok) {
      const data = await response.json().catch(() => null)
      return data as T
    }

    const data = await response.json().catch(() => null)
    const detail = data?.detail
    if (!detail && (isDemoHost || (!path.startsWith('/v1/') && (response.status === 404 || response.status >= 502)))) {
      const mock = resolveMockFallback<T>(path, bodyObj)
      if (mock !== undefined) return mock
    }

    if (response.status === 401) window.dispatchEvent(new Event('workspace-unauthorized'))
    throw new ApiError(typeof detail === 'string' ? detail : Array.isArray(detail) ?
      detail.map((item: {msg: string}) => item.msg).join(' · ') : 'The service could not complete this request.', response.status)
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (
      isDemoHost ||
      (!path.startsWith('/v1/') &&
        (err instanceof TypeError || (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'))))
    ) {
      const mock = resolveMockFallback<T>(path, bodyObj)
      if (mock !== undefined) return mock
    }
    throw err
  }
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  return send<T>(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
export async function requestWithMethod<T>(path: string, method: 'DELETE' | 'PUT' | 'PATCH', body?: unknown): Promise<T> {
  return send<T>(path, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
}
export async function uploadSnapshot(file: File, datasetId: string, token: string): Promise<Dataset> {
  if (!/\.(zip|xlsx)$/i.test(file.name)) throw new Error('Choose a .zip or .xlsx file.')
  if (file.size > 40 * 1024 * 1024) throw new Error('Upload exceeds 40 MiB.')
  if (!file.size) throw new Error('The selected file is empty.')
  return send<Dataset>('/import?' + new URLSearchParams({ filename: file.name, expected_dataset_id: datasetId }), {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Import-Token': token }, body: file,
  })
}
export const params = (values: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(values).filter((entry): entry is [string,string] => !!entry[1])).toString()

const locale = () => readPreferences().language === 'vi' ? 'vi-VN' : 'en-US'
export const integer = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat(locale(),{maximumFractionDigits:0}).format(v)
export const decimal = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat(locale(),{maximumFractionDigits:2}).format(v)
export const compact = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:2}).format(v)
export const money = (v?: number | null, code?: string) => {
  if (v == null) return '—'
  const c = String(code || getActiveCurrency()).toUpperCase()
  const sym = currencySymbol(c)
  if (readPreferences().currency === 'compact') return sym + compact(v)
  if (c === 'VND') return sym + integer(v)
  return sym + new Intl.NumberFormat(locale(), { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v)
}
export const moneyCompact = (v?: number | null, code?: string) => v == null ? '—' : currencySymbol(code) + compact(v)
export const percent = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat(locale(), { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)
export const dateLabel = (s: string) => new Intl.DateTimeFormat(readPreferences().language === 'vi' ? 'vi-VN' : 'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'))
export const shortDate = (s: string) => s.slice(5).replace('-','/')
export const label = (s: string) => s.replaceAll('_',' ').replace(/^./,(c) => c.toUpperCase())

// --- Enterprise Multi-Tenant Ingestion & Workspace Types + Clients ---

export type CompanyWorkspace = {
  id: string
  name: string
  slug: string
  status: string
  active_dataset_id?: string | null
  dataset_count?: number
  created_at?: string | null
}

export type ConnectorField = {
  name: string
  label: string
  field_type: string
  required: boolean
  secret: boolean
  placeholder: string
  options: string[]
}

export type ConnectorSpec = {
  connector_type: string
  display_name: string
  category: string
  status: 'active' | 'extensible'
  description: string
  supported_formats: string[]
  config_fields: ConnectorField[]
}

export type TenantDataSource = {
  id: string
  company_id: string
  name: string
  source_type: string
  status: string
  config: Record<string, unknown>
  sync_watermark?: string | null
  last_synced_at?: string | null
  has_encrypted_secrets?: boolean
  created_at?: string | null
}

export type MappingSuggestion = {
  source_column: string
  target_field: string
  confidence: number
  reason: string
  inferred_type: string
  non_empty_count: number
  empty_count: number
  unique_sample_count: number
  sample_values: Scalar[]
  top_alternatives: { target: string; confidence: number }[]
}

export type MappingTemplateMatch = {
  id: string
  name: string
  exact_match: boolean
  overlap_ratio: number
  mappings: Record<string, string>
  custom_fields: string[]
}

export type MappingSuggestionBundle = {
  source_signature: string
  canonical_fields: Record<string, { label: string; required: boolean; kind: string; description: string }>
  suggested_mapping: Record<string, string>
  suggestions: MappingSuggestion[]
  matched_templates: MappingTemplateMatch[]
  capabilities_preview: Record<string, boolean>
}

export type DatasetPreview = {
  dataset_id: string
  company_id: string
  file_name?: string | null
  file_format: string
  total_rows: number
  columns: string[]
  rows: Row[]
  sheets: string[]
  selected_sheet: string | null
  parse_warnings: string[]
  current_mapping: Record<string, string>
  mapping_suggestions: MappingSuggestionBundle
}

export type QualityIssueRow = {
  row_number: number
  severity: string
  column: string
  target_field: string
  issue_code: string
  raw_value: string
  message: string
}

export type ColumnQualityMetric = {
  column: string
  mapped_to: string
  total_rows: number
  missing_values: number
  valid_values: number
  invalid_values: number
  unique_values: number
  completeness_pct: number
  validity_pct: number
  detected_formats: Record<string, number>
  currencies: Record<string, number>
}

export type QualityReport = {
  id?: string
  dataset_id?: string
  overall_score: number
  dimensions: {
    completeness: number
    validity: number
    consistency: number
    uniqueness: number
    accuracy: number
  }
  total_rows: number
  valid_rows: number
  invalid_rows: number
  missing_values: number
  duplicate_records: number
  detected_currency?: string
  column_quality: ColumnQualityMetric[]
  warnings: string[]
  issue_breakdown?: Record<string, number>
  sample_errors: QualityIssueRow[]
  inconsistent_date_formats?: { column: string; formats: Record<string, number> }[]
  mixed_currency_formats?: { column: string; currencies: Record<string, number> }[]
  cleaning_summary?: {
    invalid_row_policy: string
    duplicate_policy: string
    skipped_invalid_rows: number
    deduplicated_rows: number
    ready_to_import_rows: number
  }
  error_report_available?: boolean
  created_at?: string | null
}

export type EnterpriseDatasetSummary = {
  id: string
  dataset_id: string
  company_id: string
  company_name?: string
  data_source_id?: string
  name: string
  kind: string
  status: string
  storage_mode: string
  file_name?: string | null
  file_format?: string | null
  file_size_bytes: number
  selected_sheet?: string | null
  sheets: string[]
  columns: string[]
  row_count: number
  valid_rows: number
  invalid_rows: number
  duplicate_rows: number
  date_start?: string | null
  date_end?: string | null
  currency?: string
  mapping_confirmed: boolean
  quality_confirmed: boolean
  is_active: boolean
  mapping: Record<string, string>
  cleaning_policy?: { invalid_row_policy: 'skip_invalid' | 'fail_on_error'; duplicate_policy: 'keep_all' | 'deduplicate' }
  capabilities: Record<string, boolean>
  parse_warnings?: string[]
  quality_summary?: Record<string, number> | null
  quality_score?: number | null
  created_by?: string
  created_at?: string | null
  updated_at?: string | null
  imported_at?: string | null
}

export type UploadDatasetResponse = {
  dataset: EnterpriseDatasetSummary
  preview: {
    columns: string[]
    rows: Row[]
    total_rows: number
    sheets: string[]
    selected_sheet: string | null
    parse_warnings: string[]
  }
  mapping_suggestions: MappingSuggestionBundle
}

export type MappingTemplate = {
  id: string
  company_id: string
  name: string
  source_signature: string
  mappings: Record<string, string>
  custom_fields: string[]
  created_by?: string
  created_at?: string | null
}

export type UploadHistoryEvent = {
  id: number
  dataset_id: string
  company_id: string
  data_source_id: string
  stage: string
  status: string
  actor: string
  details: Record<string, unknown>
  error_message?: string | null
  created_at: string | null
}

export type ImportResult = {
  dataset: EnterpriseDatasetSummary
  quality_report: QualityReport
  imported_counts: Record<string, number>
  model_ready: boolean
}

export const listCompanies = () => request<{ items: CompanyWorkspace[] }>('/v1/companies')
export const createCompany = (payload: { name: string; slug?: string; activate?: boolean }) =>
  request<CompanyWorkspace>('/v1/companies', payload)

export const listConnectors = () => request<{ items: ConnectorSpec[] }>('/v1/connectors')
export const listDataSources = () => request<{ company_id: string; items: TenantDataSource[] }>('/v1/data-sources')
export const testDataSource = (source_type: string, config: Record<string, unknown>, live_probe = false) =>
  request<{ ok: boolean; status: string; errors?: string[]; message?: string; status_code?: number; sample_records?: number }>(
    '/v1/data-sources/test',
    {
      source_type,
      config,
      live_probe,
    }
  )
export const createDataSource = (payload: { name: string; source_type: string; config: Record<string, unknown> }) =>
  request<TenantDataSource>('/v1/data-sources', payload)

export const listEnterpriseDatasets = () =>
  request<{ company_id: string; company_name: string; active_dataset_id: string | null; items: EnterpriseDatasetSummary[] }>('/v1/datasets')

export const getEnterpriseDataset = (datasetId: string) =>
  request<EnterpriseDatasetSummary & { quality_summary?: QualityReport | null }>(`/v1/datasets/${encodeURIComponent(datasetId)}`)

export async function uploadEnterpriseDataset(
  file: File,
  opts: { datasetName?: string; sheetName?: string; dataSourceId?: string } = {}
): Promise<UploadDatasetResponse> {
  if (!/\.(csv|xlsx|xls|json|xml)$/i.test(file.name)) {
    throw new Error('Choose a .csv, .xlsx, .xls, .json, or .xml file.')
  }
  if (!file.size) throw new Error('The selected file is empty.')
  if (file.size > 40 * 1024 * 1024) throw new Error('Upload exceeds 40 MiB.')
  const form = new FormData()
  form.append('file', file)
  if (opts.datasetName) form.append('dataset_name', opts.datasetName)
  if (opts.sheetName) form.append('sheet_name', opts.sheetName)
  if (opts.dataSourceId) form.append('data_source_id', opts.dataSourceId)
  return send('/v1/datasets/upload', { method: 'POST', body: form })
}

export const previewEnterpriseDataset = (datasetId: string, payload: { sheet_name?: string; limit?: number } = {}) =>
  request<DatasetPreview>(`/v1/datasets/${encodeURIComponent(datasetId)}/preview`, payload)

export const saveDatasetMapping = (
  datasetId: string,
  payload: {
    mappings: Record<string, string>
    custom_fields?: string[]
    sheet_name?: string
    currency?: string
    confirmed?: boolean
    save_template?: boolean
    template_name?: string
    template_id?: string
  }
) =>
  request<{
    dataset: EnterpriseDatasetSummary
    mapping: Record<string, string>
    capabilities: Record<string, boolean>
    saved_template: { id: string; name: string; source_signature: string } | null
  }>(`/v1/datasets/${encodeURIComponent(datasetId)}/mapping`, payload)

export const validateEnterpriseDataset = (
  datasetId: string,
  payload: {
    sheet_name?: string
    mappings?: Record<string, string>
    custom_fields?: string[]
    invalid_row_policy?: 'skip_invalid' | 'fail_on_error'
    duplicate_policy?: 'keep_all' | 'deduplicate'
    currency?: string
  } = {}
) =>
  request<{ dataset: EnterpriseDatasetSummary; quality_report: QualityReport }>(
    `/v1/datasets/${encodeURIComponent(datasetId)}/validate`,
    payload
  )

export const importEnterpriseDataset = (
  datasetId: string,
  payload: {
    confirmed: boolean
    sheet_name?: string
    invalid_row_policy?: 'skip_invalid' | 'fail_on_error'
    duplicate_policy?: 'keep_all' | 'deduplicate'
    currency?: string
    activate?: boolean
  }
) => request<ImportResult>(`/v1/datasets/${encodeURIComponent(datasetId)}/import`, payload)

export const activateEnterpriseDataset = (datasetId: string) =>
  request<EnterpriseDatasetSummary>(`/v1/datasets/${encodeURIComponent(datasetId)}/activate`, {})

export const deleteEnterpriseDataset = (datasetId: string) =>
  requestWithMethod<{ deleted: boolean; dataset_id: string; company_id: string; active_dataset_id: string | null }>(
    `/v1/datasets/${encodeURIComponent(datasetId)}`,
    'DELETE'
  )

export const getDatasetQuality = (datasetId: string) =>
  request<QualityReport>(`/v1/datasets/${encodeURIComponent(datasetId)}/quality`)

export const getDatasetHistory = (datasetId: string) =>
  request<{ dataset_id: string; dataset_name: string; company_id: string; items: UploadHistoryEvent[] }>(
    `/v1/datasets/${encodeURIComponent(datasetId)}/history`
  )

export async function downloadErrorReport(datasetId: string, format: 'csv' | 'json' = 'csv'): Promise<void> {
  const headers = buildAuthHeaders()
  const response = await fetch(`/api/v1/datasets/${encodeURIComponent(datasetId)}/error-report?format=${format}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(typeof data?.detail === 'string' ? data.detail : 'Unable to download error report.', response.status)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `error-report-${datasetId}.${format}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const listMappingTemplates = () =>
  request<{ company_id: string; items: MappingTemplate[] }>('/v1/mapping-templates')

export const deleteMappingTemplate = (templateId: string) =>
  requestWithMethod<{ deleted: boolean; template_id: string }>(`/v1/mapping-templates/${encodeURIComponent(templateId)}`, 'DELETE')

// --- Multimodal Data Ingestion, Async Jobs, HITL Validation & Live Sync ---

export type SampledVideoFrame = {
  frame_index: number
  timestamp_sec: number
  brightness: number
  scene_delta?: number
  scene_change_score?: number
  frame_subkey?: string
  signed_url?: string
  expires_at_epoch?: number
  ocr_text?: string
  ocr_engine?: string | null
}

export type MultimodalFile = {
  id: string
  file_id: string
  company_id: string
  dataset_id: string
  data_source_id: string
  file_name: string
  mime_type: string
  modality: 'structured' | 'document' | 'image' | 'video' | 'audio'
  file_format: string
  file_size_bytes: number
  checksum_sha256: string
  upload_timestamp: string | null
  processing_status: 'uploaded' | 'processing' | 'extracted' | 'validating' | 'awaiting_approval' | 'imported' | 'failed'
  extraction_status: string
  validation_status: string
  confidence_threshold: number
  consent_external_ai: boolean
  privacy_notice_accepted: boolean
  retention_days: number
  expires_at: string | null
  source_metadata: Record<string, unknown> & {
    sampled_frames?: SampledVideoFrame[]
    privacy_metadata?: Record<string, unknown>
    audio_metadata?: Record<string, unknown>
    page_count?: number
    slide_count?: number
    warnings?: string[]
  }
  extraction_summary: {
    stage?: string
    total_extracted?: number
    below_threshold?: number
    needs_review?: number
    average_confidence?: number | null
    extraction_status?: string
    warnings?: string[]
    error?: string
  }
  signed_content_url?: string | null
  created_by: string
  updated_at: string | null
  imported_at: string | null
}

export type IngestionJob = {
  id: string
  company_id: string
  dataset_id: string
  file_id: string | null
  data_source_id: string | null
  job_type: string
  idempotency_key: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  stage: string
  progress_pct: number
  attempt: number
  max_attempts: number
  timeout_seconds: number
  result_summary: Record<string, unknown>
  error_message: string | null
  created_by: string
  created_at: string | null
  started_at: string | null
  finished_at: string | null
}

export type ExtractedRecord = {
  id: string
  company_id: string
  dataset_id: string
  file_id: string
  source_id: string
  modality: string
  entity_type: string
  extraction_timestamp: string | null
  source_location: Record<string, unknown>
  raw_payload: Record<string, unknown>
  extracted_data: Record<string, unknown>
  corrected_data: Record<string, unknown> | null
  effective_data: Record<string, unknown>
  confidence_score: number | null
  confidence_threshold: number
  below_threshold: boolean
  extraction_method: string
  validation_status: 'unverified' | 'needs_review' | 'edited' | 'approved' | 'rejected'
  needs_human_review: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  transformation_history: Array<Record<string, unknown>>
  promoted: boolean
}

export type ExtractionBundle = {
  file: MultimodalFile
  confidence_threshold: number
  count: number
  below_threshold_count: number
  items: ExtractedRecord[]
}

export type MultimodalInsight = {
  id: string
  company_id?: string
  dataset_id: string
  source_file_id: string
  extraction_id?: string | null
  modality: string
  entity_type: string
  insight_date: string | null
  title: string
  summary_text: string
  metrics: Record<string, unknown>
  source_location: Record<string, unknown>
  confidence_score: number | null
  extraction_method: string
  validation_status?: string
  approved_by: string
  approved_at: string | null
}

export type MultimodalApproveResult = {
  approved: boolean
  file_id: string
  dataset_id: string
  promoted_financial_rows: number
  promoted_insights: number
  counts: Record<string, number>
  activated: boolean
  model_ready: boolean
  currency: string
}

export type SchemaDiscoveryResult = {
  source_id: string
  source_type: string
  schema?: string
  table_or_view?: string
  columns: Array<{ column_name: string; data_type: string; sample: Scalar }>
  sample_count: number
  sample_rows: Array<Record<string, unknown>>
}

export type SyncResult = {
  sync_log_id: number
  source_id: string
  dataset_id: string | null
  sync_mode: string
  records_fetched: number
  watermark_before: string | null
  watermark_after: string | null
}

export type ConnectorSyncLog = {
  id: number
  dataset_id: string | null
  sync_mode: string
  status: string
  watermark_before: string | null
  watermark_after: string | null
  records_fetched: number
  actor: string
  details: Record<string, unknown>
  error_message: string | null
  started_at: string | null
  finished_at: string | null
}

export async function uploadMultimodalFiles(
  files: File[],
  opts: {
    datasetId?: string
    datasetName?: string
    dataSourceId?: string
    confidenceThreshold?: number
    samplingIntervalSec?: number
    maxFrames?: number
    retentionDays?: number
    consentExternalAi?: boolean
    privacyNoticeAccepted?: boolean
    idempotencyKey?: string
  } = {}
): Promise<{ company_id: string; dataset_id: string; files: MultimodalFile[]; jobs: IngestionJob[] }> {
  if (!files.length) throw new Error('Select at least one file to upload.')
  const form = new FormData()
  for (const file of files) {
    form.append('files', file)
  }
  if (opts.datasetId) form.append('dataset_id', opts.datasetId)
  if (opts.datasetName) form.append('dataset_name', opts.datasetName)
  if (opts.dataSourceId) form.append('data_source_id', opts.dataSourceId)
  if (opts.confidenceThreshold != null) form.append('confidence_threshold', String(opts.confidenceThreshold))
  if (opts.samplingIntervalSec != null) form.append('sampling_interval_sec', String(opts.samplingIntervalSec))
  if (opts.maxFrames != null) form.append('max_frames', String(opts.maxFrames))
  if (opts.retentionDays != null) form.append('retention_days', String(opts.retentionDays))
  form.append('consent_external_ai', String(Boolean(opts.consentExternalAi)))
  form.append('privacy_notice_accepted', String(Boolean(opts.privacyNoticeAccepted)))
  if (opts.idempotencyKey) form.append('idempotency_key', opts.idempotencyKey)
  return send('/v1/multimodal/upload', { method: 'POST', body: form })
}

export const listMultimodalFiles = (filters: { modality?: string; processing_status?: string; dataset_id?: string } = {}) => {
  const qs = params(filters)
  return request<{ company_id: string; items: MultimodalFile[] }>('/v1/files' + (qs ? '?' + qs : ''))
}

export const getMultimodalFile = (fileId: string) =>
  request<{ file: MultimodalFile; jobs: IngestionJob[] }>(`/v1/files/${encodeURIComponent(fileId)}`)

export const getSignedFileUrl = (fileId: string, subkey = 'raw') =>
  request<{ file_id: string; subkey: string; url: string; expires_at_epoch: number }>(
    `/v1/files/${encodeURIComponent(fileId)}/signed-url?` + params({ subkey })
  )

export const deleteMultimodalFile = (fileId: string) =>
  requestWithMethod<{ deleted: boolean; file_id: string; dataset_id: string; removed_storage_objects: number }>(
    `/v1/files/${encodeURIComponent(fileId)}`,
    'DELETE'
  )

export const listIngestionJobs = (filters: { dataset_id?: string; file_id?: string; status?: string } = {}) => {
  const qs = params(filters)
  return request<{ company_id: string; items: IngestionJob[] }>('/v1/jobs' + (qs ? '?' + qs : ''))
}

export const retryIngestionJob = (jobId: string) =>
  request<IngestionJob>(`/v1/jobs/${encodeURIComponent(jobId)}/retry`, {})

export const getFileExtractions = (fileId: string) =>
  request<ExtractionBundle>(`/v1/files/${encodeURIComponent(fileId)}/extractions`)

export const patchExtractedRecord = (
  recordId: string,
  payload: { corrected_data?: Record<string, unknown>; validation_status?: ExtractedRecord['validation_status'] }
) => requestWithMethod<ExtractedRecord>(`/v1/extractions/${encodeURIComponent(recordId)}`, 'PATCH', payload)

export const approveImportFile = (
  fileId: string,
  payload: {
    confirmed: boolean
    record_ids?: string[]
    approve_below_threshold?: boolean
    activate?: boolean
    currency?: CurrencyCode
  }
) => request<MultimodalApproveResult>(`/v1/files/${encodeURIComponent(fileId)}/approve-import`, payload)

export const listMultimodalInsights = (filters: { dataset_id?: string; modality?: string; limit?: string } = {}) => {
  const qs = params(filters)
  return request<{ company_id: string; items: MultimodalInsight[] }>('/v1/insights' + (qs ? '?' + qs : ''))
}

export const testSavedDataSource = (sourceId: string) =>
  request<{ ok: boolean; status: string; message?: string; status_code?: number; sample_records?: number }>(
    `/v1/data-sources/${encodeURIComponent(sourceId)}/test`,
    {}
  )

export const discoverDataSourceSchema = (sourceId: string) =>
  request<SchemaDiscoveryResult>(`/v1/data-sources/${encodeURIComponent(sourceId)}/discover`, {})

export const syncDataSource = (
  sourceId: string,
  payload: { dataset_name?: string; watermark_column?: string } = {}
) => request<SyncResult>(`/v1/data-sources/${encodeURIComponent(sourceId)}/sync`, payload)

export const listDataSourceSyncLogs = (sourceId: string) =>
  request<{ source_id: string; items: ConnectorSyncLog[] }>(
    `/v1/data-sources/${encodeURIComponent(sourceId)}/sync-logs`
  )

// --- Enterprise RAG & AI Copilot Types + Clients ---

export type CopilotCitation = {
  citation_id: string
  chunk_id: string
  document_id: string
  source_file: string
  document_type: string
  domain: string
  page_number?: number | null
  section?: string | null
  content: string
  source_url?: string | null
  scores: {
    dense?: number
    bm25?: number
    rrf?: number
    rerank?: number
  }
}

export type CopilotSQLTrace = {
  executed?: boolean
  sql?: string | null
  template?: string | null
  scoped_tables?: string[]
  read_only_verified?: boolean
  blocked?: boolean
  reason?: string | null
  row_count?: number
  execution_ms?: number
  rows?: Array<Record<string, unknown>>
}

export type CopilotToolTrace = {
  intent?: string
  intent_meta?: Record<string, unknown>
  language?: string
  rag?: {
    rewritten_query?: string
    vector_backend?: string
    embedding_provider?: string
    total_candidates?: number
    dense_hits?: number
    bm25_hits?: number
    returned_hits?: number
    latencies_ms?: Record<string, number>
  } | null
  tools_executed?: Array<{ tool: string; ok: boolean; latency_ms: number; summary: string }>
  synthesis_ms?: number
  total_ms?: number
  memory_summary_used?: boolean
  company_memories_count?: number
  blocked_patterns?: string[]
}

export type CopilotMessage = {
  id: string
  conversation_id: string
  company_id: string
  role: 'user' | 'assistant'
  content: string
  intent?: string | null
  citations: CopilotCitation[]
  structured_sections?: {
    database_facts?: string[]
    document_facts?: string[]
    analysis?: string[]
    unverified_hypotheses?: string[]
  } | null
  chart?: { type: string; x: string; y: string; rows: Row[] } | null
  sql_trace?: CopilotSQLTrace | null
  tool_trace?: CopilotToolTrace | null
  followups: string[]
  parent_message_id?: string | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  latency_ms?: number | null
  created_at?: string | null
}

export type CopilotConversation = {
  id: string
  company_id: string
  dataset_id?: string | null
  title: string
  is_pinned: boolean
  language: string
  session_context: Record<string, unknown>
  memory_summary: string
  message_count: number
  created_by: string
  created_at?: string | null
  updated_at?: string | null
}

export type CompanyMemoryItem = {
  id: string
  company_id: string
  memory_key: string
  memory_type: 'business_context' | 'preference' | 'kpi_definition' | 'policy' | string
  content: string
  source_conversation_id?: string | null
  confidence: number
  created_by: string
  created_at?: string | null
  updated_at?: string | null
}

export type RagDocument = {
  id: string
  company_id: string
  dataset_id?: string | null
  source_file_id?: string | null
  source_type: string
  file_name: string
  mime_type?: string | null
  document_type: string
  domain: string
  status: string
  chunk_count: number
  char_count: number
  metadata: Record<string, unknown>
  created_by: string
  created_at?: string | null
  updated_at?: string | null
}

export type RagChunkDetail = {
  id: string
  chunk_index: number
  page_number?: number | null
  section?: string | null
  chunking_strategy: string
  token_count: number
  content: string
  embedding_provider: string
  embedding_dim: number
}

export type RagHealth = {
  status: string
  company_id: string
  embedding_provider: string
  embedding_dim: number
  vector_store: Record<string, unknown>
  documents_indexed: number
  chunks_indexed: number
  chunk_size_tokens: number
  chunk_overlap_tokens: number
  hybrid_weights: { dense: number; bm25: number }
  min_relevance_score: number
}

export type CopilotTurnResponse = {
  conversation: CopilotConversation
  user_message: CopilotMessage
  assistant_message: CopilotMessage
}

export type CopilotStreamHandlers = {
  onStatus?: (payload: { stage?: string; message?: string }) => void
  onMeta?: (payload: {
    conversation: CopilotConversation
    user_message: CopilotMessage
    intent?: string
    tool_trace?: CopilotToolTrace
  }) => void
  onCitations?: (citations: CopilotCitation[]) => void
  onSqlTrace?: (sqlTrace: CopilotSQLTrace) => void
  onChart?: (chart: { type: string; x: string; y: string; rows: Row[] }) => void
  onDelta?: (text: string) => void
  onDone?: (payload: CopilotTurnResponse) => void
  onError?: (detail: string) => void
}

async function consumeSseStream(
  response: Response,
  handlers: CopilotStreamHandlers,
  signal?: AbortSignal
): Promise<CopilotTurnResponse | null> {
  if (!response.body) {
    const json = (await response.json()) as CopilotTurnResponse
    handlers.onDone?.(json)
    return json
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: CopilotTurnResponse | null = null

  const dispatchBlock = (block: string) => {
    const lines = block.split(/\r?\n/)
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }
    if (!dataLines.length) return
    const rawData = dataLines.join('\n')
    try {
      const payload = JSON.parse(rawData)
      if (eventName === 'status') handlers.onStatus?.(payload)
      else if (eventName === 'meta') handlers.onMeta?.(payload)
      else if (eventName === 'citations') handlers.onCitations?.(payload.citations || [])
      else if (eventName === 'sql_trace') handlers.onSqlTrace?.(payload.sql_trace)
      else if (eventName === 'chart') handlers.onChart?.(payload.chart)
      else if (eventName === 'delta') handlers.onDelta?.(payload.text || '')
      else if (eventName === 'done') {
        finalResult = payload as CopilotTurnResponse
        handlers.onDone?.(finalResult)
      } else if (eventName === 'error') {
        handlers.onError?.(payload.detail || 'Copilot streaming error')
        throw new ApiError(payload.detail || 'Copilot streaming error', 500)
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
    }
  }

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {})
        break
      }
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''
      for (const blk of blocks) {
        if (blk.trim()) dispatchBlock(blk)
      }
    }
    if (buffer.trim()) dispatchBlock(buffer)
  } finally {
    reader.releaseLock()
  }
  return finalResult
}

export async function streamCopilotCompletion(
  payload: {
    message: string
    conversation_id?: string | null
    dataset_id?: string | null
    language?: 'auto' | 'en' | 'vi'
    top_k?: number
    domain?: string | null
  },
  handlers: CopilotStreamHandlers,
  signal?: AbortSignal
): Promise<CopilotTurnResponse | null> {
  const headers = buildAuthHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' })
  if (payload.dataset_id) headers.set('X-Dataset-ID', payload.dataset_id)
  const response = await fetch('/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: payload.message,
      conversation_id: payload.conversation_id || undefined,
      dataset_id: payload.dataset_id || undefined,
      language: payload.language || 'auto',
      top_k: payload.top_k || 5,
      domain: payload.domain || undefined,
      stream: true,
    }),
    signal,
  })
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('workspace-unauthorized'))
    const errJson = await response.json().catch(() => null)
    const msg = typeof errJson?.detail === 'string' ? errJson.detail : `Copilot error (HTTP ${response.status})`
    throw new ApiError(msg, response.status)
  }
  return consumeSseStream(response, handlers, signal)
}

export async function regenerateChatMessage(
  messageId: string,
  handlers: CopilotStreamHandlers,
  signal?: AbortSignal
): Promise<CopilotTurnResponse | null> {
  const headers = buildAuthHeaders({ Accept: 'text/event-stream' })
  const response = await fetch(`/api/v1/chat/messages/${encodeURIComponent(messageId)}/regenerate?stream=true`, {
    method: 'POST',
    headers,
    signal,
  })
  if (!response.ok) {
    const errJson = await response.json().catch(() => null)
    const msg = typeof errJson?.detail === 'string' ? errJson.detail : `Regenerate failed (HTTP ${response.status})`
    throw new ApiError(msg, response.status)
  }
  return consumeSseStream(response, handlers, signal)
}

export const listChatConversations = (filters: { dataset_id?: string; search?: string; pinned_only?: boolean } = {}) => {
  const qs = params({
    dataset_id: filters.dataset_id,
    search: filters.search,
    pinned_only: filters.pinned_only ? 'true' : undefined,
  })
  return request<{ items: CopilotConversation[]; count: number; company_id: string }>(
    '/v1/chat/conversations' + (qs ? '?' + qs : '')
  )
}

export const createChatConversation = (payload: { title?: string; dataset_id?: string; language?: 'auto' | 'en' | 'vi' } = {}) =>
  request<CopilotConversation>('/v1/chat/conversations', payload)

export const getChatConversationDetail = (conversationId: string) =>
  request<{
    conversation: CopilotConversation
    messages: CopilotMessage[]
    session_context: Record<string, unknown>
    memory_summary: string
    company_memories: CompanyMemoryItem[]
    token_usage_est: number
  }>(`/v1/chat/conversations/${encodeURIComponent(conversationId)}`)

export const patchChatConversation = (
  conversationId: string,
  payload: { title?: string; is_pinned?: boolean; dataset_id?: string | null }
) => requestWithMethod<CopilotConversation>(`/v1/chat/conversations/${encodeURIComponent(conversationId)}`, 'PATCH', payload)

export const deleteChatConversation = (conversationId: string) =>
  requestWithMethod<{ deleted: boolean; conversation_id: string }>(
    `/v1/chat/conversations/${encodeURIComponent(conversationId)}`,
    'DELETE'
  )

export const listCompanyMemories = () =>
  request<{ items: CompanyMemoryItem[]; count: number; company_id: string }>('/v1/chat/memory')

export const upsertCompanyMemory = (payload: {
  memory_key: string
  content: string
  memory_type?: 'business_context' | 'preference' | 'kpi_definition' | 'policy'
  source_conversation_id?: string
}) => request<CompanyMemoryItem>('/v1/chat/memory', payload)

export const deleteCompanyMemory = (memoryId: string) =>
  requestWithMethod<{ deleted: boolean; memory_id: string }>(`/v1/chat/memory/${encodeURIComponent(memoryId)}`, 'DELETE')

export async function ingestRagFile(
  file: File,
  opts: { datasetId?: string; domain?: string; chunkingStrategy?: string } = {}
): Promise<{
  document_id: string
  file_name: string
  document_type: string
  domain: string
  chunk_count: number
  char_count: number
  status: string
}> {
  const form = new FormData()
  form.append('file', file)
  if (opts.datasetId) form.append('dataset_id', opts.datasetId)
  if (opts.domain) form.append('domain', opts.domain)
  if (opts.chunkingStrategy) form.append('chunking_strategy', opts.chunkingStrategy)
  return send('/v1/rag/ingest', { method: 'POST', body: form })
}

export const reindexRagDataset = (datasetId?: string) =>
  request<{ reindexed_dataset: Record<string, unknown> | null }>(
    '/v1/rag/ingest/reindex' + (datasetId ? '?' + params({ dataset_id: datasetId }) : ''),
    {}
  )

export const searchRagKnowledge = (payload: {
  query: string
  dataset_id?: string
  domain?: string
  document_type?: string
  top_k?: number
}) => request<{ hits: CopilotCitation[]; count: number; trace: Record<string, unknown> }>('/v1/rag/search', payload)

export const listRagDocuments = (filters: { dataset_id?: string; document_type?: string; domain?: string } = {}) => {
  const qs = params(filters)
  return request<{ items: RagDocument[]; count: number; company_id: string }>('/v1/rag/documents' + (qs ? '?' + qs : ''))
}

export const getRagDocumentDetail = (documentId: string) =>
  request<{ document: RagDocument; chunks: RagChunkDetail[] }>(`/v1/rag/documents/${encodeURIComponent(documentId)}`)

export const deleteRagDocument = (documentId: string) =>
  requestWithMethod<{ deleted: boolean; document_id: string; file_name: string }>(
    `/v1/rag/documents/${encodeURIComponent(documentId)}`,
    'DELETE'
  )

export const getRagHealth = () => request<RagHealth>('/v1/rag/health')

