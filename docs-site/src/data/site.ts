export interface NavSection {
  id: string
  num: string
  title: string
  blurb: string
  group: 'Getting Started' | 'Architecture & Data' | 'AI & Analytics' | 'Development' | 'Reference'
}

export const REPO_URL = 'https://github.com/NguyenTriBaoThang/DecisionPilotAI'
export const APP_DEMO_URL = 'https://nguyentribaothang.github.io/DecisionPilotAI/'
export const VERSION = 'v1.0.0'
export const COMPETITION = 'AI for Business Innovation 2026'

export const NAV_SECTIONS: NavSection[] = [
  // Getting Started
  {
    id: 'overview',
    num: '01',
    title: 'Project Overview & Mission',
    blurb: 'Executive summary, SME context in Vietnam, and the 3-layer architecture (Ask → Predict → Decide).',
    group: 'Getting Started',
  },
  {
    id: 'workspaces',
    num: '02',
    title: 'Core Workspaces & Features',
    blurb: 'Six dedicated business intelligence workspaces: Overview, Copilot, Anomaly, Forecast, Simulator, and Recommendations.',
    group: 'Getting Started',
  },
  {
    id: 'quickstart',
    num: '11',
    title: 'Installation & Quick Start',
    blurb: 'Step-by-step setup for Windows, Linux, macOS, and Docker Compose with one-click scripts.',
    group: 'Getting Started',
  },

  // Architecture & Data
  {
    id: 'architecture',
    num: '03',
    title: 'System Architecture',
    blurb: '5-tier system design: Client UI, API Gateway, Orchestration, AI/ML Modeling, and Persistence.',
    group: 'Architecture & Data',
  },
  {
    id: 'data-schema',
    num: '04',
    title: 'Data Architecture & Schema',
    blurb: '6 relational tables, strict primary/foreign key constraints, and business data dictionary.',
    group: 'Architecture & Data',
  },
  {
    id: 'etl-pipeline',
    num: '05',
    title: 'Data Processing & ETL Pipeline',
    blurb: '7-stage automated pipeline from multi-source CSV ingestion to clean analytical snapshots.',
    group: 'Architecture & Data',
  },

  // AI & Analytics
  {
    id: 'data-decision-intelligence',
    num: '05★',
    title: 'Data & Decision Intelligence',
    blurb: 'Flagship interactive showcase for LIKELION 2026: Natural Language Analytics, Revenue Anomaly Diagnostics, Demand Forecasting, and Scenario Simulation.',
    group: 'AI & Analytics',
  },
  {
    id: 'ai-engine',
    num: '06',
    title: 'AI & Machine Learning Engine',
    blurb: 'LightGBM chronological forecasting, Isolation Forest anomaly detection, and Price Elasticity microeconomics.',
    group: 'AI & Analytics',
  },
  {
    id: 'training-workflow',
    num: '07',
    title: 'Model Training Workflow',
    blurb: 'Chronological split (Train 70%, Val 15%, Test 15%), hyperparameter tuning, and zero data leakage.',
    group: 'AI & Analytics',
  },
  {
    id: 'benchmarks',
    num: '08',
    title: 'Model Evaluation & Benchmarks',
    blurb: 'Empirical verification: 11.24% WAPE, 92.4% anomaly precision, and holdout scenario replay.',
    group: 'AI & Analytics',
  },
  {
    id: 'simulator',
    num: '09',
    title: 'Microeconomic Scenario Simulator',
    blurb: 'What-If simulations: pricing elasticity, marketing ROAS response curves, and inventory safety buffers.',
    group: 'AI & Analytics',
  },

  // Development
  {
    id: 'project-structure',
    num: '12',
    title: 'Project Structure & Codebase',
    blurb: 'Interactive directory hierarchy with direct links to GitHub source modules.',
    group: 'Development',
  },
  {
    id: 'testing-qa',
    num: '13',
    title: 'Testing & Quality Assurance',
    blurb: 'pytest unit and integration test suites, SQL integrity checks, and automated CI pipelines.',
    group: 'Development',
  },
  {
    id: 'security-governance',
    num: '14',
    title: 'Security, Privacy & AI Responsibility',
    blurb: 'Read-only SQL synthesis, HMAC snapshot verification, zero-hallucination grounding, and human-in-the-loop audit.',
    group: 'Development',
  },

  // Reference
  {
    id: 'api-reference',
    num: '10',
    title: 'REST API Specification',
    blurb: 'Full FastAPI endpoint documentation with request/response schemas and interactive curl builder.',
    group: 'Reference',
  },
  {
    id: 'case-study',
    num: '15',
    title: 'End-to-End Business Case Study',
    blurb: 'Complete business case: diagnosing a sudden 24% revenue drop and evaluating recommended solutions.',
    group: 'Reference',
  },
  {
    id: 'roadmap',
    num: '16',
    title: 'Roadmap & Contributing',
    blurb: 'Current technical boundaries, upcoming v1.1/v1.2 roadmap, and open-source contribution guidelines.',
    group: 'Reference',
  },
]

