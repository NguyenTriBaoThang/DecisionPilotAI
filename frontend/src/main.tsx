import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { type Dataset, type Options, type Session, ApiError, request } from './api'
import { PreferencesProvider, usePageTranslations, usePreferences, useT } from './preferences'
import { ErrorState, Loading, ToastProvider } from './ui'
import { Dashboard } from './Dashboard'
import { Alerts, Ask, ForecastPage, Recommendations, type ChatMessage } from './WorkspacePages'
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

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
})

const routeTitles: Record<string, string> = {
  ...Object.fromEntries(navGroups.flatMap((g) => g.items.map((item) => [item.to, item.title]))),
  '/anomalies': 'Anomaly Center',
  '/forecast': 'Forecast Center',
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

  const [dark, setDark] = useState(readSessionDarkMode)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dp-sidebar-collapsed') === '1')
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const { pathname } = useLocation()

  const needsOptions = pathname === '/' || pathname === '/forecast' || pathname === '/scenarios'

  const ds = useQuery({ queryKey: ['dataset'], queryFn: () => request<Dataset>('/dataset') })

  const opts = useQuery({
    queryKey: ['options', ds.data?.dataset_id],
    queryFn: () => request<Options>('/options'),
    enabled: !!ds.data && needsOptions,
  })

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

  useEffect(() => setMessages([]), [ds.data?.dataset_id])

  if (pathname === '/landing') {
    return (
      <Suspense fallback={<Loading />}>
        <LandingPage />
      </Suspense>
    )
  }

  const activeTitle = routeTitles[pathname] || 'Executive Dashboard'

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
          dataset={ds.data}
          session={session}
          dark={dark}
          setDark={setDark}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onOpenMobile={() => setOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[1440px] w-full mx-auto">
          {ds.isLoading && <Loading />}
          <ErrorState
            error={ds.error || opts.error}
            retry={() => {
              void ds.refetch()
              if (ds.data) void opts.refetch()
            }}
          />

          {!ds.isLoading && !ds.data && (
            <div className="dp-surface p-5 text-sm">
              <Link
                to="/data-sources"
                className="font-semibold hover:underline"
                style={{ color: 'var(--primary-text)' }}
              >
                {t('Open Data Sources to import a dataset')}
              </Link>
            </div>
          )}

          {pathname === '/data-sources' && !ds.data && !ds.isLoading && <DataSourcesPage session={session} />}

          {ds.data && (
            <Routes key={ds.data.dataset_id}>
              <Route
                path="/"
                element={opts.data ? <Dashboard dataset={ds.data} options={opts.data} /> : <Loading />}
              />
              <Route path="/ask" element={<Ask dataset={ds.data} messages={messages} setMessages={setMessages} />} />
              <Route path="/anomalies" element={<Alerts dataset={ds.data} />} />
              <Route
                path="/forecast"
                element={opts.data ? <ForecastPage options={opts.data} /> : <Loading />}
              />
              <Route
                path="/scenarios"
                element={
                  opts.data ? (
                    <Suspense fallback={<Loading />}>
                      <ScenarioSimulator3D options={opts.data} />
                    </Suspense>
                  ) : (
                    <Loading />
                  )
                }
              />
              <Route path="/recommendations" element={<Recommendations />} />
              <Route path="/data-sources" element={<DataSourcesPage dataset={ds.data} session={session} />} />
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
