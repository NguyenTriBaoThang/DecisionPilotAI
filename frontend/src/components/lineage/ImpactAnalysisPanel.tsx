import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ExternalLink, Layers, RefreshCw } from 'lucide-react'
import type { LineageImpactResponse } from '../../api'
import { Button, Pill } from '../../ui'
import { getStatusTheme } from './types'

interface ImpactAnalysisPanelProps {
  impact?: LineageImpactResponse
  loading?: boolean
  onSelectNodeId: (nodeId: string) => void
  onHighlightDownstream: () => void
}

export function ImpactAnalysisPanel({
  impact,
  loading,
  onSelectNodeId,
  onHighlightDownstream,
}: ImpactAnalysisPanelProps) {
  if (loading) {
    return <div className="text-xs py-4" style={{ color: 'var(--text-secondary)' }}>Analyzing downstream impact…</div>
  }
  if (!impact) {
    return <div className="text-xs py-4" style={{ color: 'var(--text-secondary)' }}>Impact data unavailable for this node.</div>
  }

  return (
    <div className="space-y-4">
      {/* Honesty Notice */}
      <div
        className="rounded-xl border p-3 text-xs leading-relaxed flex items-start gap-2.5"
        style={{
          background: 'var(--warning-bg)',
          borderColor: 'var(--warning-border)',
          color: 'var(--warning-text)',
        }}
      >
        <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-bold">Impact Trace &amp; Review Policy</div>
          <p className="mt-0.5">{impact.honesty_note}</p>
        </div>
      </div>

      <Button size="sm" variant="primary" onClick={onHighlightDownstream} className="w-full">
        Highlight Full Downstream Impact ({impact.dependent_nodes.length} nodes)
      </Button>

      {/* Upstream Origin Sources */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Origin Data Sources ({impact.upstream_sources.length})
        </div>
        {impact.upstream_sources.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>This node is an origin source or has no upstream sources.</div>
        ) : (
          <div className="space-y-1">
            {impact.upstream_sources.map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => onSelectNodeId(src.id)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs hover:bg-[var(--surface-muted)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="font-semibold truncate" style={{ color: 'var(--heading)' }}>{src.name}</span>
                <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Affected BI Reports & Outputs */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Affected BI Outputs &amp; Reports ({impact.affected_reports.length})
        </div>
        {impact.affected_reports.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No downstream outputs recorded yet.</div>
        ) : (
          <div className="space-y-1.5">
            {impact.affected_reports.map((rep) => {
              const st = getStatusTheme(rep.status)
              return (
                <div
                  key={rep.id}
                  className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectNodeId(rep.id)}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="text-xs font-semibold truncate" style={{ color: 'var(--heading)' }}>
                      {rep.name}
                    </div>
                    <div className="text-[10px]" style={{ color: st.badgeText }}>
                      Status: {st.label}
                    </div>
                  </button>
                  <Link
                    to={rep.output_reference}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border hover:bg-[var(--surface)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--primary-text)' }}
                  >
                    Open <ExternalLink size={11} />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Affected Pipelines */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <Layers size={12} /> Affected Pipelines ({impact.affected_pipelines.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {impact.affected_pipelines.map((p) => (
            <Pill key={p.id} tone={p.status === 'failed' ? 'danger' : p.status === 'processing' ? 'high' : 'accent'}>
              {p.name}
            </Pill>
          ))}
        </div>
      </div>

      {/* Reprocessing Recommendations */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <RefreshCw size={12} /> Reprocessing Guidance
        </div>
        <ul className="space-y-1.5 text-xs list-disc pl-4" style={{ color: 'var(--text)' }}>
          {impact.reprocessing_recommendations.map((rec, idx) => (
            <li key={idx} className="leading-relaxed">
              {rec}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

