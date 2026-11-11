import { useMemo } from 'react'
import type {
  TwinAIModelInfo,
  TwinEdge,
  TwinNode,
  TwinSimulationEvent,
  TwinSimulationResult,
  TwinZone,
} from '../../../api'

export interface DigitalTwinViewportProps {
  zones: TwinZone[]
  nodes: TwinNode[]
  edges: TwinEdge[]
  activeEdgeIds: string[]
  events: TwinSimulationEvent[]
  activeStepIndex: number
  selectedZoneId: string | null
  selectedNodeId: string | null
  selectedEdgeId: string | null
  onSelectZone: (zoneId: string) => void
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
  isPlaying: boolean
  playbackSpeed: number
  animateParticles: boolean
  showBaselineFlow: boolean
  reducedMotion: boolean
  cameraPreset?: 'reset' | 'iso' | 'top' | 'focus_zone' | 'focus_flow'
  dark3D: boolean
  resultsMap: Record<string, TwinSimulationResult>
  aiModels: TwinAIModelInfo[]
}

const ZONE_POS_2D: Record<string, { x: number; y: number }> = {
  marketing: { x: 115, y: 115 },
  customers: { x: 350, y: 82 },
  sales: { x: 590, y: 115 },
  supply_chain: { x: 115, y: 385 },
  inventory: { x: 350, y: 418 },
  finance_ops: { x: 590, y: 385 },
  ai_engine: { x: 350, y: 250 },
  outcomes: { x: 815, y: 250 },
}

