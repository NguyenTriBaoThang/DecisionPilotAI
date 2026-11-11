import type { LineageEdge, LineageNode, LineageNodeType, LineageStatus } from '../../api'

export const NODE_WIDTH = 248
export const NODE_HEIGHT = 104
export const COL_GAP = 62
export const ROW_GAP = 24
export const CANVAS_PAD_X = 36
export const CANVAS_PAD_Y = 58

export const LAYER_COLUMNS: {
  order: number
  type: LineageNodeType
  label: string
  shortLabel: string
  accent: string
}[] = [
  { order: 0, type: 'data_source', label: '1. Data Sources', shortLabel: 'Sources', accent: '#2563EB' },
  { order: 1, type: 'processing', label: '2. Data Processing', shortLabel: 'Processing', accent: '#EA580C' },
  { order: 2, type: 'storage', label: '3. Storage Layer', shortLabel: 'Storage', accent: '#0284C7' },
  { order: 3, type: 'ai_model', label: '4. AI & Analytics Models', shortLabel: 'AI Models', accent: '#7C3AED' },
  { order: 4, type: 'business_intelligence', label: '5. Business Intelligence', shortLabel: 'BI Modules', accent: '#2563EB' },
  { order: 5, type: 'final_output', label: '6. Final Outputs & Insights', shortLabel: 'Insights', accent: '#16A34A' },
]

export function getStatusTheme(status: LineageStatus | string): {
  stroke: string
  badgeBg: string
  badgeBorder: string
  badgeText: string
  label: string
  dot: string
} {
  const s = (status || 'completed').toLowerCase()
  if (s === 'processing' || s === 'running' || s === 'queued') {
    return {
      stroke: '#EA580C',
      badgeBg: 'var(--orange-bg)',
      badgeBorder: 'var(--orange-border)',
      badgeText: 'var(--orange-text)',
      label: 'processing',
      dot: '#EA580C',
    }
  }
  if (s === 'failed' || s === 'error') {
    return {
      stroke: '#DC2626',
      badgeBg: 'var(--danger-bg)',
      badgeBorder: 'var(--danger-border)',
      badgeText: 'var(--danger-text)',
      label: 'failed',
      dot: '#DC2626',
    }
  }
  if (s === 'warning') {
    return {
      stroke: '#D97706',
      badgeBg: 'var(--warning-bg)',
      badgeBorder: 'var(--warning-border)',
      badgeText: 'var(--warning-text)',
      label: 'warning',
      dot: '#D97706',
    }
  }
  if (s === 'pending' || s === 'uploaded') {
    return {
      stroke: '#94A3B8',
      badgeBg: 'var(--surface-subtle)',
      badgeBorder: 'var(--border)',
      badgeText: 'var(--text-secondary)',
      label: 'pending',
      dot: '#94A3B8',
    }
  }
  if (s === 'normal') {
    return {
      stroke: '#2563EB',
      badgeBg: 'var(--primary-soft)',
      badgeBorder: 'var(--primary-border)',
      badgeText: 'var(--primary-text)',
      label: 'normal',
      dot: '#2563EB',
    }
  }
  return {
    stroke: '#16A34A',
    badgeBg: 'var(--success-bg)',
    badgeBorder: 'var(--success-border)',
    badgeText: 'var(--success-text)',
    label: 'completed',
    dot: '#16A34A',
  }
}

export function formatBytesCompact(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatShortTimestamp(iso?: string | null): string {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export type NodePosition = { x: number; y: number }

export type TraceHighlightState = {
  selectedNodeId: string | null
  selectedEdgeId: string | null
  tracedNodeIds: Set<string> | null
  tracedEdgeIds: Set<string> | null
  traceDirection: 'upstream' | 'downstream' | 'both' | null
  matchedNodeIds: Set<string> | null
  playbackNodeId: string | null
  playbackEdgeIds: Set<string>
  playbackVisitedNodeIds: Set<string>
}

export interface NodeCardProps {
  node: LineageNode
  position: NodePosition
  isSelected: boolean
  isTraced: boolean
  isMatched: boolean
  isDimmed: boolean
  isPlaybackActive: boolean
  isPlaybackVisited: boolean
  onSelect: (node: LineageNode) => void
  onDoubleClick: (node: LineageNode) => void
  onDragStart: (e: React.PointerEvent, nodeId: string) => void
}

export type { LineageEdge, LineageNode }

