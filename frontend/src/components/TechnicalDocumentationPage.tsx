import { useState, type ReactNode } from 'react'
import { BookOpen, Code2, Cpu, Database, Layers, ShieldCheck, Terminal } from 'lucide-react'
import { Card, Heading, Pill, SectionTitle } from '../ui'

type DocTab = 'architecture' | 'datamodel' | 'ml' | 'api' | 'research' | 'operations'

export function TechnicalDocumentationPage() {
  const [activeTab, setActiveTab] = useState<DocTab>('architecture')

  const docTabs: { id: DocTab; title: string; subtitle: string; icon: ReactNode }[] = [
    {
      id: 'architecture',
      title: 'System Architecture',
      subtitle: '5-Tier Design & Sequence Flows',
      icon: <Layers size={16} style={{ color: 'var(--primary)' }} />,
    },
    {
      id: 'datamodel',
      title: 'Relational Data Model',
      subtitle: '6 Normalized Tables & ERD',
      icon: <Database size={16} style={{ color: 'var(--info)' }} />,
    },
    {
      id: 'ml',
      title: 'Machine Learning & Econometrics',
      subtitle: 'LightGBM, Isolation Forest & Elasticity',
      icon: <Cpu size={16} style={{ color: 'var(--primary)' }} />,
    },
    {
      id: 'api',
      title: 'REST API Reference',
      subtitle: 'Endpoint Schemas & Contracts',
      icon: <Code2 size={16} style={{ color: 'var(--success)' }} />,
    },
    {
      id: 'research',
      title: 'Research Proposal',
      subtitle: 'Academic Framework & Impact',
      icon: <BookOpen size={16} style={{ color: 'var(--warning)' }} />,
    },
    {
      id: 'operations',
      title: 'Operations & Deployment',
      subtitle: 'Docker, Alembic & Launch Guide',
      icon: <Terminal size={16} style={{ color: 'var(--text-secondary)' }} />,
    },
  ]

  return (
    <div className="space-y-6">
      <Heading
        eyebrow="ENGINEERING & DATA SCIENCE BLUEPRINT"
        title="Technical Documentation"
        subtitle="Complete system architecture, machine learning pipelines, microeconomic foundations, and API specifications for DecisionPilot AI."
      />

      {/* Section Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {docTabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: active ? 'var(--primary-soft)' : 'var(--surface)',
                borderColor: active ? 'var(--primary)' : 'var(--border)',
              }}
              className="p-3 rounded-xl border text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center gap-2 mb-1">
                {tab.icon}
                <span className="font-semibold text-xs truncate" style={{ color: 'var(--heading)' }}>
                  {tab.title}
                </span>
              </div>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                {tab.subtitle}
              </p>
            </button>
          )
        })}
      </div>

      {/* Main Content */}
      <Card className="p-6">
        {activeTab === 'architecture' && (
          <div className="space-y-5">
            <SectionTitle
              title="1. System Architecture & 5-Tier Overview"
              detail="Separation of concerns across Presentation, Gateway, Intelligence, Persistence, and Storage"
              aside={<Pill tone="info">Production v1.0</Pill>}
            />

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              {[
                {
                  title: '1. Presentation Layer',
                  desc: 'React 19, TypeScript, Recharts analytics visualizations, Three.js interactive 3D studio, Tailwind CSS v4.',
                },
                {
                  title: '2. API Gateway',
                  desc: 'FastAPI on Uvicorn, Pydantic v2 schemas, CORS middleware, RBAC & bearer token session guard.',
                },
                {
                  title: '3. Intelligence Layer',
                  desc: 'LightGBM time-series regressor, Hybrid Isolation Forest anomaly detector, Microeconomic What-If simulator.',
                },
                {
                  title: '4. Data Access',
                  desc: 'SQLAlchemy 2.0 Core, Alembic schema migrations, snapshot hash validation and chronological splits.',
                },
                {
                  title: '5. Physical Storage',
                  desc: 'SQLite 3.40+ (Local demo) / PostgreSQL 16+ (Production), versioned joblib model bundles in artifacts/.',
                },
              ].map((tier) => (
                <div
                  key={tier.title}
                  className="p-4 rounded-xl border space-y-1.5"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                >
                  <strong className="block font-semibold" style={{ color: 'var(--primary-text)' }}>
                    {tier.title}
                  </strong>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text)' }}>
                    {tier.desc}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="p-4 rounded-xl border space-y-2"
              style={{ background: 'var(--info-bg)', borderColor: 'var(--info-border)' }}
            >
              <h4 className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--heading)' }}>
                <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                <span>Zero-Hallucination AI Grounding Policy</span>
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
                DecisionPilot AI strictly decouples Language Models from mathematical computation. The intent parser classifies questions into a typed Pydantic schema and routes exclusively to fixed, tested read-only analytics tools via SQLAlchemy—never arbitrary LLM-written SQL. Every numerical figure originates deterministically from the database or versioned forecast bundles.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'datamodel' && (
          <div className="space-y-5">
            <SectionTitle
              title="2. Relational Data Model & 6 Normalized Tables"
              detail="24 continuous months, 50,000 transactions, 50 SKUs, calendar events and inventory tracking"
              aside={<Pill tone="success">50,000 Rows Validated</Pill>}
            />

            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr
                    className="border-b text-[11px] font-semibold uppercase"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <th className="py-2.5 px-3">Table Name</th>
                    <th className="py-2.5 px-3">Primary Key</th>
                    <th className="py-2.5 px-3">Key Foreign Keys</th>
                    <th className="py-2.5 px-3">Row Volume</th>
                    <th className="py-2.5 px-3">Business Purpose</th>
                  </tr>
                </thead>
                <tbody style={{ color: 'var(--text)' }}>
                  {[
                    [
                      'sales_transactions',
                      'transaction_id',
                      'customer_id, product_id, campaign_id',
                      '50,000',
                      'Realized sales, discounts, landed COGS, contribution margin',
                    ],
                    [
                      'products',
                      'product_id',
                      '—',
                      '50',
                      'SKU master catalog, unit cost, lead time, reorder point, elasticity',
                    ],
                    [
                      'customers',
                      'customer_id',
                      '—',
                      '10,000',
                      'Segments (Returning, Individual, Corporate, Price-sensitive), LTV, regions',
                    ],
                    [
                      'marketing_campaigns',
                      'campaign_id, date',
                      'date',
                      '2,920',
                      'Channels (Facebook Ads, Google Ads, TikTok Ads, Email), spend & ROAS',
                    ],
                    [
                      'inventory_daily',
                      'date, product_id',
                      'date, product_id',
                      '24,820',
                      '34 physical SKUs × 730 days: opening/closing stock, receipts, stockout_flag',
                    ],
                    [
                      'calendar_events',
                      'date',
                      '—',
                      '730',
                      'Day of week, month, holidays (Tet, Black Friday), promo flags',
                    ],
                  ].map(([tbl, pk, fk, rows, purpose]) => (
                    <tr key={tbl} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2.5 px-3 font-mono font-semibold" style={{ color: 'var(--primary-text)' }}>
                        {tbl}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{pk}</td>
                      <td className="py-2.5 px-3 font-mono">{fk}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold" style={{ color: 'var(--success-text)' }}>
                        {rows}
                      </td>
                      <td className="py-2.5 px-3">{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'ml' && (
          <div className="space-y-5">
            <SectionTitle
              title="3. Machine Learning & Microeconomic Formulation"
              detail="Temporal feature engineering, LightGBM demand forecasting, and non-linear simulation"
              aside={<Pill tone="warning">Revenue WAPE: 24.1% (moving average)</Pill>}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className="p-4 rounded-xl border space-y-2.5 text-xs"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <strong className="block font-semibold text-sm" style={{ color: 'var(--heading)' }}>
                  LightGBM Demand Regressor
                </strong>
                <p className="leading-relaxed" style={{ color: 'var(--text)' }}>
                  Trained across 17 causal temporal features: lag 1, 7, 14, 28 days; 7d/14d/28d rolling mean and standard deviation; growth_7; calendar encodings; and log1p(scale). Chronological Train/Val/Test splits and a 2% validation MAE selection gate prevent data leakage.
                </p>
                <div
                  className="font-mono text-[11px] p-2.5 rounded-lg border"
                  style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--success-text)',
                  }}
                >
                  Revenue (all): WAPE 24.14% · MAE 34.58M ₫ · coverage 83.81%
                </div>
              </div>

              <div
                className="p-4 rounded-xl border space-y-2.5 text-xs"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <strong className="block font-semibold text-sm" style={{ color: 'var(--heading)' }}>
                  Microeconomic What-If Engine
                </strong>
                <p className="leading-relaxed" style={{ color: 'var(--text)' }}>
                  Unlike static calculators, models consumer price elasticity (e in [-5, 0]) with warehouse inventory limits and diminishing marginal returns on ad spend:
                </p>
                <div
                  className="font-mono text-[11px] p-2.5 rounded-lg border"
                  style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--primary-text)',
                  }}
                >
                  Q_new = min(Q_capacity, Q_base * (1 + e * delta_P / P_0))
                  <br />
                  R_marketing = R_base * (1 + delta_Spend / Spend_base)^alpha
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-5">
            <SectionTitle
              title="4. REST API Reference Specification"
              detail="Deterministic JSON endpoints running on FastAPI (Port 8000)"
              aside={<Pill tone="info">Swagger UI at /docs</Pill>}
            />

            <div className="space-y-2.5 text-xs">
              {[
                ['GET', '/health', 'Database readiness and model artifact bundle probe'],
                ['GET', '/kpi/summary', 'Multi-grain aggregated financial KPIs (Revenue, Profit, Orders, ROAS)'],
                ['POST', '/query', 'Natural language inquiry routed to fixed read-only analytics tools'],
                ['GET', '/anomalies', 'Ranked business anomalies detected by Isolation Forest with severity'],
                ['POST', '/forecast', 'LightGBM / baseline daily point & 90% confidence interval projections'],
                ['POST', '/simulate', 'What-If scenario simulation under microeconomic response functions'],
                ['POST', '/scenarios/feedback', 'Atomic scenario decision (accepted / rejected) linked to optional recommendation'],
                ['POST', '/recommendations/feedback', 'Executive sign-off (accepted / rejected) recorded in append-only audit ledger'],
              ].map(([method, path, desc]) => (
                <div
                  key={path}
                  className="p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                >
                  <div className="font-mono">
                    <span
                      className="font-bold mr-2.5"
                      style={{ color: method === 'GET' ? 'var(--success-text)' : 'var(--primary-text)' }}
                    >
                      {method}
                    </span>
                    <span className="font-semibold" style={{ color: 'var(--heading)' }}>
                      {path}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'research' && (
          <div className="space-y-5">
            <SectionTitle
              title="5. Research & Business Innovation Proposal"
              detail="Academic title: AI-Powered Business Data Analysis, Forecasting and Decision Support System for SMEs"
              aside={<Pill tone="info">LIKELION &amp; K-TECH 2026</Pill>}
            />

            <div className="text-xs space-y-4 leading-relaxed" style={{ color: 'var(--text)' }}>
              <p>
                <strong>Abstract:</strong> SMEs represent over 97% of active businesses in Vietnam and South Korea. Despite collecting thousands of transactions, SMEs face a severe decision bottleneck: descriptive dashboards only report past numbers, while unconstrained LLMs hallucinate figures without mathematical foundations.
              </p>
              <p>
                DecisionPilot AI operationalizes Herbert Simon&apos;s decision-making model (Intelligence, Design, Choice) into a closed-loop chain: <strong>Ask &rarr; Detect &rarr; Explain &rarr; Forecast &rarr; Simulate &rarr; Decide</strong>. Running on commodity CPU hardware with zero cloud GPU dependencies, the system delivers enterprise-grade forecasting and What-If simulation for under $10/month in operational overhead.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'operations' && (
          <div className="space-y-5">
            <SectionTitle
              title="6. Operations & Quickstart Guide"
              detail="Windows single-command launcher, Docker containerization, and migrations"
              aside={<Pill tone="success">run.bat Ready</Pill>}
            />

            <div className="space-y-4 text-xs">
              <div
                className="p-4 rounded-xl border font-mono space-y-1.5"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--heading)' }}
              >
                <span className="block font-sans font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Quick Launch on Windows:
                </span>
                <p style={{ color: 'var(--success-text)' }}>
                  # Double-click run.bat in project root, or execute in PowerShell:
                </p>
                <p>.\scripts\dev.ps1</p>
              </div>

              <div
                className="p-4 rounded-xl border font-mono space-y-1.5"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--heading)' }}
              >
                <span className="block font-sans font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Docker Multi-Container Deployment:
                </span>
                <p>docker compose up -d --build</p>
                <p style={{ color: 'var(--text-secondary)' }}>
                  # Services: Frontend (Nginx :80), Backend (FastAPI :8000), DB (Postgres :5432)
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
