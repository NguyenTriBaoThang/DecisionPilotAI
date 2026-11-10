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
      { name: 'app/analytics.py', path: 'backend/app/analytics.py', desc: 'Parameterized SQLAlchemy Core aggregations, KPI summaries & comparisons' },
      { name: 'app/services.py', path: 'backend/app/services.py', desc: 'Forecast/scenario orchestration, recommendations & evaluation bundle loader' },
      { name: 'app/db.py', path: 'backend/app/db.py', desc: 'SQLAlchemy 6-table schema, advisory locks, read-only connections' },
      { name: 'app/schemas.py', path: 'backend/app/schemas.py', desc: 'Strict Pydantic v2 schemas (extra="forbid") for requests and intents' },
      { name: 'app/security.py', path: 'backend/app/security.py', desc: 'Bearer token identification, constant-time compare, RBAC enforcement' },
    ],
  },
  {
    name: 'frontend/',
    path: 'frontend',
    desc: 'Modern React 19 + TypeScript + Vite + Tailwind CSS business intelligence dashboard',
    children: [
      { name: 'src/main.tsx', path: 'frontend/src/main.tsx', desc: 'Application entry point, BrowserRouter workspace routes & auth gate' },
      { name: 'src/Dashboard.tsx', path: 'frontend/src/Dashboard.tsx', desc: 'Executive Overview KPIs, breakdowns & anomaly summary workspace' },
      { name: 'src/WorkspacePages.tsx', path: 'frontend/src/WorkspacePages.tsx', desc: 'Copilot (/ask), Anomaly Center, Forecast Center, Simulator & Recommendations' },
      { name: 'src/api.ts', path: 'frontend/src/api.ts', desc: 'HTTP client with static fallback for GitHub Pages preview' },
      { name: 'src/mockData.ts', path: 'frontend/src/mockData.ts', desc: 'Static snapshot fixture enabling offline GitHub Pages preview' },
      { name: 'src/preferences.tsx', path: 'frontend/src/preferences.tsx', desc: 'Bilingual (VI/EN) & currency display context provider' },
      { name: 'src/features/scenario-simulator/components/ScenarioSimulator3D.tsx', path: 'frontend/src/features/scenario-simulator/components/ScenarioSimulator3D.tsx', desc: 'Interactive 3D holographic What-If workspace & tab navigation' },
      { name: 'src/components/DataSourcesPage.tsx', path: 'frontend/src/components/DataSourcesPage.tsx', desc: 'Dataset integrity inspector, atomic ZIP/XLSX uploader & artifact status' },
      { name: 'src/components/TechnicalDocumentationPage.tsx', path: 'frontend/src/components/TechnicalDocumentationPage.tsx', desc: 'Embedded technical documentation & API overview view' },
    ],
  },
  {
    name: 'ai_service/',
    path: 'ai_service',
    desc: 'Machine learning, statistical anomaly detection, and counterfactual scenario engines',
    children: [
      { name: 'features.py', path: 'ai_service/features.py', desc: '17 point-in-time lag, rolling mean/std, growth & calendar features' },
      { name: 'forecasting.py', path: 'ai_service/forecasting.py', desc: 'LightGBM vs Seasonal Naive / Moving Average selection & residual intervals' },
      { name: 'anomaly.py', path: 'ai_service/anomaly.py', desc: 'Hybrid Isolation Forest + IQR + robust Z-score (56-day shifted window)' },
      { name: 'scenario.py', path: 'ai_service/scenario.py', desc: 'Linear price elasticity, power marketing diminishing returns & daily stock replay' },
      { name: 'llm_orchestrator.py', path: 'ai_service/llm_orchestrator.py', desc: 'Typed Intent classification (Gemini/OpenAI/rules) + deterministic analytics' },
    ],
  },
  {
    name: 'scripts/',
    path: 'scripts',
    desc: 'ETL ingestion pipeline, synthetic generator, model training, and evaluation scripts',
    children: [
      { name: 'generate.py', path: 'scripts/generate.py', desc: 'Reproducible synthetic dataset generator with labeled anomalies (seed 42)' },
      { name: 'pipeline.py', path: 'scripts/pipeline.py', desc: 'Dataset validation, atomic snapshot import & CSV/XLSX loading' },
      { name: 'train.py', path: 'scripts/train.py', desc: 'Chronological 70/15/15 training pipeline & evaluation artifact exporter' },
      { name: 'report.py', path: 'scripts/report.py', desc: 'Builds MODEL_EVALUATION.md & evaluation figures' },
      { name: 'benchmark.py', path: 'scripts/benchmark.py', desc: 'Runs 46-case AI Copilot grounding and latency benchmark' },
    ],
  },
  {
    name: 'artifacts/',
    path: 'artifacts',
    desc: 'Serialized model weights, data quality reports, and benchmark evaluation ledgers',
    children: [
      { name: 'MODEL_EVALUATION.md', path: 'artifacts/MODEL_EVALUATION.md', desc: 'Empirical model accuracy, anomaly precision/recall, and holdout replay' },
      { name: 'data_quality.json', path: 'artifacts/data_quality.json', desc: 'Relational data integrity checks and synthetic generator metadata' },
      { name: 'query_benchmark.json', path: 'artifacts/query_benchmark.json', desc: '46-case AI Copilot grounding and execution latency benchmark' },
    ],
  },
  {
    name: 'docs-site/',
    path: 'docs-site',
    desc: 'Independent, static technical documentation website hosted on GitHub Pages',
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

