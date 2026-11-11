import {
  AudioLines,
  Cloud,
  Database,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Globe,
  HardDrive,
  Presentation,
  Server,
  Video,
} from 'lucide-react'
import { formatBytesCompact, getStatusTheme, NODE_HEIGHT, NODE_WIDTH, type NodeCardProps } from './types'

function pickSourceIcon(subType: string) {
  const st = subType.toLowerCase()
  if (st.includes('csv') || st.includes('xlsx') || st.includes('xls') || st.includes('excel')) return FileSpreadsheet
  if (st.includes('json') || st.includes('xml')) return FileCode2
  if (st.includes('pptx')) return Presentation
  if (st.includes('pdf') || st.includes('docx') || st.includes('txt') || st.includes('document')) return FileText
  if (st.includes('image') || st.includes('png') || st.includes('jpg')) return FileImage
  if (st.includes('video') || st.includes('mp4')) return Video
  if (st.includes('audio') || st.includes('mp3') || st.includes('wav')) return AudioLines
  if (st.includes('postgres') || st.includes('sql') || st.includes('mysql')) return Server
  if (st.includes('rest') || st.includes('api')) return Globe
  if (st.includes('erp') || st.includes('crm')) return Cloud
  if (st.includes('snapshot')) return HardDrive
  return Database
}

export function DataSourceNode({
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
  const Icon = pickSourceIcon(node.sub_type)
  const records = node.metadata.record_count
  const bytes = node.metadata.file_size_bytes ?? node.metadata.data_size_bytes
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
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: node.status === 'failed' ? '#DC2626' : '#2563EB' }}
      />
      <div className="flex items-start justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg border flex-shrink-0"
            style={{
              background: 'var(--primary-soft)',
              borderColor: 'var(--primary-border)',
              color: '#2563EB',
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
        <span className="tabular-nums truncate">
          {records != null ? `${Number(records).toLocaleString()} rows` : formatBytesCompact(bytes)}
        </span>
        <span className="truncate font-mono">{node.owner}</span>
      </div>
    </div>
  )
}

