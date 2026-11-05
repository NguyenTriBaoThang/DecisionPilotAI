import { useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowRight, Bell, Check, ChevronRight, CircleAlert, Database, Send, Sparkles, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { type Alert, type Audit, type Dataset, type Forecast, type Options, type QueryResult, type Recommendation, type Row, type Scenario,
  dateLabel, decimal, integer, label, money, moneyCompact, params, percent, request } from './api'
import { alertName } from './Dashboard'
import { Button, Card, Chart, Empty, ErrorState, Heading, Loading, Pill, SectionTitle, Select, Source, Table } from './ui'

const prompts = [
  'How is our business performing this month?',
  'Why did revenue decrease this month?',
  'Which product generated the highest profit?',
  'Which marketing channel had the lowest ROAS?',
  'Forecast demand for SmartDesk Mini for the next 30 days.',
]

function Contribution({rows,interpretation,metric}: {rows:Record<string,Row[]>;interpretation?:string;metric?:string}) {
  const [dimension,setDimension] = useState('product')
  const format = metric==='units'?decimal:moneyCompact
  return <div className="contribution">
    <Select label="Contribution breakdown" value={dimension} onChange={setDimension}
      options={Object.keys(rows).map<[string,string]>(key=>[key,label(key)])}/>
    <Table rows={(rows[dimension]||[]).slice(0,8)} columns={[
      {key:'name',title:'Group'},{key:'actual',format},{key:'baseline',title:'Previous',format},
      {key:'delta',title:'Change',format},{key:'share_of_net_change',title:'Share of net change',format:percent}]}/>
    <p className="muted">{interpretation||'Each dimension independently reconciles to total change. Contributions are descriptive.'}</p>
  </div>
}

const askForm = z.object({question:z.string().trim().min(3,'Enter a question with at least three characters.').max(500)})

export type ChatMessage = {question:string;result?:QueryResult;error?:string}

export function Ask({dataset,messages,setMessages}: {
  dataset:Dataset; messages:ChatMessage[]; setMessages:Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const form = useForm<z.infer<typeof askForm>>({resolver:zodResolver(askForm),defaultValues:{question:''}})
  const query = useMutation({mutationFn:(question:string)=>request<QueryResult>('/query',{question}),
    onSuccess:(result,question)=>setMessages(rows=>[...rows,{question,result}]),
    onError:(error,question)=>setMessages(rows=>[...rows,{question,error:error.message}])})
  const send = (question:string) => { if(!query.isPending) {form.reset();query.mutate(question)} }
  return <>
    <Heading eyebrow="CONVERSATIONAL ANALYTICS" title="Ask business data" subtitle="Ask a business question and inspect the calculation, data scope and supporting records."/>
    <div className="ask-grid">
      <Card className="chat">
        <SectionTitle title="Analysis conversation" detail={'Data through '+dateLabel(dataset.end)} aside={<span className="stat-icon"><Sparkles size={18}/></span>}/>
        {!messages.length&&!query.isPending&&<div className="chat-welcome"><span><Sparkles size={26}/></span><h2>What would you like to understand?</h2>
          <p>Start with a question about sales, marketing, inventory or a forecast.</p></div>}
        <div className="messages" aria-live="polite">{messages.map(({question,result,error},i)=><div className="message" key={i}>
          <div className="user-message">{question}</div>
          {error&&<ErrorState error={new Error(error)}/>}
          {result&&<div className="assistant-message"><div className="assistant-meta"><Sparkles size={15}/> DecisionPilot AI <Pill>{result.trace.provider}</Pill></div>
            <p>{result.answer}</p>
            {result.chart&&<Chart data={result.chart.rows} x={result.chart.x} date={result.chart.x==='date'} height={235} series={[
              {key:result.chart.y,name:label(result.chart.y),kind:result.chart.type==='bar'?'bar':'line'}]}/>}
            {result.evidence.contributions&&<Contribution rows={result.evidence.contributions}/>}
            <details><summary>Sources and calculation</summary>
              <Source>{result.trace.sources?.join(' · ')||'No data accessed'}</Source>
              {result.trace.range&&<p>{result.trace.range.join(' to ')}</p>}
              {Object.values(result.trace.formulas).map(formula=><p key={formula}>{formula}</p>)}
              <details><summary>Structured evidence</summary><pre>{JSON.stringify(result.evidence,null,2)}</pre></details>
            </details>
          </div>}
        </div>)}</div>
        {query.isPending&&<div className="working" role="status"><Sparkles size={15}/> Checking the business dataset…</div>}
        <form className="chat-form" onSubmit={form.handleSubmit(({question})=>send(question))}>
          <input aria-label="Business question" placeholder="Ask about revenue, products, marketing or inventory" maxLength={500} {...form.register('question')}/>
          <Button className="primary" type="submit" disabled={query.isPending}><Send size={16}/> Send</Button>
        </form>
        {form.formState.errors.question&&<p className="field-error" role="alert">{form.formState.errors.question.message}</p>}
      </Card>
      <Card className="prompts"><SectionTitle title="Try asking" detail="Examples grounded in this workspace"/>
        {prompts.map(text=><button key={text} onClick={()=>send(text)} disabled={query.isPending}>{text}<ChevronRight size={15}/></button>)}
        <Source>Validated analytics tools</Source>
      </Card>
    </div>
  </>
}

const alertFormat = (metric:string) => metric.includes('roas') ? (v:number)=>decimal(v)+'×' :
  metric.includes('conversion')||metric==='margin'?percent:metric==='revenue'||metric.includes('spend')?moneyCompact:decimal

export function Alerts({dataset}: {dataset:Dataset}) {
  const [severity,setSeverity] = useState('')
  const [window,setWindow] = useState({start:[dataset.end.slice(0,7)+'-01',dataset.start].sort()[1],end:dataset.end})
  const [search,setSearch] = useSearchParams()
  const alertId = search.get('alert')
  const range = params(window)
  const list = useQuery({queryKey:['alerts',range,severity],queryFn:()=>request<{rows:Alert[]}>('/anomalies?'+params({...window,severity}))})
  const detail = useQuery({queryKey:['alert',alertId,range],queryFn:()=>request<Alert>('/anomalies/'+encodeURIComponent(alertId||'')+'?'+range),enabled:!!alertId})
  const selected = detail.data
  return <>
    <Heading eyebrow="BUSINESS MONITORING" title="Anomaly center" subtitle="Review unusual movements and compare them with historical expectations."/>
    <Card className="filters">
      <label className="field"><span>From</span><input type="date" min={dataset.start} max={window.end} value={window.start}
        onChange={e=>{setWindow({...window,start:e.target.value});setSearch({})}}/></label>
      <label className="field"><span>To</span><input type="date" min={window.start} max={dataset.end} value={window.end}
        onChange={e=>{setWindow({...window,end:e.target.value});setSearch({})}}/></label>
      <Select label="Severity" value={severity} onChange={setSeverity} options={[['','All severities'],['critical','Critical'],['high','High'],['medium','Medium']]}/>
    </Card>
    <div className="split">
      <Card><SectionTitle title="Ranked alerts" detail="Business and inventory signals" aside={<Bell size={19}/>}/>
        <ErrorState error={list.error} retry={()=>void list.refetch()}/>
        {list.isLoading&&<Loading/>}
        {list.data?.rows.length===0&&<Empty text="No alerts match the selected filters."/>}
        <div className="alerts-list">{list.data?.rows.map(row=><button key={row.id}
          className={row.id===alertId?'active-alert':''} onClick={()=>setSearch({alert:row.id})}>
          <div><strong>{alertName[row.metric]||label(row.metric)}</strong><small>{row.scope} · {dateLabel(row.end)}</small></div>
          <Pill tone={row.severity}>{row.severity}</Pill><ChevronRight size={17}/>
        </button>)}</div>
      </Card>
      <Card>
        <ErrorState error={detail.error} retry={()=>void detail.refetch()}/>
        {detail.isLoading&&<Loading/>}
        {!alertId&&<Empty text="Choose an alert to view its evidence and suggested action."/>}
        {selected&&<>
          <SectionTitle title={alertName[selected.metric]||label(selected.metric)}
            detail={selected.scope+' · '+dateLabel(selected.start)+' – '+dateLabel(selected.end)}
            aside={<Pill tone={selected.severity}>{selected.severity} · {selected.score}/100</Pill>}/>
          <div className="mini-grid"><div><small>Observed</small><strong>{alertFormat(selected.metric)(selected.actual)}</strong></div>
            <div><small>Reference</small><strong>{alertFormat(selected.metric)(selected.baseline)}</strong></div>
            <div><small>Deviation</small><strong>{percent(selected.deviation)}</strong></div></div>
          <Chart data={selected.chart} x="date" date height={235} format={alertFormat(selected.metric)}
            series={[{key:'actual',name:'Observed',kind:selected.chart.length===1?'bar':'line'},
              {key:'baseline',name:'Reference',kind:selected.chart.length===1?'bar':'line',dashed:true}]}/>
          <div className="callout"><CircleAlert size={18}/><div><strong>Suggested action</strong><p>{selected.action}</p></div></div>
          {selected.contributing_factors&&<Contribution rows={selected.contributing_factors.contributions} interpretation={selected.contributing_factors.interpretation} metric={selected.contributing_factors.metric}/>}
          <details><summary>Detection evidence</summary><pre>{JSON.stringify(selected.evidence,null,2)}</pre></details>
        </>}
      </Card>
    </div>
  </>
}

export function ForecastPage({options}: {options:Options}) {
  const [target,setTarget] = useState('revenue')
  const [scope,setScope] = useState('')
  const [horizon,setHorizon] = useState('30')
  const mutation = useMutation({mutationFn:(values:unknown)=>request<Forecast>('/forecast',values)})
  const result = mutation.data
  const run = () => mutation.mutate({target,horizon:Number(horizon),...(scope.startsWith('p:')?{product:scope.slice(2)}:
    scope.startsWith('c:')?{category:scope.slice(2)}:{})})
  const format = result?.target==='revenue'?moneyCompact:decimal
  const chart = result ? [
    ...result.history.map((r,i)=>({...r,observed:r.value,projected:i===result.history.length-1?r.value:null})),
    ...result.prediction.map(r=>({...r,observed:null,projected:r.value})),
  ] : []
  const metrics = result ? Object.entries(result.metrics.test).map(([model,m])=>({model,...m})) : []
  return <>
    <Heading eyebrow="PREDICTIVE ANALYTICS" title="Forecast center" subtitle="Project revenue, order volume or demand from observed daily activity."/>
    <Card className="filters"><Select label="Target" value={target} onChange={setTarget} options={[['revenue','Revenue'],['orders','Orders'],['demand','Demand (units)']]}/>
      <Select label="Scope" value={scope} onChange={setScope} options={[['','Entire business'],...options.categories.map<[string,string]>(c=>['c:'+c,'Category · '+c]),
        ...options.products.map<[string,string]>(p=>['p:'+p.product_id,p.product_name])]}/>
      <Select label="Horizon" value={horizon} onChange={setHorizon} options={[['7','7 days'],['30','30 days']]}/>
      <Button className="primary align-end" onClick={run} disabled={mutation.isPending}>Run forecast <ArrowRight size={16}/></Button>
    </Card>
    <ErrorState error={mutation.error}/>
    {mutation.isPending&&<Loading/>}
    {!result&&!mutation.isPending&&!mutation.error&&<Card><Empty text="Select a scope and run a forecast to see predictions and holdout performance."/></Card>}
    {result&&<>
      <Card><SectionTitle title={label(result.target)+' forecast'} detail={result.horizon+' days · '+result.scope+' · Data through '+dateLabel(result.data_as_of)}
        aside={<Pill tone="accent">{result.metrics.selected==='lightgbm'?'LightGBM':label(result.metrics.selected)} · {result.model_version}</Pill>}/>
        <div className="mini-grid"><div><small>Projected total</small><strong>{format(result.total)}</strong></div>
          <div><small>Observed test interval coverage</small><strong>{percent(result.metrics.test_coverage)}</strong></div>
          <div><small>Selected model test WAPE</small><strong>{percent(result.metrics.test[result.metrics.selected].wape)}</strong></div></div>
        <div className="legend"><span><i/>Observed</span><span><i/>Forecast</span><span><i/>90% nominal band</span></div>
        <Chart data={chart} x="date" date band height={320} format={format} series={[
          {key:'observed',name:'Observed'},{key:'projected',name:'Forecast',dashed:true}]}/>
        <p className="muted">{result.interval_method}</p>
        <div className="callout"><CircleAlert size={18}/><p>{result.stockout_note}</p></div>
      </Card>
      <div className="dashboard-grid"><Card><SectionTitle title="Holdout model comparison" detail="Selected using validation MAE"/>
        <Table rows={metrics} columns={[{key:'model'},{key:'mae',format},{key:'rmse',format},{key:'wape',format:percent},{key:'bias',format}]}/></Card>
      <Card><SectionTitle title="Model drivers" detail="Global gain when LightGBM is selected"/>
        <Table rows={Object.entries(result.drivers).map(([name,value])=>({name,value}))} columns={[{key:'name',title:'Driver'},{key:'value'}]}/>
        <Source>Sales transactions · Versioned model artifact</Source></Card></div>
    </>}
  </>
}

const scenarioTitles: Record<string,string> = {price:'Price & discount',marketing:'Marketing budget',inventory:'Inventory reorder'}
const scenarioForm = z.object({
  objective:z.enum(['profit','revenue','stockout','balanced']), horizon:z.enum(['7','30']),
  subject:z.string().min(1,'Choose a product or channel.'),
  variants:z.string().max(80),
  assumption:z.string(), incoming:z.string(), arrival:z.string(), safety:z.string(),
})
type FormValues = z.infer<typeof scenarioForm>

function valuesOf(raw:string,min:number,max:number,whole=false) {
  if(!raw.trim()) return []
  const parts = raw.split(',').map(x=>x.trim())
  const values = parts.map(Number)
  if(parts.length>8||parts.some(x=>!x)||values.some(x=>!Number.isFinite(x)||x<min||x>max||whole&&!Number.isInteger(x)))
    throw new Error('Enter up to eight comma-separated '+(whole?'whole numbers':'numbers')+' between '+min+' and '+max+'.')
  return values
}

export function Simulator({options}: {options:Options}) {
  const [kind,setKind] = useState('price')
  const [localError,setLocalError] = useState<Error|null>(null)
  const products = kind==='inventory'?options.products.filter(p=>p.is_physical):options.products
  const defaultProduct = (items:Options['products'])=>items.find(p=>p.product_name==='SmartDesk Mini')?.product_id||items[0]?.product_id||''
  const form = useForm<FormValues>({resolver:zodResolver(scenarioForm),defaultValues:{
    objective:'profit',horizon:'30',subject:defaultProduct(options.products),variants:'0, 5, 10',
    assumption:'',incoming:'0',arrival:'1',safety:'',
  }})
  const mutation = useMutation({mutationFn:(values:unknown)=>request<Scenario>('/simulate',values)})
  const setType = (value:string) => {
    setKind(value);setLocalError(null);mutation.reset()
    form.reset({objective:value==='inventory'?'stockout':'profit',horizon:'30',
      subject:value==='marketing'?options.marketing_channels[0]||'':defaultProduct(value==='inventory'?options.products.filter(p=>p.is_physical):options.products),
      variants:value==='marketing'?'-15, 15, 30':value==='price'?'0, 5, 10':'',
      assumption:'',incoming:'0',arrival:'1',safety:''})
  }
  const run = (data:FormValues) => {
    try {
      const numeric = (str:string)=>Number(str)
      const v = valuesOf(data.variants,kind==='marketing'?-100:0,kind==='price'?50:kind==='marketing'?200:1_000_000,kind==='inventory')
      if(!v.length&&kind!=='inventory')throw new Error('Enter at least one alternative.')
      const parameters = kind==='price' ? {product:data.subject,discounts:v.map(x=>x/100),...(data.assumption?{elasticity:numeric(data.assumption)}:{})} :
        kind==='marketing'?{channel:data.subject,changes:v.map(x=>x/100),...(data.assumption?{response_exponent:numeric(data.assumption)}:{})}:
        {product:data.subject,order_quantities:v,incoming_stock:numeric(data.incoming),arrival_day:numeric(data.arrival),...(data.safety?{safety_stock:numeric(data.safety)}:{})}
      setLocalError(null)
      mutation.mutate({type:kind,horizon:numeric(data.horizon),objective:data.objective,parameters})
    } catch(error) {setLocalError(error instanceof Error?error:new Error('Check scenario inputs.'))}
  }
  const data = mutation.data
  const variants = data?[data.baseline,...data.alternatives]:[]
  return <>
    <Heading eyebrow="WHAT-IF ANALYSIS" title="Scenario simulator" subtitle="Compare actions against a data-based baseline, then inspect the assumptions behind the result."/>
    <div className="scenario-tabs" role="group" aria-label="Scenario type">{Object.entries(scenarioTitles).map(([key,title])=>
      <Button className={key===kind?'primary':''} aria-pressed={key===kind} key={key} disabled={mutation.isPending} onClick={()=>setType(key)}>{title}</Button>)}</div>
    <Card>
      <SectionTitle title={scenarioTitles[kind]} detail="Adjust inputs and compare possible outcomes."/>
      <form className="scenario-form" onSubmit={form.handleSubmit(run)}>
        <label className="field"><span>{kind==='marketing'?'Marketing channel':'Product'}</span><select {...form.register('subject')}>
          {kind==='marketing'?options.marketing_channels.map(s=><option key={s}>{s}</option>):
            products.map(p=><option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}</select></label>
        <label className="field"><span>Objective</span><select {...form.register('objective')}>
          <option value="profit">Maximize contribution profit</option><option value="revenue">Maximize revenue</option>
          {kind!=='marketing'&&<option value="stockout">Minimize stockout risk</option>}<option value="balanced">Balance return and risk</option>
        </select></label>
        <label className="field"><span>Horizon</span><select {...form.register('horizon')}><option value="7">7 days</option><option value="30">30 days</option></select></label>
        <label className="field"><span>{kind==='price'?'Discounts (%)':kind==='marketing'?'Budget changes (%)':'Reorder quantities (optional)'}</span>
          <input {...form.register('variants')} placeholder={kind==='inventory'?'Auto-select if blank':'Comma-separated values'}/></label>
        {kind==='inventory'?<>
          <label className="field"><span>Confirmed incoming units</span><input type="number" min="0" {...form.register('incoming')}/></label>
          <label className="field"><span>Confirmed arrival day</span><input type="number" min="1" max="90" {...form.register('arrival')}/></label>
          <label className="field"><span>Safety stock (optional)</span><input type="number" min="0" {...form.register('safety')}/></label>
        </>:<label className="field"><span>{kind==='price'?'Elasticity (optional)':'Response exponent (optional)'}</span>
          <input type="number" step="0.01" min={kind==='price'?-5:.2} max={kind==='price'?0:.95} {...form.register('assumption')}/></label>}
        <Button type="submit" className="primary align-end" disabled={mutation.isPending}>Compare scenarios <ArrowRight size={16}/></Button>
      </form>
      {form.formState.errors.subject&&<p className="field-error">{form.formState.errors.subject.message}</p>}
    </Card>
    <ErrorState error={localError||mutation.error}/>
    {mutation.isPending&&<Loading/>}
    {data&&<>
      <Card><SectionTitle title="Outcome comparison" detail={'Selected for objective: '+label(data.objective)}
        aside={<Pill tone="accent">Scenario estimate</Pill>}/>
        <div className="callout"><Check size={18}/><div><strong>{String(data.recommended.name)}</strong>
          <p>Projected contribution profit change vs baseline {money(Number(data.recommended.profit_delta))}.</p></div></div>
        <Chart data={variants} x="name" height={250} format={moneyCompact} series={[
          {key:'revenue',name:'Revenue',kind:'bar'},{key:'profit',name:'Contribution profit',kind:'bar'}]}/>
        <Table rows={variants} columns={[{key:'name',title:'Scenario'},{key:'demand'},{key:'fulfilled'},
          {key:'revenue',format:moneyCompact},{key:'gross_profit',format:moneyCompact},{key:'profit',format:moneyCompact},
          {key:'margin',format:percent},{key:'risk',title:'Unfulfilled units'}]}/>
      </Card>
      <div className="dashboard-grid"><Card><SectionTitle title="Sensitivity" detail="Changes under alternate assumptions"/>
        {data.sensitivity.map((group,i)=><details key={i}><summary>{group.name}</summary><Table
          rows={group.alternatives.map(item=>({case:String(item.elasticity??item.exponent??item.demand_path),...item.result}))}
          columns={[{key:'case',title:'Assumption'},{key:'profit',format:moneyCompact},{key:'revenue',format:moneyCompact},{key:'risk',title:'Unfulfilled units'}]}/></details>)}</Card>
      <Card><SectionTitle title="Assumptions & evidence"/><ul className="bullet-list">{data.assumptions.map(a=><li key={a}>{a}</li>)}</ul>
        <details><summary>Structured inputs</summary><pre>{JSON.stringify(data.evidence,null,2)}</pre></details></Card></div>
    </>}
  </>
}

export function Recommendations() {
  const client = useQueryClient()
  const data = useQuery({queryKey:['recommendations'],queryFn:()=>request<{rows:Recommendation[];dataset_id:string}>('/recommendations')})
  const audit = useQuery({queryKey:['audit'],queryFn:()=>request<{rows:Audit[]}>('/audit?kind=recommendation_feedback')})
  const feedback = useMutation({mutationFn:({id,decision}:{id:string;decision:string})=>request('/recommendations/feedback',{
    recommendation_id:id,decision,dataset_id:data.data?.dataset_id}),
    onSuccess:()=>{void client.invalidateQueries({queryKey:['recommendations']});void client.invalidateQueries({queryKey:['audit']})}})
  return <>
    <Heading eyebrow="DECISION WORKSPACE" title="Recommendations" subtitle="Review proposed actions, assumptions and estimates before recording a decision."/>
    <ErrorState error={data.error||feedback.error} retry={data.error?()=>void data.refetch():undefined}/>
    {data.isLoading&&<Loading/>}
    {data.data?.rows.length===0&&<Card><Empty text="There are no recommendations for the current snapshot."/></Card>}
    <div className="recommendation-list">
      {data.data?.rows.map(row=><Card key={row.id}><SectionTitle title={row.title} detail={row.context}
        aside={<div className="pill-row"><Pill tone={row.priority}>{row.priority}</Pill><Pill tone={row.decision==='accepted'?'success':'muted'}>{row.decision}</Pill></div>}/>
        <p className="recommended-action">{row.action}</p>
        <div className="mini-grid">{row.expected_impact?Object.entries(row.expected_impact).map(([key,value])=>
          <div key={key}><small>{label(key)}</small><strong>{key.endsWith('vnd')||key==='purchase_commitment'?moneyCompact(value):decimal(value)}</strong></div>):
          <div><small>Estimated impact</small><strong className="small-value">Insufficient evidence</strong></div>}</div>
        <p className="muted">{row.uncertainty}</p>
        <details><summary>Review assumptions, risks and evidence</summary><p>{row.risk}</p>
          <ul className="bullet-list">{row.assumptions.map(a=><li key={a}>{a}</li>)}</ul><pre>{JSON.stringify(row.evidence,null,2)}</pre>
        </details>
        <div className="decision-actions"><Button className="primary" disabled={feedback.isPending||row.decision==='accepted'}
          onClick={()=>feedback.mutate({id:row.id,decision:'accepted'})}><Check size={16}/> Accept</Button>
          <Button disabled={feedback.isPending||row.decision==='rejected'} onClick={()=>feedback.mutate({id:row.id,decision:'rejected'})}><X size={16}/> Reject</Button></div>
      </Card>)}
    </div>
    <Card><SectionTitle title="Decision audit" detail="Accept and Reject record a review decision. Times are shown in Vietnam local time." aside={<Database size={18}/>}/>
      <ErrorState error={audit.error}/>
      {audit.isLoading&&<Loading/>}
      {audit.data&&<Table rows={audit.data.rows.map(r=>({time:new Date(r.occurred_at).toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh'}),subject:r.subject,decision:r.payload.decision}))}
        columns={[{key:'time'},{key:'subject',title:'Recommendation'},{key:'decision'}]}/>}
      <Link className="inline-link" to="/scenarios">Compare scenario assumptions <ArrowRight size={16}/></Link>
    </Card>
  </>
}
