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
            Language models are never allowed to invent numbers or generate raw SQL. Instead, <code>ai_service/llm_orchestrator.py</code> classifies user questions into a strict Pydantic <code>Intent</code> schema and invokes fixed read-only analytics tools. PostgreSQL or SQLite computes exact aggregates, and every narrative figure traces back to tool evidence.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Shield size={18} className="violet" />
            2. No Model-Written SQL
          </div>
          <p className="card-desc">
            Questions are routed to a fixed set of tested, read-only analytics tools executing parameterized SQLAlchemy queries under read-only transaction isolation; neither users nor language models supply SQL. Inputs containing SQL statements (<code>DROP</code>, <code>UPDATE</code>, <code>INSERT</code>, <code>DELETE</code>, <code>SELECT ... FROM</code>) or unsupported metrics are refused before execution.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <FileText size={18} className="green" />
            3. Append-Only Audit Ledger (audit_events)
          </div>
          <p className="card-desc">
            Every query, dataset load, recommendation feedback, and scenario decision is appended to the <code>audit_events</code> table with authenticated actor identity, UTC timestamp, and active 24-hex <code>dataset_id</code> lock.
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

