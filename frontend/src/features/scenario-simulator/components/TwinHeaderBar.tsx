import { Download, Layers, Maximize2, Minimize2, Moon, Play, Plus, Save, Sun } from 'lucide-react'
import type { TwinScenario, TwinSimulationRun } from '../../../api'
import { Button, Pill } from '../../../ui'

interface TwinHeaderBarProps {
  datasetTitle?: string
  currency?: string
  scenarios: TwinScenario[]
  activeScenario: TwinScenario | null
  activeRun: TwinSimulationRun | null
  horizon: 7 | 30 | 90
  onChangeScenario: (scenarioId: string) => void
  onChangeHorizon: (h: 7 | 30 | 90) => void
  onOpenNewScenario: () => void
  onSaveVariables: () => void
  onRunSimulation: () => void
  onExport: (fmt: 'json' | 'csv') => void
  dark3D: boolean
  onToggleDark3D: () => void
  force2D: boolean
  onToggleForce2D: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  isSaving: boolean
  isRunning: boolean
  canEdit: boolean
}

const RUN_TONE: Record<string, 'success' | 'info' | 'warning' | 'critical' | 'muted'> = {
  completed: 'success',
  running: 'info',
  queued: 'info',
  preparing: 'info',
  failed: 'critical',
  cancelled: 'warning',
}

export function TwinHeaderBar({
  datasetTitle,
  currency,
  scenarios,
  activeScenario,
  activeRun,
  horizon,
  onChangeScenario,
  onChangeHorizon,
  onOpenNewScenario,
  onSaveVariables,
  onRunSimulation,
  onExport,
  dark3D,
  onToggleDark3D,
  force2D,
  onToggleForce2D,
  isFullscreen,
  onToggleFullscreen,
  isSaving,
  isRunning,
  canEdit,
}: TwinHeaderBarProps) {
  const statusLabel = activeRun ? activeRun.status.toUpperCase() : 'READY'
  const statusTone = activeRun ? RUN_TONE[activeRun.status] || 'muted' : 'muted'

  return (
    <div
      className="dp-surface p-3.5 space-y-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
              DecisionPilot AI · Enterprise Digital Twin
            </span>
            {datasetTitle && <Pill tone="info">{datasetTitle}</Pill>}
            {currency && <Pill tone="muted">{currency}</Pill>}
            <Pill tone={statusTone} data-testid="twin-run-status-pill">
              RUN: {statusLabel}
            </Pill>
          </div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--heading)' }}>
            Interactive 3D Business Scenario Simulator
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleForce2D}
            aria-label={force2D ? 'Switch to 3D Canvas' : 'Switch to 2D Canvas'}
          >
            <Layers size={13} />
            <span>{force2D ? '2D Architecture' : '3D WebGL'}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleDark3D}
            aria-label={dark3D ? 'Light 3D Canvas' : 'Dark 3D Canvas'}
          >
            {dark3D ? <Sun size={13} /> : <Moon size={13} />}
            <span>{dark3D ? 'Light Canvas' : 'Dark 3D'}</span>
          </Button>
          {activeRun?.status === 'completed' && (
            <>
              <Button size="sm" variant="outline" onClick={() => onExport('json')}>
                <Download size={13} />
                <span>Export JSON</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => onExport('csv')}>
                <Download size={13} />
                <span>Export CSV</span>
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={onToggleFullscreen}>
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </Button>
        </div>
      </div>

      {/* Scenario Switcher & Execution Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Active Scenario:
            </span>
            <select
              aria-label="Active Digital Twin Scenario"
              value={activeScenario?.id || ''}
              onChange={(e) => onChangeScenario(e.target.value)}
              className="dp-select py-1 text-xs min-w-[210px]"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.is_baseline ? `[Baseline] ${s.name}` : `${s.name} (${s.scenario_type.replaceAll('_', ' ')})`}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                disabled={!canEdit || activeScenario?.is_baseline}
                onClick={() => onChangeHorizon(d)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-50"
                style={{
                  background: horizon === d ? 'var(--primary)' : 'transparent',
                  color: horizon === d ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={!canEdit} onClick={onOpenNewScenario}>
            <Plus size={13} />
            <span>New What-if Scenario</span>
          </Button>
          {activeScenario && !activeScenario.is_baseline && (
            <Button size="sm" variant="outline" disabled={!canEdit || isSaving} onClick={onSaveVariables}>
              <Save size={13} />
              <span>{isSaving ? 'Saving…' : 'Save Assumptions'}</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={!canEdit || !activeScenario || isRunning}
            onClick={onRunSimulation}
            data-testid="twin-run-simulation-btn"
          >
            <Play size={13} />
            <span>{isRunning ? 'Running Simulation…' : 'Run Simulation'}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
