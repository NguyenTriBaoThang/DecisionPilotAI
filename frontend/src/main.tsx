import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  Activity,
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  CircleGauge,
  Compass,
  Database,
  ExternalLink,
  Layers,
  Menu,
  MessageSquareText,
  Moon,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { type Dataset, type Options, type Session, ApiError, dateLabel, request } from './api'
import { PreferencesProvider, translate, usePreferences } from './preferences'
import { ErrorState, Loading } from './ui'
import { Dashboard } from './Dashboard'
import { Alerts, Ask, ForecastPage, Recommendations, type ChatMessage } from './WorkspacePages'
const ScenarioSimulator3D = lazy(() => import('./features/scenario-simulator/components/ScenarioSimulator3D').then(module => ({ default: module.ScenarioSimulator3D })))
const LandingPage = lazy(() => import('./components/LandingPage').then(module => ({ default: module.LandingPage })))
import { DataSourcesPage } from './components/DataSourcesPage'
import { SettingsPage } from './components/SettingsPage'
import './styles.css'

const sections = [
  { to: '/', title: 'Overview', icon: CircleGauge },
  { to: '/ask', title: 'Ask AI Copilot', icon: MessageSquareText },
  { to: '/anomalies', title: 'Anomaly Center', icon: Bell },
  { to: '/forecast', title: 'Forecast Center', icon: ChartNoAxesCombined },
  { to: '/scenarios', title: 'Scenario Simulator', icon: SlidersHorizontal },
  { to: '/recommendations', title: 'Recommendations', icon: Compass },
  { to: '/data-sources', title: 'Data Sources', icon: Database },
  { to: '/settings', title: 'Settings', icon: Settings },
]

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
})

