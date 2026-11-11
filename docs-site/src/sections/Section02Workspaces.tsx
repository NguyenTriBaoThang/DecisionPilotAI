import { LayoutDashboard, MessageSquare, AlertCircle, LineChart, Sliders, Lightbulb, CheckCircle2 } from 'lucide-react'

export function Section02Workspaces() {
  const workspaces = [
    {
      id: 'ws-overview',
      icon: <LayoutDashboard size={20} className="cyan" />,
      title: 'Workspace 1: Executive Overview Dashboard',
      summary: 'Central cockpit for high-level business health monitoring across retail branches and online platforms.',
      metrics: ['Gross Revenue (VND Integer)', 'Gross Profit & Margin %', 'Total Orders & Average Order Value (AOV)', 'Regional & Channel Breakdown'],
      features: [
        'Real-time filterable date ranges (7d, 30d, 90d, custom fiscal year)',
        'SKU leaderboard ranking revenue, units sold, and contribution margins',
        'Multi-channel advertising efficiency tracking (Facebook, Shopee Mall, TikTok Shop, Direct Store)',
      ],
    },
    {
      id: 'ws-copilot',
      icon: <MessageSquare size={20} className="indigo" />,
      title: 'Workspace 2: Ask AI Copilot (Natural Language Analytics)',
      summary: 'Conversational analytical interface enabling business owners to ask questions in plain Vietnamese or English.',
      metrics: ['SQL Execution Trace', 'Query Latency (median 1.4s)', 'Synthesized Data Tables', 'Auto-generated Visualizations'],
      features: [
        'Context-aware question intent classification and schema linking',
        'Automatic SQL generation restricted strictly to read-only SELECT operations',
        'Interactive bar, line, and breakdown charts rendered on-the-fly based on result shape',
        'Refusal protocol for ambiguous questions or requests outside dataset scope',
      ],
    },
    {
      id: 'ws-anomaly',
      icon: <AlertCircle size={20} className="amber" />,
      title: 'Workspace 3: Anomaly Center (Statistical Outlier Intelligence)',
      summary: 'Automated early warning system monitoring daily revenue dips, sudden conversion collapses, and stockout threats.',
      metrics: ['Severity Level (Critical / High / Medium)', 'Z-score Deviation', 'Expected vs Realized Delta', 'Root Cause Diagnosis'],
      features: [
        'Hybrid detection combining Isolation Forest and rolling Z-score thresholds',
        'Automated root cause tagging (e.g. ad spend spike with ROAS drop, inventory depletion)',
        'Temporal grouping to distinguish transient noise from systemic trends',
      ],
    },
    {
      id: 'ws-forecast',
      icon: <LineChart size={20} className="violet" />,
      title: 'Workspace 4: Forecast Center (Chronological Demand Projections)',
      summary: '30-day ahead demand and revenue forecasts empowering proactive inventory replenishment and cash flow planning.',
      metrics: ['Forecast Point Estimate', '90% Confidence Prediction Intervals', 'Target Scope (All vs SKU-specific)', 'Historical WAPE Validation'],
      features: [
        'Model selection hierarchy: LightGBM Regressors vs Moving Average baselines',
        'Incorporation of 14 rolling features: 7d/14d/28d lags, calendar seasonality, double-day sales flags',
        'Upper and lower uncertainty bounds accounting for demand variance',
      ],
    },
    {
      id: 'ws-simulator',
      icon: <Sliders size={20} className="green" />,
      title: 'Workspace 5: 3D Scenario Simulator (Microeconomic What-If Engine)',
      summary: 'Futuristic holographic sandbox to test pricing adjustments, marketing campaigns, and inventory buffers before spending capital.',
      metrics: ['Price Delta % (-20% to +20%)', 'Marketing Multiplier (0.5x to 2.5x)', 'Projected Revenue & Profit', 'Stockout Risk Probability'],
      features: [
        'Demand re-estimation from a price-sensitivity (elasticity) value, with a sensitivity band',
        'Concave ad-spend response simulating diminishing returns on advertising',
        'Interactive Three.js 3D data sphere reflecting simulated business health visually',
      ],
    },
    {
      id: 'ws-recommendations',
      icon: <Lightbulb size={20} className="cyan" />,
      title: 'Workspace 6: Prescriptive Recommendations & Human Approval',
      summary: 'Actionable decision cards ranked by projected financial upside and implementation feasibility.',
      metrics: ['Estimated Revenue Upside (VND)', 'Net Profit Impact (VND)', 'Confidence Score (0.0 to 1.0)', 'Human Decision Status'],
      features: [
        'Quantitative supporting evidence backing every recommendation',
        'Explicit risk factor disclosure (e.g. required safety stock, ad fatigue)',
        'Human-in-the-loop executive approval or dismissal recorded into immutable audit log',
      ],
    },
  ]

  return (
    <section id="sec-workspaces">
      <h2>
        <span className="sec-badge">02</span>
        Core Workspaces &amp; Capabilities
      </h2>

      <p className="lead">
        DecisionPilot AI organizes enterprise intelligence into 6 dedicated, role-tailored workspaces. Each workspace focuses on a distinct phase of business diagnosis, projection, and strategic intervention.
      </p>

      <div className="grid-2">
        {workspaces.map((ws) => (
          <div key={ws.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="card-title">
                {ws.icon}
                <span style={{ fontSize: '1rem' }}>{ws.title}</span>
              </div>
              <p style={{ fontSize: '0.88rem', color: '#CBD5E1', marginBottom: '14px' }}>{ws.summary}</p>

              <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700 }}>
                  Key Capabilities
                </span>
                <ul style={{ listStyle: 'none', padding: 0, marginTop: '6px' }}>
                  {ws.features.map((feat, idx) => (
                    <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                      <CheckCircle2 size={13} className="cyan" style={{ flexShrink: 0, marginTop: '3px' }} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                Primary Metrics &amp; Artifacts
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {ws.metrics.map((m, mIdx) => (
                  <span key={mIdx} className="badge badge-indigo" style={{ fontSize: '0.7rem' }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

