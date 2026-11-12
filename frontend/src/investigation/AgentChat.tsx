import { useState } from 'react'
import { AGENT_META,type Agent,type Evidence,type TraceEvent } from './api'
import { EvidenceCard } from './EvidenceCard'
export function AgentChat({events,filter}:{events:TraceEvent[];filter:Agent|null}){
  const [open,setOpen]=useState<number|null>(null)
  const lines=new Map<number,string>();for(const e of events)if(e.type==='narration')for(const row of (e.payload.lines as {seq:number;text:string}[]||[]))lines.set(row.seq,row.text)
  return <section className="space-y-2" aria-live="polite">{events.filter(e=>e.type!=='narration'&&(!filter||e.agent===filter)).map(e=>{
    const evidence=(e.payload.evidence as Evidence[]|undefined)??[]
    return <article key={e.seq} className={`rounded-xl border p-3 ${e.type==='rebuttal'?'border-rose-400 bg-rose-50':'bg-white'}`}>
      <strong>{AGENT_META[e.agent]?.emoji} {AGENT_META[e.agent]?.name}</strong> · {lines.get(e.seq)||String(e.payload.text||e.payload.reason||e.type)}
      {evidence.length>0&&<button className="ml-2 text-indigo-700 underline" onClick={()=>setOpen(open===e.seq?null:e.seq)}>Bằng chứng</button>}
      {open===e.seq&&evidence.map(ev=><EvidenceCard key={ev.id} evidence={ev}/>)}</article>})}</section>
}