function AppShell({ session }: { session: Session }) {
  const { preferences } = usePreferences()
  const [dark, setDark] = useState(() => localStorage.getItem('dp-theme') !== 'light')
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const { pathname } = useLocation()

  const ds = useQuery({ queryKey: ['dataset'], queryFn: () => request<Dataset>('/dataset') })
  const opts = useQuery({
    queryKey: ['options', ds.data?.dataset_id],
    queryFn: () => request<Options>('/options'),
    enabled: !!ds.data,
  })
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => request<{ model_ready: boolean; status: string; database: string }>('/health'),
  })

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('dp-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => setMessages([]), [ds.data?.dataset_id])

  if (pathname === '/landing') {
    return <Suspense fallback={<Loading />}><LandingPage /></Suspense>
  }

  const active = sections.find((s) => s.to === pathname)?.title

  return (
    <div className="shell">
      {open && <button className="overlay" aria-label="Close navigation" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={'sidebar' + (open ? ' sidebar-open' : '')}>
        <div className="brand flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
              <Sparkles size={20} />
            </div>
            <div>
              <strong className="text-base font-bold text-white tracking-tight">
                DecisionPilot <span className="text-cyan-400">AI</span>
              </strong>
              <small className="block text-[9px] font-semibold tracking-widest uppercase text-indigo-300">
                Decision Intelligence
              </small>
            </div>
          </Link>
          <button
            className="mobile close-nav text-slate-400 hover:text-white"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="nav-title text-[10px] font-bold tracking-widest uppercase text-slate-500 px-3 mb-2">
          WORKSPACE
        </div>

        <nav className="space-y-1">
          {sections.map(({ to, title, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600/30 to-violet-600/20 text-cyan-300 border border-indigo-500/30 shadow-md shadow-indigo-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`
              }
            >
              <Icon size={17} />
              <span>{translate(title, preferences.language)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Bottom Status */}
        <div className="sidebar-bottom mt-auto pt-4 border-t border-indigo-500/10 space-y-3">
          <Link
            to="/landing"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-cyan-300 hover:bg-indigo-500/20 transition-all"
          >
            <span className="flex items-center gap-2">
              <Sparkles size={14} /> Product Showcase
            </span>
            <ExternalLink size={13} />
          </Link>

          <div className="workspace flex items-center gap-2.5 p-3 rounded-xl border border-indigo-500/15 bg-slate-900/50">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
              <Database size={16} />
            </span>
            <div className="overflow-hidden">
              <strong className="block text-xs font-bold text-white truncate">
                {ds.data?.kind === 'imported' ? 'Imported Snapshot' : 'Demo Workspace'}
              </strong>
              <small className="block text-[11px] text-slate-400 truncate">
                {health.data?.status === 'ok' ? 'DB Connected' : 'Local Sandbox'}
              </small>
            </div>
          </div>

          <a
            className="api-link flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-cyan-300 transition-colors px-1"
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
          >
            <span>OpenAPI Swagger Reference</span>
            <ArrowUpRight size={13} />
          </a>
        </div>
      </aside>

      {/* Main Body */}
      <div className="body flex flex-col min-w-0">
        <header className="topbar sticky top-0 z-40 flex items-center justify-between px-6 py-3.5 backdrop-blur-md bg-[#070b17]/80 border-b border-indigo-500/10">
          <div className="breadcrumbs flex items-center gap-2.5 text-xs text-slate-400">
            <button
              className="icon-button mobile p-2 rounded-lg border border-slate-700 text-slate-300"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </button>
            <Link to="/" className="hover:text-white transition-colors">
              DecisionPilot
            </Link>
            <span className="text-slate-600">/</span>
            <strong className="text-white font-bold">{translate(active || 'Workspace', preferences.language)}</strong>
          </div>

          <div className="top-actions flex items-center gap-3">
            {ds.data && (
              <span className="dataset-chip inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-950/40 px-3 py-1 text-xs font-semibold text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>{ds.data.kind === 'synthetic' ? 'Synthetic Demo' : 'Imported Data'}</span>
              </span>
            )}
            <button
              className="icon-button flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/20 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-indigo-400 transition-colors"
              onClick={() => setDark(!dark)}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6 max-w-7xl w-full mx-auto">
          {(ds.isLoading || opts.isLoading) && <Loading />}
          <ErrorState
            error={ds.error || opts.error}
            retry={() => {
              void ds.refetch()
              if (ds.data) void opts.refetch()
            }}
          />

          {!ds.isLoading && !ds.data && <Link to="/data-sources">Open Data Sources to import a dataset</Link>}
          {pathname === '/data-sources' && !ds.data && !ds.isLoading && <DataSourcesPage session={session} />}
          {ds.data && opts.data && (
            <Routes key={ds.data.dataset_id}>
              <Route path="/" element={<Dashboard dataset={ds.data} options={opts.data} />} />
              <Route
                path="/ask"
                element={<Ask dataset={ds.data} messages={messages} setMessages={setMessages} />}
              />
              <Route path="/anomalies" element={<Alerts dataset={ds.data} />} />
              <Route path="/forecast" element={<ForecastPage options={opts.data} />} />
              <Route path="/scenarios" element={<Suspense fallback={<Loading />}><ScenarioSimulator3D options={opts.data} /></Suspense>} />
              <Route path="/recommendations" element={<Recommendations />} />
              <Route path="/data-sources" element={<DataSourcesPage dataset={ds.data} session={session} />} />
              <Route path="/settings" element={<SettingsPage dark={dark} setDark={setDark} session={session} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  )
}

function WorkspaceAccess() {
  const [token, setToken] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Session>('/session'), retry: false })
  useEffect(() => {
    const denied = () => setNeedsLogin(true)
    window.addEventListener('workspace-unauthorized', denied)
    return () => window.removeEventListener('workspace-unauthorized', denied)
  }, [])
  if (needsLogin || session.error instanceof ApiError && session.error.status === 401) {
    return <main className="p-8 max-w-lg mx-auto space-y-4">
      <h1>Workspace sign in</h1>
      <p>Enter the access token issued by your workspace administrator.</p>
      <form onSubmit={event => {
        event.preventDefault()
        sessionStorage.setItem('dp-access-token', token.trim())
        client.clear()
        setNeedsLogin(false)
        setToken('')
        void session.refetch()
      }} className="space-y-4">
        <label className="field"><span>Access token</span><input type="password" autoComplete="off" required value={token} onChange={e => setToken(e.target.value)} /></label>
        <button type="submit" className="button primary">Sign in</button>
      </form>
    </main>
  }
  if (session.isLoading) return <Loading />
  if (session.error) return <ErrorState error={session.error} retry={() => void session.refetch()} />
  return session.data ? <AppShell session={session.data} /> : null
}

const appBasename = typeof window !== 'undefined' && window.location.pathname.startsWith('/DecisionPilotAI')
  ? '/DecisionPilotAI'
  : undefined

function Main() {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        <PreferencesProvider>
          <BrowserRouter basename={appBasename}><WorkspaceAccess /></BrowserRouter>
        </PreferencesProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<Main />)
}
