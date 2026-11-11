import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, Home } from 'lucide-react'
import { Header } from './components/Header'
import { HomePage } from './components/HomePage'
import { LeftSidebar } from './components/LeftSidebar'
import { RightTOC } from './components/RightTOC'
import { SearchDialog } from './components/SearchDialog'
import { NAV_SECTIONS } from './data/site'
import { buildHref, parseLocation, type DocSectionId, type IntelTabId, type PageId } from './routes'

// 17 Documentation Chapters (16 numbered + 05★ Track 5 Showcase)
import { Section01Overview } from './sections/Section01Overview'
import { Section02Workspaces } from './sections/Section02Workspaces'
import { Section03Architecture } from './sections/Section03Architecture'
import { Section04Schema } from './sections/Section04Schema'
import { Section05Pipeline } from './sections/Section05Pipeline'
import { DataDecisionIntelligenceSection } from './features/data-decision-intelligence/DataDecisionIntelligenceSection'
import { Section06AI } from './sections/Section06AI'
import { Section07Training } from './sections/Section07Training'
import { Section08Benchmarks } from './sections/Section08Benchmarks'
import { Section09Simulator } from './sections/Section09Simulator'
import { Section10Api } from './sections/Section10Api'
import { Section11Quickstart } from './sections/Section11Quickstart'
import { Section12Structure } from './sections/Section12Structure'
import { Section13Testing } from './sections/Section13Testing'
import { Section14Security } from './sections/Section14Security'
import { Section15CaseStudy } from './sections/Section15CaseStudy'
import { Section16Roadmap } from './sections/Section16Roadmap'

