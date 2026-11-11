import { useState } from 'react'
import {
  BookOpen,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  Layers,
  Network,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { Card, Heading, Pill, SectionTitle } from '../ui'

type DocTab = 'architecture' | 'datamodel' | 'ml' | 'api' | 'research' | 'operations'

export function TechnicalDocumentationPage() {
  const [activeTab, setActiveTab] = useState<DocTab>('architecture')

  const docTabs: { id: DocTab; title: string; subtitle: string; icon: React.ReactNode }[] = [
    {
      id: 'architecture',
      title: 'System Architecture',
      subtitle: '5-Tier Design & Sequence Flows',
      icon: <Layers size={18} className="text-indigo-400" />,
    },
    {
      id: 'datamodel',
      title: 'Relational Data Model',
      subtitle: '6 Normalized Tables & ERD',
      icon: <Database size={18} className="text-cyan-400" />,
    },
    {
      id: 'ml',
      title: 'Machine Learning & Econometrics',
      subtitle: 'LightGBM, Isolation Forest & Elasticity',
      icon: <Cpu size={18} className="text-purple-400" />,
    },
    {
      id: 'api',
      title: 'REST API Reference',
      subtitle: 'Endpoint Schemas & Contracts',
      icon: <Code2 size={18} className="text-emerald-400" />,
    },
    {
      id: 'research',
      title: 'Research Proposal',
      subtitle: 'Academic Framework & Impact',
      icon: <BookOpen size={18} className="text-amber-400" />,
    },
    {
      id: 'operations',
      title: 'Operations & Deployment',
      subtitle: 'Docker, Alembic & Launch Guide',
      icon: <Terminal size={18} className="text-pink-400" />,
    },
  ]

  return (
    <div className="space-y-6">
      <Heading
        eyebrow="ENGINEERING & DATA SCIENCE BLUEPRINT"
        title="Technical Documentation"
        subtitle="Complete system architecture, machine learning pipelines, microeconomic foundations, and API specifications for DecisionPilot AI."
      />

      {/* Navigation Pills */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {docTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeTab === tab.id
                ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.25)] text-white'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {tab.icon}
              <span className="font-semibold text-xs tracking-wide">{tab.title}</span>
            </div>
            <p className="text-[10px] text-slate-400 line-clamp-1">{tab.subtitle}</p>
          </button>
        ))}
      </div>

      {/* Main Documentation Content Area */}
      <Card className="p-6">
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <SectionTitle
              title="1. System Architecture & 5-Tier Overview"
              detail="Separation of concerns across Presentation, Gateway, Intelligence, Persistence, and Storage"
              aside={<Pill tone="info">Production v1.0</Pill>}
            />

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/20">
                <strong className="text-indigo-300 block mb-1">1. Presentation Layer</strong>
                <p className="text-slate-300 text-[11px]">
                  React 19, TypeScript, Three.js 3D WebGL Holographic Sphere, Recharts gradient charts, Tailwind CSS 4.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20">
                <strong className="text-cyan-300 block mb-1">2. API Gateway</strong>
                <p className="text-slate-300 text-[11px]">
                  FastAPI on Uvicorn, Pydantic v2 schemas, CORS middleware, sub-50ms latency SLA, read-only session pools.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-950/20">
                <strong className="text-purple-300 block mb-1">3. Intelligence Layer</strong>
                <p className="text-slate-300 text-[11px]">
                  LightGBM time-series regressor, Isolation Forest anomaly detector, Microeconomic What-If simulator.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20">
                <strong className="text-emerald-300 block mb-1">4. Data Access</strong>
                <p className="text-slate-300 text-[11px]">
                  SQLAlchemy 2.0 Core, Alembic schema migrations (head), snapshot hash validation and zero-leakage partitions.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-950/20">
                <strong className="text-amber-300 block mb-1">5. Physical Storage</strong>
                <p className="text-slate-300 text-[11px]">
                  SQLite 3.40+ (Local demo) / PostgreSQL 16+ (Production), versioned joblib model bundles in artifacts/.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="text-emerald-400" size={16} />
                <span>Zero-Hallucination AI Grounding Policy</span>
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                DecisionPilot AI strictly decouples Language Models from mathematical computation. The intent parser classifies questions into a typed Pydantic schema and routes exclusively to fixed, tested read-only analytics tools via SQLAlchemy—never arbitrary LLM-written SQL. Every numerical figure originates deterministically from the database or versioned forecast bundles.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'datamodel' && (
          <div className="space-y-6">
            <SectionTitle
              title="2. Relational Data Model & 6 Normalized Tables"
              detail="24 continuous months, 50,000 transactions, 50 SKUs, calendar events and inventory tracking"
              aside={<Pill tone="success">50,000 Rows Validated</Pill>}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-3 font-semibold">Table Name</th>
                    <th className="py-2 px-3 font-semibold">Primary Key</th>
                    <th className="py-2 px-3 font-semibold">Key Foreign Keys</th>
                    <th className="py-2 px-3 font-semibold">Row Volume</th>
                    <th className="py-2 px-3 font-semibold">Business Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                  <tr>
                    <td className="py-2 px-3 text-indigo-300 font-bold">sales_transactions</td>
                    <td className="py-2 px-3">transaction_id</td>
                    <td className="py-2 px-3">customer_id, product_id, campaign_id</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">50,000</td>
                    <td className="py-2 px-3 font-sans">Realized sales, discounts, landed COGS, contribution margin</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-indigo-300 font-bold">products</td>
                    <td className="py-2 px-3">product_id</td>
                    <td className="py-2 px-3">—</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">50</td>
                    <td className="py-2 px-3 font-sans">SKU master catalog, unit cost, lead time, reorder point, elasticity</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-indigo-300 font-bold">customers</td>
                    <td className="py-2 px-3">customer_id</td>
                    <td className="py-2 px-3">—</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">10,000</td>
                    <td className="py-2 px-3 font-sans">Segments (Returning, Individual, Corporate, Price-sensitive), LTV, 4 regions</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-indigo-300 font-bold">marketing_campaigns</td>
                    <td className="py-2 px-3">campaign_id, date</td>
                    <td className="py-2 px-3">date</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">2,920</td>
                    <td className="py-2 px-3 font-sans">Channels (Facebook Ads, Google Ads, TikTok Ads, Email), spend &amp; ROAS</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-indigo-300 font-bold">inventory_daily</td>
                    <td className="py-2 px-3">date, product_id</td>
                    <td className="py-2 px-3">date, product_id</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">24,820</td>
                    <td className="py-2 px-3 font-sans">34 physical SKUs &times; 730 days: opening/closing stock, receipts, stockout_flag</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-indigo-300 font-bold">calendar_events</td>
                    <td className="py-2 px-3">date</td>
                    <td className="py-2 px-3">—</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">730</td>
                    <td className="py-2 px-3 font-sans">Day of week, month, holidays (Tet, Black Friday), promo flags</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'ml' && (
          <div className="space-y-6">
            <SectionTitle
              title="3. Machine Learning & Microeconomic Formulation"
              detail="Temporal feature engineering, LightGBM demand forecasting, and non-linear simulation"
              aside={<Pill tone="warning">Revenue WAPE: 24.1% (moving average)</Pill>}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2 text-xs">
                <strong className="text-indigo-300 block font-bold text-sm">LightGBM Demand Regressor</strong>
                <p className="text-slate-300 leading-relaxed">
                  Trained across 17 causal temporal features: lag 1, 7, 14, 28 days; 7d/14d/28d rolling mean and standard deviation; growth_7; calendar encodings; and log1p(scale). Chronological Train/Val/Test splits and a 2% validation MAE selection gate prevent data leakage.
                </p>
                <div className="font-mono text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-emerald-400">
                  Revenue (all): WAPE 24.14% · MAE 34.58M ₫ · coverage 83.81%
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2 text-xs">
                <strong className="text-purple-300 block font-bold text-sm">Microeconomic What-If Engine</strong>
                <p className="text-slate-300 leading-relaxed">
                  Unlike static calculators, models consumer price elasticity (e in [-5, 0]) with warehouse inventory limits and diminishing marginal returns on ad spend:
                </p>
                <div className="font-mono text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-cyan-300">
                  Q_new = min(Q_capacity, Q_base * (1 + e * delta_P / P_0))
                  <br />
                  R_marketing = R_base * (1 + delta_Spend / Spend_base)^alpha
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-6">
            <SectionTitle
              title="4. REST API Reference Specification"
              detail="Deterministic JSON endpoints running on FastAPI (Port 8000)"
              aside={<Pill tone="info">Swagger UI at /docs</Pill>}
            />

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div>
                  <span className="text-emerald-400 font-bold mr-2">GET</span>
                  <span className="text-white">/health</span>
                </div>
                <span className="text-slate-400 text-[11px] font-sans">Database readiness and model artifact bundle probe</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div>
                  <span className="text-emerald-400 font-bold mr-2">GET</span>
                  <span className="text-white">/kpi/summary</span>
                </div>
                <span className="text-slate-400 text-[11px] font-sans">Multi-grain aggregated financial KPIs (Revenue, Profit, Orders, ROAS)</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div>
                  <span className="text-indigo-400 font-bold mr-2">POST</span>
                  <span className="text-white">/query</span>
                </div>
                <span className="text-slate-400 text-[11px] font-sans">Natural language inquiry routed to fixed read-only analytics tools</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div>
                  <span className="text-emerald-400 font-bold mr-2">GET</span>
                  <span className="text-white">/anomalies</span>
                </div>
                <span className="text-slate-400 text-[11px] font-sans">Ranked business anomalies detected by Isolation Forest with severity</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div>
                  <span className="text-indigo-400 font-bold mr-2">POST</span>
                  <span className="text-white">/forecast</span>
                </div>
                <span className="text-slate-400 text-[11px] font-sans">LightGBM / baseline daily point & 90% confidence interval projections</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div>
                  <span className="text-indigo-400 font-bold mr-2">POST</span>
                  <span className="text-white">/simulate</span>
                </div>
                <span className="text-slate-400 text-[11px] font-sans">What-If scenario simulation under microeconomic response functions</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div>
                  <span className="text-indigo-400 font-bold mr-2">POST</span>
                  <span className="text-white">/scenarios/feedback</span>
                </div>
                <span className="text-slate-400 text-[11px] font-sans">Atomic scenario decision (accepted / rejected) linked to optional recommendation</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div>
                  <span className="text-indigo-400 font-bold mr-2">POST</span>
                  <span className="text-white">/recommendations/feedback</span>
                </div>
                <span className="text-slate-400 text-[11px] font-sans">Executive sign-off (accepted / rejected) recorded in append-only audit ledger</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'research' && (
          <div className="space-y-6">
            <SectionTitle
              title="5. Research & Business Innovation Proposal"
              detail="Academic title: AI-Powered Business Data Analysis, Forecasting and Decision Support System for SMEs"
              aside={<Pill tone="info">LIKELION & K-TECH 2026</Pill>}
            />

            <div className="text-xs text-slate-300 space-y-4 leading-relaxed">
              <p>
                <strong>Abstract:</strong> SMEs represent over 97% of active businesses in Vietnam and South Korea. Despite collecting thousands of transactions, SMEs face a severe decision bottleneck: descriptive dashboards only report past numbers, while unconstrained LLMs hallucinate figures without mathematical foundations.
              </p>
              <p>
                DecisionPilot AI operationalizes Herbert Simon's decision-making model (Intelligence, Design, Choice) into a closed-loop chain: <strong>Ask &rarr; Detect &rarr; Explain &rarr; Forecast &rarr; Simulate &rarr; Decide</strong>. Running on commodity CPU hardware with zero cloud GPU dependencies, the system delivers enterprise-grade forecasting and What-If simulation for under $10/month in operational overhead.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'operations' && (
          <div className="space-y-6">
            <SectionTitle
              title="6. Operations & Quickstart Guide"
              detail="Windows single-command launcher, Docker containerization, and migrations"
              aside={<Pill tone="success">run.bat Ready</Pill>}
            />

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 font-mono text-slate-200 space-y-2">
                <span className="text-slate-400 block font-sans font-bold">Quick Launch on Windows:</span>
                <p className="text-emerald-400"># Double-click run.bat in project root, or execute in PowerShell:</p>
                <p className="text-indigo-300">.\scripts\dev.ps1</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 font-mono text-slate-200 space-y-2">
                <span className="text-slate-400 block font-sans font-bold">Docker Multi-Container Deployment:</span>
                <p className="text-indigo-300">docker compose up -d --build</p>
                <p className="text-slate-400"># Services: Frontend (Nginx :80), Backend (FastAPI :8000), DB (Postgres :5432)</p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

