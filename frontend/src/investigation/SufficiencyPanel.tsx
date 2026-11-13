import type { CaseSummary } from './api'
import { REFUSAL_TEXT } from './strings'
const label={certain:'Chắc chắn',likely:'Khá chắc',unsure:'Chưa chắc',refused:'Từ chối'}
export function SufficiencyPanel({summary}:{summary:CaseSummary}){const s=summary.sufficiency;return <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Mức tin cậy: {label[s.level]}</h2>{s.level==='refused'&&<strong className="text-rose-700">{REFUSAL_TEXT}</strong>}
  <ul>{s.checks.map(c=><li key={c.rule}>{c.passed?'✓':'✗'} {c.rule}: {JSON.stringify(c.value)} / {JSON.stringify(c.threshold)}</li>)}</ul>{s.missing.map((m,i)=><p key={i}>{m}</p>)}</section>}
