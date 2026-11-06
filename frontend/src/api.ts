import { readPreferences } from './preferences'
export type Scalar = string | number | boolean | null
export type Row = Record<string, Scalar>
export type Filters = { start?: string; end?: string; category?: string; product?: string; region?: string; channel?: string; grain?: string }
export type Product = { product_id: string; product_name: string; category: string; is_physical: boolean }
export type Options = { products: Product[]; regions: string[]; categories: string[]; channels: string[]; marketing_channels: string[] }
export type Dataset = { dataset_id: string; kind: string; start: string; end: string; title: string; counts: Record<string,number> }
export type KPI = {
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

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export type Session = { actor: string; role: 'viewer' | 'analyst' | 'admin'; authentication: 'local' | 'token'; import_enabled: boolean }
export async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = sessionStorage.getItem('dp-access-token')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch('/api' + path, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(90_000) })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    if (response.status === 401) window.dispatchEvent(new Event('workspace-unauthorized'))
    throw new ApiError(typeof detail === 'string' ? detail : Array.isArray(detail) ?
      detail.map((item: {msg: string}) => item.msg).join(' · ') : 'The service could not complete this request.', response.status)
  }
  return data as T
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  return send<T>(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
export const money = (v?: number | null) => v == null ? '—' : '₫' + (readPreferences().currency === 'compact' ? compact(v) : integer(v))
export const moneyCompact = (v?: number | null) => v == null ? '—' : '₫' + compact(v)
export const percent = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat(locale(), { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)
export const dateLabel = (s: string) => new Intl.DateTimeFormat(readPreferences().language === 'vi' ? 'vi-VN' : 'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'))
export const shortDate = (s: string) => s.slice(5).replace('-','/')
export const label = (s: string) => s.replaceAll('_',' ').replace(/^./,(c) => c.toUpperCase())
