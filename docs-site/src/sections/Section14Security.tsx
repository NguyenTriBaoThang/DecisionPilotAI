import { Shield, Lock, EyeOff, FileText, CheckCircle2 } from 'lucide-react'

export function Section14Security() {
  return (
    <section id="sec-security-governance">
      <h2>
        <span className="sec-badge">14</span>
        Security, Privacy &amp; AI Responsibility
      </h2>

      <p className="lead">
        Enterprise financial and transactional data requires uncompromising protection. DecisionPilot AI enforces zero-trust architecture, strict read-only execution sandboxes, and immutable audit logging.
      </p>

      <div className="grid-2" style={{ margin: '24px 0' }}>
        <div className="card">
          <div className="card-title">
            <Lock size={18} className="cyan" />
            1. Zero-Hallucination Grounding
          </div>
          <p className="card-desc">
            Large language models are prone to confabulating plausible-sounding numbers. DecisionPilot AI solves this by disallowing the LLM from generating figures directly. The model only synthesizes read-only SQL; the database engine computes the exact metric; the model then formats the verified tabular output into natural Vietnamese or English prose.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Shield size={18} className="violet" />
            2. No Model-Written SQL
          </div>
          <p className="card-desc">
            Questions are routed to a fixed set of tested, read-only analytics tools; neither users nor language models supply SQL. Questions that contain SQL statements (<code>DROP</code>, <code>UPDATE</code>, <code>INSERT</code>, <code>DELETE</code>, <code>SELECT ... FROM</code>) or ask for unsupported metrics are refused before any query runs.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <FileText size={18} className="green" />
            3. Immutable Audit Ledger
          </div>
          <p className="card-desc">
            Every executive action is appended to the <code>audit</code> database ledger with authenticated actor identity, UTC timestamp, and dataset version hash. This includes every question asked, scenario simulated, and recommendation approved or dismissed, providing complete auditability for corporate governance.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <EyeOff size={18} className="amber" />
            4. SME Data Privacy &amp; Local Deployment
          </div>
          <p className="card-desc">
            DecisionPilot AI does not require sending sensitive customer PII or raw transaction records to foreign cloud servers. The entire backend, database, and forecasting engine can run completely on-premises or on private sovereign cloud infrastructure within Vietnam.
          </p>
        </div>
      </div>
    </section>
  )
}

