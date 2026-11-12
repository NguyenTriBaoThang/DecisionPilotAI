import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  type Dataset,
  type Options,
  type Session,
  ApiError,
  getActiveCompanyId,
  request,
  setActiveCompanyId,
  setActiveCurrency,
} from './api'
import { PreferencesProvider, usePageTranslations, usePreferences, useT } from './preferences'
import { ErrorState, Loading, ToastProvider } from './ui'
import { TodayPage } from './redesign/TodayPage'
import { Alerts, Ask, ForecastPage, type ChatMessage } from './WorkspacePages'
import { Sidebar, BrandLogo, navGroups } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { GlobalSearchDialog } from './components/layout/GlobalSearchDialog'
import { DataSourcesPage } from './components/DataSourcesPage'
import { SettingsPage } from './components/SettingsPage'
import './styles.css'

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
const EnterpriseKnowledgeMap = lazy(() =>
  import('./components/lineage/EnterpriseKnowledgeMap').then((module) => ({
    default: module.EnterpriseKnowledgeMap,
  }))
)
const RecommendationsCenter = lazy(() =>
  import('./features/recommendations-audit/RecommendationsCenter').then((module) => ({
    default: module.RecommendationsCenter,
  }))
)
const RecommendationDetailView = lazy(() =>
  import('./features/recommendations-audit/RecommendationDetailView').then((module) => ({
    default: module.RecommendationDetailView,
  }))
)
const AuditGovernanceCenter = lazy(() =>
  import('./features/recommendations-audit/AuditGovernanceCenter').then((module) => ({
    default: module.AuditGovernanceCenter,
  }))
)

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
})

const routeTitles: Record<string, string> = {
  ...Object.fromEntries(navGroups.flatMap((g) => g.items.map((item) => [item.to, item.title]))),
  '/anomalies': 'Anomaly Center',
  '/forecast': 'Forecast Center',
  '/recommendations': 'Recommendations & XAI',
  '/audit': 'Audit & Governance',
  '/knowledge-map': 'Enterprise Knowledge Map',
  '/docs': 'Documentation',
}

const SESSION_THEME_KEY = 'dp-session-theme'

function clearLegacyThemePreference() {
  try {
    if (localStorage.getItem('dp-theme')) localStorage.removeItem('dp-theme')
  } catch {
    // Ignore storage access errors in restricted browsing contexts.
  }
}

function readSessionDarkMode(): boolean {
  clearLegacyThemePreference()
  try {
    return sessionStorage.getItem(SESSION_THEME_KEY) === 'dark'
  } catch {
    return false
  }
}

