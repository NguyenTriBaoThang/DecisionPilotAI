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
            Large language models are prone to confabulating plausible-sounding numbers. DecisionPilot AI solves this by disallowing raw SQL generation or ad-hoc math in prompts. The model only maps text to a typed Pydantic <code>Intent</code>; backend SQLAlchemy Core computes every metric over a read-only connection before rendering grounded prose.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Shield size={18} className="violet" />
            2. Typed Intent &amp; Read-Only Pool Enforcement
          </div>
          <p className="card-desc">
            Every query passes a regex prompt-injection / SQL-keyword blocker and strict Pydantic schema validation (<code>extra=&quot;forbid&quot;</code>) before running parameterized queries via <code>read_connection</code> (PostgreSQL <code>REPEATABLE READ, READ ONLY</code> + 8s statement timeout; SQLite <code>PRAGMA query_only = ON</code>).
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <FileText size={18} className="green" />
            3. Append-Only Audit Ledger (audit_events)
          </div>
          <p className="card-desc">
            Executive decisions, simulation feedback, and dataset imports are appended to the <code>audit_events</code> table with authenticated actor identity, UTC timestamp, and dataset hash lock—protected by DB triggers that block updates or deletions.
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

