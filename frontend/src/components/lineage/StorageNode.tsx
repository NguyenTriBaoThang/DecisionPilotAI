import { Archive, Boxes, Database, Layers } from 'lucide-react'
import { formatBytesCompact, getStatusTheme, NODE_HEIGHT, NODE_WIDTH, type NodeCardProps } from './types'

function pickStorageIcon(subType: string) {
  const st = subType.toLowerCase()
  if (st.includes('object')) return Archive
  if (st.includes('vector')) return Boxes
  if (st.includes('multimodal')) return Layers
  return Database
}

export function StorageNode({
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
  const Icon = pickStorageIcon(node.sub_type)
  const records = node.metadata.record_count
  const bytes = node.metadata.data_size_bytes
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
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: '#0284C7' }} />
      <div className="flex items-start justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg border flex-shrink-0"
            style={{
              background: 'var(--info-bg)',
              borderColor: 'var(--info-border)',
              color: '#0284C7',
            }}
          >
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-bold leading-tight truncate" style={{ color: 'var(--heading)' }}>
              {node.name}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider truncate" style={{ color: 'var(--text-secondary)' }}>
              {node.metadata.data_format || node.sub_type.replaceAll('_', ' ')}
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
        <span className="tabular-nums truncate">
          {records != null ? `${Number(records).toLocaleString()} stored` : 'Verified store'}
        </span>
        <span className="truncate font-mono">
          {bytes ? formatBytesCompact(bytes) : `${(node.metadata.tables || []).length || 1} store`}
        </span>
      </div>
    </div>
  )
}

