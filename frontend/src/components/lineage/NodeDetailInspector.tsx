import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertOctagon,
  ArrowDownRight,
  ArrowRight,
  ArrowUpLeft,
  ExternalLink,
  GitMerge,
  Info,
  X,
} from 'lucide-react'
import { getLineageNodeDetail, type LineageEdge, type LineageNode } from '../../api'
import { Button, Pill } from '../../ui'
import { ImpactAnalysisPanel } from './ImpactAnalysisPanel'
import { formatBytesCompact, formatShortTimestamp, getStatusTheme } from './types'

type InspectorTab = 'overview' | 'data' | 'lineage' | 'execution' | 'impact'

interface NodeDetailInspectorProps {
  selectedNode: LineageNode | null
  selectedEdge: LineageEdge | null
  allNodes: LineageNode[]
  onSelectNodeId: (nodeId: string) => void
  onTraceUpstream: (nodeId: string) => void
  onTraceDownstream: (nodeId: string) => void
  onClose: () => void
}

export function NodeDetailInspector({
  selectedNode,
  selectedEdge,
  allNodes,
  onSelectNodeId,
  onTraceUpstream,
  onTraceDownstream,
  onClose,
}: NodeDetailInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('overview')

  const detailQuery = useQuery({
    queryKey: ['lineage-node-detail', selectedNode?.id],
    queryFn: () => getLineageNodeDetail(selectedNode!.id),
    enabled: Boolean(selectedNode?.id),
  })

  if (selectedEdge && !selectedNode) {
    const srcNode = allNodes.find((n) => n.id === selectedEdge.source_node_id)
    const tgtNode = allNodes.find((n) => n.id === selectedEdge.target_node_id)
    const theme = getStatusTheme(selectedEdge.status)

    return (
      <aside
        aria-label="Edge Detail Inspector"
        className="dp-surface p-4 space-y-4 h-fit"
      >
        <div className="flex items-start justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
              Data Edge Relationship
            </div>
            <h3 className="text-sm font-bold mt-0.5 truncate" style={{ color: 'var(--heading)' }}>
              {selectedEdge.relationship_type.replaceAll('_', ' ')}
            </h3>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close inspector">
            <X size={14} />
          </Button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Execution Status</span>
            <Pill tone={theme.label === 'failed' ? 'danger' : theme.label === 'processing' ? 'high' : theme.label === 'completed' ? 'success' : 'muted'}>
              {theme.label}
            </Pill>
          </div>

          <div className="rounded-lg border p-2.5 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
            <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Connected Flow</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => srcNode && onSelectNodeId(srcNode.id)}
                className="font-semibold underline hover:text-[var(--primary)]"
                style={{ color: 'var(--heading)' }}
              >
                {srcNode?.name || selectedEdge.source_node_id}
              </button>
              <ArrowRight size={12} style={{ color: 'var(--primary)' }} />
              <button
                type="button"
                onClick={() => tgtNode && onSelectNodeId(tgtNode.id)}
                className="font-semibold underline hover:text-[var(--primary)]"
                style={{ color: 'var(--heading)' }}
              >
                {tgtNode?.name || selectedEdge.target_node_id}
              </button>
            </div>
          </div>

          <dl className="space-y-2 pt-1">
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Transformation</dt>
              <dd className="font-medium text-right" style={{ color: 'var(--heading)' }}>
                {selectedEdge.transformation || 'Direct stage handoff'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Data Transferred</dt>
              <dd className="font-mono text-right" style={{ color: 'var(--heading)' }}>
                {selectedEdge.data_transferred || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Record Count</dt>
              <dd className="font-mono tabular-nums" style={{ color: 'var(--heading)' }}>
                {selectedEdge.record_count != null ? selectedEdge.record_count.toLocaleString() : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Updated At</dt>
              <dd className="font-mono" style={{ color: 'var(--text)' }}>
                {formatShortTimestamp(selectedEdge.updated_at)}
              </dd>
            </div>
          </dl>
        </div>
      </aside>
    )
  }

  if (!selectedNode) {
    return (
      <aside
        aria-label="Detail Inspector Placeholder"
        className="dp-surface p-5 space-y-3 h-fit"
      >
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--heading)' }}>
          <Info size={15} style={{ color: 'var(--primary)' }} />
          Detail Inspector
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Click any <strong>Node</strong> to inspect schema contracts, upstream data lineage, execution logs, and downstream impact analysis — or click any <strong>Edge</strong> to inspect data handoffs.
        </p>
        <div
          className="rounded-lg border p-3 text-[11px] space-y-1.5"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}
        >
          <div className="font-semibold" style={{ color: 'var(--heading)' }}>Quick Traceability Tips</div>
          <p>• Click a <strong>Business Insight</strong> node to automatically trace its upstream provenance back to raw files.</p>
          <p>• Click a <strong>Data Source</strong> node to highlight downstream pipelines and reports affected by changes.</p>
        </div>
      </aside>
    )
  }

  const detail = detailQuery.data
  const theme = getStatusTheme(selectedNode.status)
  const outputRef = detail?.node.metadata.output_reference || selectedNode.metadata.output_reference

  return (
    <aside
      aria-label="Node Detail Inspector"
      data-testid="node-detail-inspector"
      className="dp-surface p-4 space-y-3.5 h-fit max-h-[700px] overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
            {selectedNode.node_type.replaceAll('_', ' ')} · {selectedNode.sub_type.replaceAll('_', ' ')}
          </div>
          <h3 className="text-sm font-bold mt-0.5 leading-snug" style={{ color: 'var(--heading)' }}>
            {selectedNode.name}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Pill tone={theme.label === 'failed' ? 'danger' : theme.label === 'processing' ? 'high' : theme.label === 'warning' ? 'warning' : theme.label === 'completed' ? 'success' : 'muted'}>
              {theme.label}
            </Pill>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {selectedNode.id}
            </span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close inspector">
          <X size={14} />
        </Button>
      </div>

      {/* Quick Trace Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={() => onTraceUpstream(selectedNode.id)}>
          <ArrowUpLeft size={12} /> Trace Upstream
        </Button>
        <Button size="sm" onClick={() => onTraceDownstream(selectedNode.id)}>
          <ArrowDownRight size={12} /> Impact Downstream
        </Button>
        {outputRef && (
          <Link
            to={String(outputRef)}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-muted)]"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--primary-text)' }}
          >
            Open View <ExternalLink size={11} />
          </Link>
        )}
      </div>

      {/* 5 Inspector Tabs */}
      <div role="tablist" aria-label="Node Inspector Sections" className="grid grid-cols-5 gap-1 rounded-lg p-1 border" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
        {(
          [
            ['overview', 'Overview'],
            ['data', 'Data'],
            ['lineage', 'Lineage'],
            ['execution', 'Execution'],
            ['impact', 'Impact'],
          ] as const
        ).map(([key, labelText]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              background: tab === key ? 'var(--surface)' : 'transparent',
              color: tab === key ? 'var(--primary-text)' : 'var(--text-secondary)',
              boxShadow: tab === key ? 'var(--shadow-xs)' : undefined,
            }}
            className="rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition-colors"
          >
            {labelText}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-3 text-xs">
          <p className="leading-relaxed" style={{ color: 'var(--text)' }}>
            {detail?.overview.description || selectedNode.metadata.description || 'Enterprise traceability node.'}
          </p>
          <dl className="space-y-2 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Node ID</dt>
              <dd className="font-mono text-[11px]" style={{ color: 'var(--heading)' }}>{selectedNode.id}</dd>
            </div>
            {selectedNode.external_id && (
              <div className="flex justify-between gap-2">
                <dt style={{ color: 'var(--text-secondary)' }}>External ID</dt>
                <dd className="font-mono text-[11px] truncate max-w-[190px]" style={{ color: 'var(--heading)' }}>{selectedNode.external_id}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Owner / Actor</dt>
              <dd className="font-medium" style={{ color: 'var(--heading)' }}>{selectedNode.owner}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Created</dt>
              <dd className="font-mono" style={{ color: 'var(--text)' }}>{formatShortTimestamp(selectedNode.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Updated</dt>
              <dd className="font-mono" style={{ color: 'var(--text)' }}>{formatShortTimestamp(selectedNode.updated_at)}</dd>
            </div>
          </dl>
        </div>
      )}

      {tab === 'data' && (
        <div className="space-y-3 text-xs">
          <dl className="space-y-2">
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Data Format</dt>
              <dd className="font-mono font-semibold" style={{ color: 'var(--heading)' }}>
                {detail?.data_information.data_format || selectedNode.metadata.data_format || selectedNode.sub_type}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Record Count</dt>
              <dd className="font-mono tabular-nums font-semibold" style={{ color: 'var(--heading)' }}>
                {detail?.data_information.record_count != null
                  ? Number(detail.data_information.record_count).toLocaleString()
                  : selectedNode.metadata.record_count != null
                  ? Number(selectedNode.metadata.record_count).toLocaleString()
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Data Size</dt>
              <dd className="font-mono tabular-nums" style={{ color: 'var(--heading)' }}>
                {formatBytesCompact(detail?.data_information.data_size_bytes)}
              </dd>
            </div>
          </dl>

          {!!detail?.data_information.input_schema.length && (
            <div className="space-y-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>Input Schema</div>
              <div className="flex flex-wrap gap-1">
                {detail.data_information.input_schema.map((col) => (
                  <Pill key={col} tone="muted">{col}</Pill>
                ))}
              </div>
            </div>
          )}

          {!!detail?.data_information.output_schema.length && (
            <div className="space-y-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>Output Schema</div>
              <div className="flex flex-wrap gap-1">
                {detail.data_information.output_schema.map((col) => (
                  <Pill key={col} tone="accent">{col}</Pill>
                ))}
              </div>
            </div>
          )}

          {detail?.data_information.quality_metrics && Object.keys(detail.data_information.quality_metrics).length > 0 && (
            <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>Quality Metrics</div>
              <div className="rounded-lg border p-2.5 space-y-1" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
                {Object.entries(detail.data_information.quality_metrics).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[11px]">
                    <span className="capitalize" style={{ color: 'var(--text-secondary)' }}>{k.replaceAll('_', ' ')}</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--heading)' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'lineage' && (
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>
              Direct Upstream ({detail?.lineage.upstream_nodes.length ?? 0})
            </div>
            {(detail?.lineage.upstream_nodes || []).length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>Origin node (no direct upstream).</div>
            ) : (
              <div className="space-y-1">
                {detail!.lineage.upstream_nodes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onSelectNodeId(n.id)}
                    className="w-full flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left hover:bg-[var(--surface-muted)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="font-medium truncate" style={{ color: 'var(--heading)' }}>{n.name}</span>
                    <Pill tone="muted">{n.node_type.replaceAll('_', ' ')}</Pill>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>
              Direct Downstream ({detail?.lineage.downstream_nodes.length ?? 0})
            </div>
            {(detail?.lineage.downstream_nodes || []).length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>Terminal output node.</div>
            ) : (
              <div className="space-y-1">
                {detail!.lineage.downstream_nodes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onSelectNodeId(n.id)}
                    className="w-full flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left hover:bg-[var(--surface-muted)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="font-medium truncate" style={{ color: 'var(--heading)' }}>{n.name}</span>
                    <Pill tone="accent">{n.node_type.replaceAll('_', ' ')}</Pill>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[11px] font-bold uppercase flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <GitMerge size={12} /> Related Pipelines
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(detail?.lineage.related_pipelines || []).map((p) => (
                <Pill key={p.id} tone="primary">{p.name}</Pill>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'execution' && (
        <div className="space-y-3 text-xs">
          {detail?.execution.error_details && (
            <div
              className="rounded-lg border p-2.5 flex items-start gap-2"
              style={{
                background: 'var(--danger-bg)',
                borderColor: 'var(--danger-border)',
                color: 'var(--danger-text)',
              }}
            >
              <AlertOctagon size={14} className="mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-bold">Execution Error Details</div>
                <p className="mt-0.5 break-words">{detail.execution.error_details}</p>
              </div>
            </div>
          )}

          <dl className="space-y-2">
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Pipeline Run ID</dt>
              <dd className="font-mono text-[11px]" style={{ color: 'var(--heading)' }}>{detail?.execution.pipeline_run_id || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Execution Time</dt>
              <dd className="font-mono" style={{ color: 'var(--heading)' }}>{formatShortTimestamp(detail?.execution.execution_time)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Duration</dt>
              <dd className="font-mono tabular-nums" style={{ color: 'var(--heading)' }}>
                {detail?.execution.duration_ms != null ? `${detail.execution.duration_ms} ms` : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-secondary)' }}>Model Version</dt>
              <dd className="font-mono" style={{ color: 'var(--heading)' }}>{detail?.execution.model_version || '—'}</dd>
            </div>
          </dl>

          <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>
              Recent Execution Events ({detail?.execution.logs.length ?? 0})
            </div>
            {(detail?.execution.logs || []).length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>No chronological run events bound directly to this node ID yet.</div>
            ) : (
              <div className="space-y-1.5">
                {detail!.execution.logs.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-lg border p-2 text-[11px]"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold" style={{ color: 'var(--heading)' }}>{ev.event_type}</span>
                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {formatShortTimestamp(ev.timestamp)}
                      </span>
                    </div>
                    {ev.output_summary && (
                      <div className="mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {ev.output_summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'impact' && (
        <ImpactAnalysisPanel
          impact={detail?.impact}
          loading={detailQuery.isLoading}
          onSelectNodeId={onSelectNodeId}
          onHighlightDownstream={() => onTraceDownstream(selectedNode.id)}
        />
      )}
    </aside>
  )
}

