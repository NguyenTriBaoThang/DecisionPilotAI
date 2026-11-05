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
  data_as_of: string; model_version: string; stockout_note: string; interval_method: string; drivers: Record<string, Scalar>;
  metrics: { selected: string; test_coverage: number; test: Record<string,Metric>; validation: Record<string,Metric> } }
export type QueryResult = { answer: string; chart: {type: string; x: string; y: string; rows: Row[]} | null;
  trace: {tool: string; provider: string; range?: string[]; sources?: string[]; formulas: Record<string,string>};
  evidence: {contributions?: Record<string,Row[]>; [key:string]:unknown} }
export type Scenario = { type: string; objective: string; baseline: Row; alternatives: Row[]; recommended: Row; assumptions: string[];
  evidence: Record<string,unknown>; sensitivity: {name: string; alternatives: (Record<string,unknown> & {result: Row})[]}[] }
export type Recommendation = { id: string; title: string; context: string; action: string; priority: string;
  decision: string; expected_impact: Record<string,number> | null; assumptions: string[]; risk: string; uncertainty: string; evidence: Record<string,unknown> }
export type Audit = {id: number; occurred_at: string; kind: string; subject: string; payload: Record<string,Scalar>}

export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail) ?
      detail.map((item: {msg: string}) => item.msg).join(' · ') : 'The service could not complete this request.')
  }
  return data as T
}
export const params = (values: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(values).filter((entry): entry is [string,string] => !!entry[1])).toString()

export const integer = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(v)
export const decimal = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)
export const compact = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(v)
export const money = (v?: number | null) => v == null ? '—' : '₫' + integer(v)
export const moneyCompact = (v?: number | null) => v == null ? '—' : '₫' + compact(v)
export const percent = (v?: number | null) => v == null ? '—' : (v*100).toFixed(1)+'%'
export const dateLabel = (s: string) => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'))
export const shortDate = (s: string) => s.slice(5).replace('-','/')
export const label = (s: string) => s.replaceAll('_',' ').replace(/^./,(c) => c.toUpperCase())
