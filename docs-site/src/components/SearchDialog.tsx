import { useEffect, useMemo, useRef, useState } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import { NAV_SECTIONS } from '../data/site'
import { API_ENDPOINTS } from '../data/api'
import { ARCH_NODES } from '../data/architecture'
import { RELATIONAL_TABLES } from '../data/schema'
import { FORECAST_BENCHMARKS, ANOMALY_BENCHMARKS, COPILOT_BENCHMARKS } from '../data/benchmarks'

interface SearchItem {
  title: string
  kind: 'Section' | 'API' | 'Architecture' | 'Schema' | 'Benchmark'
  anchor: string
  snippet: string
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const searchIndex: SearchItem[] = useMemo(() => {
    const list: SearchItem[] = []

    NAV_SECTIONS.forEach((s) => {
      list.push({
        title: `${s.num}. ${s.title}`,
        kind: 'Section',
        anchor: `#sec-${s.id}`,
        snippet: `${s.group} — ${s.blurb}`,
      })
    })

    API_ENDPOINTS.forEach((e) => {
      list.push({
        title: `${e.method} ${e.path}`,
        kind: 'API',
        anchor: '#sec-api-reference',
        snippet: `${e.summary}. ${e.description}`,
      })
    })

    ARCH_NODES.forEach((n) => {
      list.push({
        title: n.label,
        kind: 'Architecture',
        anchor: '#sec-architecture',
        snippet: `${n.tier} — ${n.sub}. ${n.responsibility}`,
      })
    })

    RELATIONAL_TABLES.forEach((t) => {
      list.push({
        title: `Table: ${t.name} (${t.rowCount})`,
        kind: 'Schema',
        anchor: '#sec-data-schema',
        snippet: `${t.description} Columns: ${t.columns.map((c) => c.name).join(', ')}`,
      })
    })

    COPILOT_BENCHMARKS.forEach((b) => {
      list.push({
        title: `${b.metric} (${b.score})`,
        kind: 'Benchmark',
        anchor: '#sec-benchmarks',
        snippet: b.description,
      })
    })

    return list
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return searchIndex.slice(0, 12)
    return searchIndex
      .filter((item) => item.title.toLowerCase().includes(q) || item.snippet.toLowerCase().includes(q))
      .slice(0, 15)
  }, [query, searchIndex])

  const handleSelect = (anchor: string) => {
    onClose()
    const el = document.querySelector(anchor)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-wrap">
          <SearchIcon size={20} className="cyan" />
          <input
            ref={inputRef}
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documentation, APIs, schema, benchmarks... (ESC to close)"
          />
          <button type="button" className="btn-copy" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <ul className="search-results">
          {filtered.length === 0 ? (
            <li style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)' }}>
              No technical documentation matching &ldquo;{query}&rdquo;
            </li>
          ) : (
            filtered.map((item, idx) => (
              <li key={idx} className="search-result-item">
                <a
                  href={item.anchor}
                  onClick={(e) => {
                    e.preventDefault()
                    handleSelect(item.anchor)
                  }}
                >
                  <div className="search-result-header">
                    <span className="search-result-title">{item.title}</span>
                    <span className={`badge badge-${item.kind === 'API' ? 'cyan' : item.kind === 'Architecture' ? 'indigo' : 'green'}`}>
                      {item.kind}
                    </span>
                  </div>
                  <div className="search-result-desc">{item.snippet}</div>
                </a>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

