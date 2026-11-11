import { useState } from 'react'
import { ANOMALY_INCIDENTS, type AnomalyIncident } from './mockIntelligenceData'
import { CodeBlock } from '../../components/CodeBlock'
import { AlertCircle, TrendingDown, TrendingUp, BarChart3, ShieldAlert, Cpu, CheckCircle2, ArrowRight } from 'lucide-react'

export function TabRevenueAnalysis() {
  const [selectedIncident, setSelectedIncident] = useState<AnomalyIncident>(ANOMALY_INCIDENTS[0])

  const pipelineSteps = [
    { step: '01', title: 'Continuous Stream Ingestion', desc: 'Aggregates daily revenue, channel ad spend, and inventory movements.' },
    { step: '02', title: '56-Day Trailing Baseline', desc: 'Computes past-only trailing baseline via shift(7).rolling(56, min_periods=28) so anomalies never contaminate prior windows.' },
    { step: '03', title: 'Hybrid Isolation Forest', desc: 'Isolates multi-dimensional outlier points using scikit-learn IsolationForest partitions.' },
    { step: '04', title: 'IQR & Robust Z-Score Gate', desc: 'Combines IQR fences and MAD-scaled Z-scores plus sustained weekly revenue verification.' },
    { step: '05', title: 'Contribution Decomposition', desc: 'Calculates SKU, regional, and channel delta shares reconciling to 100% of change.' },
    { step: '06', title: 'Actionable Alert Generation', desc: 'Outputs severity-ranked alerts with contributing root cause factors.' },
  ]

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return 'badge-red'
      case 'high':
        return 'badge-amber'
      default:
        return 'badge-cyan'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header & Subtitle */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="badge badge-indigo">NĂNG LỰC 02 · CAPABILITY 2</span>
          <span className="badge badge-green">IMPLEMENTED IN CODEBASE</span>
        </div>
        <h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
          Understand Business Performance
        </h3>
        <p style={{ color: 'var(--cyan)', fontSize: '1.05rem', fontWeight: 600, marginTop: '4px', marginBottom: '12px' }}>
          &ldquo;Detect meaningful changes before they become costly decisions.&rdquo;
        </p>
        <p style={{ color: '#CBD5E1', fontSize: '0.95rem', maxWidth: '850px', lineHeight: 1.6 }}>
          A sudden revenue drop rarely announces itself with a single obvious cause. By the time quarterly P&amp;L reports are compiled, weeks of margin have vanished. DecisionPilot AI monitors multidimensional business streams in real time, detecting anomalies, calculating z-scores, and decomposing observed variances into identifiable contributing factors.
        </p>
      </div>

      {/* Pipeline Architecture */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
        <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '14px' }}>
          Anomaly Detection &amp; Variance Decomposition Pipeline
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
          {pipelineSteps.map((p) => (
            <div
              key={p.step}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span className="mono cyan" style={{ fontSize: '0.72rem', fontWeight: 700 }}>STEP {p.step}</span>
                <CheckCircle2 size={13} className="green" />
              </div>
              <strong style={{ display: 'block', fontSize: '0.82rem', color: '#FFFFFF', marginBottom: '4px' }}>{p.title}</strong>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4, display: 'block' }}>{p.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Anomaly Incident Selector & Inspector */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} className="amber" />
            <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.1rem', textTransform: 'none' }}>
              Observed Anomaly Radar &amp; Root-Cause Inspector
            </h4>
          </div>
          <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
            5 Injected Anomaly Events Detected (Ground Truth)
          </span>
        </div>

        {/* Incident Button List */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {ANOMALY_INCIDENTS.map((inc) => (
            <button
              key={inc.id}
              type="button"
              onClick={() => setSelectedIncident(inc)}
              style={{
                background: selectedIncident.id === inc.id ? 'var(--indigo)' : 'var(--panel)',
                color: selectedIncident.id === inc.id ? '#FFFFFF' : 'var(--text-muted)',
                border: `1px solid ${selectedIncident.id === inc.id ? 'var(--cyan)' : 'var(--line)'}`,
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <span className={`badge ${getSeverityBadge(inc.severity)}`} style={{ fontSize: '0.65rem' }}>
                {inc.severity.toUpperCase()}
              </span>
              <span>{inc.label}</span>
            </button>
          ))}
        </div>

        {/* Detailed Inspector Card */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line-bright)',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid var(--line)', marginBottom: '18px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className={`badge ${getSeverityBadge(selectedIncident.severity)}`}>
                  {selectedIncident.severity.toUpperCase()} ALERT
                </span>
                <span className="mono cyan" style={{ fontSize: '0.82rem' }}>ID: {selectedIncident.id}</span>
                <span className="mono dim" style={{ fontSize: '0.78rem' }}>Period: {selectedIncident.date}</span>
              </div>
              <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.2rem', textTransform: 'none' }}>
                {selectedIncident.label}
              </h4>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span className="stat-label">Statistical Z-Score</span>
              <div className="stat-value" style={{ color: selectedIncident.zScore < 0 ? 'var(--red)' : 'var(--amber)', fontSize: '1.6rem' }}>
                {selectedIncident.zScore > 0 ? `+${selectedIncident.zScore.toFixed(2)}` : selectedIncident.zScore.toFixed(2)}σ
              </div>
            </div>
          </div>

          {/* Metric Comparison Stats Grid */}
          <div className="grid-3" style={{ marginBottom: '20px' }}>
            <div className="stat-box">
              <span className="stat-label">Observed Value</span>
              <div className="stat-value" style={{ color: '#FFFFFF', fontSize: '1.35rem' }}>
                {selectedIncident.observedValue}
              </div>
            </div>

            <div className="stat-box">
              <span className="stat-label">Historical Expected Baseline</span>
              <div className="stat-value" style={{ color: 'var(--text-muted)', fontSize: '1.35rem' }}>
                {selectedIncident.expectedValue}
              </div>
            </div>

            <div className="stat-box">
              <span className="stat-label">Deviation from Normal</span>
              <div className="stat-value" style={{ color: selectedIncident.deviationPct.startsWith('-') ? 'var(--red)' : 'var(--amber)', fontSize: '1.35rem' }}>
                {selectedIncident.deviationPct}
              </div>
            </div>
          </div>

          {/* Contributing Factors Decomposition */}
          <div style={{ background: 'rgba(12, 18, 36, 0.7)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
              Identified Contributing Root Factors (Multi-Dimensional Variance Decomposition)
            </span>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#E2E8F0', fontSize: '0.88rem' }}>
              {selectedIncident.contributingFactors.map((f, idx) => (
                <li key={idx}>{f}</li>
              ))}
            </ul>
          </div>

          {/* Suggested Countermeasure */}
          <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '10px', padding: '16px' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--indigo)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              AI Prescribed Countermeasure &amp; Recommended Action
            </span>
            <p style={{ margin: 0, color: '#C7D2FE', fontSize: '0.92rem' }}>
              {selectedIncident.suggestedAction}
            </p>
          </div>
        </div>
      </div>

      {/* Model Benchmark & Caveat */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <Cpu size={18} className="indigo" />
            Empirical Anomaly Detection Benchmark (artifacts/MODEL_EVALUATION.md)
          </div>
          <p className="card-desc">
            Evaluated on synthetic retail history with labeled injection windows:
          </p>
          <ul style={{ paddingLeft: '18px', marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <li><strong>facebook_spend:</strong> 100.0% Precision, 82.14% Recall, 0.0% False Positive Rate.</li>
            <li><strong>revenue:</strong> 86.67% Precision, 38.24% Recall, 2.63% False Positive Rate.</li>
            <li><strong>facebook_conversion:</strong> 75.0% Precision, 75.0% Recall, 75.0% F1.</li>
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <ShieldAlert size={18} className="amber" />
            Scientific Rigor: Correlation vs. Causal Attribution
          </div>
          <p className="card-desc">
            DecisionPilot AI strictly classifies multi-dimensional waterfall decompositions as <em>descriptive contribution shares</em>. The system alerts managers to co-occurring variances rather than claiming unverified causal certainty, preventing false diagnostic overconfidence.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-dim)', paddingTop: '8px' }}>
        <span>Source Code References:</span>
        <code style={{ fontSize: '0.75rem' }}>ai_service/anomaly.py</code>
        <code style={{ fontSize: '0.75rem' }}>backend/app/services.py (alerts)</code>
        <code style={{ fontSize: '0.75rem' }}>backend/app/main.py (GET /anomalies)</code>
      </div>
    </div>
  )
}

