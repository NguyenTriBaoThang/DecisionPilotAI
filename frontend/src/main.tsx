import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  ArrowUpRight,
  Bell,
  BookOpen,
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
import { PreferencesProvider, translate, usePreferences, useT } from './preferences'
import { ErrorState, Loading } from './ui'
import { Dashboard } from './Dashboard'
import { Alerts, Ask, ForecastPage, Recommendations, type ChatMessage } from './WorkspacePages'
import { EndToEndStepper } from './components/EndToEndStepper'
import { LanguageSwitcher } from './components/LanguageSwitcher'
const ScenarioSimulator3D = lazy(() =>
  import('./features/scenario-simulator/components/ScenarioSimulator3D').then((module) => ({
    default: module.ScenarioSimulator3D,
  }))
)
const LandingPage = lazy(() =>
  import('./components/LandingPage').then((module) => ({ default: module.LandingPage }))
)
const TechnicalDocumentationPage = lazy(() =>
  import('./components/TechnicalDocumentationPage').then((module) => ({
    default: module.TechnicalDocumentationPage,
  }))
)
import { DataSourcesPage } from './components/DataSourcesPage'
import { SettingsPage } from './components/SettingsPage'
import './styles.css'

// 4-STEP PRIMARY END-TO-END DECISION WORKFLOW
const workflowSections = [
  { to: '/', title: 'Overview', icon: CircleGauge, step: '1' },
  { to: '/ask', title: 'Ask AI Copilot', icon: MessageSquareText, step: '2' },
  { to: '/scenarios', title: 'Scenario Simulator', icon: SlidersHorizontal, step: '3' },
  { to: '/recommendations', title: 'Recommendations', icon: Compass, step: '4' },
]

// SECONDARY SYSTEM / CONFIGURATION TOOLS
const systemSections = [
  { to: '/data-sources', title: 'Data Sources', icon: Database },
  { to: '/settings', title: 'Settings', icon: Settings },
]

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
})

