import { useState, useMemo } from 'react'
import { Sliders, TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'

export function InteractiveSimulatorDemo() {
  const [priceDelta, setPriceDelta] = useState(-5) // -5% discount
  const [mktMultiplier, setMktMultiplier] = useState(1.2) // 1.2x spend
  const [inventoryBuffer, setInventoryBuffer] = useState(15) // 15 days

  // Baseline SKU: SmartDesk Mini (P001) catalog parameters
  const baseUnits = 180
  const basePrice = 2490000 // 2,490,000 VND list price
  const baseCogs = 1650000 // 1,650,000 VND unit cost
  const elasticity = -1.1 // Catalog price elasticity for P001
  const mktExponent = 0.65 // Default power diminishing-returns exponent

  const simulation = useMemo(() => {
    // 1. Price effect matches ai_service/scenario.py: max(0, 1 + elasticity * (new_price / base_price - 1))
    const priceFactor = Math.max(0.1, 1 + elasticity * (priceDelta / 100))
    // 2. Marketing uplift matches power response: ratio ** response_exponent
    const mktFactor = Math.pow(mktMultiplier, mktExponent)

    const simulatedUnits = Math.round(baseUnits * priceFactor * mktFactor)
    const simulatedPrice = Math.round(basePrice * (1 + priceDelta / 100))
    const simulatedRevenue = simulatedUnits * simulatedPrice
    const simulatedCogs = simulatedUnits * baseCogs
    const simulatedGrossProfit = simulatedRevenue - simulatedCogs

    const baseRevenue = baseUnits * basePrice
    const baseProfit = baseUnits * (basePrice - baseCogs)

    const revenueDeltaPct = ((simulatedRevenue - baseRevenue) / baseRevenue) * 100
    const profitDeltaPct = ((simulatedGrossProfit - baseProfit) / baseProfit) * 100

    // Stockout risk estimation vs available warehouse + safety buffer
    const stockAvailable = 250
    const effectiveBuffer = Math.max(20, stockAvailable - Math.max(0, 15 - inventoryBuffer) * 4)
    const stockoutProb = Math.min(1.0, Math.max(0.01, (simulatedUnits - effectiveBuffer + 20) / 80))

    const isRecommended = profitDeltaPct > 0 && stockoutProb < 0.25

    return {
      simulatedUnits,
      simulatedPrice,
      simulatedRevenue,
      simulatedGrossProfit,
      baseRevenue,
      baseProfit,
      revenueDeltaPct,
      profitDeltaPct,
      stockoutProb,
      isRecommended,
    }
  }, [priceDelta, mktMultiplier, inventoryBuffer])

  const formatVND = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)
  }

  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line-bright)',
        borderRadius: '12px',
        padding: '24px',
        margin: '24px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={20} className="cyan" />
          <h3 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.15rem' }}>
            Interactive Scenario Sandbox: SKU P001 (SmartDesk Mini)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setPriceDelta(-5)
            setMktMultiplier(1.2)
            setInventoryBuffer(15)
          }}
          className="btn-copy"
        >
          <RefreshCw size={12} />
          Reset Defaults
        </button>
      </div>

      <p className="dim" style={{ fontSize: '0.88rem', marginBottom: '20px' }}>
        Adjust strategic business levers below to observe counterfactual demand shifts calculated using SmartDesk Mini (P001) price elasticity (ε = -1.1) and power-law marketing diminishing returns (multiplier^0.65).
      </p>

      {/* Sliders Grid */}
      <div className="grid-3" style={{ marginBottom: '24px' }}>
        {/* Slider 1: Price Change */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Price Adjustment</span>
            <span className="mono cyan" style={{ fontWeight: 700 }}>
              {priceDelta > 0 ? `+${priceDelta}%` : `${priceDelta}%`}
            </span>
          </div>
          <input
            type="range"
            min={-20}
            max={20}
            step={1}
            value={priceDelta}
            onChange={(e) => setPriceDelta(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--cyan)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            <span>-20% Promo</span>
            <span>0% Current</span>
            <span>+20% Premium</span>
          </div>
        </div>

        {/* Slider 2: Marketing Multiplier */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Marketing Budget</span>
            <span className="mono violet" style={{ fontWeight: 700 }}>
              {mktMultiplier.toFixed(1)}x Spend
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.1}
            value={mktMultiplier}
            onChange={(e) => setMktMultiplier(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--violet)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            <span>0.5x Cut</span>
            <span>1.0x Baseline</span>
            <span>2.5x Aggressive</span>
          </div>
        </div>

        {/* Slider 3: Restock Buffer */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Safety Stock Buffer</span>
            <span className="mono green" style={{ fontWeight: 700 }}>
              {inventoryBuffer} Days
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={30}
            step={1}
            value={inventoryBuffer}
            onChange={(e) => setInventoryBuffer(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--green)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            <span>5 Days (Lean)</span>
            <span>15 Days</span>
            <span>30 Days (Resilient)</span>
          </div>
        </div>
      </div>

      {/* Output Projection Cards */}
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        <div className="stat-box">
          <div className="stat-value">{formatVND(simulation.simulatedRevenue)}</div>
          <div className="stat-label">Projected Revenue</div>
          <div className="mono" style={{ fontSize: '0.8rem', color: simulation.revenueDeltaPct >= 0 ? 'var(--green)' : 'var(--red)', marginTop: '4px' }}>
            {simulation.revenueDeltaPct >= 0 ? `+${simulation.revenueDeltaPct.toFixed(1)}%` : `${simulation.revenueDeltaPct.toFixed(1)}%`} vs Baseline
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--indigo)' }}>{formatVND(simulation.simulatedGrossProfit)}</div>
          <div className="stat-label">Projected Gross Profit</div>
          <div className="mono" style={{ fontSize: '0.8rem', color: simulation.profitDeltaPct >= 0 ? 'var(--green)' : 'var(--red)', marginTop: '4px' }}>
            {simulation.profitDeltaPct >= 0 ? `+${simulation.profitDeltaPct.toFixed(1)}%` : `${simulation.profitDeltaPct.toFixed(1)}%`} vs Baseline
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--violet)' }}>{simulation.simulatedUnits} units</div>
          <div className="stat-label">Projected Sales Volume</div>
          <div className="mono dim" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
            Baseline: {baseUnits} units
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-value" style={{ color: simulation.stockoutProb > 0.2 ? 'var(--amber)' : 'var(--green)' }}>
            {(simulation.stockoutProb * 100).toFixed(0)}%
          </div>
          <div className="stat-label">Stockout Risk</div>
          <div className="mono dim" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
            P001 Lead time: 14 days
          </div>
        </div>
      </div>

      {/* Decision Pilot Recommendation Banner */}
      <div
        style={{
          background: simulation.isRecommended ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${simulation.isRecommended ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          borderRadius: '8px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {simulation.isRecommended ? (
          <CheckCircle size={22} className="green" />
        ) : (
          <AlertTriangle size={22} style={{ color: 'var(--red)' }} />
        )}
        <div>
          <span style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.95rem' }}>
            {simulation.isRecommended ? 'AI Engine Recommendation: POSITIVE UPSIDE' : 'AI Engine Notice: SUBOPTIMAL OR HIGH RISK'}
          </span>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#CBD5E1' }}>
            {simulation.isRecommended
              ? `This scenario yields positive incremental gross profit (+${simulation.profitDeltaPct.toFixed(1)}%) while maintaining healthy warehouse inventory levels.`
              : 'This scenario results in margin compression or excessive stockout probability. Re-adjust pricing or marketing spend to achieve profitable unit expansion.'}
          </p>
        </div>
      </div>
    </div>
  )
}

