import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Square } from 'lucide-react'
import {
  getPipelineRunEvents,
  listPipelineRuns,
  type LineagePipeline,
  type PipelineEventItem,
} from '../../api'
import { Button, Pill } from '../../ui'

interface DataFlowPlaybackControlsProps {
  pipelines: LineagePipeline[]
  selectedPipelineId?: string
  reduceMotion: boolean
  onPlaybackFrame: (frame: {
    activeEvent: PipelineEventItem | null
    stepIndex: number
    totalSteps: number
    visitedNodeIds: string[]
    activeNodeId: string | null
    activeEdgeIds: string[]
  } | null) => void
}

export function DataFlowPlaybackControls({
  pipelines,
  selectedPipelineId,
  reduceMotion,
  onPlaybackFrame,
}: DataFlowPlaybackControlsProps) {
  const pickDefaultPipeline = (list: LineagePipeline[]) =>
    list.find((p) => p.pipeline_type !== 'decision_intelligence')?.id || list[0]?.id || ''

  const [pipelineId, setPipelineId] = useState<string>(selectedPipelineId || pickDefaultPipeline(pipelines))
  const [runId, setRunId] = useState<string>('')
  const [stepIdx, setStepIdx] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1)

  useEffect(() => {
    if (selectedPipelineId && selectedPipelineId !== pipelineId) {
      setPipelineId(selectedPipelineId)
      setRunId('')
      setStepIdx(-1)
      setIsPlaying(false)
      onPlaybackFrame(null)
    } else if (!pipelineId && pipelines.length > 0) {
      setPipelineId(pickDefaultPipeline(pipelines))
    }
  }, [selectedPipelineId, pipelines, pipelineId, onPlaybackFrame])

  const runsQuery = useQuery({
    queryKey: ['lineage-pipeline-runs', pipelineId],
    queryFn: () => listPipelineRuns(pipelineId),
    enabled: Boolean(pipelineId),
  })

  const runs = runsQuery.data?.items || []
  useEffect(() => {
    if (runs.length > 0 && (!runId || !runs.some((r) => r.id === runId))) {
      setRunId(runs[0].id)
      setStepIdx(-1)
      setIsPlaying(false)
    }
  }, [runs, runId])

  const eventsQuery = useQuery({
    queryKey: ['lineage-run-events', runId],
    queryFn: () => getPipelineRunEvents(runId),
    enabled: Boolean(runId),
  })

  const events = eventsQuery.data?.items || []

  useEffect(() => {
    if (stepIdx < 0 || !events.length) {
      onPlaybackFrame(null)
      return
    }
    const clampedIdx = Math.min(stepIdx, events.length - 1)
    const active = events[clampedIdx]
    const visited = events
      .slice(0, clampedIdx + 1)
      .map((ev) => ev.node_id)
      .filter((id): id is string => Boolean(id))

    onPlaybackFrame({
      activeEvent: active,
      stepIndex: clampedIdx,
      totalSteps: events.length,
      visitedNodeIds: Array.from(new Set(visited)),
      activeNodeId: active.node_id || null,
      activeEdgeIds: active.incoming_edge_ids || [],
    })
  }, [stepIdx, events, onPlaybackFrame])

  useEffect(() => {
    if (!isPlaying || events.length === 0) return
    const intervalMs = Math.round(1250 / speed)
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      setStepIdx((prev) => {
        const next = prev + 1
        if (next >= events.length) {
          setIsPlaying(false)
          return events.length - 1
        }
        return next
      })
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [isPlaying, events.length, speed])

  const handlePlay = () => {
    if (!events.length) return
    if (stepIdx < 0 || stepIdx >= events.length - 1) {
      setStepIdx(0)
    }
    setIsPlaying(true)
  }

  const handleReplay = () => {
    if (!events.length) return
    setStepIdx(0)
    setIsPlaying(true)
  }

  const handleStepForward = () => {
    if (!events.length) return
    setIsPlaying(false)
    setStepIdx((prev) => Math.min(events.length - 1, prev + 1))
  }

  const handleStepBack = () => {
    if (!events.length) return
    setIsPlaying(false)
    setStepIdx((prev) => Math.max(0, prev <= 0 ? 0 : prev - 1))
  }

  const handleReset = () => {
    setIsPlaying(false)
    setStepIdx(-1)
    onPlaybackFrame(null)
  }

  const currentEvent = stepIdx >= 0 && stepIdx < events.length ? events[stepIdx] : null

  return (
    <div
      className="dp-surface px-4 py-3 flex flex-col gap-2.5"
      aria-label="Historical Data Flow Playback"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span className="text-xs font-bold" style={{ color: 'var(--heading)' }}>
            Historical Data Flow Playback
          </span>
          <select
            aria-label="Select playback pipeline"
            className="dp-select text-xs max-w-[230px]"
            value={pipelineId}
            onChange={(e) => {
              setPipelineId(e.target.value)
              setRunId('')
              setStepIdx(-1)
              setIsPlaying(false)
            }}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Select playback run"
            className="dp-select text-xs max-w-[200px]"
            value={runId}
            onChange={(e) => {
              setRunId(e.target.value)
              setStepIdx(-1)
              setIsPlaying(false)
            }}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                Run {r.id.slice(0, 10)} · {r.status}
              </option>
            ))}
          </select>

          <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {events.length ? `Step ${Math.max(0, stepIdx + 1)} / ${events.length}` : 'No recorded events'}
          </span>
          {reduceMotion && <Pill tone="warning">Reduce Motion On</Pill>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isPlaying ? (
            <Button size="sm" variant="primary" onClick={() => setIsPlaying(false)}>
              <Pause size={13} />
              Pause
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={!events.length} onClick={handlePlay}>
              <Play size={13} />
              Play
            </Button>
          )}
          <Button size="sm" disabled={!events.length} onClick={handleReplay}>
            <RotateCcw size={13} />
            Replay
          </Button>
          <Button size="sm" disabled={!events.length || stepIdx <= 0} onClick={handleStepBack}>
            <SkipBack size={13} />
            Step Backward
          </Button>
          <Button size="sm" disabled={!events.length || stepIdx >= events.length - 1} onClick={handleStepForward}>
            <SkipForward size={13} />
            Step Forward
          </Button>

          <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-strong)' }}>
            {([0.5, 1, 2] as const).map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setSpeed(rate)}
                style={{
                  background: speed === rate ? 'var(--primary-soft)' : 'var(--surface)',
                  color: speed === rate ? 'var(--primary-text)' : 'var(--text-secondary)',
                }}
                className="px-2 py-1 text-[11px] font-semibold"
              >
                {rate}x
              </button>
            ))}
          </div>

          <Button size="sm" disabled={stepIdx < 0 && !isPlaying} onClick={handleReset}>
            <Square size={12} />
            Reset Flow
          </Button>
        </div>
      </div>

      {currentEvent && (
        <div
          className="rounded-lg border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
          style={{
            background: currentEvent.status === 'failed' ? 'var(--danger-bg)' : 'var(--orange-bg)',
            borderColor: currentEvent.status === 'failed' ? 'var(--danger-border)' : 'var(--orange-border)',
            color: 'var(--heading)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Pill tone={currentEvent.status === 'failed' ? 'danger' : 'high'}>
              Step #{currentEvent.step_order}: {currentEvent.event_type}
            </Pill>
            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
              {currentEvent.input_summary || ''}
              {currentEvent.output_summary ? ` -> ${currentEvent.output_summary}` : ''}
            </span>
          </div>
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {currentEvent.duration_ms != null ? `${currentEvent.duration_ms} ms` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
