import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Database,
  LineChart,
  MessageSquareText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react'
import { AIIntelligenceCore } from './AIIntelligenceCore'

export function LandingPage() {
  return (
    <div className="landing-page min-h-screen bg-[#070b17] text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-[#070b17]/80 border-b border-indigo-500/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
            <Sparkles size={20} />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-white">
              DecisionPilot <span className="text-cyan-400">AI</span>
            </span>
            <span className="block text-[9px] font-semibold tracking-widest uppercase text-indigo-300">
              Decision Intelligence
            </span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-cyan-300 transition-colors">
            Features
          </a>
          <a href="#workflow" className="hover:text-cyan-300 transition-colors">
            How It Works
          </a>
          <a href="#architecture" className="hover:text-cyan-300 transition-colors">
            Architecture
          </a>
          <a
            href="https://github.com/NguyenTriBaoThang/DecisionPilotAI"
            target="_blank"
            rel="noreferrer"
            className="hover:text-cyan-300 transition-colors"
          >
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-cyan-500/30 hover:scale-[1.02] transition-all"
          >
            <span>Explore Demo</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pt-16 pb-24 md:pt-28 md:pb-32">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-indigo-600/20 via-violet-600/15 to-cyan-400/10 blur-[130px] pointer-events-none" />

        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-12 relative z-10">
          <div className="flex-1 text-center lg:text-left space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-4 py-1.5 text-xs font-semibold text-cyan-300 shadow-inner">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>AI for Business Innovation 2026 · LIKELION</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
              Business Intelligence <br />
              <span className="bg-gradient-to-r from-indigo-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
                That Thinks Ahead.
              </span>
            </h1>

            <p className="text-lg text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Analyze performance, uncover hidden risks, forecast what&apos;s next, and simulate smarter decisions — powered
              by explainable AI for SMEs.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link
                to="/"
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-indigo-600/30 hover:shadow-indigo-500/50 hover:brightness-110 transition-all"
              >
                <span>Launch Workspace</span>
                <ArrowRight size={18} />
              </Link>
              <a
                href="#features"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 text-base font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors"
              >
                <span>Discover Features</span>
              </a>
            </div>

            {/* Quick Metrics Ticker */}
            <div className="pt-8 grid grid-cols-3 gap-4 border-t border-slate-800/80 text-left max-w-md mx-auto lg:mx-0">
              <div>
                <span className="block text-2xl font-black text-cyan-400">50,000</span>
                <span className="text-xs text-slate-400">Validated Orders</span>
              </div>
              <div>
                <span className="block text-2xl font-black text-violet-400">24.14%</span>
                <span className="text-xs text-slate-400">Revenue WAPE</span>
              </div>
              <div>
                <span className="block text-2xl font-black text-emerald-400">1.43s</span>
                <span className="text-xs text-slate-400">Median NL Query</span>
              </div>
            </div>
          </div>

          {/* 3D Holographic Core Presentation */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/10 to-cyan-400/10 blur-2xl" />
              <AIIntelligenceCore size={380} />
            </div>
            <span className="mt-2 text-xs font-medium tracking-wide uppercase text-indigo-300/80">
              DecisionPilot Holographic Core (Interactive WebGL)
            </span>
          </div>
        </div>
      </section>

      {/* Process Workflow Section */}
      <section id="workflow" className="px-6 py-20 border-y border-indigo-500/10 bg-[#0c1224]/50">
        <div className="max-w-6xl mx-auto text-center space-y-4">
          <span className="text-xs font-bold tracking-widest uppercase text-cyan-400">The Intelligence Loop</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">How DecisionPilot AI Works</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            From fragmented transactions to grounded executive actions with human-in-the-loop oversight.
          </p>

          <div className="pt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 text-left">
            {[
              {
                step: '01',
                title: 'Connect Data',
                desc: '6 reconciled business tables with point-in-time features.',
                icon: <Database className="text-indigo-400" size={24} />,
              },
              {
                step: '02',
                title: 'Analyze',
                desc: 'Observe 8 core KPIs and detect multidimensional shifts.',
                icon: <LineChart className="text-violet-400" size={24} />,
              },
              {
                step: '03',
                title: 'Predict',
                desc: 'LightGBM multi-horizon demand forecasting with 90% bands.',
                icon: <Sparkles className="text-cyan-400" size={24} />,
              },
              {
                step: '04',
                title: 'Simulate',
                desc: 'What-If price elasticity and supply chain shock scenarios.',
                icon: <SlidersHorizontal className="text-amber-400" size={24} />,
              },
              {
                step: '05',
                title: 'Decide',
                desc: 'Prioritized recommendations backed by evidence and audit trail.',
                icon: <CheckCircle2 className="text-emerald-400" size={24} />,
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="relative rounded-2xl border border-indigo-500/15 bg-gradient-to-b from-[#111a30] to-[#070b17] p-5 shadow-lg transition-transform hover:-translate-y-1.5"
              >
                <div className="flex items-center justify-between pb-3">
                  <span className="text-2xl font-black text-slate-600">{item.step}</span>
                  {item.icon}
                </div>
                <h3 className="text-base font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Deep-Dive Section */}
      <section id="features" className="px-6 py-24 max-w-6xl mx-auto space-y-16">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold tracking-widest uppercase text-violet-400">Enterprise Capabilities</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Full-Stack Decision Intelligence</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Not a generic dashboard or an ungrounded chatbot. An integrated decision-support engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-[#0c1224] to-[#070b17] p-6 shadow-xl space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <MessageSquareText size={24} />
            </div>
            <h3 className="text-lg font-bold text-white">Conversational Analytics</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Ask questions in natural language. The system extracts typed intent and queries deterministic analytics
              tools rather than hallucinating answers.
            </p>
          </div>

          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-[#0c1224] to-[#070b17] p-6 shadow-xl space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-600/20 text-rose-400 border border-rose-500/30">
              <BellRing size={24} />
            </div>
            <h3 className="text-lg font-bold text-white">Hybrid Anomaly Radar</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Combines rolling statistical Z-scores and Isolation Forest to catch spikes in ad spend, margin drops, and
              stockout risks before they impact P&L.
            </p>
          </div>

          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-[#0c1224] to-[#070b17] p-6 shadow-xl space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <SlidersHorizontal size={24} />
            </div>
            <h3 className="text-lg font-bold text-white">Interactive What-If Simulation</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Test price discounts, ad budget shifts, and lead-time bottlenecks with microeconomic price elasticity formulas
              and physical stock constraints.
            </p>
          </div>
        </div>
      </section>

      {/* Call to Action Footer */}
      <footer className="border-t border-indigo-500/20 bg-[#070b17] px-6 py-16 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold text-indigo-300">
            <Zap size={14} /> Production-Ready Local Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Turn Data Into Confident Decisions.</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Experience the future of SME decision intelligence with live FastAPI backend, React 19 frontend, and LightGBM models.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-indigo-500/30 hover:scale-105 transition-all"
            >
              <span>Open DecisionPilot Workspace</span>
              <ArrowRight size={18} />
            </Link>
          </div>
          <p className="pt-8 text-xs text-slate-500">
            DecisionPilot AI · AI for Business Innovation 2026 · Single-workspace Local-first Architecture
          </p>
        </div>
      </footer>
    </div>
  )
}

