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
  { id: 'orchestration', name: 'Tier 3: Analytics & Orchestration Tier', desc: 'LLM Orchestrator, Zero-Hallucination SQL Synthesizer, Audit Ledger' },
  { id: 'ml', name: 'Tier 4: AI & Machine Learning Tier', desc: 'LightGBM Regressors, Isolation Forest Hybrids, Microeconomic Elasticity' },
  { id: 'data', name: 'Tier 5: Persistence & Storage Tier', desc: 'PostgreSQL 16 / SQLite, SQLAlchemy ORM, Normalized 3NF Relational Tables' },
]

export const ARCH_NODES: ArchNode[] = [
  {
    id: 'frontend',
    tier: 'Tier 1: Presentation',
    label: 'Interactive Frontend Dashboard',
    sub: 'React 19 + TypeScript + Vite + Tailwind CSS',
    responsibility: 'Renders 6 business workspaces, real-time responsive charts, microeconomic parameter sliders, and 3D Scenario Simulator.',
    technology: 'React 19, Vite, Lucide Icons, Recharts, Three.js',
    location: 'frontend/src/',
  },
  {
    id: 'api-gateway',
    tier: 'Tier 2: Gateway',
    label: 'FastAPI REST Gateway',
    sub: 'High-performance async Python web gateway',
    responsibility: 'Request validation (Pydantic v2), workspace token authentication, rate limiting, and HTTP response security headers.',
    technology: 'FastAPI, Uvicorn, Pydantic v2, Starlette',
    location: 'backend/app/main.py',
  },
  {
    id: 'rbac-security',
    tier: 'Tier 2: Gateway',
    label: 'Identity & Access Control (RBAC)',
    sub: 'Role enforcement & cryptographic verification',
    responsibility: 'Strict hierarchy: Viewer (read dashboards), Analyst (record approvals/feedback), Admin (import snapshots).',
    technology: 'HMAC SHA-256, constant-time compare',
    location: 'backend/app/security.py',
  },
  {
    id: 'llm-orchestrator',
    tier: 'Tier 3: Orchestration',
    label: 'Natural Language Query Orchestrator',
    sub: 'Intent routing & fixed read-only tools',
    responsibility: 'Classifies Vietnamese/English questions (local rules; Gemini/OpenAI optional), refuses unsafe or unsupported ones, and answers through fixed read-only analytics tools.',
    technology: 'Python, rule-based router, optional LLM intent extraction',
    location: 'ai_service/llm_orchestrator.py',
  },
  {
    id: 'audit-ledger',
    tier: 'Tier 3: Orchestration',
    label: 'Tamper-Evident Audit Ledger',
    sub: 'Immutable operational history recording',
    responsibility: 'Records every query executed, simulation run, dataset import, and executive decision with actor identity and timestamp.',
    technology: 'SQLAlchemy Core, UTC ISO 8601 timestamps',
    location: 'backend/app/db.py',
  },
  {
    id: 'forecasting-engine',
    tier: 'Tier 4: AI/ML',
    label: 'LightGBM Chronological Forecaster',
    sub: '30-day ahead demand & revenue forecasting',
    responsibility: 'Trains on 70/15/15 chronological split with 14 rolling and calendar features; generates 90% confidence prediction intervals.',
    technology: 'LightGBM, Scikit-learn, NumPy, Pandas',
    location: 'ai_service/forecasting.py',
  },
  {
    id: 'anomaly-detector',
    tier: 'Tier 4: AI/ML',
    label: 'Hybrid Anomaly Detection Engine',
    sub: 'Multi-signal statistical & ML outlier detector',
    responsibility: 'Combines Isolation Forest with rolling Z-score filters to flag sudden dips in revenue, conversion rates, and stockout threats.',
    technology: 'Isolation Forest, Robust Scaler, Rolling Stats',
    location: 'ai_service/anomaly.py',
  },
  {
    id: 'scenario-simulator',
    tier: 'Tier 4: AI/ML',
    label: 'What-If Simulation Engine',
    sub: 'Price elasticity & marketing response modeling',
    responsibility: 'Computes demand response from price adjustments (ΔP → ΔQ), diminishing-returns advertising response, and inventory safety stock.',
    technology: 'Linear elasticity response, power-law ad response',
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

