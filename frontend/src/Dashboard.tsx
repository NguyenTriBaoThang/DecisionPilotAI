import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BellRing, CalendarDays, ChartNoAxesCombined, CircleDollarSign, ShoppingBag, UsersRound, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dateLabel, decimal, integer, moneyCompact, params, percent, request, type Alert, type Dataset, type Filters, type KPI, type Options } from './api'
import { Card, Chart, Empty, ErrorState, Heading, Loading, Pill, SectionTitle, Select, Source, Stat, Table } from './ui'

export const alertName: Record<string,string> = {revenue:'Revenue decline',margin:'Gross margin pressure',units:'Unusual sales volume',facebook_spend:'Facebook Ads spend',facebook_roas:'Facebook Ads ROAS',facebook_conversion:'Facebook Ads conversion',marketing_spend:'Marketing spend',marketing_roas:'Marketing ROAS',marketing_conversion:'Marketing conversion',stockout_risk:'Stockout risk'}

export function Dashboard({dataset,options}: {dataset:Dataset;options:Options}) {
  const [filters,setFilters] = useState<Filters>({start:[dataset.end.slice(0,7)+'-01',dataset.start].sort()[1],end:dataset.end})
  const data = useQuery({queryKey:['dashboard',dataset.dataset_id,filters],queryFn:()=>request<KPI>('/kpi/summary?'+params(filters))})
  const alerts = useQuery({queryKey:['dashboard-alerts',dataset.dataset_id],queryFn:()=>request<{rows:Alert[]}>('/anomalies?limit=5')})
  const update = (key:keyof Filters,value:string)=>setFilters((current)=>({...current,[key]:value}))
  const result = data.data
  const stats = result ? [
    {key:'revenue',title:'Total revenue',value:moneyCompact(result.summary.revenue),icon:<CircleDollarSign size={20}/>},
    {key:'gross_profit',title:'Gross profit',value:moneyCompact(result.summary.gross_profit),icon:<Wallet size={19}/>},
    {key:'orders',title:'Total orders',value:integer(result.summary.orders),icon:<ShoppingBag size={18}/>},
    {key:'customers',title:'Active customers',value:integer(result.summary.customers),icon:<UsersRound size={20}/>},
  ] : []
  return <>
    <Heading eyebrow="BUSINESS INTELLIGENCE" title="Executive overview" subtitle="Track business performance, spot shifts and decide what to investigate next."
      aside={<Link className="button primary hero-action" to="/ask">Ask business data <ArrowRight size={17}/></Link>}/>
    <Card className="filters">
      <div className="filter-intro"><CalendarDays size={18}/><span>Reporting scope</span></div>
      <label className="field"><span>From</span><input type="date" value={filters.start} min={dataset.start} max={filters.end} onChange={e=>update('start',e.target.value)}/></label>
      <label className="field"><span>To</span><input type="date" value={filters.end} min={filters.start} max={dataset.end} onChange={e=>update('end',e.target.value)}/></label>
      <Select label="Category" value={filters.category||''} onChange={(value)=>setFilters(current=>({...current,category:value,product:''}))} options={[['','All categories'],...options.categories]}/>
      <Select label="Region" value={filters.region||''} onChange={value=>update('region',value)} options={[['','All regions'],...options.regions]}/>
      <Select label="Sales channel" value={filters.channel||''} onChange={value=>update('channel',value)} options={[['','All channels'],...options.channels]}/>
      <Select label="Product" value={filters.product||''} onChange={value=>update('product',value)}
        options={[['','All products'],...options.products.filter(p=>!filters.category||p.category===filters.category).map<[string,string]>(p=>[p.product_id,p.product_name])]}/>
    </Card>
    <ErrorState error={data.error} retry={()=>void data.refetch()}/>
    {data.isLoading&&<Loading/>}
    {result&&<>
      <div className="stat-grid">{stats.map(s=><Stat key={s.key} title={s.title} value={s.value} icon={s.icon} change={result.changes[s.key]} formula={result.definitions[s.key]}/>)}</div>
      <div className="dashboard-grid">
        <Card>
          <SectionTitle title="Revenue & gross profit" detail={dateLabel(result.range[0])+' – '+dateLabel(result.range[1])}
            aside={<Select label="Group by" value={filters.grain||'daily'} onChange={v=>update('grain',v)} options={[['daily','Day'],['weekly','Week'],['monthly','Month']]}/>}/>
          <div className="legend"><span><i/>Revenue</span><span><i/>Gross profit</span></div>
          <Chart data={result.trend} x="date" date series={[{key:'revenue',name:'Revenue',kind:'area'},{key:'gross_profit',name:'Gross profit'}]} format={moneyCompact}/>
          <Source>Sales transactions · Report date range</Source>
        </Card>
        <Card>
          <SectionTitle title="Priority signals" detail="Latest dataset month, ranked by severity" aside={<span className="stat-icon signal-icon"><BellRing size={18}/></span>}/>
          <ErrorState error={alerts.error}/>
          {alerts.isLoading&&<Loading/>}
          {alerts.data?.rows.length===0&&<Empty text="No anomalies in the latest month."/>}
          <div className="signals">{alerts.data?.rows.map(a=><Link to={'/anomalies?alert='+encodeURIComponent(a.id)} key={a.id} className="signal">
            <span className={'signal-dot '+a.severity}/><div><strong>{alertName[a.metric]||a.metric}</strong><small>{a.scope} · {dateLabel(a.end)}</small></div>
            <span className="signal-rate">{a.deviation!=null?percent(a.deviation):'—'}</span></Link>)}</div>
          <Link to="/anomalies" className="inline-link">Open anomaly center <ArrowRight size={15}/></Link>
        </Card>
      </div>
      <div className="dashboard-grid">
        <Card><SectionTitle title="Product performance" detail="Top products by revenue" aside={<ChartNoAxesCombined size={20}/>}/>
          <Table rows={result.products} columns={[{key:'name',title:'Product'},{key:'revenue',format:moneyCompact},{key:'gross_profit',format:moneyCompact},{key:'units',format:integer}]}/>
          <Source>Sales transactions · Product catalog</Source></Card>
        <Card><SectionTitle title="Campaign efficiency" detail={result.market_scope}/>
          <Table rows={result.marketing_channels} columns={[{key:'name',title:'Channel'},{key:'spend',format:moneyCompact},{key:'roas',format:v=>decimal(v)+'×'}]}/>
          <div className="mini-grid"><div><small>Gross margin</small><strong>{percent(result.summary.margin)}</strong></div>
            <div><small>Stock availability</small><strong>{percent(result.summary.inventory_availability)}</strong></div></div>
        </Card>
      </div>
      <div className="dashboard-grid">
        <Card><SectionTitle title="Revenue by region"/><Table rows={result.regions} columns={[{key:'name',title:'Region'},{key:'revenue',format:moneyCompact},{key:'orders',format:integer}]}/></Card>
        <Card><SectionTitle title="Revenue by sales channel"/><Table rows={result.sales_channels} columns={[{key:'name',title:'Channel'},{key:'revenue',format:moneyCompact},{key:'orders',format:integer}]}/>
          <div className="mini-grid"><div><small>New customers</small><strong>{integer(result.summary.new_customers)}</strong></div><div><small>Returning customers</small><strong>{integer(result.summary.returning_customers)}</strong></div></div>
        </Card>
      </div>
    </>}
  </>
}
