import { useState } from 'react'
import { ChevronDown, ChevronRight, Clock, History } from 'lucide-react'
import type { PipelineEventItem } from '../../api'
import { Pill } from '../../ui'
import { formatShortTimestamp } from './types'

interface TraceabilityTimelineProps {
  events: PipelineEventItem[]
  activePlaybackEventId?: string | null
  selectedNodeId?: string | null
  onSelectEvent: (event: PipelineEventItem) => void
}

export function TraceabilityTimeline({
  events,
  activePlaybackEventId,
  selectedNodeId,
  onSelectEvent,
}: TraceabilityTimelineProps) {
  const [open, setOpen] = useState(true)

  return (
    <section
      aria-label="Traceability Timeline"
      data-testid="traceability-timeline"
      className="dp-surface overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 border-b hover:bg-[var(--surface-muted)] transition-colors"
        style={{ borderColor: open ? 'var(--border)' : 'transparent' }}
      >
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--heading)' }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <History size={15} style={{ color: 'var(--primary)' }} />
          <span>Traceability Timeline</span>
          <Pill tone="accent">{events.length} chronological events</Pill>
        </div>
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Click any event to focus &amp; inspect the corresponding node
        </span>
      </button>

      {open && (
        <div className="max-h-[260px] overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
          {events.length === 0 ? (
            <div className="p-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
              No pipeline execution events recorded for this workspace yet.
            </div>
          ) : (
            events.map((ev) => {
              const isPlayback = activePlaybackEventId === ev.id
              const isNodeSelected = Boolean(ev.node_id && selectedNodeId === ev.node_id)
              const stTone =
                ev.status === 'failed'
                  ? 'danger'
                  : ev.status === 'processing'
                  ? 'high'
                  : ev.status === 'warning'
                  ? 'warning'
                  : ev.status === 'completed'
                  ? 'success'
                  : 'muted'

              return (
                <button
                  key={ev.id}
                  type="button"
                  data-testid={`timeline-event-${ev.id}`}
                  onClick={() => onSelectEvent(ev)}
                  style={{
                    background: isPlayback
                      ? 'var(--orange-bg)'
                      : isNodeSelected
                      ? 'var(--primary-soft)'
                      : 'transparent',
                  }}
                  className="w-full px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-left text-xs hover:bg-[var(--surface-muted)] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      #{ev.step_order}
                    </span>
                    <span className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
                      {ev.event_type}
                    </span>
                    {(ev.input_summary || ev.output_summary) && (
                      <span className="truncate hidden md:inline" style={{ color: 'var(--text-secondary)' }}>
                        {ev.input_summary || ''}{ev.output_summary ? ` -> ${ev.output_summary}` : ''}
                      </span>
                    )}
                    {ev.error_message && (
                      <span className="truncate text-[11px] font-medium" style={{ color: 'var(--danger-text)' }}>
                        Error: {ev.error_message}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <Pill tone={stTone}>{ev.status}</Pill>
                    {ev.duration_ms != null && (
                      <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {ev.duration_ms} ms
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      <Clock size={11} />
                      {formatShortTimestamp(ev.timestamp)}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </section>
  )
}

