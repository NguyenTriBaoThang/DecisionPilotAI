import { CodeBlock } from '../components/CodeBlock'
import { CheckCircle2, Clock, ShieldAlert, GitPullRequest, Heart } from 'lucide-react'
import { REPO_URL } from '../data/site'

export function Section16Roadmap() {
  const contribSteps = `# Fork repository on GitHub, then clone locally:
git clone https://github.com/<your-username>/DecisionPilotAI.git
cd DecisionPilotAI

# Create a feature branch:
git checkout -b feature/kiotviet-connector

# Run test suite to verify baseline:
pytest -v

# Commit changes using Conventional Commits:
git commit -m "feat(integrations): add KiotViet webhook listener"
git push origin feature/kiotviet-connector`

  return (
    <section id="sec-roadmap">
      <h2>
        <span className="sec-badge">16</span>
        Roadmap, Limitations &amp; Contributing
      </h2>

      <p className="lead">
        DecisionPilot AI is developed under the open-source MIT License for the <strong>AI for Business Innovation 2026</strong> Hackathon. We welcome contributions from data scientists, software engineers, and SME business analysts.
      </p>

      {/* Feature Status Table */}
      <div className="grid-3" style={{ margin: '24px 0' }}>
        <div className="card">
          <div className="card-title">
            <CheckCircle2 size={18} className="green" />
            Completed (v1.0.0)
          </div>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            <li style={{ marginBottom: '6px' }}>&bull; 6 Core BI Workspaces</li>
            <li style={{ marginBottom: '6px' }}>&bull; 3D Scenario Simulator (Three.js)</li>
            <li style={{ marginBottom: '6px' }}>&bull; LightGBM Chronological Forecaster</li>
            <li style={{ marginBottom: '6px' }}>&bull; Isolation Forest Anomaly Detection</li>
            <li style={{ marginBottom: '6px' }}>&bull; Typed Intent Copilot &amp; Read-Only SQLAlchemy Core</li>
            <li style={{ marginBottom: '6px' }}>&bull; Append-Only Audit Ledger (<code>audit_events</code>)</li>
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <Clock size={18} className="cyan" />
            Near-Term Roadmap (v1.1)
          </div>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            <li style={{ marginBottom: '6px' }}>&bull; Direct API Connectors for KiotViet &amp; Sapo</li>
            <li style={{ marginBottom: '6px' }}>&bull; Shopee &amp; TikTok Shop webhook sync</li>
            <li style={{ marginBottom: '6px' }}>&bull; Automated Telegram &amp; Zalo alert bots</li>
            <li style={{ marginBottom: '6px' }}>&bull; Customer RFM Cohort Matrix</li>
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <Clock size={18} className="violet" />
            Future Vision (v2.0)
          </div>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            <li style={{ marginBottom: '6px' }}>&bull; Multi-tenant organization accounts</li>
            <li style={{ marginBottom: '6px' }}>&bull; Autonomous inventory reorder dispatch</li>
            <li style={{ marginBottom: '6px' }}>&bull; Reinforcement learning pricing policies</li>
            <li style={{ marginBottom: '6px' }}>&bull; Vietnamese speech-to-query voice input</li>
          </ul>
        </div>
      </div>

      <div className="callout warn">
        <div className="callout-title">
          <ShieldAlert size={16} className="amber" />
          Technical Boundaries &amp; Known Scope
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }}>
          Current release v1.0.0 is optimized for single validated SME workspaces. Simultaneous multi-tenant database partitioning is scheduled for v1.2. The evaluation metrics reported herein are benchmarked against 730-day validated retail snapshots with ground-truth anomaly injections.
        </p>
      </div>

      <h3>Contributing to DecisionPilot AI</h3>
      <p>
        Contributions are welcome! Please adhere to our code style guidelines (Black, Flake8, ESLint, TypeScript Strict) and ensure all pytest tests pass before submitting a Pull Request:
      </p>

      <CodeBlock code={contribSteps} label="bash" />

      {/* Footer credits */}
      <footer className="doc-footer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <strong>DecisionPilot AI Documentation</strong> · Released under the <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License</a>.
          </div>
          <div className="mono dim">
            Target Host: nguyentribaothang.github.io/DecisionPilotAI
          </div>
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
          Built for the AI for Business Innovation 2026 Hackathon. All benchmark metrics, table schemas, and API endpoints are derived from verifiable repository artifacts.
        </div>
      </footer>
    </section>
  )
}

