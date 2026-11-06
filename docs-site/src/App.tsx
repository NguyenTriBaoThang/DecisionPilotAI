import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { LeftSidebar } from './components/LeftSidebar'
import { RightTOC } from './components/RightTOC'
import { SearchDialog } from './components/SearchDialog'
import { NAV_SECTIONS } from './data/site'

// 16 Sections
import { Section01Overview } from './sections/Section01Overview'
import { Section02Workspaces } from './sections/Section02Workspaces'
import { Section03Architecture } from './sections/Section03Architecture'
import { Section04Schema } from './sections/Section04Schema'
import { Section05Pipeline } from './sections/Section05Pipeline'
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeId, setActiveId] = useState('overview')

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

  // ScrollSpy to track active section
  useEffect(() => {
    const sectionElements = NAV_SECTIONS.map((sec) => document.getElementById(`sec-${sec.id}`)).filter(Boolean) as HTMLElement[]

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const rawId = entry.target.id.replace('sec-', '')
            setActiveId(rawId)
          }
        })
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0,
      }
    )

    sectionElements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <Header onOpenSearch={() => setSearchOpen(true)} />

      <div className="app-body">
        {/* Left Sidebar */}
        <LeftSidebar activeId={activeId} />

        {/* Main Documentation Sections */}
        <main className="main-content">
          <Section01Overview />
          <Section02Workspaces />
          <Section03Architecture />
          <Section04Schema />
          <Section05Pipeline />
          <Section06AI />
          <Section07Training />
          <Section08Benchmarks />
          <Section09Simulator />
          <Section10Api />
          <Section11Quickstart />
          <Section12Structure />
          <Section13Testing />
          <Section14Security />
          <Section15CaseStudy />
          <Section16Roadmap />
        </main>

        {/* Right Table of Contents */}
        <RightTOC activeId={activeId} />
      </div>

      {/* Global Search Dialog Modal */}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </>
  )
}

