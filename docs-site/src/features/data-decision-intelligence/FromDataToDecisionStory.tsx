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
        'The business manager logs in and types: "Why did our HCMC revenue fall by 24% in the last two weeks of September?" DecisionPilot AI routes the intent, parses parameters, and compiles an audited read-only SQL query with zero prompt hallucination in 1.43 seconds.',
      kpis: [
        { label: 'Query Latency', value: '1,432 ms' },
        { label: 'AST Safety Pass', value: '100% Read-Only' },
        { label: 'Data Sources', value: 'sales_transactions, products' },
      ],
      quote: '"No manual Excel extraction or pivot tables required — immediate SQL execution."',
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
        'Instead of generic totals, the Isolation Forest and rolling 3-sigma z-score engine isolates two simultaneous root causes: (1) SKU P003 (FocusCam Pro) ran completely out of stock in HCMC (-62M ₫ impact), and (2) Facebook Ad spend scaled by 1.85x while conversion rate dropped from 25% to 5.5% (ROAS fell from 4.12x to 1.25x).',
      kpis: [
        { label: 'Revenue Deviation', value: '-41.0% (z = -3.84)' },
        { label: 'P003 Warehouse Stock', value: '0 units (Critical)' },
        { label: 'Facebook ROAS Drop', value: '4.12x &rarr; 1.25x' },
      ],
      quote: '"Reconciled 100% of the observed variance into specific product and ad channel drivers."',
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
        'The LightGBM forecasting model generates a 14-day projection factoring in day-of-week seasonality, rolling moving averages, and current inventory deficits. The forecast reveals October gross revenue will contract to 1,150,000,000 ₫ (underperforming target by -20.7%) if ad bleed and stockouts persist.',
      kpis: [
        { label: 'Baseline Oct Forecast', value: '1.15B ₫ (-20.7%)' },
        { label: 'Holdout WAPE', value: '11.24% Aggregated' },
        { label: '90% Interval Coverage', value: '92.86% (Calibrated)' },
      ],
      quote: '"Quantifies the cost of inaction before the month begins."',
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
        'The executive compares two strategies in the simulation engine: Scenario B proposes an aggressive 15% flash sale across all products; the simulator flags this as a "Margin Trap" (destroys 22M ₫ gross profit, triggers a 64.5% warehouse stockout risk). Conversely, Scenario A tests a calibrated 5% discount on elastic SKU P001 and reallocates 15M ₫ ad budget to Shopee Mall.',
      kpis: [
        { label: 'Scenario A Profit Delta', value: '+4.2M ₫ (+2.5%)' },
        { label: 'Scenario B Profit Delta', value: '-22.0M ₫ (-13.1%)' },
        { label: 'Scenario B Stockout Risk', value: '64.5% (REJECTED)' },
      ],
      quote: '"Exposed hidden margin collapse and stockout vulnerability prior to commitment."',
    },
    {
      id: 'decide',
      number: '05',
      title: 'DECIDE',
      label: 'Actionable Execution & Outcome',
      icon: CheckCircle2,
      color: 'var(--green)',
      headline: 'Confidence in Executive Decision Making',
      narrative:
        'The manager greenlights Scenario A with full executive consensus. Three automated actions are executed: (1) 5% promo applied to SKU P001, (2) 15M ₫ ad spend reallocated to Shopee Mall, and (3) P003 safety buffer increased to 120 units with an expedited supplier PO. Result: October revenue achieves 1,467,400,000 ₫ with healthy 36.8% margin.',
      kpis: [
        { label: 'Realized Revenue', value: '1,467,400,000 ₫' },
        { label: 'Blended Ad ROAS', value: '3.85x Rebound' },
        { label: 'P003 Stockout Resolved', value: '100% In Stock' },
      ],
      quote: '"Closed the loop from natural language question to verified business impact."',
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

