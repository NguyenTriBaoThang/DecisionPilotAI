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
        'Real-time filterable date ranges across full fiscal window (2024-10-01 to 2026-09-30)',
        'SKU leaderboard ranking revenue, units sold, and contribution margins',
        'Multi-channel performance across Online, Retail, B2B and paid campaigns (Facebook Ads, Google Ads, TikTok Ads, Email)',
      ],
    },
    {
      id: 'ws-copilot',
      icon: <MessageSquare size={20} className="indigo" />,
      title: 'Workspace 2: Ask AI Copilot (Natural Language Analytics)',
      summary: 'Conversational analytical interface enabling business owners to ask questions in plain Vietnamese or English.',
      metrics: ['Intent & Tool Trace', 'Query Latency (median 1.4s)', 'Grounded Data Evidence', 'Auto-generated Visualizations'],
      features: [
        'Context-aware question intent classification into typed schemas (local rules default; Gemini/OpenAI optional)',
        'Routes exclusively to fixed, tested read-only analytics tools via SQLAlchemy (never model-written SQL)',
        'Interactive bar, line, and breakdown charts rendered automatically from result shape',
        'Explicit refusal protocol for SQL-like strings or requests outside supported dataset metrics',
      ],
    },
    {
      id: 'ws-anomaly',
      icon: <AlertCircle size={20} className="amber" />,
      title: 'Workspace 3: Anomaly Center (Statistical Outlier Intelligence)',
      summary: 'Automated early warning system monitoring daily revenue dips, sudden conversion collapses, and stockout threats.',
      metrics: ['Severity Level (Critical / High / Medium)', 'IQR / Robust Z-score Deviation', 'Expected vs Realized Delta', 'Investigate -> Ask Copilot Bridge'],
      features: [
        '56-day past-only trailing baseline combined with IQR / robust Z-score thresholds and Isolation Forest',
        'Drill-down contributor attribution (product/channel deltas) plus one-click "Investigate with AI Copilot" prefilling /ask?q=...',
        'Sustained weekly revenue verification to separate multi-day structural shifts from single-day noise',
      ],
    },
    {
      id: 'ws-forecast',
      icon: <LineChart size={20} className="violet" />,
      title: 'Workspace 4: Forecast Center (Chronological Demand Projections)',
      summary: '7-day and 30-day ahead demand, order, and revenue forecasts empowering proactive inventory and cash flow planning.',
      metrics: ['Forecast Point Estimate', '90% Confidence Prediction Intervals', 'Target Scope (All, Category, or SKU)', 'Historical WAPE Validation'],
      features: [
        'Per-series model selection gate: LightGBM vs seasonal moving average baselines (> 2% validation MAE rule)',
        'Incorporation of 17 causal temporal features: lag 1/7/14/28, rolling 7/14/28 means & stds, growth_7, calendar & scale',
        'Calibrated 90% prediction intervals accounting for empirical validation residuals',
      ],
    },
    {
      id: 'ws-simulator',
      icon: <Sliders size={20} className="green" />,
      title: 'Workspace 5: 3D Scenario Simulator (Microeconomic What-If Engine)',
      summary: 'Interactive Three.js sandbox testing price discounts, ad spend reallocations, and inventory orders before committing capital.',
      metrics: ['Pricing Discounts (0% to 50%)', 'Ad Spend Adjustments (-100% to +200%)', 'Inventory Restock & Lead Time', 'Stockout Risk & Profit Delta'],
      features: [
        'Price response using catalog elasticity with operator override and sensitivity range',
        'Diminishing-returns ad response curve (spend_ratio ^ alpha) and inventory buffer simulation',
        'Interactive Three.js 3D data visualizer plus linked recommendation decision persistence via /scenarios/feedback',
      ],
    },
    {
      id: 'ws-recommendations',
      icon: <Lightbulb size={20} className="cyan" />,
      title: 'Workspace 6: Prescriptive Recommendations & Audit Log',
      summary: 'Actionable decision cards linked to live presets in the simulator and recorded in the append-only decision ledger (/audit).',
      metrics: ['Projected Impact Range (VND)', 'Linked Scenario Preset', 'Supporting Evidence & Risks', 'Transactional Decision Status'],
      features: [
        'Direct "Try first in simulator" deep-link carrying exact parameters & recommendation_id',
        'Atomic decision persistence: accepting a linked scenario updates both scenario and recommendation status together',
        'Dedicated /audit workspace inspecting cursor-paginated queries, dataset loads, and executive decisions',
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

