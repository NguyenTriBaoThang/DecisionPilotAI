import { AGENT_META, type Agent, type TraceEvent } from './api'
const specialists:Agent[]=['demand','region','customer','inventory','price','marketing','calendar']
export function AgentGraph({events,onFilter}:{events:TraceEvent[];onFilter:(agent:Agent)=>void}){
  const state=(agent:Agent)=>{const findings=events.filter(e=>e.agent===agent&&e.type==='finding');const last=findings.at(-1);if(last)return String(last.payload.status);return events.some(e=>e.agent===agent&&e.type==='assign')?'working':'idle'}
  const node=(agent:Agent,x:number,y:number)=><g key={agent} role="button" tabIndex={0} aria-label={`${AGENT_META[agent].name}: ${state(agent)}`} onClick={()=>onFilter(agent)} onKeyDown={e=>{if(e.key==='Enter')onFilter(agent)}}>
    <rect x={x-52} y={y-22} width={104} height={44} rx={12} fill={state(agent)==='eliminated'?'#fee2e2':state(agent)==='confirmed'?'#dcfce7':'#eef2ff'} stroke="#c7d2fe" />
    <text x={x} y={y+5} textAnchor="middle" fontSize={12}>{AGENT_META[agent].emoji} {AGENT_META[agent].name} {state(agent)==='eliminated'?'✗':state(agent)==='confirmed'?'✓':''}</text></g>
  return <svg viewBox="0 0 880 270" className="w-full rounded-2xl bg-white border" role="img" aria-label="Sơ đồ đội AI agent">
    {specialists.map((a,i)=><line key={a} x1="440" y1="55" x2={75+i*120} y2="130" stroke={state(a)==='idle'?'#cbd5e1':'#6366f1'} strokeWidth="2" />)}
    {events.some(e=>e.type==='rebuttal')&&<path d="M440 220 L440 60" stroke="#dc2626" strokeWidth="3" markerEnd="url(#arrow)" />}
    <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10" fill="#dc2626" /></marker></defs>
    {node('orchestrator',440,38)}{specialists.map((a,i)=>node(a,75+i*120,145))}{node('verifier',440,225)}{node('strategist',740,225)}
  </svg>
}
