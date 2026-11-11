import { getStatusTheme, NODE_HEIGHT, NODE_WIDTH, type LineageEdge, type NodePosition } from './types'

interface AnimatedDataEdgeProps {
  edge: LineageEdge
  sourcePos: NodePosition
  targetPos: NodePosition
  isSelected: boolean
  isTraced: boolean
  isDimmed: boolean
  isPlaybackActive: boolean
  flowEnabled: boolean
  reduceMotion: boolean
  showLabels: boolean
  onSelect: (edge: LineageEdge) => void
}

export function computeEdgePath(sourcePos: NodePosition, targetPos: NodePosition): {
  d: string
  midX: number
  midY: number
} {
  const sx = sourcePos.x + NODE_WIDTH
  const sy = sourcePos.y + NODE_HEIGHT / 2
  const tx = targetPos.x
  const ty = targetPos.y + NODE_HEIGHT / 2
  const dx = Math.max(44, Math.abs(tx - sx) * 0.45)
  const cx1 = sx + dx
  const cy1 = sy
  const cx2 = tx - dx
  const cy2 = ty
  const d = `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`
  const midX = 0.125 * sx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx
  const midY = 0.125 * sy + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ty
  return { d, midX, midY }
}

export function AnimatedDataEdge({
  edge,
  sourcePos,
  targetPos,
  isSelected,
  isTraced,
  isDimmed,
  isPlaybackActive,
  flowEnabled,
  reduceMotion,
  showLabels,
  onSelect,
}: AnimatedDataEdgeProps) {
  const { d, midX, midY } = computeEdgePath(sourcePos, targetPos)
  const theme = getStatusTheme(edge.status)

  const strokeColor = isPlaybackActive
    ? '#EA580C'
    : isSelected
    ? '#2563EB'
    : isTraced
    ? '#2563EB'
    : theme.stroke

  const isRealProcessing = edge.status === 'processing'
  // Strict visual honesty: animate particles ONLY for real processing jobs, active playback step,
  // or explicit traced-path flow, when motion is enabled & reduced motion is off.
  const canAnimate =
    flowEnabled &&
    !reduceMotion &&
    (isRealProcessing || isPlaybackActive || isTraced)

  const opacity = isDimmed ? 0.14 : isSelected || isTraced || isPlaybackActive ? 1 : 0.72
  const strokeWidth = isSelected || isPlaybackActive ? 2.6 : isTraced ? 2.2 : 1.65
  const markerKey =
    isPlaybackActive
      ? 'arrow-processing'
      : isSelected || isTraced
      ? 'arrow-normal'
      : `arrow-${theme.label}`

  const labelText = edge.record_count
    ? `${edge.relationship_type.replaceAll('_', ' ')} (${edge.record_count.toLocaleString()})`
    : edge.relationship_type.replaceAll('_', ' ')

  return (
    <g
      data-testid={`lineage-edge-${edge.id}`}
      style={{ opacity, transition: 'opacity 180ms ease' }}
    >
      {/* Wide transparent click target */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(edge)
        }}
      />

      {/* Visible directional stroke */}
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={edge.status === 'pending' ? '5 4' : canAnimate ? '7 5' : undefined}
        markerEnd={`url(#${markerKey})`}
        style={{ pointerEvents: 'none' }}
      />

      {/* Smooth particle pulse strictly when processing / playback / focused trace */}
      {canAnimate && (
        <circle r={isPlaybackActive || isRealProcessing ? 4 : 3.2} fill={isPlaybackActive || isRealProcessing ? '#EA580C' : '#2563EB'} style={{ pointerEvents: 'none' }}>
          <animateMotion
            dur={isPlaybackActive ? '0.85s' : '1.7s'}
            repeatCount="indefinite"
            path={d}
          />
        </circle>
      )}

      {showLabels && !isDimmed && (
        <g transform={`translate(${midX}, ${midY})`} style={{ pointerEvents: 'none' }}>
          <rect
            x={-Math.min(78, labelText.length * 3.1 + 10)}
            y={-10}
            width={Math.min(156, labelText.length * 6.2 + 20)}
            height={19}
            rx={6}
            fill="var(--surface)"
            stroke={isSelected || isTraced ? '#2563EB' : 'var(--border)'}
            strokeWidth={1}
          />
          <text
            x={0}
            y={3}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight={600}
            fill="var(--text-secondary)"
          >
            {labelText.slice(0, 26)}
          </text>
        </g>
      )}
    </g>
  )
}

