import { useState } from 'react'
import { ArrowRight, Check, SlidersHorizontal, Sparkles } from 'lucide-react'
import { decimal, moneyCompact, percent, type Options, type Scenario } from '../../../../api'
import { Button } from '../../../../ui'

interface PricingScenarioTabProps {
  options: Options
  onSimulatePrice: (params: {
    product: string
    discounts: number[]
    elasticity?: number
    objective: string
    horizon: number
  }) => void
  isLoading: boolean
  scenarioData?: Scenario | null
}

export function PricingScenarioTab({
  options,
  onSimulatePrice,
  isLoading,
  scenarioData,
}: PricingScenarioTabProps) {
  const defaultProduct =
    options.products.find((p) => p.product_name === 'SmartDesk Mini')?.product_id ||
    options.products[0]?.product_id ||
    'P001'

  const [productId, setProductId] = useState(defaultProduct)
  const [discountPct, setDiscountPct] = useState(5)
  const [objective, setObjective] = useState<'profit' | 'revenue' | 'balanced'>('profit')
  const [horizon, setHorizon] = useState(30)
  const [customElasticity, setCustomElasticity] = useState<string>('')

  const handleRun = () => {
    const discounts = [0, discountPct / 100, Math.min(0.2, (discountPct + 5) / 100)]
    const elasticityNum = customElasticity ? Number(customElasticity) : undefined
    onSimulatePrice({
      product: productId,
      discounts,
      elasticity: elasticityNum,
      objective,
      horizon,
    })
  }

  const recommended = scenarioData?.recommended
  const alternatives = scenarioData?.alternatives || []

  return (
    <div className="space-y-4">
      {/* Interactive Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <label className="field">
          <span className="text-slate-400 font-semibold text-[11px] uppercase">Product SKU</span>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-xl border border-indigo-500/20 bg-[#0c1224] px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-indigo-400"
          >
            {options.products.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_name} ({p.category})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="text-slate-400 font-semibold text-[11px] uppercase">Business Objective</span>
          <select
            value={objective}
            onChange={(e) => setObjective(e.target.value as any)}
            className="w-full rounded-xl border border-indigo-500/20 bg-[#0c1224] px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-indigo-400"
          >
            <option value="profit">Maximize Contribution Profit</option>
            <option value="revenue">Maximize Revenue</option>
            <option value="balanced">Balance Risk & Return</option>
          </select>
        </label>
      </div>

      {/* Discount Rate Interactive Slider (0% - 20%) */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-semibold uppercase text-[11px]">Proposed Discount Rate:</span>
          <span className="text-sm font-black text-cyan-400 font-mono">{discountPct}% Discount</span>
        </div>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={discountPct}
          onChange={(e) => setDiscountPct(Number(e.target.value))}
          className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>0% (Full Price)</span>
          <span>5%</span>
          <span>10%</span>
          <span>15%</span>
          <span>20% (Max Promo)</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Horizon:</span>
          <button
            type="button"
            onClick={() => setHorizon(7)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              horizon === 7 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            7 Days
          </button>
          <button
            type="button"
            onClick={() => setHorizon(30)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              horizon === 30 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            30 Days
          </button>
        </div>

        <Button
          className="primary px-4 py-2 text-xs flex items-center gap-2"
          onClick={handleRun}
          disabled={isLoading}
        >
          <Sparkles size={14} />
          <span>{isLoading ? 'Simulating…' : 'Simulate Price Impact'}</span>
        </Button>
      </div>

      {/* Dynamic Simulation Outcome Cards */}
      {recommended && (
        <div className="pt-2 space-y-2.5 border-t border-indigo-500/10">
          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-2.5 text-xs">
            <Check size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold text-white block">Optimal Strategy: {String(recommended.name)}</span>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Expected Profit Delta: <strong className="text-emerald-400 font-mono">+{moneyCompact(Number(recommended.profit_delta))}</strong> vs baseline.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Simulated Demand</span>
              <strong className="text-sm font-mono text-white">{decimal(Number(recommended.demand))} units</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Projected Revenue</span>
              <strong className="text-sm font-mono text-cyan-300">{moneyCompact(Number(recommended.revenue))}</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Contribution Profit</span>
              <strong className="text-sm font-mono text-emerald-400">{moneyCompact(Number(recommended.profit))}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