function AppShell({ session }: { session: Session }) {
  const { preferences } = usePreferences()
  const { t } = useT()
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
    return (
      <Suspense fallback={<Loading />}>
        <LandingPage />
      </Suspense>
    )
  }

  const allSections = [...workflowSections, ...systemSections]
  const activeTitle = allSections.find((s) => s.to === pathname)?.title || 'Overview'

  return (
    <div className="shell">
      {open && <button className="overlay" aria-label={t('Close navigation')} onClick={() => setOpen(false)} />}

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
                {t('Decision Intelligence')}
              </small>
            </div>
          </Link>
          <button
            className="mobile close-nav text-slate-400 hover:text-white"
            aria-label={t('Close navigation')}
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Primary End-to-End Workflow Section */}
        <div className="nav-title text-[10px] font-bold tracking-widest uppercase text-slate-500 px-3 mb-2 flex items-center justify-between">
          <span>{t('WORKSPACE')}</span>
          <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.5 rounded">
            4 STEPS
          </span>
        </div>

        <nav className="space-y-1.5">
          {workflowSections.map(({ to, title, icon: Icon, step }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600/35 via-indigo-600/25 to-violet-600/20 text-cyan-300 border border-indigo-500/30 shadow-md shadow-indigo-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`
              }
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-500/15 text-[10px] font-bold text-cyan-400 font-mono">
                {step}
              </span>
              <Icon size={17} />
              <span className="truncate">{t(title)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Secondary System / Config Section */}
        <div className="nav-title text-[10px] font-bold tracking-widest uppercase text-slate-500 px-3 mt-6 mb-2">
          {t('SYSTEM')}
        </div>

        <nav className="space-y-1">
          {systemSections.map(({ to, title, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-slate-800/80 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`
              }
            >
              <Icon size={15} />
              <span>{t(title)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Bottom Status */}
        <div className="sidebar-bottom mt-auto pt-4 border-t border-indigo-500/10 space-y-3">
          <a
            href="/DecisionPilotAI/"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-cyan-300 hover:bg-indigo-500/20 transition-all"
          >
            <span className="flex items-center gap-2">
              <BookOpen size={14} /> {t('Technical Docs')}
            </span>
            <ExternalLink size={13} />
          </a>

          <div className="workspace flex items-center gap-2.5 p-3 rounded-xl border border-indigo-500/15 bg-slate-900/50">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
              <Database size={16} />
            </span>
            <div className="overflow-hidden">
              <strong className="block text-xs font-bold text-white truncate">
                {ds.data?.kind === 'imported' ? t('Imported Snapshot') : t('Demo Workspace')}
              </strong>
              <small className="block text-[11px] text-slate-400 truncate">
                {health.data?.status === 'ok' ? t('DB Connected') : t('Local Sandbox')}
              </small>
            </div>
          </div>

          <a
            className="api-link flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-cyan-300 transition-colors px-1"
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
          >
            <span>{t('OpenAPI Swagger Reference')}</span>
            <ArrowUpRight size={13} />
          </a>
        </div>
      </aside>

      {/* Main Body */}
      <div className="body flex flex-col min-w-0">
        <header className="topbar sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 py-3 backdrop-blur-md bg-[#070b17]/85 border-b border-indigo-500/15">
          <div className="breadcrumbs flex items-center gap-2.5 text-xs text-slate-400">
            <button
              className="icon-button mobile p-2 rounded-lg border border-slate-700 text-slate-300"
              aria-label={t('Open navigation')}
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </button>
            <Link to="/" className="hover:text-white transition-colors">
              DecisionPilot
            </Link>
            <span className="text-slate-600">/</span>
            <strong className="text-white font-bold">{t(activeTitle)}</strong>
          </div>

          <div className="top-actions flex items-center gap-2.5 sm:gap-3">
            {/* Quick Bilingual Switcher (VI / EN) */}
            <LanguageSwitcher />

            <Link
              to="/docs"
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-950/50 hover:bg-indigo-900/50 hover:border-indigo-400 px-3 py-1 text-xs font-semibold text-indigo-200 transition-colors"
            >
              <BookOpen size={13} className="text-cyan-400" />
              <span>{t('Technical Docs')}</span>
            </Link>

            {ds.data && (
              <span className="dataset-chip hidden sm:inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-950/40 px-3 py-1 text-xs font-semibold text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>{ds.data.kind === 'synthetic' ? t('Synthetic Demo') : t('Imported Data')}</span>
              </span>
            )}

            <button
              className="icon-button flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/20 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-indigo-400 transition-colors"
              onClick={() => setDark(!dark)}
              aria-label={dark ? t('Switch to light theme') : t('Switch to dark theme')}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* Universal End-to-End Decision Stepper */}
          <EndToEndStepper />

          {(ds.isLoading || opts.isLoading) && <Loading />}
          <ErrorState
            error={ds.error || opts.error}
            retry={() => {
              void ds.refetch()
              if (ds.data) void opts.refetch()
            }}
          />

          {!ds.isLoading && !ds.data && <Link to="/data-sources">{t('Open Data Sources to import a dataset')}</Link>}
          {pathname === '/data-sources' && !ds.data && !ds.isLoading && <DataSourcesPage session={session} />}
          {ds.data && opts.data && (
            <Routes key={ds.data.dataset_id}>
              {/* Step 1: Overview & Diagnostics */}
              <Route path="/" element={<Dashboard dataset={ds.data} options={opts.data} />} />

              {/* Step 2: Ask AI Copilot Investigation */}
              <Route
                path="/ask"
                element={<Ask dataset={ds.data} messages={messages} setMessages={setMessages} />}
              />

              {/* Step 3: 3D Scenario Simulator & Forecasting */}
              <Route
                path="/scenarios"
                element={
                  <Suspense fallback={<Loading />}>
                    <ScenarioSimulator3D options={opts.data} />
                  </Suspense>
                }
              />

              {/* Step 4: Actionable Recommendations & Approvals */}
              <Route path="/recommendations" element={<Recommendations />} />

              {/* Secondary & Deep-link Routes */}
              <Route path="/anomalies" element={<Alerts dataset={ds.data} />} />
              <Route path="/forecast" element={<ForecastPage options={opts.data} />} />
              <Route
                path="/docs"
                element={
                  <Suspense fallback={<Loading />}>
                    <TechnicalDocumentationPage />
                  </Suspense>
                }
              />
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

  if (needsLogin || (session.error instanceof ApiError && session.error.status === 401)) {
    return (
      <main className="p-8 max-w-lg mx-auto space-y-4">
        <h1>Workspace sign in</h1>
        <p>Enter the access token issued by your workspace administrator.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            sessionStorage.setItem('dp-access-token', token.trim())
            client.clear()
            setNeedsLogin(false)
            setToken('')
            void session.refetch()
          }}
          className="space-y-4"
        >
          <label className="field">
            <span>Access token</span>
            <input
              type="password"
              autoComplete="off"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button type="submit" className="button primary">
            Sign in
          </button>
        </form>
      </main>
    )
  }

  if (session.isLoading) return <Loading />
  if (session.error) return <ErrorState error={session.error} retry={() => void session.refetch()} />
  return session.data ? <AppShell session={session.data} /> : null
}

const appBasename =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/DecisionPilotAI')
    ? '/DecisionPilotAI'
    : undefined

function Main() {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        <PreferencesProvider>
          <BrowserRouter basename={appBasename}>
            <WorkspaceAccess />
          </BrowserRouter>
        </PreferencesProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<Main />)
}
