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
        'Lan (an illustrative shop owner) opens the dashboard: September revenue is 3.38 billion ₫, down 30.6%. She asks "Which marketing channel had the lowest ROAS?", in English or Vietnamese. The router picks a fixed analytics tool, which reads the database and answers in about 1.4 seconds on the local rules path.',
      kpis: [
        { label: 'Query Latency', value: '1,432 ms (median)' },
        { label: 'Mutations Allowed', value: '0 (SQL questions are refused)' },
        { label: 'Data Sources', value: 'marketing_campaigns, sales_transactions' },
      ],
      quote: '"No spreadsheet export or pivot table needed."',
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
        'The answer is Facebook Ads: ad payback (ROAS) fell from 6.53x to 0.76x. The Anomaly Center had already flagged a critical Facebook spend spike on 23 Sept (7.38M ₫ per day against a 4.01M ₫ baseline, +84%). Detection combines Isolation Forest, rolling z-score and IQR bounds; for Facebook spend it reaches 100% precision and 82% recall on the synthetic test.',
      kpis: [
        { label: 'Facebook Spend Deviation', value: '+84% (critical)' },
        { label: 'Facebook Ad Payback (ROAS)', value: '6.53x → 0.76x' },
        { label: 'Email Ad Payback (ROAS)', value: '12.9x' },
      ],
      quote: '"Contributions are descriptive, not causal claims."',
    },
    {
      id: 'predict',
      number: '03',
      title: 'PREDICT',
      label: 'Time-Series Forecasting',
      icon: TrendingUp,
      color: 'var(--indigo)',
      headline: 'The Baseline Trajectory Without Action',
      narrative:
        'The Forecast Center projects the next 30 days with a likely range and shows how often the model stayed inside that range on past data. For total revenue the simple moving average is chosen because LightGBM does not clear the 2% gate. The 90% band covered 83.8% of test days, below its target, and the app says so.',
      kpis: [
        { label: 'Revenue Forecast (30 days)', value: '3.36B ₫ (moving average)' },
        { label: 'Revenue WAPE (test)', value: '24.1%' },
        { label: '90% Band Coverage', value: '83.8% (below target)' },
      ],
      quote: '"Shows how sure the forecast is, not only the number."',
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
        'From the recommendation, Lan tries a 15% cut to the Facebook Ads budget. Estimate for the next 30 days: ad spend falls from 222.5M ₫ to 189.1M ₫, attributed revenue from 111.9M ₫ to 100.7M ₫, and the estimated loss on the channel shrinks from 177.1M ₫ to 148.3M ₫. Raising the budget makes the loss larger. These are conditional estimates (the marketing replay is weaker than its baseline), so a small controlled trial is recommended.',
      kpis: [
        { label: 'Budget -15%: Profit Change', value: '+28.8M ₫' },
        { label: 'Budget -15%: Revenue Change', value: '-11.2M ₫' },
        { label: 'Budget +30%: Profit Change', value: '-58.3M ₫' },
      ],
      quote: '"Try it on paper before spending real money."',
    },
    {
      id: 'decide',
      number: '05',
      title: 'DECIDE',
      label: 'Human Decision & Decision Log',
      icon: CheckCircle2,
      color: 'var(--green)',
      headline: 'Confidence in Executive Decision Making',
      narrative:
        'Lan accepts the scenario. One action marks the scenario and the recommendation card as accepted, and the decision log stores who decided, when, and the evidence reviewed. Nothing is executed automatically: carrying out the change stays a human action and its real effect would be measured in a trial. This walkthrough makes no claim about outcomes.',
      kpis: [
        { label: 'Decision Recorded', value: 'Accepted by a named user' },
        { label: 'Executed Automatically', value: 'Nothing' },
        { label: 'Outcome', value: 'To be measured in a pilot' },
      ],
      quote: '"AI proposes, a person decides, the log remembers."',
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

