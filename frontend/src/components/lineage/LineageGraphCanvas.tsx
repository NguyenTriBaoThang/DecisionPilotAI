import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AIModelNode } from './AIModelNode'
import { AnimatedDataEdge, computeEdgePath } from './AnimatedDataEdge'
import { BusinessInsightNode } from './BusinessInsightNode'
import { DataSourceNode } from './DataSourceNode'
import { ProcessingNode } from './ProcessingNode'
import { StorageNode } from './StorageNode'
import {
  CANVAS_PAD_X,
  CANVAS_PAD_Y,
  COL_GAP,
  getStatusTheme,
  LAYER_COLUMNS,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROW_GAP,
  type LineageEdge,
  type LineageNode,
  type NodePosition,
  type TraceHighlightState,
} from './types'

interface LineageGraphCanvasProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  highlights: TraceHighlightState
  zoom: number
  onZoomChange: (zoom: number) => void
  fitSignal: number
  resetLayoutSignal: number
  focusNodeSignal: { nodeId: string; seq: number } | null
  flowEnabled: boolean
  reduceMotion: boolean
  showLabels: boolean
  onSelectNode: (node: LineageNode) => void
  onDoubleClickNode: (node: LineageNode) => void
  onSelectEdge: (edge: LineageEdge) => void
  onClearSelection: () => void
  onPositionsSnapshot?: (positions: Record<string, NodePosition>) => void
}

export function computeLayeredPositions(nodes: LineageNode[]): Record<string, NodePosition> {
  const buckets = new Map<number, LineageNode[]>()
  for (const col of LAYER_COLUMNS) buckets.set(col.order, [])
  for (const n of nodes) {
    const layer = Math.max(0, Math.min(5, Number.isFinite(n.layer_order) ? n.layer_order : 0))
    buckets.get(layer)!.push(n)
  }

  let maxColCount = 1
  for (const list of buckets.values()) {
    if (list.length > maxColCount) maxColCount = list.length
  }
  const totalContentHeight = maxColCount * NODE_HEIGHT + Math.max(0, maxColCount - 1) * ROW_GAP

  const positions: Record<string, NodePosition> = {}
  for (const col of LAYER_COLUMNS) {
    const colNodes = buckets.get(col.order) || []
    const colHeight = colNodes.length * NODE_HEIGHT + Math.max(0, colNodes.length - 1) * ROW_GAP
    const startY = CANVAS_PAD_Y + Math.max(0, (totalContentHeight - colHeight) / 2)
    const x = CANVAS_PAD_X + col.order * (NODE_WIDTH + COL_GAP)
    colNodes.forEach((n, idx) => {
      positions[n.id] = {
        x,
        y: startY + idx * (NODE_HEIGHT + ROW_GAP),
      }
    })
  }
  return positions
}

