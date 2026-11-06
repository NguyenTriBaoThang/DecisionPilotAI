import { useEffect, useState } from 'react'
import { ArrowUp, ListFilter } from 'lucide-react'
import { NAV_SECTIONS } from '../data/site'

export function RightTOC({ activeId }: { activeId: string }) {
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight
      if (totalHeight > 0) {
        const progress = Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100))
        setScrollProgress(progress)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <aside className="right-toc">
      <div className="toc-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ListFilter size={14} className="cyan" />
          <span>On This Page</span>
        </div>
        <span className="mono dim" style={{ fontSize: '0.72rem' }}>
          {scrollProgress.toFixed(0)}%
        </span>
      </div>

      {/* Progress Bar */}
      <div style={{ height: '2px', background: 'var(--line)', borderRadius: '2px', marginBottom: '14px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${scrollProgress}%`,
            background: 'linear-gradient(90deg, var(--indigo) 0%, var(--cyan) 100%)',
            transition: 'width 0.1s ease',
          }}
        />
      </div>

      <ul className="toc-list">
        {NAV_SECTIONS.map((sec) => (
          <li key={sec.id}>
            <a
              href={`#sec-${sec.id}`}
              className={`toc-link ${activeId === sec.id ? 'active' : ''}`}
            >
              {sec.num}. {sec.title}
            </a>
          </li>
        ))}
      </ul>

      <button type="button" className="btn-top" onClick={scrollToTop}>
        <ArrowUp size={14} />
        <span>Back to Top</span>
      </button>
    </aside>
  )
}