export function App() {
  const initialRoute = parseLocation()
  const [activePage, setActivePage] = useState<PageId>(initialRoute.page)
  const [intelTab, setIntelTab] = useState<IntelTabId>(initialRoute.tab ?? 'ask')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const navigateTo = useCallback(
    (page: PageId, options?: { tab?: IntelTabId; hashId?: string; replace?: boolean }) => {
      const nextTab = options?.tab ?? (page === 'data-decision-intelligence' ? intelTab : undefined)
      if (options?.tab) {
        setIntelTab(options.tab)
      }
      setActivePage(page)
      setMobileNavOpen(false)

      const targetHref = buildHref(page, { tab: nextTab, hashId: options?.hashId })
      if (options?.replace) {
        window.history.replaceState(null, '', targetHref)
      } else {
        window.history.pushState(null, '', targetHref)
      }

      if (options?.hashId) {
        requestAnimationFrame(() => {
          document.getElementById(options.hashId!)?.scrollIntoView({ behavior: 'smooth' })
        })
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' })
      }
    },
    [intelTab]
  )

  // Handle legacy #sec-<id> links normalized on first mount
  useEffect(() => {
    if (window.location.hash.startsWith('#sec-')) {
      const parsed = parseLocation()
      window.history.replaceState(null, '', buildHref(parsed.page, { tab: parsed.tab }))
    }
  }, [])

  // Sync browser Back/Forward buttons
  useEffect(() => {
    const onPopState = () => {
      const parsed = parseLocation()
      setActivePage(parsed.page)
      if (parsed.tab) setIntelTab(parsed.tab)
      if (parsed.hashId) {
        requestAnimationFrame(() => {
          document.getElementById(parsed.hashId!)?.scrollIntoView({ behavior: 'smooth' })
        })
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' })
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Update document title per page
  useEffect(() => {
    if (activePage === 'home') {
      document.title = 'DecisionPilot AI | Documentation & Decision Intelligence Portal'
    } else {
      const meta = NAV_SECTIONS.find((s) => s.id === activePage)
      document.title = meta
        ? `${meta.num}. ${meta.title} — DecisionPilot AI Docs`
        : 'DecisionPilot AI | Technical Documentation'
    }
  }, [activePage])

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleIntelTabChange = (nextTab: IntelTabId) => {
    setIntelTab(nextTab)
    window.history.replaceState(null, '', buildHref('data-decision-intelligence', { tab: nextTab }))
  }

  const currentIndex = NAV_SECTIONS.findIndex((s) => s.id === activePage)
  const currentMeta = currentIndex >= 0 ? NAV_SECTIONS[currentIndex] : undefined
  const prevSection = currentIndex > 0 ? NAV_SECTIONS[currentIndex - 1] : undefined
  const nextSection = currentIndex >= 0 && currentIndex < NAV_SECTIONS.length - 1 ? NAV_SECTIONS[currentIndex + 1] : undefined

  const renderActiveSection = (sectionId: DocSectionId) => {
    switch (sectionId) {
      case 'overview':
        return <Section01Overview onNavigate={navigateTo} />
      case 'workspaces':
        return <Section02Workspaces />
      case 'architecture':
        return <Section03Architecture />
      case 'data-schema':
        return <Section04Schema />
      case 'etl-pipeline':
        return <Section05Pipeline />
      case 'data-decision-intelligence':
        return <DataDecisionIntelligenceSection activeTab={intelTab} onTabChange={handleIntelTabChange} />
      case 'ai-engine':
        return <Section06AI />
      case 'training-workflow':
        return <Section07Training />
      case 'benchmarks':
        return <Section08Benchmarks />
      case 'simulator':
        return <Section09Simulator />
      case 'api-reference':
        return <Section10Api />
      case 'quickstart':
        return <Section11Quickstart />
      case 'project-structure':
        return <Section12Structure />
      case 'testing-qa':
        return <Section13Testing />
      case 'security-governance':
        return <Section14Security />
      case 'case-study':
        return <Section15CaseStudy />
      case 'roadmap':
        return <Section16Roadmap />
    }
  }

  return (
    <>
      <Header
        activePage={activePage}
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((prev) => !prev)}
        onNavigate={navigateTo}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {activePage === 'home' ? (
        <HomePage onNavigate={navigateTo} />
      ) : (
        <div className="app-body">
          <LeftSidebar
            activeId={activePage}
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
            onNavigate={navigateTo}
          />

          <main className="main-content">
            {currentMeta && (
              <div className="doc-breadcrumb" aria-label="Breadcrumb">
                <div className="doc-breadcrumb-trail">
                  <a
                    href={buildHref('home')}
                    onClick={(e) => {
                      e.preventDefault()
                      navigateTo('home')
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Home size={13} />
                    <span>Home</span>
                  </a>
                  <ChevronRight size={13} />
                  <span>{currentMeta.group}</span>
                  <ChevronRight size={13} />
                  <strong style={{ color: '#FFFFFF' }}>
                    {currentMeta.num}. {currentMeta.title}
                  </strong>
                </div>
                <span className="mono dim" style={{ fontSize: '0.74rem' }}>
                  Page {currentIndex + 1} of {NAV_SECTIONS.length}
                </span>
              </div>
            )}

            {renderActiveSection(activePage)}

            {/* Page-by-page Previous / Next Pagination */}
            <nav className="doc-pagination" aria-label="Chapter pagination">
              {prevSection ? (
                <a
                  href={buildHref(prevSection.id)}
                  onClick={(e) => {
                    e.preventDefault()
                    navigateTo(prevSection.id)
                  }}
                  className="page-nav-btn"
                >
                  <ArrowLeft size={16} className="cyan" />
                  <div style={{ textAlign: 'right', flex: 1 }}>
                    <span className="page-nav-label">Previous Chapter</span>
                    <span className="page-nav-title">
                      {prevSection.num}. {prevSection.title}
                    </span>
                  </div>
                </a>
              ) : (
                <a
                  href={buildHref('home')}
                  onClick={(e) => {
                    e.preventDefault()
                    navigateTo('home')
                  }}
                  className="page-nav-btn"
                >
                  <Home size={16} className="cyan" />
                  <div style={{ textAlign: 'right', flex: 1 }}>
                    <span className="page-nav-label">Portal Start</span>
                    <span className="page-nav-title">Back to Home Page</span>
                  </div>
                </a>
              )}

              {nextSection ? (
                <a
                  href={buildHref(nextSection.id)}
                  onClick={(e) => {
                    e.preventDefault()
                    navigateTo(nextSection.id)
                  }}
                  className="page-nav-btn"
                >
                  <div style={{ flex: 1 }}>
                    <span className="page-nav-label">Next Chapter</span>
                    <span className="page-nav-title">
                      {nextSection.num}. {nextSection.title}
                    </span>
                  </div>
                  <ArrowRight size={16} className="cyan" />
                </a>
              ) : (
                <a
                  href={buildHref('home')}
                  onClick={(e) => {
                    e.preventDefault()
                    navigateTo('home')
                  }}
                  className="page-nav-btn"
                >
                  <div style={{ flex: 1 }}>
                    <span className="page-nav-label">End of Documentation</span>
                    <span className="page-nav-title">Return to Home Portal</span>
                  </div>
                  <Home size={16} className="cyan" />
                </a>
              )}
            </nav>
          </main>

          <RightTOC activeId={activePage} activeTab={activePage === 'data-decision-intelligence' ? intelTab : undefined} />
        </div>
      )}

      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} onNavigate={navigateTo} />}
    </>
  )
}