function escapeXml(raw: string): string {
  return String(raw)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function serializeLineageSvg(
  nodes: LineageNode[],
  edges: LineageEdge[],
  positions: Record<string, NodePosition>,
  title = 'DecisionPilot AI - Enterprise Data Traceability'
): string {
  const coords = nodes.map((n) => positions[n.id]).filter(Boolean)
  const maxX = Math.max(1200, ...coords.map((p) => p.x + NODE_WIDTH + 60))
  const maxY = Math.max(640, ...coords.map((p) => p.y + NODE_HEIGHT + 60))

  const markers = ['normal', 'processing', 'completed', 'failed', 'pending', 'warning']
    .map((key) => {
      const st = getStatusTheme(key)
      return `<marker id="exp-arrow-${key}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,1 L7,4 L0,7 z" fill="${st.stroke}" /></marker>`
    })
    .join('')

  const edgeSvg = edges
    .map((e) => {
      const sp = positions[e.source_node_id]
      const tp = positions[e.target_node_id]
      if (!sp || !tp) return ''
      const { d } = computeEdgePath(sp, tp)
      const st = getStatusTheme(e.status)
      return `<path d="${d}" fill="none" stroke="${st.stroke}" stroke-width="1.8" marker-end="url(#exp-arrow-${st.label})" />`
    })
    .join('\n')

  const nodeSvg = nodes
    .map((n) => {
      const p = positions[n.id]
      if (!p) return ''
      const st = getStatusTheme(n.status)
      return `<g transform="translate(${p.x}, ${p.y})">
  <rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="12" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2" />
  <rect width="${NODE_WIDTH}" height="4" rx="2" fill="${st.stroke}" />
  <text x="12" y="28" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="700" fill="#0F172A">${escapeXml(n.name.slice(0, 30))}</text>
  <text x="12" y="46" font-family="Inter,Segoe UI,sans-serif" font-size="10" fill="#64748B">${escapeXml(n.sub_type.toUpperCase())}</text>
  <rect x="12" y="64" width="84" height="20" rx="10" fill="#F8FAFC" stroke="#E2E8F0" />
  <text x="22" y="78" font-family="Inter,Segoe UI,sans-serif" font-size="10" font-weight="600" fill="${st.stroke}">${escapeXml(st.label)}</text>
</g>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(maxX)}" height="${Math.ceil(maxY)}" viewBox="0 0 ${Math.ceil(maxX)} ${Math.ceil(maxY)}">
  <title>${escapeXml(title)}</title>
  <defs>${markers}</defs>
  <rect width="100%" height="100%" fill="#F7F9FC" />
  <g>${edgeSvg}</g>
  <g>${nodeSvg}</g>
</svg>`
}

export function LineageGraphCanvas({
  nodes,
  edges,
  highlights,
  zoom,
  onZoomChange,
  fitSignal,
  resetLayoutSignal,
  focusNodeSignal,
  flowEnabled,
  reduceMotion,
  showLabels,
  onSelectNode,
  onDoubleClickNode,
  onSelectEdge,
  onClearSelection,
  onPositionsSnapshot,
}: LineageGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 16, y: 12 })
  const [customPositions, setCustomPositions] = useState<Record<string, NodePosition>>({})
  const [isPanning, setIsPanning] = useState(false)

  const panDragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const nodeDragRef = useRef<{
    nodeId: string
    startClientX: number
    startClientY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)

  const basePositions = useMemo(() => computeLayeredPositions(nodes), [nodes])

  const positions = useMemo(() => {
    const merged: Record<string, NodePosition> = {}
    for (const n of nodes) {
      merged[n.id] = customPositions[n.id] || basePositions[n.id] || { x: CANVAS_PAD_X, y: CANVAS_PAD_Y }
    }
    return merged
  }, [nodes, customPositions, basePositions])

  useEffect(() => {
    onPositionsSnapshot?.(positions)
  }, [positions, onPositionsSnapshot])

  const worldBounds = useMemo(() => {
    const vals = Object.values(positions)
    if (!vals.length) return { width: 1200, height: 520, minX: 0, minY: 0, maxX: 1200, maxY: 520 }
    const minX = Math.min(...vals.map((p) => p.x))
    const minY = Math.min(...vals.map((p) => p.y))
    const maxX = Math.max(...vals.map((p) => p.x + NODE_WIDTH))
    const maxY = Math.max(...vals.map((p) => p.y + NODE_HEIGHT))
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1900, maxX + 80),
      height: Math.max(580, maxY + 80),
    }
  }, [positions])

  const runFitToScreen = useCallback(() => {
    const vals = Object.values(positions)
    if (!vals.length) {
      setPan({ x: 16, y: 12 })
      onZoomChange(0.82)
      return
    }
    const vw = containerRef.current?.clientWidth || 960
    const vh = containerRef.current?.clientHeight || 540
    const contentW = Math.max(300, worldBounds.maxX - worldBounds.minX + 72)
    const contentH = Math.max(240, worldBounds.maxY - worldBounds.minY + 90)
    const nextZoom = Math.max(0.45, Math.min(1.0, Math.min(vw / contentW, vh / contentH)))
    const nextPanX = Math.max(12, (vw - contentW * nextZoom) / 2 - worldBounds.minX * nextZoom + 24)
    const nextPanY = Math.max(12, (vh - contentH * nextZoom) / 2 - (worldBounds.minY - 36) * nextZoom)
    onZoomChange(Number(nextZoom.toFixed(2)))
    setPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) })
  }, [positions, worldBounds, onZoomChange])

  useEffect(() => {
    if (resetLayoutSignal > 0) {
      setCustomPositions({})
      setPan({ x: 18, y: 12 })
      onZoomChange(0.82)
    }
  }, [resetLayoutSignal, onZoomChange])

  useEffect(() => {
    if (fitSignal > 0) runFitToScreen()
  }, [fitSignal, runFitToScreen])

  useEffect(() => {
    if (!focusNodeSignal) return
    const p = positions[focusNodeSignal.nodeId]
    if (!p) return
    const vw = containerRef.current?.clientWidth || 960
    const vh = containerRef.current?.clientHeight || 540
    const cx = p.x + NODE_WIDTH / 2
    const cy = p.y + NODE_HEIGHT / 2
    setPan({
      x: Math.round(vw / 2 - cx * zoom),
      y: Math.round(vh / 2 - cy * zoom),
    })
  }, [focusNodeSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    panDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    }
    setIsPanning(true)
  }

  const handleNodeDragStart = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation()
    const pos = positions[nodeId]
    if (!pos) return
    nodeDragRef.current = {
      nodeId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (nodeDragRef.current) {
      const d = nodeDragRef.current
      const dx = (e.clientX - d.startClientX) / zoom
      const dy = (e.clientY - d.startClientY) / zoom
      if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) > 5) {
        d.moved = true
      }
      if (d.moved) {
        setCustomPositions((prev) => ({
          ...prev,
          [d.nodeId]: {
            x: Math.max(12, Math.round(d.origX + dx)),
            y: Math.max(CANVAS_PAD_Y, Math.round(d.origY + dy)),
          },
        }))
      }
      return
    }
    if (panDragRef.current?.active) {
      const p = panDragRef.current
      setPan({
        x: Math.round(p.origX + (e.clientX - p.startX)),
        y: Math.round(p.origY + (e.clientY - p.startY)),
      })
    }
  }

  const handlePointerUp = () => {
    if (nodeDragRef.current) {
      const dragged = nodeDragRef.current.moved
      nodeDragRef.current = null
      if (dragged) return
    }
    if (panDragRef.current?.active) {
      panDragRef.current = null
      setIsPanning(false)
    }
  }

  const handleSelectNodeGuard = (node: LineageNode) => {
    if (nodeDragRef.current?.moved) return
    onSelectNode(node)
  }

  const hasTraceFocus = Boolean(highlights.tracedNodeIds && highlights.tracedNodeIds.size > 0)
  const hasSearchFilter = Boolean(highlights.matchedNodeIds && highlights.matchedNodeIds.size > 0)
  const hasPlayback = Boolean(highlights.playbackNodeId || highlights.playbackEdgeIds.size > 0)

  const renderNodeCard = (node: LineageNode) => {
    const pos = positions[node.id] || { x: CANVAS_PAD_X, y: CANVAS_PAD_Y }
    const isSelected = highlights.selectedNodeId === node.id
    const isTraced = Boolean(highlights.tracedNodeIds?.has(node.id))
    const isMatched = Boolean(highlights.matchedNodeIds?.has(node.id))
    const isPlaybackActive = highlights.playbackNodeId === node.id
    const isPlaybackVisited = highlights.playbackVisitedNodeIds.has(node.id)

    let isDimmed = false
    if (hasPlayback) {
      isDimmed = !isPlaybackActive && !isPlaybackVisited
    } else if (hasTraceFocus) {
      isDimmed = !isTraced && !isSelected
    } else if (hasSearchFilter) {
      isDimmed = !isMatched && !isSelected
    }

    const commonProps = {
      node,
      position: pos,
      isSelected,
      isTraced,
      isMatched,
      isDimmed,
      isPlaybackActive,
      isPlaybackVisited,
      onSelect: handleSelectNodeGuard,
      onDoubleClick: onDoubleClickNode,
      onDragStart: handleNodeDragStart,
    }

    if (node.node_type === 'data_source') return <DataSourceNode key={node.id} {...commonProps} />
    if (node.node_type === 'processing') return <ProcessingNode key={node.id} {...commonProps} />
    if (node.node_type === 'storage') return <StorageNode key={node.id} {...commonProps} />
    if (node.node_type === 'ai_model') return <AIModelNode key={node.id} {...commonProps} />
    return <BusinessInsightNode key={node.id} {...commonProps} />
  }

  return (
    <div
      ref={containerRef}
      data-testid="lineage-graph-canvas"
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.08 : 0.08
        onZoomChange(Number(Math.max(0.45, Math.min(1.75, zoom + delta)).toFixed(2)))
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClearSelection()
      }}
      style={{
        backgroundColor: 'var(--bg)',
        backgroundImage: 'radial-gradient(var(--border-strong) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        cursor: isPanning ? 'grabbing' : 'grab',
      }}
      className="relative w-full h-[560px] lg:h-[620px] rounded-xl border overflow-hidden select-none"
    >
      {/* Transformed Infinite-Style Pan/Zoom World */}
      <div
        style={{
          width: worldBounds.width,
          height: worldBounds.height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="relative"
      >
        {/* Column Layer Headers */}
        {LAYER_COLUMNS.map((col) => {
          const x = CANVAS_PAD_X + col.order * (NODE_WIDTH + COL_GAP)
          const count = nodes.filter((n) => n.layer_order === col.order).length
          return (
            <div
              key={col.type}
              style={{
                left: x,
                top: 12,
                width: NODE_WIDTH,
                background: 'var(--surface)',
                borderColor: 'var(--border)',
              }}
              className="absolute rounded-lg border px-3 py-1.5 flex items-center justify-between shadow-xs pointer-events-none"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-tight" style={{ color: 'var(--heading)' }}>
                <span className="h-2 w-2 rounded-full" style={{ background: col.accent }} />
                {col.label}
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
              >
                {count}
              </span>
            </div>
          )
        })}

        {/* SVG Directed Edges Layer */}
        <svg
          width={worldBounds.width}
          height={worldBounds.height}
          className="absolute inset-0 pointer-events-none"
        >
          <defs>
            {(['normal', 'processing', 'completed', 'failed', 'pending', 'warning'] as const).map((statusKey) => {
              const st = getStatusTheme(statusKey)
              return (
                <marker
                  key={statusKey}
                  id={`arrow-${statusKey}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,1 L7,4 L0,7 z" fill={st.stroke} />
                </marker>
              )
            })}
          </defs>
          {edges.map((edge) => {
            const sourcePos = positions[edge.source_node_id]
            const targetPos = positions[edge.target_node_id]
            if (!sourcePos || !targetPos) return null

            const isSelected = highlights.selectedEdgeId === edge.id
            const isTraced = Boolean(highlights.tracedEdgeIds?.has(edge.id))
            const isPlaybackEdge = highlights.playbackEdgeIds.has(edge.id)
            const isDimmed = hasPlayback
              ? !isPlaybackEdge
              : hasTraceFocus
              ? !isTraced && !isSelected
              : false

            return (
              <AnimatedDataEdge
                key={edge.id}
                edge={edge}
                sourcePos={sourcePos}
                targetPos={targetPos}
                isSelected={isSelected}
                isTraced={isTraced}
                isDimmed={isDimmed}
                isPlaybackActive={isPlaybackEdge}
                flowEnabled={flowEnabled}
                reduceMotion={reduceMotion}
                showLabels={showLabels}
                onSelect={onSelectEdge}
              />
            )
          })}
        </svg>

        {/* Interactive Node Cards Layer */}
        <div className="relative w-full h-full">
          {nodes.map(renderNodeCard)}
        </div>
      </div>

      {/* Bottom Legend Bar inside Canvas */}
      <div
        className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-[11px] backdrop-blur-sm pointer-events-none"
        style={{
          background: 'rgba(255, 255, 255, 0.92)',
          borderColor: 'var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          {[
            { label: 'Completed', color: '#16A34A' },
            { label: 'Processing', color: '#EA580C' },
            { label: 'Normal / Active', color: '#2563EB' },
            { label: 'Warning / HITL', color: '#D97706' },
            { label: 'Failed', color: '#DC2626' },
            { label: 'Pending', color: '#94A3B8' },
          ].map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
        <div className="font-mono text-[10px]">
          Drag nodes to rearrange · Drag canvas to pan · Double-click node to isolate
        </div>
      </div>
    </div>
  )
}

