import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Activity, ArrowUpRight, Bell, ChartNoAxesCombined, CircleGauge, Compass, Database, Menu, MessageSquareText, Moon, SlidersHorizontal, Sun, X } from 'lucide-react'
import { type Dataset, type Options, dateLabel, request } from './api'
import { ErrorState, Loading } from './ui'
import { Dashboard } from './Dashboard'
import { Alerts, Ask, ForecastPage, Recommendations, Simulator, type ChatMessage } from './WorkspacePages'
import './styles.css'

const sections = [
  {to:'/',title:'Executive dashboard',icon:CircleGauge},
  {to:'/ask',title:'Ask business data',icon:MessageSquareText},
  {to:'/anomalies',title:'Anomaly center',icon:Bell},
  {to:'/forecast',title:'Forecast center',icon:ChartNoAxesCombined},
  {to:'/scenarios',title:'Scenario simulator',icon:SlidersHorizontal},
  {to:'/recommendations',title:'Recommendations',icon:Compass},
]
const client = new QueryClient({defaultOptions:{queries:{staleTime:60_000,retry:1,refetchOnWindowFocus:false}}})

function App() {
  const [dark,setDark] = useState(()=>localStorage.getItem('dp-theme')==='dark')
  const [open,setOpen] = useState(false)
  const [messages,setMessages] = useState<ChatMessage[]>([])
  const {pathname} = useLocation()
  const ds = useQuery({queryKey:['dataset'],queryFn:()=>request<Dataset>('/dataset')})
  const opts = useQuery({queryKey:['options',ds.data?.dataset_id],queryFn:()=>request<Options>('/options'),enabled:!!ds.data})
  const health = useQuery({queryKey:['health'],queryFn:()=>request<{model_ready:boolean;status:string}>('/health')})
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('dp-theme',dark?'dark':'light')},[dark])
  useEffect(()=>{setOpen(false);window.scrollTo(0,0)},[pathname])
  useEffect(()=>setMessages([]),[ds.data?.dataset_id])
  const active = sections.find(s=>s.to===pathname)?.title
  return <div className="shell">
    {open&&<button className="overlay" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
    <aside className={'sidebar'+(open?' sidebar-open':'')}>
      <div className="brand"><div className="brand-mark"><Activity size={23}/></div><div><strong>DecisionPilot<span> AI</span></strong><small>DECISION INTELLIGENCE</small></div>
        <button className="mobile close-nav" aria-label="Close navigation" onClick={()=>setOpen(false)}><X size={20}/></button></div>
      <div className="nav-title">WORKSPACE</div>
      <nav>{sections.map(({to,title,icon:Icon})=><NavLink key={to} to={to} end={to==='/'}>
        <Icon size={18}/><span>{title}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="workspace"><span className="workspace-icon"><Database size={17}/></span>
        <div><strong>{ds.data?.kind==='imported'?'Imported workspace':'Demo workspace'}</strong><small>{health.data?.status==='ok'?'Database connected':'Local workspace'}</small></div></div>
        <a className="api-link" href="/api/docs" target="_blank" rel="noreferrer">API documentation <ArrowUpRight size={14}/></a>
      </div>
    </aside>
    <div className="body">
      <header className="topbar">
        <div className="breadcrumbs"><button className="icon-button mobile" aria-label="Open navigation" onClick={()=>setOpen(true)}><Menu size={20}/></button>
          <span>DecisionPilot</span><span className="breadcrumb-slash">/</span><strong>{active||'Workspace'}</strong></div>
        <div className="top-actions">
          {ds.data&&<span className="dataset-chip"><i/>{ds.data.kind==='synthetic'?'Synthetic demo data':'Imported data'}</span>}
          <button className="icon-button" onClick={()=>setDark(!dark)} aria-label={dark?'Use light theme':'Use dark theme'}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button>
        </div>
      </header>
      <main>
        {(ds.isLoading||opts.isLoading)&&<Loading/>}
        <ErrorState error={ds.error||opts.error} retry={()=>{void ds.refetch();if(ds.data)void opts.refetch()}}/>
        {ds.data&&opts.data&&<Routes>
          <Route path="/" element={<Dashboard dataset={ds.data} options={opts.data}/>}/>
          <Route path="/ask" element={<Ask dataset={ds.data} messages={messages} setMessages={setMessages}/>}/>
          <Route path="/anomalies" element={<Alerts dataset={ds.data}/>}/>
          <Route path="/forecast" element={<ForecastPage options={opts.data}/>}/>
          <Route path="/scenarios" element={<Simulator options={opts.data}/>}/>
          <Route path="/recommendations" element={<Recommendations/>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>}
        {ds.data&&<footer className="footer"><span>DecisionPilot AI · Ask. Understand. Predict. Decide.</span><span>Data through {dateLabel(ds.data.end)} · VND</span></footer>}
      </main>
    </div>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={client}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></StrictMode>)
