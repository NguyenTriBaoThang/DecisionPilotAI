import { useEffect, useState } from 'react'
import { Check, SlidersHorizontal } from 'lucide-react'
import { decimal, moneyCompact, type Options, type Scenario } from '../../../../api'
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
    ''

  const [productId, setProductId] = useState(defaultProduct)
  const [discountPct, setDiscountPct] = useState(5)
  const [objective, setObjective] = useState<'profit' | 'revenue' | 'balanced'>('profit')
  const [horizon, setHorizon] = useState(30)
  const [customElasticity, setCustomElasticity] = useState<string>('')

  useEffect(() => {
    if (!options.products.some((p) => p.product_id === productId)) {
      setProductId(defaultProduct)
    }
  }, [options.products, defaultProduct, productId])

  const handleRun = () => {
    if (!productId) return
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

  return (
    <div className="space-y-4">
      {options.products.length === 0 && (
        <div
          className="rounded-lg border p-3 text-xs"
          style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--warning-text)' }}
        >
          No product SKUs are present in the active dataset. Map a Product column during import to unlock SKU price elasticity simulation.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 text-xs">
        <label className="dp-field">
          <span className="dp-field-label">Product SKU</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="dp-select" disabled={!options.products.length}>
            {options.products.length === 0 && <option value="">No SKUs available</option>}
            {options.products.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_name} ({p.category})
              </option>
            ))}
          </select>
        </label>

        <label className="dp-field">
          <span className="dp-field-label">Business Objective</span>
          <select
            value={objective}
            onChange={(e) => setObjective(e.target.value as 'profit' | 'revenue' | 'balanced')}
            className="dp-select"
          >
            <option value="profit">Maximize Contribution Profit</option>
            <option value="revenue">Maximize Revenue</option>
            <option value="balanced">Balance Risk &amp; Return</option>
          </select>
        </label>
      </div>

      {/* Discount Rate Slider */}
      <div
        className="rounded-lg border p-3.5 space-y-2"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Proposed Discount Rate:
          </span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--primary-text)' }}>
            {discountPct}% Discount
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={discountPct}
          onChange={(e) => setDiscountPct(Number(e.target.value))}
          className="w-full accent-[#2563EB] cursor-pointer"
        />
        <div className="flex justify-between text-[10px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          <span>0% (Full Price)</span>
          <span>5%</span>
          <span>10%</span>
          <span>15%</span>
          <span>20% (Max Promo)</span>
        </div>
      </div>

      <label className="dp-field">
        <span className="dp-field-label">Price Elasticity Override (Optional)</span>
        <input
          type="number"
          step="0.1"
          min={-5}
          max={0}
          placeholder="Catalog default (-1.4 to -0.8)"
          value={customElasticity}
          onChange={(e) => setCustomElasticity(e.target.value)}
          className="dp-input"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Horizon:
          </span>
          {[7, 30].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={horizon === d ? 'primary' : 'outline'}
              onClick={() => setHorizon(d)}
            >
              {d} Days
            </Button>
          ))}
        </div>

        <Button variant="primary" onClick={handleRun} disabled={isLoading || !productId}>
          <SlidersHorizontal size={14} />
          <span>{isLoading ? 'Simulating…' : 'Simulate Price Impact'}</span>
        </Button>
      </div>

      {recommended && (
        <div className="pt-3 space-y-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
          <div
            className="rounded-lg border p-3 flex items-start gap-2.5 text-xs"
            style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}
          >
            <Check size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
            <div>
              <span className="font-semibold block" style={{ color: 'var(--heading)' }}>
                Optimal Strategy: {String(recommended.name)}
              </span>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text)' }}>
                Expected Profit Delta:{' '}
                <strong className="tabular-nums font-bold" style={{ color: 'var(--success-text)' }}>
                  +{moneyCompact(Number(recommended.profit_delta))}
                </strong>{' '}
                vs baseline.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
              <span className="block text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>
                Demand
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
                Profit
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
