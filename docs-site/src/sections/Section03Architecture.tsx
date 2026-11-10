import { InteractiveArchitecture } from '../components/InteractiveArchitecture'
import { CodeBlock } from '../components/CodeBlock'
import { ShieldCheck, Database, Cpu, ArrowRightLeft } from 'lucide-react'

export function Section03Architecture() {
  const mermaidDiagram = `
flowchart TD
  subgraph Client ["Tier 1: Client & Presentation"]
    UI["React 19 SPA (Vite + Tailwind CSS)"]
    SIM3D["3D Scenario Simulator (Three.js)"]
    COPILOT["Executive Copilot Interface"]
  end

  subgraph Gateway ["Tier 2: API Gateway & Security"]
    FASTAPI["FastAPI Async REST Service"]
    RBAC["RBAC & Bearer Token Validator"]
    DSLOCK["Dataset Snapshot Hash Lock"]
  end

  subgraph Orchestration ["Tier 3: Analytics & Orchestration"]
    LLM_ORCH["Intent Router (llm_orchestrator.py)"]
    SQL_CORE["Parameterized SQLAlchemy Core"]
    AUDIT["Append-Only Audit Ledger"]
  end

  subgraph AI_Engine ["Tier 4: AI & Machine Learning"]
    LGBM["LightGBM & Baseline Forecaster"]
    ISOF["Hybrid Anomaly Detector (Isolation Forest)"]
    SIM_ENG["Scenario Counterfactual Engine"]
  end

  subgraph Persistence ["Tier 5: Persistence & Storage"]
    DB[("PostgreSQL 16 / SQLite Engine")]
    TABLES["6 Data + 3 Meta/Audit/Sim Tables"]
    CACHE["Versioned Joblib Model Bundle"]
  end

  UI -->|HTTP Bearer Requests| FASTAPI
  FASTAPI --> RBAC
  RBAC --> DSLOCK
  RBAC --> LLM_ORCH
  LLM_ORCH --> SQL_CORE
  SQL_CORE -->|Read-Only Execution| DB
  DB --> TABLES
  FASTAPI --> LGBM
  FASTAPI --> ISOF
  FASTAPI --> SIM_ENG
  SIM_ENG --> DB
  FASTAPI --> AUDIT
  AUDIT -->|Append-Only| DB
`

  return (
    <section id="sec-architecture">
      <h2>
        <span className="sec-badge">03</span>
        System Architecture &amp; Component Design
      </h2>

      <p className="lead">
        DecisionPilot AI employs a decoupled, 5-tier architecture designed for horizontal scalability, high analytical throughput, and cryptographic workspace isolation.
      </p>

      {/* Interactive Explorer */}
      <InteractiveArchitecture />

      <h3>Data Flow &amp; Inter-Tier Communication Diagram</h3>
      <p>
        The diagram below illustrates the path of a client request from presentation down to database execution and model inferencing.
      </p>

      <CodeBlock code={mermaidDiagram.trim()} label="System Architecture Diagram (Mermaid)" />

      <div className="grid-2" style={{ marginTop: '24px' }}>
        <div className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="cyan" />
            Advisory Locking &amp; Snapshot Consistency
          </div>
          <p className="card-desc">
            To prevent race conditions during snapshot loading and audit logging, DecisionPilot AI acquires PostgreSQL transaction-level advisory locks (<code>SELECT pg_advisory_xact_lock(177480102)</code>) and SQLite <code>BEGIN IMMEDIATE</code> locks. Scenario feedback and recommendations bind to the exact <code>dataset_id</code> SHA-256 prefix, returning HTTP 409 Conflict if the underlying dataset changes.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Database size={18} className="green" />
            Read-Only Connection Pool Isolation
          </div>
          <p className="card-desc">
            Analytical querying (<code>ai_service/llm_orchestrator.py</code>) maps natural language into a strict Pydantic <code>Intent</code> (<code>extra=&quot;forbid&quot;</code>) with regex injection guards and executes parameterized SQLAlchemy Core queries via <code>read_connection</code> (PostgreSQL <code>READ ONLY</code> + 8s timeout; SQLite <code>PRAGMA query_only = ON</code>).
          </p>
        </div>
      </div>
    </section>
  )
}

