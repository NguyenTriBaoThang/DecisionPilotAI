import { useState } from 'react'
import { AlertTriangle, Check, ShieldCheck, Sparkles } from 'lucide-react'
import { decimal, integer, moneyCompact, type Options, type Scenario } from '../../../../api'
import { Button } from '../../../../ui'

interface InventoryScenarioTabProps {
  options: Options
  onSimulateInventory: (params: {
    product: string
    orderQuantities: number[]
    incomingStock: number
    arrivalDay: number
    safetyStock?: number
    horizon: number
    objective: string
  }) => void
  isLoading: boolean
  scenarioData?: Scenario | null
}

export function InventoryScenarioTab({
  options,
  onSimulateInventory,
  isLoading,
  scenarioData,
}: InventoryScenarioTabProps) {
  const physicalProducts = options.products.filter((p) => p.is_physical)
  const defaultProduct =
    physicalProducts.find((p) => p.product_name === 'SmartDesk Mini')?.product_id ||
    physicalProducts[0]?.product_id ||
    'P001'

  const [productId, setProductId] = useState(defaultProduct)
  const [reorderQty, setReorderQty] = useState(150)
  const [incomingStock, setIncomingStock] = useState(0)
  const [arrivalDay, setArrivalDay] = useState(14)
  const [horizon, setHorizon] = useState(30)

  const handleRun = () => {
    const quantities = [0, reorderQty, reorderQty * 2]
    onSimulateInventory({
      product: productId,
      orderQuantities: quantities,
      incomingStock,
      arrivalDay,
      horizon,
      objective: 'stockout',
    })
  }

  const recommended = scenarioData?.recommended

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <label className="field">
          <span className="text-slate-400 font-semibold text-[11px] uppercase">Physical SKU</span>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-xl border border-indigo-500/20 bg-[#0c1224] px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-indigo-400"
          >
            {physicalProducts.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_name} ({p.category})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="text-slate-400 font-semibold text-[11px] uppercase">Lead-Time Arrival Day</span>
          <input
            type="number"
            min={1}
            max={90}
            value={arrivalDay}
            onChange={(e) => setArrivalDay(Number(e.target.value))}
            className="w-full rounded-xl border border-indigo-500/20 bg-[#0c1224] px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-indigo-400"
          />
        </label>
      </div>

      {/* Reorder Quantity Interactive Slider */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-semibold uppercase text-[11px]">Proposed Reorder Batch:</span>
          <span className="text-sm font-black text-emerald-400 font-mono">{reorderQty} Units</span>
        </div>
        <input
          type="range"
          min={0}
          max={500}
          step={25}
          value={reorderQty}
          onChange={(e) => setReorderQty(Number(e.target.value))}
          className="w-full accent-emerald-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>0 (No replenishment)</span>
          <span>100</span>
          <span>250</span>
          <span>500 Units</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-slate-400">Enforces supplier lead-time physical constraint</span>
        <Button
          className="primary px-4 py-2 text-xs flex items-center gap-2"
          onClick={handleRun}
          disabled={isLoading}
        >
          <ShieldCheck size={14} className="text-emerald-300" />
          <span>{isLoading ? 'Simulating Stock…' : 'Simulate Stockout Risk'}</span>
        </Button>
      </div>

      {/* Simulation Outcome */}
      {recommended && (
        <div className="pt-2 space-y-2.5 border-t border-indigo-500/10">
          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-2.5 text-xs">
            <Check size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold text-white block">Recommended Action: {String(recommended.name)}</span>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Fulfillment capacity: <strong className="text-emerald-400 font-mono">{decimal(Number(recommended.fulfilled))}</strong> units.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Simulated Demand</span>
              <strong className="text-sm font-mono text-white">{decimal(Number(recommended.demand))} units</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Unfulfilled Stockouts</span>
              <strong className={`text-sm font-mono ${Number(recommended.risk) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {Number(recommended.risk) > 0 ? `${recommended.risk} units risk` : 'Zero Stockouts'}
              </strong>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase">Protected Profit</span>
              <strong className="text-sm font-mono text-cyan-300">{moneyCompact(Number(recommended.profit))}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