function AppShell({ session }: { session: Session }) {
  const { preferences } = usePreferences()
  const { t } = useT()
  usePageTranslations(preferences.language)

  const [companyId, setCompanyId] = useState(getActiveCompanyId)
  const [dark, setDark] = useState(false) // ponytail: light-only redesign (spec §6); readSessionDarkMode kept for when dark tokens exist
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dp-sidebar-collapsed') === '1')
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const { pathname } = useLocation()

  const needsOptions = pathname === '/' || pathname === '/ask' || pathname === '/forecast' || pathname === '/scenarios'

  const ds = useQuery({
    queryKey: ['dataset', companyId],
    queryFn: () => request<Dataset>('/dataset'),
    retry: false,
  })

  const opts = useQuery({
    queryKey: ['options', companyId, ds.data?.dataset_id],
    queryFn: () => request<Options>('/options'),
    enabled: !!ds.data && needsOptions,
  })

  const handleChangeCompany = (nextId: string) => {
    setActiveCompanyId(nextId)
    setCompanyId(nextId)
    setMessages([])
    void client.cancelQueries({ predicate: (q) => !['session', 'companies'].includes(String(q.queryKey[0])) })
    client.removeQueries({ predicate: (q) => !['session', 'companies'].includes(String(q.queryKey[0])) })
  }

  useEffect(() => {
    setActiveCurrency(ds.data?.currency || (ds.data?.kind === 'synthetic' ? 'VND' : 'USD'))
  }, [companyId, ds.data?.dataset_id, ds.data?.currency, ds.data?.kind])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try {
      sessionStorage.setItem(SESSION_THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      // Ignore storage access errors.
    }
  }, [dark])

  useEffect(() => {
    localStorage.setItem('dp-sidebar-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => setMessages([]), [companyId, ds.data?.dataset_id])

  if (pathname === '/landing') {
    return (
      <Suspense fallback={<Loading />}>
        <LandingPage />
      </Suspense>
    )
  }

  const activeTitle =
    routeTitles[pathname] ||
    (pathname.startsWith('/recommendations/') ? 'Recommendation XAI Detail' : 'Executive Dashboard')
  const isEmptyWorkspace =
    !ds.isLoading && !ds.data && ds.error instanceof ApiError && (ds.error.status === 503 || ds.error.status === 404)
  const fatalDatasetError = isEmptyWorkspace ? null : ds.error

  const emptyWorkspaceCard = (
    <div className="dp-surface p-6 sm:p-8 space-y-4">
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
          {t('Company Workspace')}
        </div>
        <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--heading)' }}>
          {t('Empty Company Workspace')}
        </h2>
        <p className="text-sm max-w-2xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Upload your company&apos;s CSV, XLSX, XLS, JSON, or XML tabular data — or ingest multimodal PDF, DOCX, PPTX, Image, Video, and Audio files in Multimodal Studio — review AI extractions and confirm import to unlock Executive Dashboard, Ask AI, Forecasts, Scenarios, and Audit trails.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/data-sources"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors hover:brightness-95"
          style={{ background: 'var(--primary)' }}
        >
          {t('Upload Your Business Data')}
        </Link>
        <Link
          to="/ask"
          className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium hover:bg-[var(--surface-muted)]"
          style={{ borderColor: 'var(--border-strong)', color: 'var(--primary-text)' }}
        >
          {t('Ask AI Copilot')}
        </Link>
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium hover:bg-[var(--surface-muted)]"
          style={{ borderColor: 'var(--border-strong)', color: 'var(--heading)' }}
        >
          {t('Settings')}
        </Link>
      </div>
    </div>
  )

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {open && (
        <button
          type="button"
          className="dp-drawer-backdrop"
          aria-label={t('Close navigation')}
          onClick={() => setOpen(false)}
        />
      )}

      <Sidebar
        open={open}
        collapsed={collapsed}
        onCloseMobile={() => setOpen(false)}
      />

      <div className="dp-main-column">
        <Topbar
          activeTitle={activeTitle}
          companyId={companyId}
          onChangeCompany={handleChangeCompany}
          dataset={ds.data}
          session={session}
          dark={dark}
          setDark={setDark}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onOpenMobile={() => setOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main
          className={`flex-1 px-4 sm:px-6 py-5 space-y-5 w-full mx-auto ${
            pathname === '/scenarios' ? 'max-w-[1720px]' : 'lg:px-8 py-6 space-y-6 max-w-[1440px]'
          }`}
        >
          {ds.isLoading && <Loading />}
          <ErrorState
            error={fatalDatasetError || opts.error}
            retry={() => {
              void ds.refetch()
              if (ds.data) void opts.refetch()
            }}
          />

          {!ds.isLoading && !ds.data && (
            <Routes key={`empty:${companyId}`}>
              <Route path="/ask" element={<Ask canEdit={session.role !== 'viewer'} />} />
              <Route
                path="/scenarios"
                element={
                  <Suspense fallback={<Loading />}>
                    <ScenarioSimulator3D session={session} />
                  </Suspense>
                }
              />
              <Route
                path="/recommendations"
                element={
                  <Suspense fallback={<Loading />}>
                    <RecommendationsCenter />
                  </Suspense>
                }
              />
              <Route
                path="/recommendations/:recId"
                element={
                  <Suspense fallback={<Loading />}>
                    <RecommendationDetailView />
                  </Suspense>
                }
              />
              <Route
                path="/audit"
                element={
                  <Suspense fallback={<Loading />}>
                    <AuditGovernanceCenter />
                  </Suspense>
                }
              />
              <Route
                path="/knowledge-map"
                element={
                  <Suspense fallback={<Loading />}>
                    <EnterpriseKnowledgeMap companyId={companyId} session={session} />
                  </Suspense>
                }
              />
              <Route path="/data-sources" element={<DataSourcesPage companyId={companyId} session={session} />} />
              <Route path="/settings" element={<SettingsPage dark={dark} setDark={setDark} session={session} />} />
              <Route
                path="/docs"
                element={
                  <Suspense fallback={<Loading />}>
                    <TechnicalDocumentationPage />
                  </Suspense>
                }
              />
              <Route path="*" element={emptyWorkspaceCard} />
            </Routes>
          )}

          {ds.data && (
            <Routes key={`${companyId}:${ds.data.dataset_id}`}>
              <Route
                path="/"
                element={<TodayPage dataset={ds.data} options={opts.data} />}
              />
              <Route path="/ask" element={<Ask dataset={ds.data} options={opts.data} messages={messages} setMessages={setMessages} canEdit={session.role !== 'viewer'} />} />
              <Route path="/anomalies" element={<Alerts dataset={ds.data} />} />
              <Route
                path="/forecast"
                element={opts.data ? <ForecastPage dataset={ds.data} options={opts.data} /> : <Loading />}
              />
              <Route
                path="/scenarios"
                element={
                  opts.data ? (
                    <Suspense fallback={<Loading />}>
                      <ScenarioSimulator3D dataset={ds.data} options={opts.data} session={session} />
                    </Suspense>
                  ) : (
                    <Loading />
                  )
                }
              />
              <Route
                path="/recommendations"
                element={
                  <Suspense fallback={<Loading />}>
                    <RecommendationsCenter dataset={ds.data} />
                  </Suspense>
                }
              />
              <Route
                path="/recommendations/:recId"
                element={
                  <Suspense fallback={<Loading />}>
                    <RecommendationDetailView dataset={ds.data} />
                  </Suspense>
                }
              />
              <Route
                path="/audit"
                element={
                  <Suspense fallback={<Loading />}>
                    <AuditGovernanceCenter dataset={ds.data} />
                  </Suspense>
                }
              />
              <Route
                path="/knowledge-map"
                element={
                  <Suspense fallback={<Loading />}>
                    <EnterpriseKnowledgeMap companyId={companyId} dataset={ds.data} session={session} />
                  </Suspense>
                }
              />
              <Route path="/data-sources" element={<DataSourcesPage companyId={companyId} dataset={ds.data} session={session} />} />
              <Route path="/settings" element={<SettingsPage dark={dark} setDark={setDark} session={session} />} />
              <Route
                path="/docs"
                element={
                  <Suspense fallback={<Loading />}>
                    <TechnicalDocumentationPage />
                  </Suspense>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>

      <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

function WorkspaceAccess() {
  const [token, setToken] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Session>('/session'), retry: false })

  useEffect(() => {
    document.documentElement.dataset.theme = readSessionDarkMode() ? 'dark' : 'light'
  }, [])

  useEffect(() => {
    const denied = () => setNeedsLogin(true)
    window.addEventListener('workspace-unauthorized', denied)
    return () => window.removeEventListener('workspace-unauthorized', denied)
  }, [])

  if (needsLogin || (session.error instanceof ApiError && session.error.status === 401)) {
    return (
      <main
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--bg)' }}
      >
        <div
          className="w-full max-w-md rounded-2xl border p-6 space-y-5"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="flex items-center gap-3">
            <BrandLogo />
            <div>
              <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--heading)' }}>
                Workspace sign in
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Enter the access token issued by your workspace administrator.
              </p>
            </div>
          </div>

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
            <label className="dp-field">
              <span className="dp-field-label">Access token</span>
              <input
                type="password"
                autoComplete="off"
                required
                className="dp-input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg py-2.5 text-xs font-semibold text-white transition-colors hover:brightness-95"
              style={{ background: 'var(--primary)', boxShadow: 'var(--shadow-xs)' }}
            >
              Sign in
            </button>
          </form>
        </div>
      </main>
    )
  }

  if (session.isLoading) return <Loading />
  if (session.error) return <ErrorState error={session.error} retry={() => void session.refetch()} />
  return session.data ? <AppShell session={session.data} /> : null
}

const appBasename =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/DecisionPilotAI/app')
    ? '/DecisionPilotAI/app'
    : typeof window !== 'undefined' && window.location.pathname.startsWith('/DecisionPilotAI')
      ? '/DecisionPilotAI'
      : undefined

if (typeof window !== 'undefined') {
  const spaRedirect = sessionStorage.getItem('dp-spa-redirect')
  if (spaRedirect && spaRedirect.startsWith('/DecisionPilotAI/app')) {
    sessionStorage.removeItem('dp-spa-redirect')
    window.history.replaceState(null, '', spaRedirect)
  }
}

function Main() {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        <PreferencesProvider>
          <ToastProvider>
            <BrowserRouter basename={appBasename}>
              <WorkspaceAccess />
            </BrowserRouter>
          </ToastProvider>
        </PreferencesProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<Main />)
}
