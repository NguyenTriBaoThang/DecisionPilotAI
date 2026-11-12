import { useEffect,useRef,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { send } from '../api'
import { AgentGraph } from './AgentGraph'
import { AgentChat } from './AgentChat'
import { SufficiencyPanel } from './SufficiencyPanel'
import { OptionsPanel } from './OptionsPanel'
import { TrackingPanel } from './TrackingPanel'
import { useCase,useTrace,useRun,useDecide,type Agent } from './api'
export function CasePage({canEdit}:{canEdit:boolean}){
  const {caseId=''}=useParams();const {data,error}=useCase(caseId);const trace=useTrace(caseId,!!data);const run=useRun();const decide=useDecide()
  const started=useRef<string|null>(null);const [filter,setFilter]=useState<Agent|null>(null);const [question,setQuestion]=useState('');const [answer,setAnswer]=useState('')
  useEffect(()=>{if(canEdit&&data?.run_state==='idle'&&started.current!==caseId){started.current=caseId;run.mutate(caseId)}},[data?.run_state,caseId,canEdit])
  if(error)return <p role="alert">{String(error)}</p>;if(!data)return <p>Đang tải vụ việc…</p>
  const steps=['Phát hiện','Điều tra','Phương án','Quyết định','Theo dõi','Chấm điểm'];const index={new:0,investigating:1,awaiting_decision:2,tracking:4,scored:5,refused:1}[data.status]
  return <div className="space-y-6"><Link to="/">← Bản tin sáng</Link><h1 className="text-3xl font-bold">{data.title}</h1>
    <ol className="grid grid-cols-3 gap-2 md:grid-cols-6">{steps.map((s,i)=><li className={`rounded-lg p-2 text-center text-xs ${i<=index?'bg-indigo-700 text-white':'bg-slate-100'}`} key={s}>{s}</li>)}</ol>
    <AgentGraph events={trace.events} onFilter={a=>setFilter(filter===a?null:a)}/>
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]"><div><h2 className="mb-3 text-xl font-bold">Hội thoại đội AI {filter&&`· ${filter}`}</h2><AgentChat events={trace.events} filter={filter}/></div>
      <div className="space-y-4">{data.summary&&<SufficiencyPanel summary={data.summary}/>}<TrackingPanel data={data}/></div></div>
    {data.status!=='refused'&&data.options?.length>0&&<OptionsPanel options={data.options} canEdit={canEdit&&!data.prediction} onChoose={key=>decide.mutate({id:caseId,option_key:key})}/>}
    <form className="rounded-2xl bg-white p-5" onSubmit={async e=>{e.preventDefault();const result=await send<{answer?:string}>(`/v1/investigation/cases/${caseId}/ask`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});setAnswer(result.answer??JSON.stringify(result))}}><label htmlFor="case-question">Hỏi thêm về vụ này</label><input id="case-question" className="mx-2 rounded-lg border p-2" value={question} onChange={e=>setQuestion(e.target.value)} minLength={3}/><button className="rounded-lg bg-indigo-700 p-2 text-white">Hỏi AI</button>{answer&&<p>{answer}</p>}</form>
  </div>
}
