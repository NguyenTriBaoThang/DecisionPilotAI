export interface ArchNode {
  id: string
  tier: string
  label: string
  sub: string
  responsibility: string
  technology: string
  location: string
}

export const ARCH_TIERS = [
  { id: 'client', name: 'Tier 1: Client & Presentation Tier', desc: 'React 19, TypeScript, Vite, Tailwind CSS, Lucide, Three.js 3D Simulator' },
  { id: 'gateway', name: 'Tier 2: API Gateway & Security Tier', desc: 'FastAPI, Bearer Token Auth, RBAC (Viewer/Analyst/Admin), HMAC SHA-256' },
  { id: 'orchestration', name: 'Tier 3: Analytics & Orchestration Tier', desc: 'Typed Intent Router (Gemini / OpenAI / Rules), Parameterized SQLAlchemy Core Analytics, Append-only Audit Ledger' },
  { id: 'ml', name: 'Tier 4: AI & Machine Learning Tier', desc: 'LightGBM Regressors, Hybrid Isolation Forest + Z-Score/IQR, Counterfactual Scenario Calculator' },
  { id: 'data', name: 'Tier 5: Persistence & Storage Tier', desc: 'PostgreSQL 16 / SQLite, SQLAlchemy 2.0 Core, Normalized 6-Table Schema' },
]

export const ARCH_NODES: ArchNode[] = [
  {
    id: 'frontend',
    tier: 'Tier 1: Presentation',
    label: 'Interactive Frontend Dashboard',
    sub: 'React 19 + TypeScript + Vite + Tailwind CSS',
    responsibility: 'Renders business workspaces (/ask, /anomalies, /forecast, /scenarios, /recommendations, /data-sources, /settings), interactive charts, and 3D Scenario Simulator.',
    technology: 'React 19, Vite, Lucide Icons, Recharts, Three.js',
    location: 'frontend/src/',
  },
  {
    id: 'api-gateway',
    tier: 'Tier 2: Gateway',
    label: 'FastAPI REST Gateway',
    sub: 'Async Python web gateway',
    responsibility: 'Strict Pydantic v2 request validation (extra="forbid"), bearer token auth, RBAC enforcement, and response security headers.',
    technology: 'FastAPI, Uvicorn, Pydantic v2, Starlette',
    location: 'backend/app/main.py',
  },
  {
    id: 'rbac-security',
    tier: 'Tier 2: Gateway',
    label: 'Identity & Access Control (RBAC)',
    sub: 'Role enforcement & constant-time token compare',
    responsibility: 'Strict hierarchy: Viewer (read analytics/simulate), Analyst (record accepted/rejected feedback), Admin (import snapshots).',
    technology: 'HMAC-safe constant-time compare, Bearer Auth',
    location: 'backend/app/security.py',
  },
  {
    id: 'llm-orchestrator',
    tier: 'Tier 3: Orchestration',
    label: 'Natural Language Query Orchestrator',
    sub: 'Typed intent classification & parameterized routing',
    responsibility: 'Rejects injection attempts, classifies Vietnamese/English questions into a strict Pydantic Intent schema (via Gemini, OpenAI, or local bilingual rules), and runs parameterized SQLAlchemy Core queries on read-only DB sessions.',
    technology: 'Python, Pydantic v2 Intent, SQLAlchemy Core, Gemini / OpenAI',
    location: 'ai_service/llm_orchestrator.py',
  },
  {
    id: 'audit-ledger',
    tier: 'Tier 3: Orchestration',
    label: 'Append-Only Audit Ledger',
    sub: 'Protected operational history recording',
    responsibility: 'Records every query trace, simulation run, dataset import, and human decision with actor identity and UTC timestamps.',
    technology: 'SQLAlchemy Core, PostgreSQL trigger-protected audit_events',
    location: 'backend/app/db.py',
  },
  {
    id: 'forecasting-engine',
    tier: 'Tier 4: AI/ML',
    label: 'LightGBM & Baseline Forecaster',
    sub: '7- and 30-day revenue, order & demand forecasting',
    responsibility: 'Trains on 70/15/15 chronological split with 17 point-in-time rolling and calendar features; promotes LightGBM only when validation MAE beats baselines by >2%, with 90% empirical validation-residual intervals.',
    technology: 'LightGBM, Scikit-learn, NumPy, Pandas',
    location: 'ai_service/forecasting.py',
  },
  {
    id: 'anomaly-detector',
    tier: 'Tier 4: AI/ML',
    label: 'Hybrid Anomaly Detection Engine',
    sub: 'Multi-signal statistical & ML outlier detector',
    responsibility: 'Combines Isolation Forest, IQR, and robust Z-scores on a 56-day baseline window shifted by 7 days plus sustained drop and stockout-risk business rules.',
    technology: 'Isolation Forest, Rolling Robust Z-Score, IQR',
    location: 'ai_service/anomaly.py',
  },
  {
    id: 'scenario-simulator',
    tier: 'Tier 4: AI/ML',
    label: 'Microeconomic Simulation Engine',
    sub: 'Price elasticity, marketing response & inventory modeling',
    responsibility: 'Computes linear % demand response from price changes, power diminishing returns on marketing spend ((1+change)^alpha), and daily fulfillment under supplier lead time.',
    technology: 'Linear % elasticity, Power curve (alpha=0.65), Daily stock balance',
    location: 'ai_service/scenario.py',
  },
  {
    id: 'relational-db',
    tier: 'Tier 5: Persistence',
    label: 'Relational Database (PostgreSQL / SQLite)',
    sub: 'Normalized 3NF relational schema',
    responsibility: 'Stores 6 core business tables with strict primary/foreign key constraints, audit records, and serialized simulation state.',
    technology: 'PostgreSQL 16 / SQLite 3.40+',
    location: 'backend/app/db.py',
  },
]

