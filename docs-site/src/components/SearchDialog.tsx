import { useEffect, useMemo, useRef, useState } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import { NAV_SECTIONS } from '../data/site'
import { API_ENDPOINTS } from '../data/api'
import { ARCH_NODES } from '../data/architecture'
import { RELATIONAL_TABLES } from '../data/schema'
import { COPILOT_BENCHMARKS, FORECAST_BENCHMARKS, ANOMALY_BENCHMARKS } from '../data/benchmarks'
import { buildHref, type IntelTabId, type PageId } from '../routes'

interface SearchItem {
  title: string
  kind: 'Page' | 'API' | 'Architecture' | 'Schema' | 'Benchmark' | 'Showcase'
  pageId: PageId
  tab?: IntelTabId
  hashId?: string
  snippet: string
}

interface SearchDialogProps {
  onClose: () => void
  onNavigate: (page: PageId, options?: { tab?: IntelTabId; hashId?: string }) => void
}

export function SearchDialog({ onClose, onNavigate }: SearchDialogProps) {
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
    const list: SearchItem[] = [
      {
        title: 'Home Portal — DecisionPilot AI Overview & Workflow',
        kind: 'Page',
        pageId: 'home',
        snippet: 'Landing page featuring Ask -> Understand -> Predict -> Simulate -> Decide flow and chapter directory.',
      },
      {
        title: 'Track 5 Tab: Ask Business Data (Natural Language Analytics)',
        kind: 'Showcase',
        pageId: 'data-decision-intelligence',
        tab: 'ask',
        snippet: 'Typed intent classification routed to fixed read-only analytics tools with chart rendering.',
      },
      {
        title: 'Track 5 Tab: Understand Business Performance & Anomalies',
        kind: 'Showcase',
        pageId: 'data-decision-intelligence',
        tab: 'analyze',
        snippet: 'Isolation Forest + 56-day trailing baseline robust Z-score anomaly radar and variance decomposition.',
      },
      {
        title: 'Track 5 Tab: Forecast Demand & Revenue',
        kind: 'Showcase',
        pageId: 'data-decision-intelligence',
        tab: 'forecast',
        snippet: 'Chronological LightGBM forecaster with 17 features, 2% validation gate, and 90% intervals.',
      },
      {
        title: 'Track 5 Tab: Scenario Simulation & Decisions',
        kind: 'Showcase',
        pageId: 'data-decision-intelligence',
        tab: 'simulate',
        snippet: 'Price elasticity, diminishing-returns advertising response, and inventory lead-time trade-offs.',
      },
    ]

    NAV_SECTIONS.forEach((s) => {
      list.push({
        title: `${s.num}. ${s.title}`,
        kind: 'Page',
        pageId: s.id,
        snippet: `${s.group} — ${s.blurb}`,
      })
    })

    API_ENDPOINTS.forEach((e) => {
      list.push({
        title: `${e.method} ${e.path}`,
        kind: 'API',
        pageId: 'api-reference',
        snippet: `${e.summary}. ${e.description}`,
      })
    })

    ARCH_NODES.forEach((n) => {
      list.push({
        title: n.label,
        kind: 'Architecture',
        pageId: 'architecture',
        snippet: `${n.tier} — ${n.sub}. ${n.responsibility}`,
      })
    })

    RELATIONAL_TABLES.forEach((t) => {
      list.push({
        title: `Table: ${t.name} (${t.rowCount})`,
        kind: 'Schema',
        pageId: 'data-schema',
        snippet: `${t.description} Columns: ${t.columns.map((c) => c.name).join(', ')}`,
      })
    })

    FORECAST_BENCHMARKS.forEach((f) => {
      list.push({
        title: `Forecast (${f.target} / ${f.scope}): ${f.wape} WAPE`,
        kind: 'Benchmark',
        pageId: 'benchmarks',
        snippet: `Selected model: ${f.model}, MAE ${f.mae}, 90% coverage ${f.coverage}.`,
      })
    })

    ANOMALY_BENCHMARKS.forEach((a) => {
      list.push({
        title: `Anomaly (${a.signal}): ${a.precision} Precision / ${a.recall} Recall`,
        kind: 'Benchmark',
        pageId: 'benchmarks',
        snippet: `Method ${a.method}, F1 ${a.f1}, FPR ${a.fpr}.`,
      })
    })

    COPILOT_BENCHMARKS.forEach((b) => {
      list.push({
        title: `${b.metric} (${b.score})`,
        kind: 'Benchmark',
        pageId: 'benchmarks',
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

  const handleSelect = (item: SearchItem) => {
    onClose()
    onNavigate(item.pageId, { tab: item.tab, hashId: item.hashId })
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
            placeholder="Search chapters, APIs, schema, benchmarks... (ESC to close)"
          />
          <button type="button" className="btn-copy" onClick={onClose} aria-label="Close search">
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
                  href={buildHref(item.pageId, { tab: item.tab, hashId: item.hashId })}
                  onClick={(e) => {
                    e.preventDefault()
                    handleSelect(item)
                  }}
                >
                  <div className="search-result-header">
                    <span className="search-result-title">{item.title}</span>
                    <span
                      className={`badge badge-${
                        item.kind === 'API' || item.kind === 'Showcase'
                          ? 'cyan'
                          : item.kind === 'Architecture'
                          ? 'indigo'
                          : 'green'
                      }`}
                    >
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
