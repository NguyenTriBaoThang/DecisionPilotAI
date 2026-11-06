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
    desc: 'Modern React 19 + TypeScript + Vite + Tailwind CSS business intelligence dashboard',
    children: [
      { name: 'src/App.tsx', path: 'frontend/src/App.tsx', desc: 'Workspace router and dashboard state provider' },
      { name: 'src/api.ts', path: 'frontend/src/api.ts', desc: 'HTTP client with mock offline fallback for GitHub Pages' },
      { name: 'src/mockData.ts', path: 'frontend/src/mockData.ts', desc: 'Static snapshot fixture enabling 100% offline interactivity' },
      { name: 'src/components/ThreeScenarioSimulator.tsx', path: 'frontend/src/components/ThreeScenarioSimulator.tsx', desc: 'Futuristic 3D Holographic AI scenario simulator' },
      { name: 'src/components/Overview.tsx', path: 'frontend/src/components/Overview.tsx', desc: 'Executive KPI dashboard, channel efficiency, product matrices' },
      { name: 'src/components/AskAICopilot.tsx', path: 'frontend/src/components/AskAICopilot.tsx', desc: 'Executive conversational interface with chart auto-render' },
      { name: 'src/components/AnomalyCenter.tsx', path: 'frontend/src/components/AnomalyCenter.tsx', desc: 'Statistical outlier inspection and root-cause analysis' },
      { name: 'src/components/ForecastCenter.tsx', path: 'frontend/src/components/ForecastCenter.tsx', desc: 'Chronological sales & demand forecasting with confidence bands' },
      { name: 'src/components/Recommendations.tsx', path: 'frontend/src/components/Recommendations.tsx', desc: 'Prescriptive action items with human-in-the-loop audit recording' },
    ],
  },
  {
    name: 'ai_service/',
    path: 'ai_service',
    desc: 'Machine learning, statistical anomaly detection, and microeconomic simulation engines',
    children: [
      { name: 'forecasting.py', path: 'ai_service/forecasting.py', desc: 'LightGBM model training, lag features, moving average baselines' },
      { name: 'anomaly.py', path: 'ai_service/anomaly.py', desc: 'Isolation Forest + Rolling Z-score hybrid anomaly detection' },
      { name: 'simulation.py', path: 'ai_service/simulation.py', desc: 'Price elasticity curves, Hill marketing saturation, inventory buffers' },
      { name: 'llm_orchestrator.py', path: 'ai_service/llm_orchestrator.py', desc: 'Query intent parsing, safe SQL synthesis, and grounded narrative answers' },
    ],
  },
  {
    name: 'scripts/',
    path: 'scripts',
    desc: 'ETL ingestion pipeline, synthetic generator, model training, and benchmark evaluation',
    children: [
      { name: 'pipeline.py', path: 'scripts/pipeline.py', desc: 'Automated 7-step data ingestion, validation, and snapshot serialization' },
      { name: 'train.py', path: 'scripts/train.py', desc: 'Model training pipeline on chronological 70/15/15 split' },
      { name: 'evaluate.py', path: 'scripts/evaluate.py', desc: 'Generates evaluation.json, WAPE benchmarks, and residual figures' },
      { name: 'generate_data.py', path: 'scripts/generate_data.py', desc: 'Reproducible business data synthesis with realistic injected anomalies' },
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

