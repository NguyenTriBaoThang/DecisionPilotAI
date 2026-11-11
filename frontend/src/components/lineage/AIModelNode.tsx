import { Activity, Bot, BrainCircuit, Compass, Cpu, DatabaseZap, Gauge, SlidersHorizontal, TrendingUp } from 'lucide-react'
import { getStatusTheme, NODE_HEIGHT, NODE_WIDTH, type NodeCardProps } from './types'

function pickModelIcon(subType: string) {
  const st = subType.toLowerCase()
  if (st.includes('lightgbm') || st.includes('forecast')) return TrendingUp
  if (st.includes('anomaly')) return Activity
  if (st.includes('simulator')) return SlidersHorizontal
  if (st.includes('recommendation')) return Compass
  if (st.includes('rag')) return BrainCircuit
  if (st.includes('sql')) return DatabaseZap
  if (st.includes('quality')) return Gauge
  if (st.includes('llm')) return Bot
  return Cpu
}

export function AIModelNode({
  node,
  position,
  isSelected,
  isTraced,
  isMatched,
  isDimmed,
  isPlaybackActive,
  isPlaybackVisited,
  onSelect,
  onDoubleClick,
  onDragStart,
}: NodeCardProps) {
  const theme = getStatusTheme(node.status)
  const Icon = pickModelIcon(node.sub_type)
  const modelVersion = node.metadata.model_version
  const ringColor = isPlaybackActive
    ? '#EA580C'
    : isSelected
    ? '#2563EB'
    : isTraced || isPlaybackVisited
    ? '#2563EB'
    : isMatched
    ? '#EA580C'
    : undefined

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`lineage-node-${node.id}`}
      data-node-type={node.node_type}
      data-node-sub-type={node.sub_type}
      aria-pressed={isSelected}
      aria-label={`${node.name} (${node.sub_type}, ${theme.label})`}
      onPointerDown={(e) => onDragStart(e, node.id)}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick(node)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(node)
        }
      }}
      style={{
        left: position.x,
        top: position.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: 'var(--surface)',
        borderColor: ringColor || 'var(--border-strong)',
        boxShadow: isSelected || isPlaybackActive
          ? `0 0 0 2px ${ringColor}, var(--shadow-md)`
          : isTraced
          ? '0 0 0 1px #2563EB, var(--shadow-sm)'
          : 'var(--shadow-sm)',
        opacity: isDimmed ? 0.28 : 1,
      }}
      className="absolute select-none rounded-xl border p-3 cursor-grab active:cursor-grabbing transition-opacity duration-200 flex flex-col justify-between overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: '#7C3AED' }} />
      <div className="flex items-start justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg border flex-shrink-0"
            style={{
              background: '#F5F3FF',
              borderColor: '#DDD6FE',
              color: '#6D28D9',
            }}
          >
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-bold leading-tight truncate" style={{ color: 'var(--heading)' }}>
              {node.name}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider truncate" style={{ color: 'var(--text-secondary)' }}>
              {node.sub_type.replaceAll('_', ' ')}
            </div>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0"
          style={{
            background: theme.badgeBg,
            borderColor: theme.badgeBorder,
            color: theme.badgeText,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.dot }} />
          {theme.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] pt-1.5 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <span className="truncate font-mono">{modelVersion ? String(modelVersion) : 'Implemented Engine'}</span>
        <span className="truncate">{node.owner}</span>
      </div>
    </div>
  )
}

