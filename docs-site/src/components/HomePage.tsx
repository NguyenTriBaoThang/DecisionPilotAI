import {
  ArrowRight,
  BellRing,
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  Github,
  LineChart,
  MessageSquareText,
  Rocket,
  Server,
  ShieldCheck,
  Sliders,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react'
import { Hero3D } from './Hero3D'
import { APP_DEMO_URL, NAV_SECTIONS, REPO_URL, VERSION } from '../data/site'
import { BASE_URL, buildHref, type IntelTabId, type PageId } from '../routes'

interface HomePageProps {
  onNavigate: (page: PageId, options?: { tab?: IntelTabId; hashId?: string }) => void
}

const GROUPS = [
  { name: 'Getting Started', icon: Rocket, color: 'var(--cyan)' },
  { name: 'Architecture & Data', icon: Server, color: 'var(--violet)' },
  { name: 'AI & Analytics', icon: Cpu, color: 'var(--indigo)' },
  { name: 'Development', icon: Wrench, color: 'var(--green)' },
  { name: 'Reference', icon: BookOpen, color: 'var(--amber)' },
] as const

export function HomePage({ onNavigate }: HomePageProps) {
  const workflowSteps: {
    step: string
    title: string
    subtitle: string
    desc: string
    target: PageId
    tab?: IntelTabId
    icon: typeof BellRing
    color: string
  }[] = [
    {
      step: '01 · ALERT',
      title: 'Detect Anomalies',
      subtitle: 'Anomaly Radar & Alerts',
      desc: 'Hybrid Isolation Forest + rolling robust Z-score & IQR flags abnormal ad spend, revenue dips, and margin shocks.',
      target: 'data-decision-intelligence',
      tab: 'analyze',
      icon: BellRing,
      color: '#F87171',
    },
    {
      step: '02 · ASK',
      title: 'Investigate with Copilot',
      subtitle: 'Dashboard -> /ask?q=...',
      desc: 'One-click investigation carries context into natural language analytics backed by fixed read-only tools — zero model-written SQL.',
      target: 'data-decision-intelligence',
      tab: 'ask',
      icon: MessageSquareText,
      color: 'var(--cyan)',
    },
    {
      step: '03 · PREDICT',
      title: 'Forecast Demand',
      subtitle: 'LightGBM & 90% Bounds',
      desc: 'Chronological 70/15/15 split with 17 features and a strict 2% validation gate selects LightGBM or resilient baselines.',
      target: 'data-decision-intelligence',
      tab: 'forecast',
      icon: LineChart,
      color: 'var(--indigo)',
    },
    {
      step: '04 · SIMULATE',
      title: 'Try First in Sandbox',
      subtitle: 'Recommendations -> /scenarios',
      desc: 'Pre-runs price elasticity, diminishing-returns ad curves, and stockout limits before any real capital is committed.',
      target: 'data-decision-intelligence',
      tab: 'simulate',
      icon: Sliders,
      color: '#A78BFA',
    },
    {
      step: '05 · DECIDE',
      title: 'Audited Approval',
      subtitle: 'Transactional Audit Ledger',
      desc: 'Accepting or rejecting syncs scenario and recommendation status together in audit_events with dataset hash lock.',
      target: 'case-study',
      icon: CheckCircle2,
      color: 'var(--green)',
    },
  ]

  const capabilities: {
    num: string
    tab: IntelTabId
    badge: string
    title: string
    prompt: string
    desc: string
    color: string
    icon: typeof MessageSquareText
  }[] = [
    {
      num: 'CAPABILITY 01',
      tab: 'ask',
      badge: 'Fixed Read-Only Tools',
      title: 'Ask Your Business Data',
      prompt: 'Turn Vietnamese/English questions into grounded reports',
      desc: 'Typed intent routing (local rules; Gemini/OpenAI optional) executes deterministic database tools and refuses raw SQL.',
      color: 'var(--cyan)',
      icon: MessageSquareText,
    },
    {
      num: 'CAPABILITY 02',
      tab: 'analyze',
      badge: 'Isolation Forest + IQR',
      title: 'Revenue & Anomaly Diagnostics',
      prompt: 'Detect significant shifts before margins erode',
      desc: '56-day trailing baselines (7-day exclusion) + descriptive waterfall contribution decomposition by SKU, region, and channel.',
      color: '#F87171',
      icon: BellRing,
    },
    {
      num: 'CAPABILITY 03',
      tab: 'forecast',
      badge: 'LightGBM + 2% Rule Gate',
      title: 'Historical Demand Forecasting',
      prompt: '7-day & 30-day projections with 90% prediction bands',
      desc: 'Leakage-free 17-feature pipeline benchmarks LightGBM against moving-average & seasonal-naive baselines per target.',
      color: 'var(--indigo)',
      icon: LineChart,
    },
    {
      num: 'CAPABILITY 04',
      tab: 'simulate',
      badge: 'Elasticity & Saturation',
      title: 'Scenario Simulation & Decisions',
      prompt: 'Stress-test pricing, ads, and inventory buffers',
      desc: 'Compare conditional P&L outcomes side-by-side with sensitivity bands before recording human-in-the-loop decisions.',
      color: '#A78BFA',
      icon: Sliders,
    },
  ]

  return (
    <main className="home-page">
      {/* Top Hero Landing Box */}
      <div className="hero-box" style={{ marginBottom: '28px' }}>
        <div className="hero-badge-row">
          <span className="hero-tag">LIKELION · AI for Business Innovation 2026</span>
          <span className="badge badge-indigo">Track 5 · Data &amp; Decision Intelligence</span>
          <span className="badge badge-green">{VERSION} Portal</span>
        </div>

        <h1>DecisionPilot AI</h1>
        <p className="hero-subtitle">
          AI-Powered Business Data Analysis, Forecasting &amp; Decision Support System for SMEs &mdash;{' '}
          <span style={{ color: 'var(--cyan)' }}>Ask. Understand. Predict. Decide.</span>
        </p>

        <p className="hero-desc">
          Small and medium enterprises struggle with fragmented channels, delayed spreadsheets, and ungrounded chatbots.
          DecisionPilot AI unifies deterministic analytics, LightGBM forecasting, hybrid anomaly detection, and interactive
          What-If scenario simulation in a single verifiable platform backed by an append-only decision ledger.
        </p>

        <div className="hero-cta-row">
          <a
            href={buildHref('overview')}
            onClick={(e) => {
              e.preventDefault()
              onNavigate('overview')
            }}
            className="btn-primary"
          >
            <BookOpen size={16} />
            <span>Open Technical Documentation</span>
            <ArrowRight size={15} />
          </a>

          <a
            href={buildHref('data-decision-intelligence', { tab: 'ask' })}
            onClick={(e) => {
              e.preventDefault()
              onNavigate('data-decision-intelligence', { tab: 'ask' })
            }}
            className="btn-secondary"
            style={{ borderColor: 'rgba(34, 211, 238, 0.45)', color: '#A5F3FC' }}
          >
            <Sparkles size={15} className="cyan" />
            <span>Explore Track 5 Showcase</span>
          </a>

          <a href={APP_DEMO_URL} target="_blank" rel="noreferrer" className="btn-secondary">
            <Zap size={15} className="green" />
            <span>Launch Live App</span>
            <ExternalLink size={13} />
          </a>

          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-secondary">
            <Github size={15} />
            <span>View GitHub</span>
          </a>
        </div>

        <Hero3D />
      </div>

      {/* Measured Synthetic Benchmark Strip */}
      <section aria-label="Verified Benchmark Highlights">
        <div className="grid-4" style={{ marginTop: 0 }}>
          <div className="stat-box">
            <div className="stat-value">50,000</div>
            <div className="stat-label">Orders · 6 Relational Tables</div>
            <p className="dim" style={{ fontSize: '0.78rem', margin: '6px 0 0 0' }}>
              730-day synthetic Vietnam SME snapshot (50 SKUs, 10k customers)
            </p>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: '#A5B4FC' }}>24.14%</div>
            <div className="stat-label">Enterprise Revenue WAPE</div>
            <p className="dim" style={{ fontSize: '0.78rem', margin: '6px 0 0 0' }}>
              Moving average selected; P001 LightGBM reaches 92.86% band coverage
            </p>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--green)' }}>100% / 82.1%</div>
            <div className="stat-label">FB Spend Alert Precision / Recall</div>
            <p className="dim" style={{ fontSize: '0.78rem', margin: '6px 0 0 0' }}>
              Hybrid Isolation Forest + robust Z-score; revenue recall is 38.2%
            </p>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: '#FBBF24' }}>46 / 46</div>
            <div className="stat-label">NL Benchmark (1,432 ms)</div>
            <p className="dim" style={{ fontSize: '0.78rem', margin: '6px 0 0 0' }}>
              Curated EN/VI/refusal suite on local rules; zero model-written SQL
            </p>
          </div>
        </div>
        <p className="dim" style={{ fontSize: '0.78rem', marginTop: '6px' }}>
          Metrics come from built-in synthetic dataset <code>f32e87e3a5744333ff98d3bf</code> (bundle <code>dp-1.1</code>) and do not establish accuracy on a real business.
        </p>
      </section>

      {/* Connected End-to-End Decision Loop */}
      <section className="home-section">
        <div className="home-section-header">
          <div>
            <span className="hero-tag" style={{ marginBottom: '8px', display: 'inline-block' }}>
              CONNECTED BROWSER DEMO FLOW
            </span>
            <h2>From Warning Alert to Audited Executive Decision</h2>
          </div>
          <a
            href={buildHref('case-study')}
            onClick={(e) => {
              e.preventDefault()
              onNavigate('case-study')
            }}
            className="mono"
            style={{ fontSize: '0.84rem' }}
          >
            Read Full Case Study &rarr;
          </a>
        </div>

        <div className="workflow-grid">
          {workflowSteps.map((item) => {
            const Icon = item.icon
            return (
              <a
                key={item.step}
                href={buildHref(item.target, item.tab ? { tab: item.tab } : undefined)}
                onClick={(e) => {
                  e.preventDefault()
                  onNavigate(item.target, item.tab ? { tab: item.tab } : undefined)
                }}
                className="workflow-step-card"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="mono" style={{ fontSize: '0.72rem', fontWeight: 800, color: item.color }}>
                    {item.step}
                  </span>
                  <Icon size={17} color={item.color} />
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.02rem', color: '#FFFFFF' }}>{item.title}</div>
                <div className="mono dim" style={{ fontSize: '0.72rem' }}>
                  {item.subtitle}
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  {item.desc}
                </p>
              </a>
            )
          })}
        </div>
      </section>

      {/* 4 Track 5 Interactive Capabilities Launchpad */}
      <section className="home-section">
        <div className="home-section-header">
          <div>
            <span className="hero-tag" style={{ marginBottom: '8px', display: 'inline-block' }}>
              TRACK 5 INTERACTIVE SHOWCASE
            </span>
            <h2>Four AI Pillars Verified Against Codebase &amp; Artifacts</h2>
          </div>
          <a
            href={buildHref('data-decision-intelligence', { tab: 'ask' })}
            onClick={(e) => {
              e.preventDefault()
              onNavigate('data-decision-intelligence', { tab: 'ask' })
            }}
            className="mono"
            style={{ fontSize: '0.84rem' }}
          >
            Open Interactive Track 5 Page &rarr;
          </a>
        </div>

        <div className="grid-2">
          {capabilities.map((cap) => {
            const Icon = cap.icon
            return (
              <a
                key={cap.tab}
                href={buildHref('data-decision-intelligence', { tab: cap.tab })}
                onClick={(e) => {
                  e.preventDefault()
                  onNavigate('data-decision-intelligence', { tab: cap.tab })
                }}
                className="chapter-card"
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span className="mono" style={{ fontSize: '0.74rem', fontWeight: 800, color: cap.color }}>
                      {cap.num}
                    </span>
                    <span className="badge badge-indigo">{cap.badge}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <Icon size={20} color={cap.color} />
                    <strong style={{ fontSize: '1.1rem', color: '#FFFFFF' }}>{cap.title}</strong>
                  </div>
                  <div style={{ fontSize: '0.86rem', color: cap.color, fontWeight: 600, marginBottom: '6px' }}>
                    {cap.prompt}
                  </div>
                  <p className="card-desc">{cap.desc}</p>
                </div>
                <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Launch Interactive Tab</span>
                  <ArrowRight size={13} />
                </div>
              </a>
            )
          })}
        </div>
      </section>

      {/* Complete Paginated Documentation Index */}
      <section className="home-section">
        <div className="home-section-header">
          <div>
            <span className="hero-tag" style={{ marginBottom: '8px', display: 'inline-block' }}>
              TECHNICAL DOCUMENTATION PORTAL
            </span>
            <h2>Browse Documentation by Chapter</h2>
          </div>
          <span className="dim" style={{ fontSize: '0.86rem' }}>
            {NAV_SECTIONS.length} focused pages &mdash; navigate cleanly chapter by chapter
          </span>
        </div>

        {GROUPS.map((grp) => {
          const sections = NAV_SECTIONS.filter((s) => s.group === grp.name)
          const GroupIcon = grp.icon
          if (sections.length === 0) return null

          return (
            <div key={grp.name} className="chapter-group-block">
              <div className="chapter-group-title" style={{ color: grp.color }}>
                <GroupIcon size={15} color={grp.color} />
                <span>{grp.name}</span>
              </div>
              <div className="chapter-grid">
                {sections.map((sec) => (
                  <a
                    key={sec.id}
                    href={buildHref(sec.id)}
                    onClick={(e) => {
                      e.preventDefault()
                      onNavigate(sec.id)
                    }}
                    className="chapter-card"
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span className="badge badge-cyan">{sec.num}</span>
                        <span className="mono dim" style={{ fontSize: '0.72rem' }}>
                          /docs/{sec.id}
                        </span>
                      </div>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: '1.04rem', color: '#FFFFFF' }}>{sec.title}</h3>
                      <p className="card-desc" style={{ fontSize: '0.84rem' }}>
                        {sec.blurb}
                      </p>
                    </div>
                    <div className="mono" style={{ fontSize: '0.76rem', color: '#A5B4FC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Read chapter</span>
                      <ArrowRight size={13} />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      {/* Portal Footer */}
      <footer className="doc-footer" style={{ marginTop: '64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={`${BASE_URL}logo.png`} alt="DecisionPilot AI" style={{ width: 24, height: 24, borderRadius: 6 }} />
            <span>
              <strong>DecisionPilot AI Documentation Portal</strong> &middot;{' '}
              <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                MIT License
              </a>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <a
              href={buildHref('overview')}
              onClick={(e) => {
                e.preventDefault()
                onNavigate('overview')
              }}
            >
              Documentation
            </a>
            <a href={APP_DEMO_URL} target="_blank" rel="noreferrer">
              Live Web App
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub Repository
            </a>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          <ShieldCheck size={14} className="cyan" />
          <span>
            All specifications, database tables, API schemas, and benchmark figures reflect verified repository artifacts on <code>main</code>.
          </span>
        </div>
      </footer>
    </main>
  )
}

