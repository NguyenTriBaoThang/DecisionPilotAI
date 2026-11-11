import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Clock,
  Cpu,
  Database,
  GitBranch,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import {
  consumeLineageStream,
  getLineageDownstream,
  getLineageGraph,
  getLineageUpstream,
  type Dataset,
  type LineageEdge,
  type LineageGraphFilters,
  type LineageNode,
  type PipelineEventItem,
  type Session,
} from '../../api'
import { Button, ErrorState, PageHeader, Pill } from '../../ui'
import { DataFlowPlaybackControls } from './DataFlowPlaybackControls'
import { LineageGraphCanvas, serializeLineageSvg } from './LineageGraphCanvas'
import { NodeDetailInspector } from './NodeDetailInspector'
import { TraceabilityTimeline } from './TraceabilityTimeline'
import { TraceabilityToolbar } from './TraceabilityToolbar'
import { formatShortTimestamp, getStatusTheme, type NodePosition, type TraceHighlightState } from './types'

interface EnterpriseKnowledgeMapProps {
  companyId: string
  dataset?: Dataset
  session: Session
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function EnterpriseKnowledgeMap({ companyId }: EnterpriseKnowledgeMapProps) {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<LineageGraphFilters>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [traceDirection, setTraceDirection] = useState<'upstream' | 'downstream' | 'both' | null>(null)
  const [tracedNodeIds, setTracedNodeIds] = useState<Set<string> | null>(null)
  const [tracedEdgeIds, setTracedEdgeIds] = useState<Set<string> | null>(null)

  const [zoom, setZoom] = useState<number>(0.84)
  const [fitSignal, setFitSignal] = useState<number>(0)
  const [resetLayoutSignal, setResetLayoutSignal] = useState<number>(0)
  const [focusNodeSignal, setFocusNodeSignal] = useState<{ nodeId: string; seq: number } | null>(null)

  const [flowEnabled, setFlowEnabled] = useState<boolean>(true)
  const [reduceMotion, setReduceMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  const [showLabels, setShowLabels] = useState<boolean>(true)
  const [searchCursor, setSearchCursor] = useState<number>(0)
  const [sseConnected, setSseConnected] = useState<boolean>(false)
  const [liveActiveProcessing, setLiveActiveProcessing] = useState<boolean | null>(null)

  const [playbackFrame, setPlaybackFrame] = useState<{
    activeEvent: PipelineEventItem | null
    stepIndex: number
    totalSteps: number
    visitedNodeIds: string[]
    activeNodeId: string | null
    activeEdgeIds: string[]
  } | null>(null)

  const latestPositionsRef = useRef<Record<string, NodePosition>>({})
  const handlePositionsSnapshot = useCallback((positions: Record<string, NodePosition>) => {
    latestPositionsRef.current = positions
  }, [])

  // Reset selections & filters cleanly on tenant switch
  useEffect(() => {
    setFilters({})
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setTraceDirection(null)
    setTracedNodeIds(null)
    setTracedEdgeIds(null)
    setPlaybackFrame(null)
    setLiveActiveProcessing(null)
  }, [companyId])

  const graphQuery = useQuery({
    queryKey: ['lineage-graph', companyId, filters],
    queryFn: () => getLineageGraph(filters),
    refetchInterval: (query) => {
      const data = query.state.data
      const active = liveActiveProcessing ?? data?.has_active_processing
      if (!active) return false
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false
      return 4_000
    },
  })

  const graph = graphQuery.data
  const nodes = graph?.nodes || []
  const edges = graph?.edges || []
  const pipelines = graph?.pipelines || []
  const isProcessingActive = Boolean(liveActiveProcessing ?? graph?.has_active_processing)

  // Real SSE subscription for active jobs / new ingestions / failed syncs
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setSseConnected(false)

    consumeLineageStream(
      (evName, payload) => {
        if (!active) return
        setSseConnected(true)
        setLiveActiveProcessing(payload.has_active_processing)
        if (evName === 'lineage_update') {
          void queryClient.invalidateQueries({ queryKey: ['lineage-graph', companyId] })
        }
      },
      controller.signal,
      2.5
    ).catch(() => {
      if (active) setSseConnected(false)
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [companyId, queryClient])

  const triggerFocusNode = useCallback((nodeId: string) => {
    setFocusNodeSignal((prev) => ({ nodeId, seq: (prev?.seq || 0) + 1 }))
  }, [])

  const applyTrace = useCallback(
    async (nodeId: string, dir: 'upstream' | 'downstream' | 'both') => {
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
      setTraceDirection(dir)
      try {
        if (dir === 'both') {
          const [up, dn] = await Promise.all([getLineageUpstream(nodeId), getLineageDownstream(nodeId)])
          setTracedNodeIds(new Set([...up.node_ids, ...dn.node_ids]))
          setTracedEdgeIds(new Set([...up.edge_ids, ...dn.edge_ids]))
        } else if (dir === 'upstream') {
          const res = await getLineageUpstream(nodeId)
          setTracedNodeIds(new Set(res.node_ids))
          setTracedEdgeIds(new Set(res.edge_ids))
        } else {
          const res = await getLineageDownstream(nodeId)
          setTracedNodeIds(new Set(res.node_ids))
          setTracedEdgeIds(new Set(res.edge_ids))
        }
      } catch {
        setTracedNodeIds(new Set([nodeId]))
        setTracedEdgeIds(new Set())
      }
    },
    []
  )

  const handleSelectNode = useCallback(
    (node: LineageNode) => {
      setSelectedEdgeId(null)
      if (node.node_type === 'business_intelligence' || node.node_type === 'final_output') {
        void applyTrace(node.id, 'upstream')
      } else if (node.node_type === 'data_source') {
        void applyTrace(node.id, 'downstream')
      } else {
        setSelectedNodeId(node.id)
        setTraceDirection(null)
        setTracedNodeIds(null)
        setTracedEdgeIds(null)
      }
    },
    [applyTrace]
  )

  const handleDoubleClickNode = useCallback(
    (node: LineageNode) => {
      triggerFocusNode(node.id)
      void applyTrace(node.id, 'both')
    },
    [triggerFocusNode, applyTrace]
  )

  const handleSelectNodeById = useCallback(
    (nodeId: string) => {
      const target = nodes.find((n) => n.id === nodeId)
      if (target) {
        triggerFocusNode(nodeId)
        setSelectedNodeId(nodeId)
        setSelectedEdgeId(null)
      }
    },
    [nodes, triggerFocusNode]
  )

  const handleSelectEdge = useCallback((edge: LineageEdge) => {
    setSelectedNodeId(null)
    setSelectedEdgeId(edge.id)
    setTraceDirection(null)
    setTracedNodeIds(new Set([edge.source_node_id, edge.target_node_id]))
    setTracedEdgeIds(new Set([edge.id]))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setTraceDirection(null)
    setTracedNodeIds(null)
    setTracedEdgeIds(null)
  }, [])

  const handleSelectTimelineEvent = useCallback(
    (ev: PipelineEventItem) => {
      if (ev.node_id) {
        triggerFocusNode(ev.node_id)
        setSelectedNodeId(ev.node_id)
        setSelectedEdgeId(null)
      }
    },
    [triggerFocusNode]
  )

  const handlePlaybackFrame = useCallback(
    (
      frame: {
        activeEvent: PipelineEventItem | null
        stepIndex: number
        totalSteps: number
        visitedNodeIds: string[]
        activeNodeId: string | null
        activeEdgeIds: string[]
      } | null
    ) => {
      setPlaybackFrame(frame)
      if (frame?.activeNodeId) {
        setSelectedNodeId(frame.activeNodeId)
        setSelectedEdgeId(null)
      }
    },
    []
  )

  const handleJumpNextMatch = useCallback(() => {
    const matches = graph?.matched_node_ids || []
    if (!filters.search || !matches.length) return
    const idx = searchCursor % matches.length
    const targetId = matches[idx]
    setSearchCursor(idx + 1)
    setSelectedNodeId(targetId)
    setSelectedEdgeId(null)
    triggerFocusNode(targetId)
  }, [graph?.matched_node_ids, filters.search, searchCursor, triggerFocusNode])

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) || null : null),
    [nodes, selectedNodeId]
  )
  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) || null : null),
    [edges, selectedEdgeId]
  )

  const highlights: TraceHighlightState = useMemo(
    () => ({
      selectedNodeId,
      selectedEdgeId,
      tracedNodeIds,
      tracedEdgeIds,
      traceDirection,
      matchedNodeIds: filters.search ? new Set(graph?.matched_node_ids || []) : null,
      playbackNodeId: playbackFrame?.activeNodeId || null,
      playbackEdgeIds: new Set(playbackFrame?.activeEdgeIds || []),
      playbackVisitedNodeIds: new Set(playbackFrame?.visitedNodeIds || []),
    }),
    [
      selectedNodeId,
      selectedEdgeId,
      tracedNodeIds,
      tracedEdgeIds,
      traceDirection,
      filters.search,
      graph?.matched_node_ids,
      playbackFrame,
    ]
  )

  const kpiCards = [
    {
      label: 'Total Data Sources',
      value: graph ? String(graph.summary.total_data_sources) : '—',
      icon: Database,
      color: '#2563EB',
    },
    {
      label: 'Processing Pipelines',
      value: graph ? String(graph.summary.processing_pipelines) : '—',
      icon: GitBranch,
      color: '#EA580C',
    },
    {
      label: 'AI Models',
      value: graph ? String(graph.summary.ai_models) : '—',
      icon: Cpu,
      color: '#7C3AED',
    },
    {
      label: 'Business Insights',
      value: graph ? String(graph.summary.business_insights) : '—',
      icon: Lightbulb,
      color: '#16A34A',
    },
    {
      label: 'Data Quality Score',
      value:
        graph && graph.summary.data_quality_score != null
          ? `${graph.summary.data_quality_score}%`
          : '—',
      icon: ShieldCheck,
      color: '#0284C7',
    },
    {
      label: 'Last Synchronized',
      value: formatShortTimestamp(graph?.summary.last_synchronized),
      icon: Clock,
      color: '#475569',
    },
  ]

  return (
    <div className="space-y-5" data-testid="enterprise-knowledge-map">
      <PageHeader
        eyebrow="ENTERPRISE KNOWLEDGE MAP"
        title="Enterprise Data Traceability"
        subtitle="Track every data source, transformation, model, and business insight across your decision-making pipeline."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            {isProcessingActive ? (
              <Pill tone="high">
                <Activity size={12} className="animate-pulse" />
                Live Processing Active
              </Pill>
            ) : (
              <Pill tone={sseConnected ? 'success' : 'muted'}>
                <Sparkles size={12} />
                {sseConnected ? 'Telemetry Synchronized' : 'Verified Snapshot'}
              </Pill>
            )}
            <Button size="sm" onClick={() => void graphQuery.refetch()} disabled={graphQuery.isFetching}>
              <RefreshCw size={13} className={graphQuery.isFetching ? 'animate-spin' : undefined} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* 6 Header KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.label}
              className="dp-surface p-3.5 flex items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                  {kpi.label}
                </div>
                <div
                  className="text-lg font-bold tracking-tight mt-1 tabular-nums truncate"
                  style={{ color: 'var(--heading)' }}
                >
                  {kpi.value}
                </div>
              </div>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg border flex-shrink-0"
                style={{
                  background: 'var(--surface-muted)',
                  borderColor: 'var(--border)',
                  color: kpi.color,
                }}
              >
                <Icon size={15} />
              </span>
            </div>
          )
        })}
      </div>

      <ErrorState error={graphQuery.error} retry={() => void graphQuery.refetch()} />

      {/* Pipeline Quick Selector Pills */}
      {pipelines.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Pipeline Isolation Selector">
          <span className="text-[11px] font-bold uppercase tracking-wider mr-1" style={{ color: 'var(--text-secondary)' }}>
            Pipelines:
          </span>
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, pipeline_id: undefined }))}
            style={{
              background: !filters.pipeline_id ? 'var(--primary)' : 'var(--surface)',
              color: !filters.pipeline_id ? '#FFFFFF' : 'var(--heading)',
              borderColor: !filters.pipeline_id ? 'var(--primary)' : 'var(--border-strong)',
            }}
            className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
          >
            All Pipelines ({pipelines.length})
          </button>
          {pipelines.map((p) => {
            const active = filters.pipeline_id === p.id
            const st = getStatusTheme(p.status)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    pipeline_id: active ? undefined : p.id,
                  }))
                }
                style={{
                  background: active ? 'var(--primary-soft)' : 'var(--surface)',
                  color: active ? 'var(--primary-text)' : 'var(--heading)',
                  borderColor: active ? 'var(--primary)' : 'var(--border-strong)',
                }}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--surface-muted)]"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: st.dot }} />
                {p.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Toolbar & Facet Filters */}
      <TraceabilityToolbar
        filters={filters}
        onFiltersChange={(next) => {
          setFilters(next)
          setSearchCursor(0)
        }}
        facets={graph?.facets}
        pipelines={pipelines}
        matchCount={filters.search ? (graph?.matched_node_ids.length || 0) : 0}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Number(Math.min(1.75, z + 0.12).toFixed(2)))}
        onZoomOut={() => setZoom((z) => Number(Math.max(0.45, z - 0.12).toFixed(2)))}
        onFitToScreen={() => setFitSignal((s) => s + 1)}
        onResetLayout={() => {
          setResetLayoutSignal((s) => s + 1)
          clearSelection()
        }}
        flowEnabled={flowEnabled}
        onToggleFlow={() => setFlowEnabled((v) => !v)}
        reduceMotion={reduceMotion}
        onToggleReduceMotion={() => setReduceMotion((v) => !v)}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
        selectedNodeId={selectedNodeId}
        activeTraceDirection={traceDirection}
        onTraceUpstream={() => selectedNodeId && void applyTrace(selectedNodeId, 'upstream')}
        onTraceDownstream={() => selectedNodeId && void applyTrace(selectedNodeId, 'downstream')}
        onClearFocus={clearSelection}
        onExportJson={() => {
          if (!graph) return
          downloadBlob(
            `enterprise-lineage-${companyId}.json`,
            JSON.stringify(
              {
                company_id: graph.company_id,
                exported_at: new Date().toISOString(),
                summary: graph.summary,
                pipelines: graph.pipelines,
                nodes: graph.nodes,
                edges: graph.edges,
              },
              null,
              2
            ),
            'application/json'
          )
        }}
        onExportSvg={() => {
          const svg = serializeLineageSvg(nodes, edges, latestPositionsRef.current)
          downloadBlob(`enterprise-lineage-${companyId}.svg`, svg, 'image/svg+xml')
        }}
        onJumpNextMatch={handleJumpNextMatch}
      />

      {/* Historical Data Flow Playback Bar (uses real pipeline_events) */}
      {pipelines.length > 0 && (
        <DataFlowPlaybackControls
          pipelines={pipelines}
          selectedPipelineId={filters.pipeline_id}
          reduceMotion={reduceMotion}
          onPlaybackFrame={handlePlaybackFrame}
        />
      )}

      {/* Honest Empty Workspace State vs Interactive Canvas + Inspector */}
      {graphQuery.isLoading ? (
        <div className="dp-surface p-12 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
          Synchronizing real pipeline metadata and data lineage graph…
        </div>
      ) : nodes.length === 0 ? (
        <div
          className="dp-surface p-10 text-center space-y-3"
          data-testid="empty-lineage-state"
        >
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border"
            style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary-border)', color: 'var(--primary)' }}
          >
            <UploadCloud size={22} />
          </div>
          <h3 className="text-base font-bold" style={{ color: 'var(--heading)' }}>
            No Real Data Lineage Recorded Yet
          </h3>
          <p className="text-xs max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {Object.values(filters).some(Boolean)
              ? 'No nodes matched the active search or filters. Clear filters to view all pipelines in this workspace.'
              : 'This workspace has no ingested datasets, multimodal extractions, RAG knowledge documents, or connectors yet. DecisionPilot AI never renders synthetic placeholder lineage.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {Object.values(filters).some(Boolean) ? (
              <Button size="sm" variant="primary" onClick={() => setFilters({})}>
                Reset Filters
              </Button>
            ) : (
              <Link
                to="/data-sources"
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white hover:brightness-95"
                style={{ background: 'var(--primary)' }}
              >
                Upload or Connect Data
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_370px] gap-4 items-start">
          <LineageGraphCanvas
            nodes={nodes}
            edges={edges}
            highlights={highlights}
            zoom={zoom}
            onZoomChange={setZoom}
            fitSignal={fitSignal}
            resetLayoutSignal={resetLayoutSignal}
            focusNodeSignal={focusNodeSignal}
            flowEnabled={flowEnabled && !reduceMotion}
            reduceMotion={reduceMotion}
            showLabels={showLabels}
            onSelectNode={handleSelectNode}
            onDoubleClickNode={handleDoubleClickNode}
            onSelectEdge={handleSelectEdge}
            onClearSelection={clearSelection}
            onPositionsSnapshot={handlePositionsSnapshot}
          />

          <NodeDetailInspector
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            allNodes={nodes}
            onSelectNodeId={handleSelectNodeById}
            onTraceUpstream={(nid) => void applyTrace(nid, 'upstream')}
            onTraceDownstream={(nid) => void applyTrace(nid, 'downstream')}
            onClose={clearSelection}
          />
        </div>
      )}

      {/* Bottom Collapsible Traceability Timeline */}
      <TraceabilityTimeline
        events={graph?.recent_events || []}
        activePlaybackEventId={playbackFrame?.activeEvent?.id || null}
        selectedNodeId={selectedNodeId}
        onSelectEvent={handleSelectTimelineEvent}
      />
    </div>
  )
}

