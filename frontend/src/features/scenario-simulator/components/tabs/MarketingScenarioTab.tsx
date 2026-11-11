import { useState } from 'react'
import { Check, Zap } from 'lucide-react'
import { decimal, moneyCompact, type Options, type Scenario } from '../../../../api'
import { Button } from '../../../../ui'

interface MarketingScenarioTabProps {
  options: Options
  onSimulateMarketing: (params: {
    channel: string
    changes: number[]
    responseExponent?: number
    objective: string
    horizon: number
  }) => void
  isLoading: boolean
  scenarioData?: Scenario | null
  /** Inputs handed over from a recommendation card; used as-is until the user moves the slider or channel. */
  preset?: { channel: string; pct: number; changes: number[] }
}

export function MarketingScenarioTab({
  options,
  onSimulateMarketing,
  isLoading,
  scenarioData,
  preset,
}: MarketingScenarioTabProps) {
  const defaultChannel = options.marketing_channels[0] || 'Facebook Ads'
  const [channel, setChannel] = useState(preset?.channel ?? defaultChannel)
  const [budgetChangePct, setBudgetChangePct] = useState(preset?.pct ?? 20)
  const [objective, setObjective] = useState<'profit' | 'revenue' | 'balanced'>('profit')
  const [horizon] = useState(30)

  const handleRun = () => {
    const changes =
      preset && channel === preset.channel && budgetChangePct === preset.pct
        ? preset.changes
        : [
            Math.max(-0.5, (budgetChangePct - 20) / 100),
            budgetChangePct / 100,
            Math.min(1.0, (budgetChangePct + 30) / 100),
          ]
    onSimulateMarketing({
      channel,
      changes,
      objective,
      horizon,
    })
  }

  const recommended = scenarioData?.recommended

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 text-xs">
        <label className="dp-field">
          <span className="dp-field-label">Marketing Channel</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="dp-select">
            {options.marketing_channels.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </label>

        <label className="dp-field">
          <span className="dp-field-label">Optimization Target</span>
          <select
            value={objective}
            onChange={(e) => setObjective(e.target.value as 'profit' | 'revenue' | 'balanced')}
            className="dp-select"
          >
            <option value="profit">Maximize Attributed Profit</option>
            <option value="revenue">Maximize Attributed Revenue</option>
            <option value="balanced">Balance ROAS &amp; Volume</option>
          </select>
        </label>
      </div>

      {/* Budget Adjustment Slider */}
      <div
        className="rounded-lg border p-3.5 space-y-2"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Proposed Budget Adjustment:
          </span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--warning-text)' }}>
            {budgetChangePct >= 0 ? '+' : ''}
            {budgetChangePct}% Budget
          </span>
        </div>
        <input
          type="range"
          min={-50}
          max={100}
          step={5}
          value={budgetChangePct}
          onChange={(e) => setBudgetChangePct(Number(e.target.value))}
          className="w-full accent-[#D97706] cursor-pointer"
        />
        <div className="flex justify-between text-[10px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          <span>-50% (Cut)</span>
          <span>-20%</span>
          <span>Baseline (0%)</span>
          <span>+50%</span>
          <span>+100% (Scale)</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Diminishing returns model: Exponent α = 0.65
        </span>
        <Button variant="primary" onClick={handleRun} disabled={isLoading}>
          <Zap size={14} />
          <span>{isLoading ? 'Calculating ROAS…' : 'Simulate Budget Shift'}</span>
        </Button>
      </div>

      {recommended && (
        <div className="pt-3 space-y-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
          <div
            className="rounded-lg border p-3 flex items-start gap-2.5 text-xs"
            style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}
          >
            <Check size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--warning)' }} />
            <div>
              <span className="font-semibold block" style={{ color: 'var(--heading)' }}>
                Recommended Reallocation: {String(recommended.name)}
              </span>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text)' }}>
                Expected Profit Delta:{' '}
                <strong className="tabular-nums font-bold" style={{ color: 'var(--success-text)' }}>
                  +{moneyCompact(Number(recommended.profit_delta))}
                </strong>{' '}
                vs current spend.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
              <span className="block text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>
                Orders
              </span>
              <strong className="text-xs font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                {decimal(Number(recommended.demand))}
              </strong>
            </div>
            <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
              <span className="block text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>
                Revenue
              </span>
              <strong className="text-xs font-bold tabular-nums" style={{ color: 'var(--primary-text)' }}>
                {moneyCompact(Number(recommended.revenue))}
              </strong>
            </div>
            <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
              <span className="block text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>
                Net Profit
              </span>
              <strong className="text-xs font-bold tabular-nums" style={{ color: 'var(--success-text)' }}>
                {moneyCompact(Number(recommended.profit))}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
