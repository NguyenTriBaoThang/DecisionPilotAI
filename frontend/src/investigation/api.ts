import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { request, send } from '../api'

export type Agent = 'orchestrator'|'demand'|'region'|'customer'|'inventory'|'price'|'marketing'|'calendar'|'verifier'|'strategist'
export type TraceEvent = {seq:number;agent:Agent;type:'assign'|'tool_call'|'finding'|'rebuttal'|'recompute'|'verdict'|'narration'|'option';payload:Record<string,unknown>;created_at:string}
export type CaseStatus = 'new'|'investigating'|'awaiting_decision'|'tracking'|'scored'|'refused'
export type CaseSummary = {headline:string;causes:{key:string;label_vi:string;share:number;delta_daily:number}[];sufficiency:{level:'certain'|'likely'|'unsure'|'refused';explained_share:number;checks:{rule:string;passed:boolean;value:unknown;threshold:unknown}[];missing:string[]}}
export type Case = {id:string;kind:string;status:CaseStatus;title:string;impact_vnd:number;impact_evidence?:Evidence;summary:CaseSummary|null;run_state:'idle'|'running'|'done'|'failed'}
export type Clock = {base_end:string;current_end:string}
export type Scorecard = {scored:number;correct:number;lessons:string[]}
export type Option = {key:string;title_vi:string;metric:string;calibrated_delta_pct:number;predicted_delta_pct:number;horizon_days:number;evidence:Evidence[]}
export type Evidence = {id:string;agent:string;claim:string;numbers:Record<string,number>;method:'exact'|'model';lineage:{tables:string[];start:string;end:string;rows:number};chart?:{type:string;x:string;y:string;rows:Record<string,unknown>[]} | null;shap?:Record<string,unknown> | null}
export type CaseDetail = Case & {options:Option[];prediction?:{status:string;verdict?:string;calibrated_delta_pct:number;actual_delta_pct?:number};progress?:{day:number;horizon:number;actual_delta_pct:number;predicted_delta_pct:number}}
export const AGENT_META:Record<Agent,{name:string;emoji:string}> = {
  orchestrator:{name:'Điều phối',emoji:'🧭'}, demand:{name:'Nhu cầu chung',emoji:'📉'},region:{name:'Khu vực',emoji:'📍'},
  customer:{name:'Khách hàng',emoji:'👥'},inventory:{name:'Tồn kho',emoji:'📦'},price:{name:'Giá',emoji:'🏷️'},
  marketing:{name:'Quảng cáo',emoji:'📣'},calendar:{name:'Lịch',emoji:'📅'},verifier:{name:'Kiểm chứng',emoji:'🔎'},strategist:{name:'Chiến lược',emoji:'🧪'} }
const base='/v1/investigation'
export const useBrief=()=>useQuery({queryKey:['investigation','brief'],queryFn:()=>request<{clock:Clock;cases:Case[];scorecard:Scorecard}>(`${base}/brief`)})
export const useCase=(id:string)=>useQuery({queryKey:['investigation','case',id],queryFn:()=>request<CaseDetail>(`${base}/cases/${id}`),enabled:!!id,refetchInterval:2000})
export function useTrace(id:string,enabled:boolean){
  const [events,setEvents]=useState<TraceEvent[]>([]); const [runState,setRunState]=useState<Case['run_state']>('idle')
  useEffect(()=>{setEvents([]);setRunState('idle')},[id])
  useEffect(()=>{if(!enabled||!id||runState==='done'||runState==='failed')return;let live=true
    const poll=async()=>{try{const after=events.at(-1)?.seq??0;const data=await request<{events:TraceEvent[];run_state:Case['run_state']}>(`${base}/cases/${id}/trace?after=${after}`);if(live){setEvents(old=>[...old,...data.events.filter(e=>!old.some(x=>x.seq===e.seq))]);setRunState(data.run_state)}}catch{}}
    void poll();const timer=setInterval(()=>void poll(),500);return()=>{live=false;clearInterval(timer)}},[id,enabled,events,runState])
  return {events,runState}
}
function mutation<T,V>(path:(v:V)=>string,body:(v:V)=>unknown){
  const client=useQueryClient();return useMutation({mutationFn:(v:V)=>send<T>(path(v),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body(v))}),onSuccess:()=>client.invalidateQueries({queryKey:['investigation']})})
}
export const useRun=()=>mutation<{run_state:string},string>(id=>`${base}/cases/${id}/run`,()=>({}))
export const useDecide=()=>mutation<unknown,{id:string;option_key:string}>(v=>`${base}/cases/${v.id}/decide`,v=>({option_key:v.option_key}))
export const useAdvance=()=>mutation<Clock,1|7>(()=>`${base}/clock/advance`,days=>({days}))
export const useReset=()=>mutation<Clock,void>(()=>`${base}/clock/reset`,()=>({}))
