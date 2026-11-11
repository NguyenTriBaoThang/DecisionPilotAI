import { useState } from 'react'
import { Folder, FolderOpen, FileCode, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react'
import { REPO_URL } from '../data/site'

interface TreeNode {
  name: string
  path: string
  desc: string
  children?: TreeNode[]
}

const TREE_DATA: TreeNode[] = [
  {
    name: 'backend/',
    path: 'backend',
    desc: 'FastAPI core application, database models, analytics services, security & audit',
    children: [
      { name: 'app/main.py', path: 'backend/app/main.py', desc: 'FastAPI endpoints, middleware, audit logging, error handlers' },
      { name: 'app/services.py', path: 'backend/app/services.py', desc: 'KPI aggregations, anomaly formatting, forecast serialization' },
      { name: 'app/db.py', path: 'backend/app/db.py', desc: 'SQLAlchemy table definitions, advisory locks, read-only connections' },
      { name: 'app/schemas.py', path: 'backend/app/schemas.py', desc: 'Pydantic v2 domain models for requests and analytical responses' },
      { name: 'app/security.py', path: 'backend/app/security.py', desc: 'Bearer token identification, constant-time compare, RBAC enforcement' },
    ],
  },
  {
    name: 'frontend/',
    path: 'frontend',
    desc: 'React 19 + TypeScript + Vite business intelligence dashboard (8 workspaces + Live Portal)',
    children: [
      { name: 'src/App.tsx', path: 'frontend/src/App.tsx', desc: 'Workspace router, navigation, and dashboard state provider' },
      { name: 'src/api.ts', path: 'frontend/src/api.ts', desc: 'HTTP client with local snapshot fallback for GitHub Pages preview' },
      { name: 'src/mockData.ts', path: 'frontend/src/mockData.ts', desc: 'Deterministic fallback snapshot data when API server is absent' },
      { name: 'src/utils/investigate.ts', path: 'frontend/src/utils/investigate.ts', desc: 'Connected workflow helper bridging alerts & KPI cards into /ask?q=...' },
      { name: 'src/components/WorkspacePages.tsx', path: 'frontend/src/components/WorkspacePages.tsx', desc: 'Core /ask, /anomalies, /forecast, /scenarios, /recommendations & /audit pages' },
      { name: 'src/components/ThreeScenarioSimulator.tsx', path: 'frontend/src/components/ThreeScenarioSimulator.tsx', desc: 'Interactive 3D Three.js scenario impact visualizer' },
      { name: 'e2e/demo-flow.spec.ts', path: 'frontend/e2e/demo-flow.spec.ts', desc: 'End-to-end Playwright test verifying the connected decision loop' },
    ],
  },
  {
    name: 'ai_service/',
    path: 'ai_service',
    desc: 'Machine learning, statistical anomaly detection, and microeconomic simulation engines',
    children: [
      { name: 'features.py', path: 'ai_service/features.py', desc: '17-feature causal chronological lag, rolling window, and calendar matrix' },
      { name: 'forecasting.py', path: 'ai_service/forecasting.py', desc: 'LightGBM model training, validation MAE gate, and seasonal MA baselines' },
      { name: 'anomaly.py', path: 'ai_service/anomaly.py', desc: '56-day trailing baseline + IQR/robust Z-score + Isolation Forest hybrid detector' },
      { name: 'scenario.py', path: 'ai_service/scenario.py', desc: 'Price elasticity response, diminishing-returns ad spend, inventory buffers' },
      { name: 'llm_orchestrator.py', path: 'ai_service/llm_orchestrator.py', desc: 'Typed Intent classifier (local rules or Gemini/OpenAI) -> fixed read-only tools' },
    ],
  },
  {
    name: 'scripts/',
    path: 'scripts',
    desc: 'ETL ingestion pipeline, synthetic generator, model training, and benchmark scripts',
    children: [
      { name: 'pipeline.py', path: 'scripts/pipeline.py', desc: '6-table CSV validation, integrity checks, and SQLite/PostgreSQL snapshot load' },
      { name: 'train.py', path: 'scripts/train.py', desc: 'Model training pipeline on chronological Train/Val/Test split (--out artifacts)' },
      { name: 'generate.py', path: 'scripts/generate.py', desc: 'Seeded synthetic SME dataset generator with planted business anomalies' },
      { name: 'benchmark.py', path: 'scripts/benchmark.py', desc: 'Query router evaluation running the 46-case accuracy & latency benchmark' },
      { name: 'bootstrap.py', path: 'scripts/bootstrap.py', desc: 'Initializes local database, trains model artifact if missing, verifies readiness' },
      { name: 'dev.ps1', path: 'scripts/dev.ps1', desc: 'Windows PowerShell script starting Uvicorn (:8000) and Vite (:5173)' },
    ],
  },
  {
    name: 'artifacts/',
    path: 'artifacts',
    desc: 'Serialized model weights, data quality reports, and benchmark evaluation ledgers',
    children: [
      { name: 'f32e87e3a5744333ff98d3bf.joblib', path: 'artifacts/f32e87e3a5744333ff98d3bf.joblib', desc: 'Trained model bundle keyed by dataset_id (forecast, anomaly, report)' },
      { name: 'MODEL_EVALUATION.md', path: 'artifacts/MODEL_EVALUATION.md', desc: 'Empirical model WAPE, 90% PI coverage, and validation gate outcomes' },
      { name: 'query_benchmark.json', path: 'artifacts/query_benchmark.json', desc: '46-case NL router accuracy and execution latency benchmark ledger' },
    ],
  },
  {
    name: 'docs-site/',
    path: 'docs-site',
    desc: 'Multi-page React technical documentation portal hosted at GitHub Pages root',
  },
  {
    name: 'report/',
    path: 'report',
    desc: 'Competition submission materials, evidence pack, and technical presentation writeups',
  },
]

export function InteractiveProjectTree() {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    backend: true,
    frontend: true,
    ai_service: true,
    scripts: true,
    artifacts: true,
  })

  const toggle = (path: string) => {
    setOpenMap((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  const renderNode = (node: TreeNode, depth = 0) => {
    const isOpen = openMap[node.path] ?? false
    const hasChildren = node.children && node.children.length > 0

    return (
      <div key={node.path} style={{ marginLeft: `${depth * 18}px` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 8px',
            borderRadius: '6px',
            cursor: hasChildren ? 'pointer' : 'default',
            transition: 'background 0.15s ease',
          }}
          onClick={() => hasChildren && toggle(node.path)}
          className="tree-row"
        >
          {hasChildren ? (
            isOpen ? <ChevronDown size={14} className="cyan" /> : <ChevronRight size={14} className="dim" />
          ) : (
            <div style={{ width: 14 }} />
          )}

          {hasChildren ? (
            isOpen ? <FolderOpen size={16} className="cyan" /> : <Folder size={16} className="cyan" />
          ) : (
            <FileCode size={16} className="dim" />
          )}

          <span className="mono" style={{ fontSize: '0.86rem', color: hasChildren ? '#FFFFFF' : '#CBD5E1', fontWeight: hasChildren ? 700 : 400 }}>
            {node.name}
          </span>

          <span className="dim" style={{ fontSize: '0.8rem', marginLeft: '6px', flex: 1 }}>
            — {node.desc}
          </span>

          <a
            href={`${REPO_URL}/tree/main/${node.path}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-dim)' }}
            title="View on GitHub"
          >
            <ExternalLink size={12} />
          </a>
        </div>

        {hasChildren && isOpen && (
          <div style={{ borderLeft: '1px solid var(--line)', marginLeft: '14px', paddingLeft: '4px' }}>
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: '10px',
        padding: '16px',
        margin: '20px 0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: '0.78rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700 }}>
          Repository Directory Map (Verified v1.0.0)
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-copy"
        >
          <ExternalLink size={12} />
          Browse on GitHub
        </a>
      </div>
      <div>{TREE_DATA.map((node) => renderNode(node))}</div>
    </div>
  )
}

