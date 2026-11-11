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
    HMAC["HMAC Snapshot Authenticator"]
  end

  subgraph Orchestration ["Tier 3: Analytics & Orchestration"]
    LLM_ORCH["Intent Classifier & Orchestrator"]
    SQL_GEN["Fixed Read-Only Analytics Tools"]
    AUDIT["Append-Only audit_events Ledger"]
  end

  subgraph AI_Engine ["Tier 4: AI & Machine Learning"]
    LGBM["LightGBM Chronological Forecaster"]
    ISOF["Hybrid Anomaly Detector (Isolation Forest)"]
    SIM_ENG["Microeconomic Elasticity Engine"]
  end

  subgraph Persistence ["Tier 5: Persistence & Storage"]
    DB[("PostgreSQL 16 / SQLite Engine")]
    TABLES["6 Normalized Relational Tables"]
    CACHE["In-Memory Feature Snapshot"]
  end

  UI -->|HTTP Bearer Requests| FASTAPI
  FASTAPI --> RBAC
  RBAC --> LLM_ORCH
  LLM_ORCH --> SQL_GEN
  SQL_GEN -->|Read-Only Execution| DB
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
            To prevent race conditions during scenario evaluation, DecisionPilot AI implements PostgreSQL transaction-level advisory locks (<code>SELECT pg_advisory_xact_lock(...)</code>) and SQLite <code>BEGIN IMMEDIATE</code> locks. Simulations are cryptographically keyed to the exact <code>dataset_id</code> hash. If the dataset is modified during an analyst's simulation run, the API rejects stale submissions with HTTP 409 Conflict.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Database size={18} className="green" />
            Read-Only Connection Pool Isolation
          </div>
          <p className="card-desc">
            The analytical querying engine (<code>ai_service/llm_orchestrator.py</code>) routes each question to a fixed set of read-only analytics tools that run through SQLAlchemy. No user- or model-written SQL is executed, and questions that contain SQL statements are refused. Decision history is protected by database triggers against ordinary UPDATE and DELETE.
          </p>
        </div>
      </div>
    </section>
  )
}

