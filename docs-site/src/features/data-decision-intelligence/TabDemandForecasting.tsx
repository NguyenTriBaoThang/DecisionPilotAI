import { useState } from 'react'
import { FORECAST_CHRONOLOGICAL_DATA, type ForecastPoint } from './mockIntelligenceData'
import { CodeBlock } from '../../components/CodeBlock'
import { TrendingUp, BarChart2, Calendar, Target, CheckCircle2, ShieldCheck, Cpu, ArrowRight } from 'lucide-react'

export function TabDemandForecasting() {
  const [horizon, setHorizon] = useState<'7d' | '30d'>('30d')
  const [seriesView, setSeriesView] = useState<'revenue' | 'sku'>('revenue')

  const scaleVal = (v: number | undefined) => {
    if (v === undefined) return undefined
    return seriesView === 'revenue' ? v : Number((v / 6_800_000).toFixed(2))
  }

  // Filter data based on horizon (14 historical days at indices 0..13, 30 forecast days at 14..43)
  const rawDisplayData = horizon === '7d'
    ? FORECAST_CHRONOLOGICAL_DATA.slice(7, 21) // 7 historical + 7 predicted
    : FORECAST_CHRONOLOGICAL_DATA // 14 historical + 30 predicted

  const displayData: ForecastPoint[] = rawDisplayData.map((d) => ({
    date: d.date,
    actual: scaleVal(d.actual),
    predicted: scaleVal(d.predicted),
    lowerBound: scaleVal(d.lowerBound),
    upperBound: scaleVal(d.upperBound),
  }))

  const formatVND = (v: number) => (v / 1_000_000).toFixed(1) + 'M ₫'
  const formatSKU = (v: number) => `${v.toFixed(1)} pcs`

  // SVG Chart Dimensions
  const svgWidth = 760
  const svgHeight = 240
  const padding = { top: 20, right: 30, bottom: 35, left: 65 }
  const chartW = svgWidth - padding.left - padding.right
  const chartH = svgHeight - padding.top - padding.bottom

  // Min / Max for scaling
  const allValues = displayData.flatMap((d) => [
    d.actual ?? null,
    d.predicted ?? null,
    d.lowerBound ?? null,
    d.upperBound ?? null,
  ]).filter((v): v is number => v !== null)

  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const stepUnit = seriesView === 'revenue' ? 5_000_000 : 2
  const minVal = Math.max(0, Math.floor((rawMin * 0.9) / stepUnit) * stepUnit)
  const maxVal = Math.ceil((rawMax * 1.05) / stepUnit) * stepUnit

  const getX = (idx: number) => padding.left + (idx / (displayData.length - 1)) * chartW
  const getY = (val: number) => padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH

  // Build SVG Paths
  const actualPoints = displayData
    .map((d, i) => (d.actual !== undefined ? { x: getX(i), y: getY(d.actual), val: d.actual, date: d.date } : null))
    .filter(Boolean) as { x: number; y: number; val: number; date: string }[]

  const predictedPoints = displayData
    .map((d, i) => (d.predicted !== undefined ? { x: getX(i), y: getY(d.predicted), val: d.predicted, date: d.date, lower: d.lowerBound, upper: d.upperBound } : null))
    .filter(Boolean) as { x: number; y: number; val: number; date: string; lower?: number; upper?: number }[]

  // Connect last actual point with first predicted point for visual continuity
  const lastActual = actualPoints[actualPoints.length - 1]
  const forecastPathCoords = lastActual ? [{ x: lastActual.x, y: lastActual.y }, ...predictedPoints] : predictedPoints

  const actualPathD = actualPoints.length > 0 
    ? `M ${actualPoints.map((p) => `${p.x},${p.y}`).join(' L ')}` 
    : ''

  const predictedPathD = forecastPathCoords.length > 0
    ? `M ${forecastPathCoords.map((p) => `${p.x},${p.y}`).join(' L ')}`
    : ''

  // Confidence Band Polygon
  const upperCoords = predictedPoints.map((p) => `${p.x},${getY(p.upper || p.val)}`)
  const lowerCoords = [...predictedPoints].reverse().map((p) => `${p.x},${getY(p.lower || p.val)}`)
  const bandPolygonD = predictedPoints.length > 0 
    ? `M ${upperCoords.join(' L ')} L ${lowerCoords.join(' L ')} Z` 
    : ''

  const pipelineSteps = [
    { step: '01', title: 'Chronological Data Split', desc: 'Train (2024-10-01 to 2026-02-22), Validation (to 2026-06-12), Holdout Test (to 2026-09-30). Zero leakage.' },
    { step: '02', title: '17 Point-in-Time Features', desc: 'Builds lag_1/7/14/28, rolling mean/std (7, 14, 28), growth_7, weekday/month/quarter/holiday, and scale.' },
    { step: '03', title: 'Model Family Competition', desc: 'Trains LightGBM regressors alongside Seasonal Naive (t-7) and Moving Average baselines per scope.' },
    { step: '04', title: '>2% Validation MAE Gate', desc: 'LightGBM is promoted ONLY if validation MAE beats the better statistical baseline by more than 2%.' },
    { step: '05', title: 'Empirical Residual Intervals', desc: 'Constructs 90% nominal intervals using empirical validation residual quantiles split by lead bucket.' },
    { step: '06', title: '7d & 30d Decision Horizons', desc: 'Serves daily forecasts across 7-day and 30-day horizons for revenue, orders, or SKU demand.' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header & Subtitle */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="badge badge-indigo">NĂNG LỰC 03 · CAPABILITY 3</span>
          <span className="badge badge-green">IMPLEMENTED IN CODEBASE</span>
        </div>
        <h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
          Predict What Comes Next
        </h3>
        <p style={{ color: 'var(--cyan)', fontSize: '1.05rem', fontWeight: 600, marginTop: '4px', marginBottom: '12px' }}>
          &ldquo;Forecast demand, revenue and business trends using historical data.&rdquo;
        </p>
        <p style={{ color: '#CBD5E1', fontSize: '0.95rem', maxWidth: '850px', lineHeight: 1.6 }}>
          SMEs routinely battle the twin hazards of inventory planning: excess inventory traps working capital, while stockouts surrender revenue to competitors during peak demand. DecisionPilot AI employs a calibrated LightGBM time-series architecture with lag features, seasonal cyclic encoding, and 90% confidence bands to deliver reliable forecasts that beat standard statistical baselines.
        </p>
      </div>

      {/* Pipeline Flow Diagram */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
        <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '14px' }}>
          AI Demand Forecasting &amp; Verification Pipeline
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
          {pipelineSteps.map((p, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '12px',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.7rem', fontFamily: 'var(--mono)', color: 'var(--indigo)', fontWeight: 800 }}>
                  PHASE {p.step}
                </span>
                {idx < pipelineSteps.length - 1 && (
                  <ArrowRight size={12} color="var(--muted)" style={{ opacity: 0.6 }} />
                )}
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>
                {p.title}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.4 }}>
                {p.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Forecast Visualizer Card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <TrendingUp size={20} color="var(--cyan)" />
              <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                Chronological Demand &amp; Revenue Projection
              </h4>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '4px 0 0 0' }}>
              Historical actuals (solid cyan) compared with selected forecast (dashed violet) &amp; empirical 90% prediction envelope.
            </p>
          </div>

          {/* Interactive Horizon & View Switchers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '3px' }}>
              <button
                onClick={() => setSeriesView('revenue')}
                style={{
                  background: seriesView === 'revenue' ? 'var(--indigo)' : 'transparent',
                  color: seriesView === 'revenue' ? '#FFFFFF' : '#94A3B8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Total Revenue (₫)
              </button>
              <button
                onClick={() => setSeriesView('sku')}
                style={{
                  background: seriesView === 'sku' ? 'var(--indigo)' : 'transparent',
                  color: seriesView === 'sku' ? '#FFFFFF' : '#94A3B8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                SKU P001 Units
              </button>
            </div>

            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '3px' }}>
              <button
                onClick={() => setHorizon('7d')}
                style={{
                  background: horizon === '7d' ? 'var(--cyan)' : 'transparent',
                  color: horizon === '7d' ? '#070B17' : '#94A3B8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                7-Day Horizon
              </button>
              <button
                onClick={() => setHorizon('30d')}
                style={{
                  background: horizon === '30d' ? 'var(--cyan)' : 'transparent',
                  color: horizon === '30d' ? '#070B17' : '#94A3B8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                30-Day Horizon
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px', marginBottom: '14px', padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.78rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '3px', background: 'var(--cyan)' }} />
            <span style={{ color: '#E2E8F0' }}>Historical Actuals (Observed)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '0px', borderTop: '2px dashed #A78BFA' }} />
            <span style={{ color: '#E2E8F0' }}>
              {seriesView === 'revenue' ? 'Moving Average (Selected for Total Revenue)' : 'LightGBM Forecast (Selected for P001)'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '10px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)' }} />
            <span style={{ color: '#E2E8F0' }}>Empirical 90% Interval (Validation Residuals)</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="badge badge-indigo">Bundle dp-1.1</span>
            <span className="badge badge-green">&gt;2% Val MAE Gate</span>
          </div>
        </div>

        {/* Responsive SVG Chart */}
        <div style={{ width: '100%', overflowX: 'auto', background: 'rgba(11, 16, 32, 0.8)', borderRadius: '10px', padding: '12px 6px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', minWidth: '600px', height: 'auto', display: 'block' }}>
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = padding.top + chartH * pct
              const val = maxVal - pct * (maxVal - minVal)
              return (
                <g key={i}>
                  <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
                  <text x={padding.left - 10} y={y + 4} textAnchor="end" fill="#64748B" fontSize="10" fontFamily="var(--mono)">
                    {seriesView === 'revenue' ? formatVND(val) : formatSKU(val)}
                  </text>
                </g>
              )
            })}

            {/* Transition dividing line between historical & forecast */}
            {lastActual && (
              <g>
                <line
                  x1={lastActual.x}
                  y1={padding.top}
                  x2={lastActual.x}
                  y2={padding.top + chartH}
                  stroke="rgba(255, 255, 255, 0.25)"
                  strokeDasharray="4 4"
                />
                <text x={lastActual.x - 6} y={padding.top + 12} textAnchor="end" fill="#94A3B8" fontSize="9" fontFamily="var(--mono)">
                  HISTORICAL
                </text>
                <text x={lastActual.x + 6} y={padding.top + 12} textAnchor="start" fill="#22D3EE" fontSize="9" fontFamily="var(--mono)" fontWeight="bold">
                  AI FORECAST &rarr;
                </text>
              </g>
            )}

            {/* Shaded 90% Confidence Band */}
            {bandPolygonD && (
              <path d={bandPolygonD} fill="rgba(139, 92, 246, 0.18)" stroke="rgba(139, 92, 246, 0.35)" strokeWidth="1" />
            )}

            {/* Historical Actuals Line */}
            {actualPathD && (
              <path d={actualPathD} fill="none" stroke="var(--cyan)" strokeWidth="2.5" />
            )}

            {/* Forecast Line */}
            {predictedPathD && (
              <path d={predictedPathD} fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeDasharray="5 4" />
            )}

            {/* Historical Points */}
            {actualPoints.map((p, i) => (
              <g key={`act-${i}`}>
                <circle cx={p.x} cy={p.y} r={3.5} fill="#070B17" stroke="var(--cyan)" strokeWidth="2" />
              </g>
            ))}

            {/* Forecast Points */}
            {predictedPoints.map((p, i) => (
              <g key={`pred-${i}`}>
                <circle cx={p.x} cy={p.y} r={3.5} fill="#070B17" stroke="#A78BFA" strokeWidth="2" />
              </g>
            ))}

            {/* X-Axis Dates */}
            {displayData.map((d, i) => {
              // Show label every 2nd point on 7d or 6th point on 30d
              const step = horizon === '7d' ? 2 : 6
              if (i % step !== 0 && i !== displayData.length - 1) return null
              const x = getX(i)
              return (
                <text
                  key={`lbl-${i}`}
                  x={x}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  fill={d.actual ? '#94A3B8' : '#A78BFA'}
                  fontSize="10"
                  fontFamily="var(--mono)"
                  fontWeight={d.actual ? 'normal' : 'bold'}
                >
                  {d.date}
                </text>
              )
            })}
          </svg>
        </div>

        {/* Verification Ground-Truth Metrics Card */}
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                Revenue 30d Test WAPE
              </span>
              <Target size={14} color="var(--cyan)" />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#FFFFFF' }}>
              24.14%
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--green)', display: 'block', marginTop: '2px' }}>
              &bull; Moving Avg selected (MAE 34.58M ₫ vs Seasonal Naive 26.40%)
            </span>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                SKU P001 30d Test WAPE
              </span>
              <BarChart2 size={14} color="var(--indigo)" />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#FFFFFF' }}>
              41.87%
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'block', marginTop: '2px' }}>
              &bull; LightGBM selected (MAE: 2.68 units/day vs Naive 3.49)
            </span>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                SKU P001 90% Coverage
              </span>
              <ShieldCheck size={14} color="var(--green)" />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--green)' }}>
              92.86%
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'block', marginTop: '2px' }}>
              &bull; Empirical residual quantiles (90% nominal; Revenue 30d: 83.81%)
            </span>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                Chronological Split
              </span>
              <Calendar size={14} color="#A78BFA" />
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF' }}>
              Train / Val / Test
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'block', marginTop: '2px' }}>
              &bull; Strict temporal ordering (to 2026-09-30): zero leakage
            </span>
          </div>
        </div>

        <div style={{ marginTop: '14px', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>
          Documented Demo Result — Synthetic Dataset (<code>dp-1.1</code>) &bull; Evaluated against holdout test partition (2026-06-13 to 2026-09-30)
        </div>
      </div>

      {/* Model Architecture Deep-Dive: LightGBM vs Statistical Baselines */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
        <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', marginTop: 0, marginBottom: '14px' }}>
          Methodological Comparison: Model Families Across Scopes (30-Day Holdout Test)
        </h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: '#94A3B8' }}>
                <th style={{ padding: '10px 12px' }}>Evaluation Metric / Scope</th>
                <th style={{ padding: '10px 12px' }}>Seasonal Naive</th>
                <th style={{ padding: '10px 12px' }}>Moving Average</th>
                <th style={{ padding: '10px 12px' }}>LightGBM (17 Features)</th>
                <th style={{ padding: '10px 12px' }}>Production Selection</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#FFFFFF' }}>All-Revenue 30d Test WAPE</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: '#CBD5E1' }}>26.40%</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>24.14%</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: '#94A3B8' }}>22.96% (missed val gate)</td>
                <td style={{ padding: '10px 12px' }}><span className="badge badge-cyan">Moving Avg Selected</span></td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#FFFFFF' }}>All-Revenue 30d Test MAE</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: '#CBD5E1' }}>37,823,705 ₫</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--cyan)', fontWeight: 700 }}>34,584,972 ₫</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: '#94A3B8' }}>32,895,074 ₫</td>
                <td style={{ padding: '10px 12px' }}><span className="badge badge-green">Verified in CSV</span></td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#FFFFFF' }}>SKU P001 Demand WAPE / MAE</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: '#CBD5E1' }}>54.54% (3.49)</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: '#CBD5E1' }}>43.28% (2.77)</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>41.87% (2.68)</td>
                <td style={{ padding: '10px 12px' }}><span className="badge badge-green">LightGBM Selected</span></td>
              </tr>
              <tr>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#FFFFFF' }}>90% Nominal Coverage &amp; Features</td>
                <td style={{ padding: '10px 12px', color: '#94A3B8' }}>Direct shift (t-7)</td>
                <td style={{ padding: '10px 12px', color: '#CBD5E1' }}>83.81% (Revenue 30d)</td>
                <td style={{ padding: '10px 12px', color: 'var(--green)', fontWeight: 700 }}>92.86% (P001, 17 features)</td>
                <td style={{ padding: '10px 12px' }}><span className="badge badge-indigo">Empirical Residuals</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Production Source & API Reference */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            Production Forecasting Engine Implementation
          </span>
          <p style={{ fontSize: '0.84rem', color: '#CBD5E1', lineHeight: 1.5, marginBottom: '14px' }}>
            Inspect the live model training and inference pipelines in the repository:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
            <a
              href="https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/forecasting.py"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--indigo)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Cpu size={14} /> <code>ai_service/forecasting.py</code> &rarr;
            </a>
            <a
              href="https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/features.py"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--indigo)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Cpu size={14} /> <code>ai_service/features.py</code> &rarr;
            </a>
            <a
              href="https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/MODEL_EVALUATION.md"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--indigo)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckCircle2 size={14} /> <code>artifacts/MODEL_EVALUATION.md</code> &rarr;
            </a>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            REST API Endpoint Specification
          </span>
          <div style={{ marginBottom: '8px' }}>
            <code style={{ fontSize: '0.82rem', color: '#38BDF8', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px' }}>
              POST /forecast
            </code>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: '6px 0 10px 0' }}>
            Accepts target metric (<code>revenue</code>, <code>orders</code>, <code>demand</code>), optional <code>product</code> or <code>category</code> scope, and horizon (<code>7</code> or <code>30</code>). Returns selected model predictions with empirical 90% intervals.
          </p>
          <CodeBlock
            code={`// Request Payload Example (ForecastRequest)
{
  "target": "demand",
  "product": "P001",
  "horizon": 30
}`}
            label="json"
          />
        </div>
      </div>
    </div>
  )
}
