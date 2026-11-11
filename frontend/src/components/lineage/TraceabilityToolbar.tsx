import {
  Activity,
  ArrowDownRight,
  ArrowUpLeft,
  Download,
  FileJson,
  FilterX,
  Maximize2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Search,
  Tag,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { LineageGraphFilters, LineageGraphResponse } from '../../api'
import { Button } from '../../ui'

interface TraceabilityToolbarProps {
  filters: LineageGraphFilters
  onFiltersChange: (next: LineageGraphFilters) => void
  facets?: LineageGraphResponse['facets']
  pipelines?: LineageGraphResponse['pipelines']
  matchCount: number
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToScreen: () => void
  onResetLayout: () => void
  flowEnabled: boolean
  onToggleFlow: () => void
  reduceMotion: boolean
  onToggleReduceMotion: () => void
  showLabels: boolean
  onToggleLabels: () => void
  selectedNodeId: string | null
  activeTraceDirection: 'upstream' | 'downstream' | 'both' | null
  onTraceUpstream: () => void
  onTraceDownstream: () => void
  onClearFocus: () => void
  onExportJson: () => void
  onExportSvg: () => void
  onJumpNextMatch: () => void
}

export function TraceabilityToolbar({
  filters,
  onFiltersChange,
  facets,
  pipelines = [],
  matchCount,
  zoom,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onResetLayout,
  flowEnabled,
  onToggleFlow,
  reduceMotion,
  onToggleReduceMotion,
  showLabels,
  onToggleLabels,
  selectedNodeId,
  activeTraceDirection,
  onTraceUpstream,
  onTraceDownstream,
  onClearFocus,
  onExportJson,
  onExportSvg,
  onJumpNextMatch,
}: TraceabilityToolbarProps) {
  const hasFilters = Boolean(
    filters.search ||
      filters.node_type ||
      filters.status ||
      filters.pipeline_id ||
      filters.source_id ||
      filters.model ||
      filters.owner ||
      filters.date_from ||
      filters.date_to
  )

  return (
    <div
      className="dp-surface p-3.5 space-y-3"
      aria-label="Traceability controls and filters"
    >
      {/* Row 1: Search + Canvas View + Flow Controls + Export */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={filters.search || ''}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onJumpNextMatch()
              }}
              aria-label="Search lineage nodes"
              placeholder="Search node name, file, model, pipeline ID, node ID…"
              className="dp-input pl-8 pr-3 text-xs"
            />
          </div>
          {filters.search && (
            <Button size="sm" onClick={onJumpNextMatch} title="Focus next matching node">
              {matchCount} match{matchCount === 1 ? '' : 'es'}
            </Button>
          )}
        </div>

        {/* Zoom / Layout / Flow / Export Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
            <ZoomOut size={13} />
          </Button>
          <span
            className="px-2 text-[11px] font-mono font-semibold tabular-nums"
            style={{ color: 'var(--heading)' }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <Button size="sm" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
            <ZoomIn size={13} />
          </Button>
          <Button size="sm" onClick={onFitToScreen} title="Fit to screen">
            <Maximize2 size={13} />
            Fit to screen
          </Button>
          <Button size="sm" onClick={onResetLayout} title="Reset layout">
            <RotateCcw size={13} />
            Reset layout
          </Button>

          <span className="h-5 w-px mx-0.5" style={{ background: 'var(--border)' }} />

          <Button
            size="sm"
            variant={flowEnabled && !reduceMotion ? 'primary' : 'default'}
            onClick={onToggleFlow}
            aria-pressed={flowEnabled}
          >
            {flowEnabled ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
            Animated Flow
          </Button>
          <Button
            size="sm"
            variant={reduceMotion ? 'primary' : 'default'}
            onClick={onToggleReduceMotion}
            aria-pressed={reduceMotion}
          >
            <Activity size={13} />
            Reduce Motion
          </Button>
          <Button
            size="sm"
            variant={showLabels ? 'primary' : 'default'}
            onClick={onToggleLabels}
            aria-pressed={showLabels}
          >
            <Tag size={13} />
            Labels
          </Button>

          <span className="h-5 w-px mx-0.5" style={{ background: 'var(--border)' }} />

          <Button
            size="sm"
            disabled={!selectedNodeId}
            variant={activeTraceDirection === 'upstream' ? 'primary' : 'default'}
            onClick={onTraceUpstream}
            title="Show upstream dependencies for selected node"
          >
            <ArrowUpLeft size={13} />
            Show Upstream
          </Button>
          <Button
            size="sm"
            disabled={!selectedNodeId}
            variant={activeTraceDirection === 'downstream' ? 'primary' : 'default'}
            onClick={onTraceDownstream}
            title="Show downstream impact for selected node"
          >
            <ArrowDownRight size={13} />
            Show Downstream
          </Button>
          {(activeTraceDirection || selectedNodeId) && (
            <Button size="sm" onClick={onClearFocus}>
              Clear Focus
            </Button>
          )}

          <span className="h-5 w-px mx-0.5" style={{ background: 'var(--border)' }} />

          <Button size="sm" onClick={onExportJson}>
            <FileJson size={13} />
            Export JSON
          </Button>
          <Button size="sm" onClick={onExportSvg}>
            <Download size={13} />
            Export SVG
          </Button>
        </div>
      </div>

      {/* Row 2: Multi-Dimension Facet Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <label className="dp-field">
          <span className="dp-field-label">Node Type</span>
          <select
            className="dp-select text-xs"
            value={filters.node_type || ''}
            onChange={(e) => onFiltersChange({ ...filters, node_type: e.target.value || undefined })}
          >
            <option value="">All types</option>
            <option value="data_source">Data Source</option>
            <option value="processing">Processing</option>
            <option value="storage">Storage</option>
            <option value="ai_model">AI Model</option>
            <option value="business_intelligence">BI Module</option>
            <option value="final_output">Final Output</option>
          </select>
        </label>

        <label className="dp-field">
          <span className="dp-field-label">Execution Status</span>
          <select
            className="dp-select text-xs"
            value={filters.status || ''}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value || undefined })}
          >
            <option value="">All statuses</option>
            <option value="completed">completed</option>
            <option value="processing">processing</option>
            <option value="warning">warning</option>
            <option value="failed">failed</option>
            <option value="pending">pending</option>
          </select>
        </label>

        <label className="dp-field">
          <span className="dp-field-label">Pipeline</span>
          <select
            className="dp-select text-xs"
            value={filters.pipeline_id || ''}
            onChange={(e) => onFiltersChange({ ...filters, pipeline_id: e.target.value || undefined })}
          >
            <option value="">All pipelines</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="dp-field">
          <span className="dp-field-label">Data Source</span>
          <select
            className="dp-select text-xs"
            value={filters.source_id || ''}
            onChange={(e) => onFiltersChange({ ...filters, source_id: e.target.value || undefined })}
          >
            <option value="">All sources</option>
            {(facets?.sources || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="dp-field">
          <span className="dp-field-label">AI Model</span>
          <select
            className="dp-select text-xs"
            value={filters.model || ''}
            onChange={(e) => onFiltersChange({ ...filters, model: e.target.value || undefined })}
          >
            <option value="">All models</option>
            {(facets?.models || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="dp-field">
          <span className="dp-field-label">Owner</span>
          <select
            className="dp-select text-xs"
            value={filters.owner || ''}
            onChange={(e) => onFiltersChange({ ...filters, owner: e.target.value || undefined })}
          >
            <option value="">All owners</option>
            {(facets?.owners || []).map((ow) => (
              <option key={ow} value={ow}>
                {ow}
              </option>
            ))}
          </select>
        </label>

        <label className="dp-field">
          <span className="dp-field-label">From Date</span>
          <input
            type="date"
            className="dp-input text-xs"
            value={filters.date_from || ''}
            onChange={(e) => onFiltersChange({ ...filters, date_from: e.target.value || undefined })}
          />
        </label>

        <div className="flex items-end gap-1.5">
          <label className="dp-field flex-1">
            <span className="dp-field-label">To Date</span>
            <input
              type="date"
              className="dp-input text-xs"
              value={filters.date_to || ''}
              onChange={(e) => onFiltersChange({ ...filters, date_to: e.target.value || undefined })}
            />
          </label>
          {hasFilters && (
            <Button
              size="sm"
              onClick={() => onFiltersChange({})}
              title="Reset all filters"
              aria-label="Clear all filters"
            >
              <FilterX size={13} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

