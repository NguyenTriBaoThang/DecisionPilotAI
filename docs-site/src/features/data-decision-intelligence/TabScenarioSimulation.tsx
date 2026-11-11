import { useState } from 'react'
import { SCENARIO_COMPARISON_MATRIX } from './mockIntelligenceData'
import { CodeBlock } from '../../components/CodeBlock'
import { Sliders, Sparkles, TrendingUp, AlertTriangle, ShieldCheck, Cpu, CheckCircle2, DollarSign, Package, Share2, Layers } from 'lucide-react'

export function TabScenarioSimulation() {
  const [subTab, setSubTab] = useState<'pricing' | 'marketing' | 'inventory'>('pricing')

  // Sub-tab A: Pricing Simulation State
  const [discountPct, setDiscountPct] = useState<number>(5) // 5% default
  const basePrice = 1_000_000
  const baseUnits = 420
  const unitCOGS = 600_000
  const elasticity = -1.1 // P001 catalog elasticity (illustrative calculator)

  // Dynamic pricing calculation
  const discountRate = discountPct / 100
  const effectivePrice = basePrice * (1 - discountRate)
  // Elasticity demand multiplier: (1 - d)^ε
  const demandMultiplier = Math.pow(1 - discountRate, elasticity)
  const projectedUnits = Math.round(baseUnits * demandMultiplier)
  const projectedRevenue = projectedUnits * effectivePrice
  const projectedCOGS = projectedUnits * unitCOGS
  const projectedGrossProfit = projectedRevenue - projectedCOGS
  const projectedMargin = (projectedGrossProfit / projectedRevenue) * 100

  const baselineProfit = baseUnits * (basePrice - unitCOGS) // 168,000,000
  const profitDelta = projectedGrossProfit - baselineProfit
  const profitDeltaPct = (profitDelta / baselineProfit) * 100

  // Estimated warehouse stockout risk based on demand surge
  const stockoutRisk = Math.min(95, Math.max(4, Math.round(4 + Math.pow(discountPct / 2.5, 2))))

  // Sub-tab B: Marketing Budget State
  const [spendMultiplier, setSpendMultiplier] = useState<number>(1.2) // 1.2x
  const baseFbSpend = 26_000_000
  const currentFbSpend = baseFbSpend * spendMultiplier
  // Illustrative saturation curve for the docs demo (the production simulator uses ratio^alpha)
  // Calibrated so at 1.0x spend (26M), Rev = 107.1M (ROAS = 4.12)
  const vMax = 180_000_000
  const kHalf = 22_000_000
  const hillN = 1.6
  const spendPow = Math.pow(currentFbSpend, hillN)
  const kPow = Math.pow(kHalf, hillN)
  const projectedAdRevenue = (vMax * spendPow) / (kPow + spendPow)
  const effectiveROAS = projectedAdRevenue / currentFbSpend

  // Sub-tab C: Inventory Planning State
  const [leadTimeDays, setLeadTimeDays] = useState<number>(14)
  const [safetyBufferUnits, setSafetyBufferUnits] = useState<number>(120)
  const dailyBurnRate = 18 // units per day
  const inventoryOnHand = 310
  const daysCover = Math.round(inventoryOnHand / dailyBurnRate)
  const requiredStock = dailyBurnRate * leadTimeDays + safetyBufferUnits
  const reorderRecommendation = Math.max(0, requiredStock - inventoryOnHand)
  const leadStockoutProb = daysCover < leadTimeDays ? 88 : daysCover < leadTimeDays + 4 ? 35 : 4

  const formatVND = (v: number) => {
    const sign = v < 0 ? '-' : ''
    const abs = Math.abs(v)
    return `${sign}${(abs / 1_000_000).toFixed(1)}M ₫`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header & Subtitle */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="badge badge-indigo">NĂNG LỰC 04 · CAPABILITY 4</span>
          <span className="badge badge-green">IMPLEMENTED IN CODEBASE</span>
        </div>
        <h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
          Simulate Before You Decide
        </h3>
        <p style={{ color: 'var(--cyan)', fontSize: '1.05rem', fontWeight: 600, marginTop: '4px', marginBottom: '12px' }}>
          &ldquo;Explore strategies, evaluate trade-offs, and make evidence-based decisions.&rdquo;
        </p>
        <p style={{ color: '#CBD5E1', fontSize: '0.95rem', maxWidth: '850px', lineHeight: 1.6 }}>
          Executive leaders frequently make irreversible pricing, marketing, and inventory commitments relying on gut instinct, only to trigger margin collapse or warehouse stockouts. DecisionPilot AI provides a mathematical simulation sandbox combining a price-sensitivity model, a diminishing-returns advertising model, and lead-time inventory constraints to stress-test scenarios before capital is committed.
        </p>
      </div>

      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
        <button
          onClick={() => setSubTab('pricing')}
          style={{
            background: subTab === 'pricing' ? 'var(--indigo)' : 'var(--surface)',
            color: subTab === 'pricing' ? '#FFFFFF' : '#94A3B8',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '10px 18px',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <DollarSign size={16} /> Sub-tab A: Pricing &amp; Elasticity
        </button>

        <button
          onClick={() => setSubTab('marketing')}
          style={{
            background: subTab === 'marketing' ? 'var(--indigo)' : 'var(--surface)',
            color: subTab === 'marketing' ? '#FFFFFF' : '#94A3B8',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '10px 18px',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <Share2 size={16} /> Sub-tab B: Marketing Spend &amp; ROAS
        </button>

        <button
          onClick={() => setSubTab('inventory')}
          style={{
            background: subTab === 'inventory' ? 'var(--indigo)' : 'var(--surface)',
            color: subTab === 'inventory' ? '#FFFFFF' : '#94A3B8',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '10px 18px',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <Package size={16} /> Sub-tab C: Inventory &amp; Lead Time
        </button>
      </div>

      {/* Sub-tab A: Interactive Pricing Simulation */}
      {subTab === 'pricing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
              <div>
                <span className="badge badge-cyan" style={{ marginBottom: '6px' }}>PRICE ELASTICITY MODEL (ILLUSTRATIVE)</span>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '4px 0 0 0' }}>
                  SKU P001 (SmartDesk Mini) Price Elasticity Simulator
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '4px 0 0 0' }}>
                  Catalog elasticity &epsilon; = -1.1 for this SKU; the calculator below is an illustration, not the production simulator. Baseline price: 1,000,000 ₫ &bull; Unit COGS: 600,000 ₫.
                </p>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 14px', textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontFamily: 'var(--mono)' }}>OPTIMAL RANGE</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--green)', fontWeight: 700 }}>4% &ndash; 6% Discount</div>
              </div>
            </div>

            {/* Slider Control */}
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: '10px', padding: '18px', marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF' }}>
                  Simulated Discount Percentage: <span style={{ color: 'var(--cyan)', fontSize: '1.1rem' }}>-{discountPct}%</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontFamily: 'var(--mono)' }}>
                  Effective Price: {effectivePrice.toLocaleString('vi-VN')} ₫
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={discountPct}
                onChange={(e) => setDiscountPct(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', marginTop: '6px' }}>
                <span>0% (Baseline)</span>
                <span>5% (AI Optimal Point)</span>
                <span>10%</span>
                <span>15% (Margin Trap)</span>
                <span>20% (Severe Loss)</span>
              </div>
            </div>

            {/* Dynamic Results Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Projected Demand</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '4px' }}>
                  {projectedUnits} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#94A3B8' }}>units</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>
                  +{Math.round((projectedUnits - baseUnits) / baseUnits * 100)}% vs baseline
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Projected Revenue</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '4px' }}>
                  {formatVND(projectedRevenue)}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--cyan)', fontWeight: 600 }}>
                  +{((projectedRevenue - basePrice * baseUnits) / (basePrice * baseUnits) * 100).toFixed(1)}% delta
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Projected Gross Profit</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: profitDelta >= 0 ? 'var(--green)' : '#F87171', marginTop: '4px' }}>
                  {formatVND(projectedGrossProfit)}
                </div>
                <span style={{ fontSize: '0.75rem', color: profitDelta >= 0 ? 'var(--green)' : '#F87171', fontWeight: 600 }}>
                  {profitDelta >= 0 ? '+' : ''}{profitDeltaPct.toFixed(1)}% ({formatVND(profitDelta)})
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Gross Margin %</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: projectedMargin >= 35 ? '#FFFFFF' : '#F87171', marginTop: '4px' }}>
                  {projectedMargin.toFixed(1)}%
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                  Baseline: 40.0%
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Warehouse Stockout Risk</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: stockoutRisk > 40 ? '#F87171' : stockoutRisk > 15 ? '#FBBF24' : 'var(--green)', marginTop: '4px' }}>
                  {stockoutRisk}%
                </div>
                <span style={{ fontSize: '0.75rem', color: stockoutRisk > 40 ? '#F87171' : '#94A3B8' }}>
                  {stockoutRisk > 40 ? 'CRITICAL DEPLETION' : stockoutRisk > 15 ? 'Moderate strain' : 'Normal safety buffer'}
                </span>
              </div>
            </div>

            {/* AI Decision Engine Callout */}
            <div
              style={{
                background: profitDelta >= 0 && stockoutRisk < 25 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${profitDelta >= 0 && stockoutRisk < 25 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                borderRadius: '8px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              {profitDelta >= 0 && stockoutRisk < 25 ? (
                <CheckCircle2 size={20} color="var(--green)" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <AlertTriangle size={20} color="#F87171" style={{ flexShrink: 0, marginTop: '2px' }} />
              )}
              <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                <strong style={{ color: profitDelta >= 0 && stockoutRisk < 25 ? 'var(--green)' : '#F87171' }}>
                  {profitDelta >= 0 && stockoutRisk < 25
                    ? 'AI ENGINE VERDICT: RECOMMENDED PROMOTION'
                    : 'AI ENGINE VERDICT: HIGH-RISK DECISION (VOLUME TRAP)'}
                </strong>
                <p style={{ margin: '4px 0 0 0', color: '#CBD5E1' }}>
                  {profitDelta >= 0 && stockoutRisk < 25
                    ? `At a ${discountPct}% discount, unit demand expansion (+${Math.round((projectedUnits - baseUnits) / baseUnits * 100)}%) outweighs the per-unit price reduction, generating +${formatVND(profitDelta)} in net incremental gross profit while keeping inventory stockout risk safe at ${stockoutRisk}%.`
                    : `At a ${discountPct}% discount, although unit volume surges to ${projectedUnits} units, cumulative COGS and price erosion destroy ${formatVND(Math.abs(profitDelta))} in gross profit. Furthermore, rapid stock depletion pushes warehouse stockout probability to ${stockoutRisk}%.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab B: Marketing Budget Simulation */}
      {subTab === 'marketing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
            <span className="badge badge-indigo" style={{ marginBottom: '6px' }}>SATURATION CURVE (ILLUSTRATIVE)</span>
            <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '4px 0 0 0' }}>
              Advertising Spend Saturation Curve (Diminishing ROAS)
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '4px 0 20px 0' }}>
              Models customer acquisition fatigue: incremental spend yields progressively smaller sales lift once core audience reaches saturation.
            </p>

            {/* Slider Control */}
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: '10px', padding: '18px', marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF' }}>
                  Budget Multiplier: <span style={{ color: 'var(--cyan)', fontSize: '1.1rem' }}>{spendMultiplier.toFixed(1)}x</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontFamily: 'var(--mono)' }}>
                  Total Ad Spend: {formatVND(currentFbSpend)} / month
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={spendMultiplier}
                onChange={(e) => setSpendMultiplier(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--indigo)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', marginTop: '6px' }}>
                <span>0.5x (13.0M ₫)</span>
                <span>1.0x Baseline (26.0M ₫)</span>
                <span>1.5x (Efficiency Limit)</span>
                <span>2.0x (Diminishing)</span>
                <span>2.5x (65.0M ₫)</span>
              </div>
            </div>

            {/* Results Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Monthly Ad Spend</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '4px' }}>
                  {formatVND(currentFbSpend)}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Baseline: 26.0M ₫</span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Attributed Revenue</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--cyan)', marginTop: '4px' }}>
                  {formatVND(projectedAdRevenue)}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--green)' }}>
                  +{((projectedAdRevenue - 107_120_000) / 107_120_000 * 100).toFixed(1)}% lift
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Blended ROAS</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: effectiveROAS >= 3.0 ? 'var(--green)' : effectiveROAS >= 2.0 ? '#FBBF24' : '#F87171', marginTop: '4px' }}>
                  {effectiveROAS.toFixed(2)}x
                </div>
                <span style={{ fontSize: '0.75rem', color: effectiveROAS < 2.0 ? '#F87171' : '#94A3B8' }}>
                  {effectiveROAS < 2.0 ? 'Inefficient Spend' : 'Target: >3.0x'}
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Channel Efficiency</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: spendMultiplier <= 1.3 ? 'var(--green)' : spendMultiplier <= 1.7 ? '#FBBF24' : '#F87171', marginTop: '4px' }}>
                  {spendMultiplier <= 1.3 ? 'Optimal Zone' : spendMultiplier <= 1.7 ? 'Moderate Saturation' : 'Severe Fatigue'}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Audience Saturation</span>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#CBD5E1', lineHeight: 1.5, margin: 0 }}>
              &bull; <strong>SME Strategic Insight:</strong> Scaling ad budget beyond 1.5x on a single channel triggers steep diminishing returns. Note: this interactive tab illustrates a saturation curve; the production simulator (<code>ai_service/scenario.py</code>) models diminishing returns via <code>spend_ratio ^ alpha</code> (default <code>alpha = 0.65</code>) and recommends controlled channel trials across Google Ads and Email.
            </p>
          </div>
        </div>
      )}

      {/* Sub-tab C: Inventory & Lead-Time Simulation */}
      {subTab === 'inventory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
            <span className="badge badge-amber" style={{ marginBottom: '6px' }}>LEAD-TIME &amp; REORDER OPTIMIZER</span>
            <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '4px 0 0 0' }}>
              Supply Chain Replenishment &amp; Stockout Risk Model
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '4px 0 20px 0' }}>
              Current inventory on hand: {inventoryOnHand} units &bull; Average daily sales velocity: {dailyBurnRate} units/day.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '22px' }}>
              {/* Supplier Lead Time Slider */}
              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#FFFFFF' }}>Supplier Lead Time</label>
                  <span style={{ fontSize: '0.88rem', color: 'var(--cyan)', fontWeight: 800 }}>{leadTimeDays} days</span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="28"
                  step="1"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                  Min 7 days (Domestic) &bull; Max 28 days (Port Customs Delay)
                </span>
              </div>

              {/* Safety Stock Buffer Slider */}
              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#FFFFFF' }}>Safety Stock Buffer</label>
                  <span style={{ fontSize: '0.88rem', color: 'var(--indigo)', fontWeight: 800 }}>{safetyBufferUnits} units</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="250"
                  step="10"
                  value={safetyBufferUnits}
                  onChange={(e) => setSafetyBufferUnits(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--indigo)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                  Recommended threshold: 100 &ndash; 150 units buffer
                </span>
              </div>
            </div>

            {/* Results Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Days of Inventory Cover</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: daysCover <= leadTimeDays ? '#F87171' : '#FFFFFF', marginTop: '4px' }}>
                  {daysCover} days
                </div>
                <span style={{ fontSize: '0.75rem', color: daysCover <= leadTimeDays ? '#F87171' : 'var(--green)' }}>
                  {daysCover <= leadTimeDays ? 'DEPLETION BEFORE DELIVERY' : 'Sufficient Runway'}
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Recommended Reorder Qty</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--cyan)', marginTop: '4px' }}>
                  {reorderRecommendation} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#94A3B8' }}>units</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Based on lead demand + buffer</span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Stockout Probability</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: leadStockoutProb > 30 ? '#F87171' : 'var(--green)', marginTop: '4px' }}>
                  {leadStockoutProb}%
                </div>
                <span style={{ fontSize: '0.75rem', color: leadStockoutProb > 30 ? '#F87171' : 'var(--green)' }}>
                  {leadStockoutProb > 30 ? 'High Vulnerability' : 'Protected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Scenario Comparison Matrix Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
              Evidence-Based Scenario Comparison Matrix
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '4px 0 0 0' }}>
              Multi-scenario evaluation combining pricing changes, marketing budget reallocation, and supply constraints.
            </p>
          </div>
          <span className="badge badge-green">Backtested on Holdout</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: '#94A3B8' }}>
                <th style={{ padding: '10px 12px' }}>Decision Variable / Metric</th>
                <th style={{ padding: '10px 12px' }}>Baseline (Status Quo)</th>
                <th style={{ padding: '10px 12px', color: 'var(--green)' }}>Scenario A (AI Recommended)</th>
                <th style={{ padding: '10px 12px', color: '#F87171' }}>Scenario B (Aggressive Promo)</th>
                <th style={{ padding: '10px 12px' }}>Delta (A vs B)</th>
              </tr>
            </thead>
            <tbody>
              {SCENARIO_COMPARISON_MATRIX.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#FFFFFF' }}>{row.metric}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: '#CBD5E1' }}>{row.baseline}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 600 }}>{row.scenarioA}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: '#F87171' }}>{row.scenarioB}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>
                    {row.deltaA} vs {row.deltaB}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '14px', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>
          Interactive Educational Simulation — Synthetic Data &amp; Explicit Assumptions &bull; Backtested in <code>artifacts/scenario_backtest.json</code>
        </div>
      </div>

      {/* Production Source & API Reference */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            Production Simulation Engine Implementation
          </span>
          <p style={{ fontSize: '0.84rem', color: '#CBD5E1', lineHeight: 1.5, marginBottom: '14px' }}>
            Inspect the scenario modeling algorithms and backtesting replay scripts:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
            <a
              href="https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/scenario.py"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--indigo)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Cpu size={14} /> <code>ai_service/scenario.py</code> &rarr;
            </a>
            <a
              href="https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/scenario_backtest.json"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--indigo)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckCircle2 size={14} /> <code>artifacts/scenario_backtest.json</code> &rarr;
            </a>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            REST API Endpoint Specification
          </span>
          <div style={{ marginBottom: '8px' }}>
            <code style={{ fontSize: '0.82rem', color: '#38BDF8', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px' }}>
              POST /api/simulate
            </code>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: '6px 0 10px 0' }}>
            Discriminated union accepting <code>price</code>, <code>marketing</code>, or <code>inventory</code> scenario parameters plus objective &amp; horizon. Decisions can be linked to recommendations via <code>POST /api/scenarios/feedback</code>.
          </p>
          <CodeBlock
            code={`// ScenarioRequest Payload Example
{
  "type": "price",
  "objective": "profit",
  "horizon": 30,
  "parameters": {
    "product": "P001",
    "discounts": [0, 0.05, 0.10],
    "elasticity": -1.1,
    "additional_cost": 0
  }
}`}
            label="json"
          />
        </div>
      </div>
    </div>
  )
}
