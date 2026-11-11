import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Database,
  LineChart,
  MessageSquareText,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react'
import { BrandLogo } from './layout/Sidebar'

export function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Clean Enterprise Topbar */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-md"
        style={{ background: 'var(--topbar)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BrandLogo />
            <div>
              <span className="text-base font-bold tracking-tight" style={{ color: 'var(--heading)' }}>
                DecisionPilot <span style={{ color: 'var(--primary)' }}>AI</span>
              </span>
              <span
                className="block text-[10px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Decision Intelligence
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            <a href="#features" className="hover:text-[var(--heading)] transition-colors">
              Features
            </a>
            <a href="#workflow" className="hover:text-[var(--heading)] transition-colors">
              How It Works
            </a>
            <a
              href="https://github.com/NguyenTriBaoThang/DecisionPilotAI"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--heading)] transition-colors"
            >
              GitHub
            </a>
          </nav>

          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors hover:brightness-95"
            style={{ background: 'var(--primary)', boxShadow: 'var(--shadow-xs)' }}
          >
            <span>Explore Demo</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-16 pb-20 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-semibold"
              style={{
                background: 'var(--primary-soft)',
                borderColor: 'var(--primary-border)',
                color: 'var(--primary-text)',
              }}
            >
              <span>AI for Business Innovation 2026 · LIKELION</span>
            </div>

            <h1
              className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] leading-[1.12]"
              style={{ color: 'var(--heading)' }}
            >
              Business Intelligence{' '}
              <span style={{ color: 'var(--primary)' }}>That Thinks Ahead.</span>
            </h1>

            <p className="text-base leading-relaxed max-w-xl" style={{ color: 'var(--text-secondary)' }}>
              Analyze performance, uncover hidden risks, forecast demand, and simulate pricing, marketing, and inventory decisions — grounded deterministically for SMEs.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-95"
                style={{ background: 'var(--primary)', boxShadow: 'var(--shadow-sm)' }}
              >
                <span>Launch Workspace</span>
                <ArrowRight size={16} />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-[var(--surface)] transition-colors"
                style={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--heading)',
                }}
              >
                <span>Discover Features</span>
              </a>
            </div>

            <div
              className="pt-6 grid grid-cols-3 gap-6 border-t max-w-lg"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <span className="block text-2xl font-bold tabular-nums" style={{ color: 'var(--heading)' }}>
                  50,000
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Validated Orders
                </span>
              </div>
              <div>
                <span className="block text-2xl font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                  24.14%
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Revenue WAPE
                </span>
              </div>
              <div>
                <span className="block text-2xl font-bold tabular-nums" style={{ color: 'var(--success-text)' }}>
                  1.43s
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Median NL Query
                </span>
              </div>
            </div>
          </div>

          {/* Enterprise Architectural Preview Card */}
          <div className="lg:col-span-5">
            <div
              className="dp-surface p-6 space-y-4"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
                  Closed-Loop Decision Pipeline
                </span>
                <span
                  className="rounded px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}
                >
                  Zero Hallucination
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {[
                  { label: '01 · Deterministic SQL Analytics', desc: 'Fixed, auditable read-only tools' },
                  { label: '02 · Hybrid Anomaly Detection', desc: 'Isolation Forest + rolling z-score baseline' },
                  { label: '03 · LightGBM Forecasting', desc: '7d / 30d horizon with empirical intervals' },
                  { label: '04 · Microeconomic Simulator', desc: 'Price elasticity & stockout lead-time caps' },
                  { label: '05 · Executive Approval Ledger', desc: 'Append-only audit trail for every sign-off' },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="rounded-lg border px-3.5 py-2.5"
                    style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                  >
                    <div className="font-semibold" style={{ color: 'var(--heading)' }}>
                      {row.label}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {row.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section
        id="workflow"
        className="px-6 py-16 border-y"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
              The Intelligence Loop
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--heading)' }}>
              How DecisionPilot AI Works
            </h2>
            <p className="text-sm max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              From fragmented transactions to grounded executive actions with human-in-the-loop oversight.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                step: '01',
                title: 'Connect Data',
                desc: '6 reconciled business tables with point-in-time features.',
                icon: <Database size={18} style={{ color: 'var(--primary)' }} />,
              },
              {
                step: '02',
                title: 'Analyze',
                desc: 'Track core KPIs and isolate variance drivers across dimensions.',
                icon: <LineChart size={18} style={{ color: 'var(--info)' }} />,
              },
              {
                step: '03',
                title: 'Predict',
                desc: 'LightGBM multi-horizon demand forecasting with 90% bands.',
                icon: <TrendingUp size={18} style={{ color: 'var(--primary)' }} />,
              },
              {
                step: '04',
                title: 'Simulate',
                desc: 'What-If price elasticity and supply chain shock scenarios.',
                icon: <SlidersHorizontal size={18} style={{ color: 'var(--warning)' }} />,
              },
              {
                step: '05',
                title: 'Decide',
                desc: 'Prioritized recommendations backed by evidence and audit trail.',
                icon: <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl border p-4 space-y-2.5"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {item.step}
                  </span>
                  {item.icon}
                </div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
                  {item.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="features" className="px-6 py-16 max-w-6xl mx-auto space-y-10">
        <div className="text-center space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
            Enterprise Capabilities
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--heading)' }}>
            Full-Stack Decision Intelligence
          </h2>
          <p className="text-sm max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Not a generic dashboard or an ungrounded chatbot. An integrated decision-support engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              title: 'Conversational Analytics',
              desc: 'Ask questions in natural language. The system extracts typed intent and queries deterministic analytics tools rather than hallucinating answers.',
              icon: <MessageSquareText size={20} style={{ color: 'var(--primary)' }} />,
            },
            {
              title: 'Hybrid Anomaly Radar',
              desc: 'Combines rolling statistical Z-scores and Isolation Forest to catch spikes in ad spend, margin drops, and stockout risks before they impact P&L.',
              icon: <BellRing size={20} style={{ color: 'var(--danger)' }} />,
            },
            {
              title: 'Interactive What-If Simulation',
              desc: 'Test price discounts, ad budget shifts, and lead-time bottlenecks with microeconomic price elasticity formulas and physical stock constraints.',
              icon: <SlidersHorizontal size={20} style={{ color: 'var(--success)' }} />,
            },
          ].map((cap) => (
            <div
              key={cap.title}
              className="dp-surface p-6 space-y-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg border"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                {cap.icon}
              </div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--heading)' }}>
                {cap.title}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {cap.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-12 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto space-y-4">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--heading)' }}>
            Turn Data Into Confident Decisions.
          </h2>
          <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            Experience SME decision intelligence with FastAPI, React 19, and LightGBM forecasting models.
          </p>
          <div className="pt-1">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-95"
              style={{ background: 'var(--primary)' }}
            >
              <span>Open DecisionPilot Workspace</span>
              <ArrowRight size={16} />
            </Link>
          </div>
          <p className="pt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
            DecisionPilot AI · AI for Business Innovation 2026 · Single-workspace Local-first Architecture
          </p>
        </div>
      </footer>
    </div>
  )
}
