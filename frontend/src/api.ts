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
export const testDataSource = (source_type: string, config: Record<string, unknown>) =>
  request<{ ok: boolean; status: string; errors?: string[]; message?: string }>('/v1/data-sources/test', {
    source_type,
    config,
  })
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
  if (!/\.(csv|xlsx|xls|json)$/i.test(file.name)) {
    throw new Error('Choose a .csv, .xlsx, .xls, or .json file.')
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
