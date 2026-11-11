import { useState } from 'react'
import { Check, Sparkles, TrendingUp, Zap } from 'lucide-react'
import { decimal, moneyCompact, percent, type Options, type Scenario } from '../../../../api'
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
  const [horizon, setHorizon] = useState(30)

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
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <label className="field">
          <span className="text-slate-400 font-semibold text-[11px] uppercase">Marketing Channel</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full rounded-xl border border-indigo-500/20 bg-[#0c1224] px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-indigo-400"
          >
            {options.marketing_channels.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="text-slate-400 font-semibold text-[11px] uppercase">Optimization Target</span>
          <select
            value={objective}
            onChange={(e) => setObjective(e.target.value as any)}
            className="w-full rounded-xl border border-indigo-500/20 bg-[#0c1224] px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-indigo-400"
          >
            <option value="profit">Maximize Attributed Profit</option>
            <option value="revenue">Maximize Attributed Revenue</option>
            <option value="balanced">Balance ROAS & Volume</option>
          </select>
        </label>
      </div>

      {/* Budget Adjustment Interactive Slider (-50% to +100%) */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-semibold uppercase text-[11px]">Proposed Budget Adjustment:</span>
          <span className="text-sm font-black text-amber-400 font-mono">
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
          className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>-50% (Cut)</span>
          <span>-20%</span>
          <span>Baseline (0%)</span>
          <span>+50%</span>
          <span>+100% (Scale)</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-slate-400">Diminishing returns model: Exponent α = 0.65</span>
        <Button
          className="primary px-4 py-2 text-xs flex items-center gap-2"
          onClick={handleRun}
          disabled={isLoading}
        >
          <Zap size={14} className="text-amber-300" />
          <span>{isLoading ? 'Calculating ROAS…' : 'Simulate Budget Shift'}</span>
        </Button>
      </div>

      {/* Simulation Outcome */}
      {recommended && (
        <div className="pt-2 space-y-2.5 border-t border-indigo-500/10">
          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-start gap-2.5 text-xs">
            <Check size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold text-white block">Recommended Reallocation: {String(recommended.name)}</span>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Expected Profit Delta: <strong className="text-emerald-400 font-mono">+{moneyCompact(Number(recommended.profit_delta))}</strong> vs current spend.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Attributed Orders</span>
              <strong className="text-sm font-mono text-white">{decimal(Number(recommended.demand))} orders</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Attributed Revenue</span>
              <strong className="text-sm font-mono text-cyan-300">{moneyCompact(Number(recommended.revenue))}</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Net Marketing Profit</span>
              <strong className="text-sm font-mono text-emerald-400">{moneyCompact(Number(recommended.profit))}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

