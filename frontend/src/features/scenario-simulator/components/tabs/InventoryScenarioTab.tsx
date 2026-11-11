import { useEffect, useMemo, useState } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import { decimal, moneyCompact, type Options, type Scenario } from '../../../../api'
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
  const physicalProducts = useMemo(() => options.products.filter((p) => p.is_physical), [options.products])
  const defaultProduct =
    physicalProducts.find((p) => p.product_name === 'SmartDesk Mini')?.product_id ||
    physicalProducts[0]?.product_id ||
    ''

  const [productId, setProductId] = useState(defaultProduct)
  const [reorderQty, setReorderQty] = useState(150)
  const [incomingStock, setIncomingStock] = useState(0)
  const [arrivalDay, setArrivalDay] = useState(14)
  const [horizon] = useState(30)

  useEffect(() => {
    if (!physicalProducts.some((p) => p.product_id === productId)) {
      setProductId(defaultProduct)
    }
  }, [physicalProducts, defaultProduct, productId])

  const handleRun = () => {
    if (!productId) return
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
      {physicalProducts.length === 0 && (
        <div
          className="rounded-lg border p-3 text-xs"
          style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--warning-text)' }}
        >
          No physical inventory SKUs are available in the active dataset. Map Inventory and Product fields during upload to simulate replenishment.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 text-xs">
        <label className="dp-field">
          <span className="dp-field-label">Physical SKU</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="dp-select" disabled={!physicalProducts.length}>
            {physicalProducts.length === 0 && <option value="">No physical SKUs available</option>}
            {physicalProducts.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_name} ({p.category})
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="dp-field">
            <span className="dp-field-label">Lead-Time Arrival Day</span>
            <input
              type="number"
              min={1}
              max={90}
              value={arrivalDay}
              onChange={(e) => setArrivalDay(Number(e.target.value))}
              className="dp-input"
            />
          </label>
          <label className="dp-field">
            <span className="dp-field-label">Incoming Stock</span>
            <input
              type="number"
              min={0}
              value={incomingStock}
              onChange={(e) => setIncomingStock(Number(e.target.value))}
              className="dp-input"
            />
          </label>
        </div>
      </div>

      {/* Reorder Quantity Slider */}
      <div
        className="rounded-lg border p-3.5 space-y-2"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
            Proposed Reorder Batch:
          </span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--success-text)' }}>
            {reorderQty} Units
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={500}
          step={25}
          value={reorderQty}
          onChange={(e) => setReorderQty(Number(e.target.value))}
          className="w-full accent-[#16A34A] cursor-pointer"
        />
        <div className="flex justify-between text-[10px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          <span>0 (No replenishment)</span>
          <span>100</span>
          <span>250</span>
          <span>500 Units</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Enforces supplier lead-time physical constraint
        </span>
        <Button variant="primary" onClick={handleRun} disabled={isLoading || !productId}>
          <ShieldCheck size={14} />
          <span>{isLoading ? 'Simulating Stock…' : 'Simulate Stockout Risk'}</span>
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
                Recommended Action: {String(recommended.name)}
              </span>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text)' }}>
                Fulfillment capacity:{' '}
                <strong className="tabular-nums font-bold" style={{ color: 'var(--success-text)' }}>
                  {decimal(Number(recommended.fulfilled))}
                </strong>{' '}
                units.
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
                Stockout Risk
              </span>
              <strong
                className="text-xs font-bold tabular-nums"
                style={{ color: Number(recommended.risk) > 0 ? 'var(--danger-text)' : 'var(--success-text)' }}
              >
                {Number(recommended.risk) > 0 ? `${recommended.risk} units` : 'Zero'}
              </strong>
            </div>
            <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
              <span className="block text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>
                Protected Profit
              </span>
              <strong className="text-xs font-bold tabular-nums" style={{ color: 'var(--primary-text)' }}>
                {moneyCompact(Number(recommended.profit))}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
