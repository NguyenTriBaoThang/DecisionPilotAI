import { useState } from 'react'
import { SCENARIO_COMPARISON_MATRIX } from './mockIntelligenceData'
import { CodeBlock } from '../../components/CodeBlock'
import { Sliders, Sparkles, TrendingUp, AlertTriangle, ShieldCheck, Cpu, CheckCircle2, DollarSign, Package, Share2, Layers } from 'lucide-react'

export function TabScenarioSimulation() {
  const [subTab, setSubTab] = useState<'pricing' | 'marketing' | 'inventory'>('pricing')

  // Sub-tab A: Pricing Simulation State (P001 SmartDesk Mini catalog parameters from scripts/generate.py)
  const [discountPct, setDiscountPct] = useState<number>(5) // 5% default
  const basePrice = 2_490_000
  const baseUnits = 180
  const unitCOGS = 1_650_000
  const elasticity = -1.1 // Catalog price elasticity for P001

  // Dynamic pricing calculation matching ai_service/scenario.py:
  // demand_at_price = base_demand * max(0, 1 + elasticity * (new_price / base_price - 1))
  const discountRate = discountPct / 100
  const effectivePrice = Math.round(basePrice * (1 - discountRate))
  const demandMultiplier = Math.max(0, 1 + elasticity * (-discountRate))
  const projectedUnits = Math.round(baseUnits * demandMultiplier)
  const projectedRevenue = projectedUnits * effectivePrice
  const projectedCOGS = projectedUnits * unitCOGS
  const projectedGrossProfit = projectedRevenue - projectedCOGS
  const projectedMargin = projectedRevenue > 0 ? (projectedGrossProfit / projectedRevenue) * 100 : 0

  const baselineProfit = baseUnits * (basePrice - unitCOGS) // 151,200,000
  const baselineMarginPct = ((basePrice - unitCOGS) / basePrice) * 100 // 33.7%
  const profitDelta = projectedGrossProfit - baselineProfit
  const profitDeltaPct = (profitDelta / baselineProfit) * 100

  // Estimated warehouse depletion strain vs stock runway
  const stockoutRisk = Math.min(95, Math.max(4, Math.round(4 + Math.pow(discountPct / 2.2, 2))))

  // Sub-tab B: Marketing Budget State matching ai_service/scenario.py:
  // budget_response(ratio, exponent) = ratio ** response_exponent (default 0.65)
  const [spendMultiplier, setSpendMultiplier] = useState<number>(1.2) // 1.2x
  const baseFbSpend = 26_000_000
  const baseAttributedRevenue = 107_120_000 // Baseline 4.12x ROAS reference
  const responseExponent = 0.65
  const currentFbSpend = baseFbSpend * spendMultiplier
  const projectedAdRevenue = baseAttributedRevenue * Math.pow(spendMultiplier, responseExponent)
  const effectiveROAS = projectedAdRevenue / currentFbSpend

  // Sub-tab C: Inventory Planning State (P001 lead_time_days = 14, reorder_point = 32)
  const [leadTimeDays, setLeadTimeDays] = useState<number>(14)
  const [safetyBufferUnits, setSafetyBufferUnits] = useState<number>(32)
  const dailyBurnRate = 6 // ~180 units / 30 days
  const inventoryOnHand = 90
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
          Executive leaders frequently make irreversible pricing, marketing, and inventory commitments relying on gut instinct, only to trigger margin collapse or warehouse stockouts. DecisionPilot AI provides a deterministic simulation sandbox combining linear percentage price elasticity, power-law marketing diminishing returns (<code>ratio^0.65</code>), and daily stock-balance replenishment modeling with sensitivity sweeps before capital is committed.
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
                <span className="badge badge-cyan" style={{ marginBottom: '6px' }}>LINEAR % ELASTICITY MODEL</span>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '4px 0 0 0' }}>
                  SKU P001 (SmartDesk Mini) Price Elasticity Simulator
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '4px 0 0 0' }}>
                  Catalog elasticity coefficient &epsilon; = -1.10 &bull; List price: 2,490,000 ₫ &bull; Unit COGS: 1,650,000 ₫.
                </p>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 14px', textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontFamily: 'var(--mono)' }}>PROFIT OBJECTIVE</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--green)', fontWeight: 700 }}>0% (Profit) vs 5% (+Rev)</div>
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
                <span>0% (Max Profit)</span>
                <span>5% (Max Revenue)</span>
                <span>10% (Margin Erosion)</span>
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
                <span style={{ fontSize: '0.75rem', color: projectedRevenue >= basePrice * baseUnits ? 'var(--cyan)' : '#F87171', fontWeight: 600 }}>
                  {projectedRevenue >= basePrice * baseUnits ? '+' : ''}{((projectedRevenue - basePrice * baseUnits) / (basePrice * baseUnits) * 100).toFixed(1)}% delta
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
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: projectedMargin >= 30 ? '#FFFFFF' : '#F87171', marginTop: '4px' }}>
                  {projectedMargin.toFixed(1)}%
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                  Baseline: {baselineMarginPct.toFixed(1)}%
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
                background: discountPct === 0 ? 'rgba(16, 185, 129, 0.08)' : projectedRevenue >= basePrice * baseUnits && stockoutRisk < 25 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${discountPct === 0 ? 'rgba(16, 185, 129, 0.3)' : projectedRevenue >= basePrice * baseUnits && stockoutRisk < 25 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                borderRadius: '8px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              {discountPct === 0 ? (
                <CheckCircle2 size={20} color="var(--green)" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <AlertTriangle size={20} color={projectedRevenue >= basePrice * baseUnits && stockoutRisk < 25 ? '#FBBF24' : '#F87171'} style={{ flexShrink: 0, marginTop: '2px' }} />
              )}
              <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                <strong style={{ color: discountPct === 0 ? 'var(--green)' : projectedRevenue >= basePrice * baseUnits && stockoutRisk < 25 ? '#FBBF24' : '#F87171' }}>
                  {discountPct === 0
                    ? 'AI ENGINE VERDICT: HOLD PRICE FOR MAX GROSS PROFIT'
                    : projectedRevenue >= basePrice * baseUnits && stockoutRisk < 25
                      ? 'AI ENGINE VERDICT: TOP-LINE TRADE-OFF (PROFIT COMPRESSION)'
                      : 'AI ENGINE VERDICT: HIGH-RISK DECISION (MARGIN TRAP)'}
                </strong>
                <p style={{ margin: '4px 0 0 0', color: '#CBD5E1' }}>
                  {discountPct === 0
                    ? `With SmartDesk Mini (P001) catalog elasticity ε = -1.1 and 33.7% baseline gross margin, holding full list price yields ${formatVND(baselineProfit)} gross profit with low stockout strain (${stockoutRisk}%).`
                    : projectedRevenue >= basePrice * baseUnits && stockoutRisk < 25
                      ? `At a ${discountPct}% discount, unit demand rises to ${projectedUnits} units and revenue edges to ${formatVND(projectedRevenue)}, but margin erosion reduces gross profit by ${formatVND(Math.abs(profitDelta))} (${profitDeltaPct.toFixed(1)}%). Only approve if your objective prioritizes top-line volume over margin.`
                      : `At a ${discountPct}% discount, although unit demand surges to ${projectedUnits} units, cumulative COGS and price compression destroy ${formatVND(Math.abs(profitDelta))} in gross profit while pushing warehouse depletion strain to ${stockoutRisk}%.`}
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
            <span className="badge badge-indigo" style={{ marginBottom: '6px' }}>POWER RESPONSE CURVE (ratio ^ 0.65)</span>
            <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '4px 0 0 0' }}>
              Advertising Spend Diminishing-Returns Curve (ratio<sup>0.65</sup>)
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '4px 0 20px 0' }}>
              Models diminishing marginal returns using <code>budget_response(ratio, exponent) = ratio ** 0.65</code> from <code>ai_service/scenario.py</code>: incremental spend yields sub-linear sales lift.
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
              &bull; <strong>SME Strategic Insight:</strong> Because revenue scales by <code>ratio^0.65</code>, scaling spend 2.0x only produces 1.57x attributed revenue, reducing marginal ROAS. Compare Facebook Ads against Google Ads, TikTok Ads, or Email via <code>POST /simulate</code> before reallocating budget (note: 7-day Facebook replay had 33.00% WAPE vs 25.44% baseline during shock windows).
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
                  min="20"
                  max="120"
                  step="4"
                  value={safetyBufferUnits}
                  onChange={(e) => setSafetyBufferUnits(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--indigo)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                  P001 catalog reorder point: 32 units &bull; Higher buffer protects against customs delays
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
                <th style={{ padding: '10px 12px' }}>Baseline (0% Disc / Profit Winner)</th>
                <th style={{ padding: '10px 12px', color: '#FBBF24' }}>Scenario A (-5% Disc / +Rev)</th>
                <th style={{ padding: '10px 12px', color: '#F87171' }}>Scenario B (-15% Aggressive)</th>
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
              POST /simulate
            </code>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: '6px 0 10px 0' }}>
            Discriminated union <code>ScenarioRequest</code> (<code>price | marketing | inventory</code>) with explicit <code>objective</code> (<code>profit | revenue | stockout | balanced</code>) and 7d/30d horizon. Returns baseline, alternatives, sensitivity sweeps, and explicit assumptions.
          </p>
          <CodeBlock
            code={`// Scenario Request Payload (PriceRequest)
{
  "type": "price",
  "objective": "profit",
  "horizon": 30,
  "parameters": {
    "product": "P001",
    "discounts": [0, 0.05, 0.15]
  }
}`}
            label="json"
          />
        </div>
      </div>
    </div>
  )
}
