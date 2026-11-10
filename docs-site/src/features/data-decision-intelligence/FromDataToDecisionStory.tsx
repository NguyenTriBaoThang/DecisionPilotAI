import { useState } from 'react'
import { MessageSquareText, AlertTriangle, TrendingUp, Sliders, CheckCircle2, ArrowRight, Zap, Target } from 'lucide-react'

export function FromDataToDecisionStory() {
  const [activeStep, setActiveStep] = useState<number>(0)

  const steps = [
    {
      id: 'ask',
      number: '01',
      title: 'ASK',
      label: 'Natural Language Ingestion',
      icon: MessageSquareText,
      color: 'var(--cyan)',
      headline: 'The Executive Query',
      narrative:
        'The business operator logs in and asks: "Why did our HCMC revenue drop in September?" DecisionPilot AI maps the question to a strict Pydantic Intent (openAI, Gemini, or local bilingual rules), enforces allowlist guards, and executes parameterized SQLAlchemy Core queries on a read-only database session with zero mathematical hallucination.',
      kpis: [
        { label: 'Median Benchmark Latency', value: '1,432.2 ms' },
        { label: 'Query Safety Architecture', value: 'Typed Intent + Read-Only' },
        { label: 'Grounded Sources', value: 'sales_transactions, products' },
      ],
      quote: '"No manual Excel extraction or pivot tables required — immediate parameterized execution."',
    },
    {
      id: 'understand',
      number: '02',
      title: 'UNDERSTAND',
      label: 'Multidimensional Anomaly Detection',
      icon: AlertTriangle,
      color: '#F87171',
      headline: 'Root Cause Decomposition',
      narrative:
        'Using a 56-day trailing baseline shifted by 7 days, hybrid Isolation Forest + IQR + robust Z-score detectors and stockout rules isolate the co-occurring anomalies in September: (1) HCMC market traffic contracted to 0.59x with returning customer share dropping from 44% to 20%, (2) Facebook Ads spend scaled 1.85x while attributed order probability dropped from 25% to 5.5%, and (3) SmartDesk Mini (P001) flagged late-month stockout risk.',
      kpis: [
        { label: 'HCMC Revenue Shock', value: '-41.0% (z = -3.84)' },
        { label: 'P001 Late-Sept Alert', value: 'stockout_risk Flagged' },
        { label: 'Facebook ROAS Drop', value: '4.12x &rarr; 1.25x' },
      ],
      quote: '"Reconciles observed variances across product, region, channel, and segment contributors."',
    },
    {
      id: 'predict',
      number: '03',
      title: 'PREDICT',
      label: 'Calibrated Time-Series Forecasting',
      icon: TrendingUp,
      color: 'var(--indigo)',
      headline: 'The Baseline Trajectory Without Action',
      narrative:
        'The forecasting router evaluates Moving Average, Seasonal Naive, and 17-feature LightGBM models over a 70/15/15 chronological split across 7-day and 30-day horizons. Moving Average wins for total business revenue (24.14% 30-day test WAPE) while LightGBM clears the >2% validation gate for SKU P001 demand (41.87% WAPE, 92.86% empirical 90%-interval coverage).',
      kpis: [
        { label: 'All-Revenue 30d Test WAPE', value: '24.14% (Moving Avg)' },
        { label: 'SKU P001 30d Test WAPE', value: '41.87% (LightGBM)' },
        { label: 'SKU P001 90% Coverage', value: '92.86% (Empirical)' },
      ],
      quote: '"Selects LightGBM only where validation proves >2% MAE lift over naive baselines."',
    },
    {
      id: 'simulate',
      number: '04',
      title: 'SIMULATE',
      label: 'What-If Strategy Sandbox',
      icon: Sliders,
      color: '#A78BFA',
      headline: 'Stress-Testing Strategy Alternatives',
      narrative:
        'Instead of blindly discounting during a slump, the operator runs POST /simulate in ai_service/scenario.py. For SmartDesk Mini (P001, list 2,490,000 ₫, unit cost 1,650,000 ₫, elasticity -1.1), linear % elasticity reveals that a 15% promo destroys -53.2M ₫ in gross profit (-35.2%) and elevates depletion risk. Holding 0% discount protects 151.2M ₫ profit, while capping overspent Facebook Ads and shifting spend to Google Ads improves contribution profit.',
      kpis: [
        { label: 'Hold Price (0% Disc) Profit', value: '151.2M ₫ (Optimal Profit)' },
        { label: '5% Disc Profit vs Rev', value: '-15.3M ₫ (+0.3% Rev)' },
        { label: '15% Disc Profit Impact', value: '-53.2M ₫ (REJECTED)' },
      ],
      quote: '"Exposed hidden margin collapse and stock depletion trade-offs prior to capital commitment."',
    },
    {
      id: 'decide',
      number: '05',
      title: 'DECIDE',
      label: 'Actionable Execution & Audit',
      icon: CheckCircle2,
      color: 'var(--green)',
      headline: 'Human-in-the-Loop Decision Execution',
      narrative:
        'Following the no-autonomous-write design constraint, the operator explicitly reviews sensitivity bounds and logs Accepted / Rejected decisions via POST /recommendations/feedback or POST /scenarios/feedback into the immutable decision_audit table: preserving SmartDesk Mini pricing, capping saturated Facebook Ads spend, and scheduling supplier replenishment for lead-time safety stock.',
      kpis: [
        { label: 'Execution Boundary', value: 'Human Approval Required' },
        { label: 'Audit Record Status', value: 'Accepted / Rejected' },
        { label: 'Marketing Curve Model', value: 'Power Law (ratio^0.65)' },
      ],
      quote: '"Closed the loop from natural language question to auditable, sensitivity-checked decisions."',
    },
  ]

  const current = steps[activeStep]
  const IconComp = current.icon

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <Zap size={16} color="var(--cyan)" />
        <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700 }}>
          End-to-End Enterprise Case Study
        </span>
      </div>
      <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
        From Data to Decision &mdash; The Turnaround Journey
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', margin: '4px 0 20px 0' }}>
        Walk through how DecisionPilot AI transformed an impending Q4 revenue crisis into a profitable turnaround.
      </p>

      {/* Step Selector Pills */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '24px' }}>
        {steps.map((s, idx) => {
          const StepIcon = s.icon
          const isSelected = activeStep === idx
          return (
            <button
              key={s.id}
              onClick={() => setActiveStep(idx)}
              style={{
                background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(0,0,0,0.25)',
                border: `1px solid ${isSelected ? s.color : 'var(--line)'}`,
                borderRadius: '8px',
                padding: '10px 12px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: isSelected ? s.color : 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <StepIcon size={14} color={isSelected ? '#070B17' : '#94A3B8'} />
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', fontFamily: 'var(--mono)', color: isSelected ? s.color : '#64748B', fontWeight: 700 }}>
                  STEP {s.number}
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isSelected ? '#FFFFFF' : '#94A3B8' }}>
                  {s.title}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Current Step Showcase Card */}
      <div
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: `1px solid ${current.color}40`,
          borderRadius: '10px',
          padding: '22px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: current.color }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${current.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconComp size={20} color={current.color} />
            </div>
            <div>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)', color: current.color, fontWeight: 700, textTransform: 'uppercase' }}>
                STAGE {current.number} &bull; {current.label}
              </span>
              <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                {current.headline}
              </h4>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={activeStep === 0}
              onClick={() => setActiveStep((p) => Math.max(0, p - 1))}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--line)',
                color: activeStep === 0 ? '#475569' : '#FFFFFF',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.75rem',
                cursor: activeStep === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              &larr; Previous
            </button>
            <button
              disabled={activeStep === steps.length - 1}
              onClick={() => setActiveStep((p) => Math.min(steps.length - 1, p + 1))}
              style={{
                background: 'var(--indigo)',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: activeStep === steps.length - 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Next Step &rarr;
            </button>
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', color: '#CBD5E1', lineHeight: 1.6, marginBottom: '20px' }}>
          {current.narrative}
        </p>

        {/* Evidence KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {current.kpis.map((k, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: '6px', padding: '10px 14px' }}>
              <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontFamily: 'var(--mono)' }}>{k.label}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: k.value }} />
            </div>
          ))}
        </div>

        <div style={{ fontStyle: 'italic', fontSize: '0.82rem', color: current.color, borderLeft: `2px solid ${current.color}`, paddingLeft: '10px' }}>
          {current.quote}
        </div>
      </div>
    </div>
  )
}

