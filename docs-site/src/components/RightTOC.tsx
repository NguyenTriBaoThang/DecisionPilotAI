import { useEffect, useState } from 'react'
import { ArrowUp, ListFilter } from 'lucide-react'
import type { IntelTabId, PageId } from '../routes'

interface HeadingItem {
  id: string
  text: string
  level: 'h2' | 'h3'
}

function slugifyHeading(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function RightTOC({ activeId, activeTab }: { activeId: PageId; activeTab?: IntelTabId }) {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activeHeadingId, setActiveHeadingId] = useState<string>('')

  useEffect(() => {
    const collect = () => {
      const main = document.querySelector('main.main-content')
      if (!main) {
        setHeadings([])
        return
      }
      const usedIds = new Set<string>()
      const collected: HeadingItem[] = []
      const els = main.querySelectorAll('h2, h3')

      els.forEach((el, index) => {
        const rawText = (el.textContent || '').replace(/^\d+[★]?\s*/, '').trim()
        if (!rawText) return
        let id = el.id
        if (!id) {
          const base = slugifyHeading(rawText) || `heading-${index}`
          id = base
          let suffix = 2
          while (usedIds.has(id) || document.getElementById(id)) {
            id = `${base}-${suffix++}`
          }
          el.id = id
        }
        usedIds.add(id)
        collected.push({
          id,
          text: rawText,
          level: el.tagName.toLowerCase() === 'h2' ? 'h2' : 'h3',
        })
      })

      setHeadings(collected)
      setActiveHeadingId(collected[0]?.id ?? '')
    }

    const frame = requestAnimationFrame(collect)
    return () => cancelAnimationFrame(frame)
  }, [activeId, activeTab])

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight
      if (totalHeight > 0) {
        const progress = Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100))
        setScrollProgress(progress)
      } else {
        setScrollProgress(100)
      }

      if (headings.length > 0) {
        let current = headings[0].id
        for (const h of headings) {
          const el = document.getElementById(h.id)
          if (el) {
            const rect = el.getBoundingClientRect()
            if (rect.top <= 120) {
              current = h.id
            }
          }
        }
        setActiveHeadingId(current)
      }
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [headings])

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
        {headings.length === 0 ? (
          <li className="dim" style={{ fontSize: '0.78rem' }}>
            Page overview
          </li>
        ) : (
          headings.map((h) => (
            <li key={h.id} style={{ paddingLeft: h.level === 'h3' ? '10px' : '0px' }}>
              <a
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  const target = document.getElementById(h.id)
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth' })
                    setActiveHeadingId(h.id)
                  }
                }}
                className={`toc-link ${activeHeadingId === h.id ? 'active' : ''}`}
                style={{ fontSize: h.level === 'h3' ? '0.78rem' : '0.84rem' }}
              >
                {h.text}
              </a>
            </li>
          ))
        )}
      </ul>

      <button type="button" className="btn-top" onClick={scrollToTop}>
        <ArrowUp size={14} />
        <span>Back to Top</span>
      </button>
    </aside>
  )
}
