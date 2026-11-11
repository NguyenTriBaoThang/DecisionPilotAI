import { Activity, Camera, GitCompare, Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react'
import type { TwinSimulationEvent } from '../../../api'
import { Button, Pill } from '../../../ui'

interface TwinBottomControlsProps {
  events: TwinSimulationEvent[]
  activeStepIndex: number
  onStepChange: (idx: number) => void
  isPlaying: boolean
  onTogglePlay: () => void
  onStop: () => void
  onReplay: () => void
  onReset: () => void
  playbackSpeed: number
  onChangeSpeed: (s: number) => void
  animateParticles: boolean
  onToggleParticles: () => void
  showBaselineFlow: boolean
  onToggleBaselineFlow: () => void
  reducedMotion: boolean
  onToggleReducedMotion: () => void
  cameraPreset: 'reset' | 'iso' | 'top' | 'focus_zone' | 'focus_flow'
  onChangeCameraPreset: (p: 'reset' | 'iso' | 'top' | 'focus_zone' | 'focus_flow') => void
  onOpenCompare: () => void
  scenarioCount: number
}

export function TwinBottomControls({
  events,
  activeStepIndex,
  onStepChange,
  isPlaying,
  onTogglePlay,
  onStop,
  onReplay,
  onReset,
  playbackSpeed,
  onChangeSpeed,
  animateParticles,
  onToggleParticles,
  showBaselineFlow,
  onToggleBaselineFlow,
  reducedMotion,
  onToggleReducedMotion,
  cameraPreset,
  onChangeCameraPreset,
  onOpenCompare,
  scenarioCount,
}: TwinBottomControlsProps) {
  const total = events.length
  const curEvt = activeStepIndex >= 0 && activeStepIndex < total ? events[activeStepIndex] : null

  return (
    <div
      className="dp-surface p-3 space-y-2.5 text-xs"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Playback Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant={isPlaying ? 'outline' : 'primary'} disabled={total === 0} onClick={onTogglePlay}>
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            <span>{isPlaying ? 'Pause' : 'Play Flow'}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={total === 0}
            onClick={() => onStepChange(activeStepIndex < total - 1 ? activeStepIndex + 1 : 0)}
            aria-label="Step Forward Flow"
          >
            <SkipForward size={13} />
            <span>Step</span>
          </Button>
          <Button size="sm" variant="outline" disabled={total === 0} onClick={onStop} aria-label="Stop Flow">
            <Square size={12} />
          </Button>
          <Button size="sm" variant="outline" disabled={total === 0} onClick={onReplay} aria-label="Replay Flow">
            <RotateCcw size={13} />
            <span>Replay</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset} aria-label="Reset View">
            <span>Reset</span>
          </Button>

          <select
            aria-label="Playback speed"
            value={playbackSpeed}
            onChange={(e) => onChangeSpeed(Number(e.target.value))}
            className="dp-select py-1 text-[11px]"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1.0x</option>
            <option value={2}>2.0x</option>
          </select>

          <Pill tone="info" data-testid="twin-step-counter">
            Step {activeStepIndex >= 0 ? activeStepIndex + 1 : 0} / {total}
          </Pill>
        </div>

        {/* Camera & Flow Mode Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <Camera size={12} />
            <select
              aria-label="Camera angle"
              value={cameraPreset}
              onChange={(e) => onChangeCameraPreset(e.target.value as typeof cameraPreset)}
              className="dp-select py-1 text-[11px]"
            >
              <option value="iso">Isometric Studio</option>
              <option value="top">Top Architectural</option>
              <option value="focus_zone">Focus Selected Zone</option>
              <option value="focus_flow">Focus AI Pipeline</option>
              <option value="reset">Reset Camera</option>
            </select>
          </label>

          <Button size="sm" variant={animateParticles ? 'primary' : 'outline'} onClick={onToggleParticles}>
            <Activity size={12} />
            <span>Particles</span>
          </Button>
          <Button size="sm" variant={showBaselineFlow ? 'primary' : 'outline'} onClick={onToggleBaselineFlow}>
            <span>Parallel Baseline</span>
          </Button>
          <Button size="sm" variant={reducedMotion ? 'primary' : 'ghost'} onClick={onToggleReducedMotion}>
            <span>{reducedMotion ? 'Reduced Motion On' : 'Low Perf'}</span>
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={scenarioCount < 2}
            onClick={onOpenCompare}
            data-testid="open-multi-compare-btn"
          >
            <GitCompare size={13} />
            <span>Compare Scenarios ({scenarioCount})</span>
          </Button>
        </div>
      </div>

      {/* Interactive Timeline Scrubber */}
      {total > 0 && (
        <div className="flex items-center gap-3 pt-1">
          <input
            type="range"
            aria-label="Simulation chronological timeline"
            min={-1}
            max={total - 1}
            value={activeStepIndex}
            onChange={(e) => onStepChange(Number(e.target.value))}
            className="flex-1 accent-[#2563EB] cursor-pointer"
          />
          <span className="text-[11px] font-medium truncate max-w-[280px]" style={{ color: 'var(--heading)' }}>
            {curEvt ? `${curEvt.event_type} (${curEvt.status})` : 'Overview: Full Pipeline Graph'}
          </span>
        </div>
      )}
    </div>
  )
}