export function DigitalTwinCanvas2D({
  zones,
  nodes,
  edges,
  activeEdgeIds,
  events,
  activeStepIndex,
  selectedZoneId,
  selectedNodeId,
  selectedEdgeId,
  onSelectZone,
  onSelectNode,
  onSelectEdge,
  isPlaying,
  animateParticles,
  showBaselineFlow,
  reducedMotion,
  dark3D,
  resultsMap,
  aiModels,
}: DigitalTwinViewportProps) {
  const activeEvent = activeStepIndex >= 0 && activeStepIndex < events.length ? events[activeStepIndex] : null
  const activeEdgeSet = useMemo(() => new Set(activeEdgeIds), [activeEdgeIds])

  const nodeCoords = useMemo(() => {
    const map: Record<string, { x: number; y: number; zoneId: string; kind: string; label: string }> = {}
    const byZone: Record<string, TwinNode[]> = {}
    for (const n of nodes) {
      ;(byZone[n.zone_id] ??= []).push(n)
    }
    for (const [zid, list] of Object.entries(byZone)) {
      const center = ZONE_POS_2D[zid] || { x: 420, y: 250 }
      const cols = zid === 'ai_engine' ? 4 : Math.min(3, list.length)
      list.forEach((n, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const dx = (col - (cols - 1) / 2) * 56
        const dy = (row - Math.floor((list.length - 1) / cols) / 2) * 28
        map[n.id] = {
          x: center.x + dx,
          y: center.y + dy + (zid === 'ai_engine' ? 8 : 10),
          zoneId: zid,
          kind: n.kind,
          label: n.label,
        }
      })
    }
    return map
  }, [nodes])

  const closingStock = resultsMap.closing_inventory_units?.scenario_value
  const stockoutRisk = resultsMap.inventory_risk_units?.scenario_value
  const stockPct =
    closingStock != null
      ? Math.max(8, Math.min(100, Math.round((Number(closingStock) / Math.max(100, Number(closingStock) + Number(stockoutRisk || 0))) * 100)))
      : 68

  const bgMain = dark3D ? '#0f172a' : '#f8fafc'
  const surfaceFill = dark3D ? '#1e293b' : '#ffffff'
  const borderCol = dark3D ? '#334155' : '#cbd5e1'
  const textCol = dark3D ? '#e2e8f0' : '#0f172a'
  const subCol = dark3D ? '#94a3b8' : '#475569'

  return (
    <div
      data-testid="digital-twin-canvas-2d"
      className="relative w-full h-[500px] rounded-xl border overflow-hidden select-none"
      style={{ background: bgMain, borderColor: 'var(--border)' }}
    >
      <svg
        viewBox="0 0 940 500"
        className="w-full h-full"
        role="img"
        aria-label="Interactive Digital Twin Enterprise Data Flow Map"
      >
        <defs>
          <marker id="dt-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill="#2563EB" />
          </marker>
          <marker id="dt-arrow-step" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
            <path d="M0,0 L8,3.5 L0,7 Z" fill="#EA580C" />
          </marker>
          <marker id="dt-arrow-muted" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#94A3B8" />
          </marker>
          <pattern id="dt-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke={dark3D ? '#1e293b' : '#e2e8f0'}
              strokeWidth="0.8"
            />
          </pattern>
        </defs>

        <rect width="940" height="500" fill="url(#dt-grid)" />

        {/* Zone Architectural Platforms */}
        {zones.map((z) => {
          const pos = ZONE_POS_2D[z.id] || { x: 450, y: 250 }
          const w = z.id === 'ai_engine' ? 255 : z.id === 'outcomes' ? 185 : 200
          const h = z.id === 'ai_engine' ? 124 : 98
          const isSelected = selectedZoneId === z.id || activeEvent?.zone_id === z.id
          const isUnsupported = z.baseline && z.baseline.supported === false
          return (
            <g
              key={z.id}
              data-testid={`twin-zone-${z.id}`}
              className="cursor-pointer"
              onClick={() => onSelectZone(z.id)}
            >
              <rect
                x={pos.x - w / 2}
                y={pos.y - h / 2}
                width={w}
                height={h}
                rx={14}
                fill={surfaceFill}
                stroke={isSelected ? '#2563EB' : borderCol}
                strokeWidth={isSelected ? 2.6 : 1.4}
                opacity={isUnsupported ? 0.8 : 1}
              />
              <rect
                x={pos.x - w / 2 + 8}
                y={pos.y - h / 2 + 6}
                width={5}
                height={18}
                rx={2.5}
                fill={isUnsupported ? '#94A3B8' : z.color}
              />
              <text
                x={pos.x - w / 2 + 20}
                y={pos.y - h / 2 + 19}
                fontSize={11.5}
                fontWeight={700}
                fill={textCol}
              >
                {z.name}
              </text>
              {isUnsupported && (
                <text x={pos.x + w / 2 - 10} y={pos.y - h / 2 + 18} textAnchor="end" fontSize={8.5} fill="#EA580C" fontWeight={700}>
                  PARTIAL/UNMAPPED
                </text>
              )}
              {z.id === 'inventory' && (
                <g>
                  <rect
                    x={pos.x - w / 2 + 14}
                    y={pos.y + h / 2 - 14}
                    width={w - 28}
                    height={6}
                    rx={3}
                    fill={dark3D ? '#334155' : '#e2e8f0'}
                  />
                  <rect
                    x={pos.x - w / 2 + 14}
                    y={pos.y + h / 2 - 14}
                    width={((w - 28) * stockPct) / 100}
                    height={6}
                    rx={3}
                    fill={stockoutRisk && stockoutRisk > 0 ? '#EA580C' : '#16A34A'}
                  />
                </g>
              )}
            </g>
          )
        })}

        {/* Directed Pipeline Edges + Parallel Baseline Overlay */}
        {edges.map((e) => {
          const s = nodeCoords[e.source]
          const t = nodeCoords[e.target]
          if (!s || !t) return null
          const isPipe = activeEdgeSet.has(e.id)
          const isCurrent = activeEvent?.edge_id === e.id
          const isSelEdge = selectedEdgeId === e.id
          const mx = (s.x + t.x) / 2
          const my = (s.y + t.y) / 2 - 14
          const pathD = `M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`
          const basePathD = `M ${s.x} ${s.y + 5} Q ${mx} ${my + 5} ${t.x} ${t.y + 5}`

          return (
            <g key={e.id} className="cursor-pointer" onClick={() => onSelectEdge(e.id)}>
              {showBaselineFlow && isPipe && (
                <path
                  d={basePathD}
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth={1.6}
                  strokeDasharray="4 4"
                  opacity={0.7}
                />
              )}
              <path
                d={pathD}
                fill="none"
                stroke={isCurrent || isSelEdge ? '#EA580C' : isPipe ? '#2563EB' : borderCol}
                strokeWidth={isCurrent || isSelEdge ? 3 : isPipe ? 2.1 : 1.1}
                opacity={isCurrent || isSelEdge ? 1 : isPipe ? 0.85 : 0.35}
                markerEnd={
                  isCurrent || isSelEdge
                    ? 'url(#dt-arrow-step)'
                    : isPipe
                    ? 'url(#dt-arrow-active)'
                    : 'url(#dt-arrow-muted)'
                }
              />
              {isPipe && animateParticles && !reducedMotion && (isPlaying || isCurrent) && (
                <circle r={isCurrent ? 4.5 : 3.2} fill={isCurrent ? '#EA580C' : '#0284C7'}>
                  <animateMotion dur="1.4s" repeatCount="indefinite" path={pathD} />
                </circle>
              )}
            </g>
          )
        })}

        {/* Interactive Nodes */}
        {nodes.map((n) => {
          const pos = nodeCoords[n.id]
          if (!pos) return null
          const modelInfo = n.kind === 'ai_model' ? aiModels.find((m) => m.id === n.id) : undefined
          const isUnintegrated = modelInfo?.status === 'not_integrated' || modelInfo?.status === 'unavailable'
          const isCurrent = activeEvent?.node_id === n.id
          const isSel = selectedNodeId === n.id
          const nodeFill = isUnintegrated
            ? dark3D
              ? '#334155'
              : '#e2e8f0'
            : isCurrent
            ? '#FFEDD5'
            : isSel
            ? '#DBEAFE'
            : dark3D
            ? '#0f172a'
            : '#f8fafc'

          return (
            <g
              key={n.id}
              data-testid={`twin-node-${n.id}`}
              className="cursor-pointer"
              onClick={(ev) => {
                ev.stopPropagation()
                onSelectNode(n.id)
              }}
            >
              <rect
                x={pos.x - 24}
                y={pos.y - 11}
                width={48}
                height={22}
                rx={6}
                fill={nodeFill}
                stroke={isCurrent ? '#EA580C' : isSel ? '#2563EB' : isUnintegrated ? '#94A3B8' : '#64748B'}
                strokeWidth={isCurrent || isSel ? 2 : 1.1}
                strokeDasharray={isUnintegrated ? '3 2' : undefined}
              />
              <text
                x={pos.x}
                y={pos.y + 3}
                textAnchor="middle"
                fontSize={7.8}
                fontWeight={600}
                fill={isUnintegrated ? subCol : textCol}
              >
                {n.label.slice(0, 10)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
