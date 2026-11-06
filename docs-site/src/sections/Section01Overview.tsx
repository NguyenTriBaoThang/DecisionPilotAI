import { Hero3D } from '../components/Hero3D'
import { Sparkles, Target, Zap, Shield, HelpCircle, ArrowRight } from 'lucide-react'
import { APP_DEMO_URL, REPO_URL } from '../data/site'

export function Section01Overview() {
  return (
    <section id="sec-overview">
      <div className="hero-box">
        <div className="hero-badge-row">
          <span className="hero-tag">AI for Business Innovation 2026</span>
          <span className="badge badge-indigo">Decision Intelligence Platform</span>
          <span className="badge badge-green">v1.0.0 Ready</span>
        </div>

        <h1>DecisionPilot AI</h1>
        <p className="hero-subtitle">
          AI-Powered Business Data Analysis, Forecasting &amp; Decision Support System for SMEs
        </p>

        <p className="hero-desc">
          Small and medium enterprises (SMEs) face fragmented sales channels, opaque marketing attribution, and reactive inventory management. DecisionPilot AI bridges the gap between raw transactional data and strategic executive decisions through a unified 3-layer architecture: <strong>Ask</strong> (natural language analytical queries), <strong>Predict</strong> (chronological demand &amp; sales forecasting), and <strong>Decide</strong> (microeconomic scenario simulation &amp; audited recommendations).
        </p>

        <div className="hero-cta-row">
          <a href={APP_DEMO_URL} target="_blank" rel="noreferrer" className="btn-primary">
            <Zap size={16} />
            Launch Live Interactive App
          </a>
          <a href="#sec-quickstart" className="btn-secondary">
            Quick Start Guide
            <ArrowRight size={14} />
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-secondary">
            View on GitHub
          </a>
        </div>

        <Hero3D />
      </div>

      <h2>
        <span className="sec-badge">01</span>
        Project Overview &amp; Executive Summary
      </h2>

      <p className="lead" style={{ fontSize: '1.05rem', color: '#E2E8F0', marginBottom: '1.5rem' }}>
        In Vietnam and emerging Southeast Asian markets, more than 97% of enterprises are SMEs. These businesses generate millions of daily transactions across Shopee, TikTok Shop, physical retail, and direct websites, yet lack dedicated data science teams to optimize pricing, forecast stockouts, or measure real advertising ROI.
      </p>

      <div className="grid-3">
        <div className="card">
          <div className="card-title">
            <HelpCircle size={18} className="cyan" />
            1. Ask (Khám phá)
          </div>
          <p className="card-desc">
            Executive natural language Copilot translates Vietnamese and English questions into read-only analytical SQL queries. Zero hallucination: answers are grounded strictly on verifiable database aggregates.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <TrendingUpIcon size={18} className="violet" />
            2. Predict (Dự báo)
          </div>
          <p className="card-desc">
            Chronological LightGBM regressors with rolling window features project 30-day ahead revenue and SKU demand, complete with 90% confidence prediction intervals and statistical anomaly alerts.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Target size={18} className="green" />
            3. Decide (Hành động)
          </div>
          <p className="card-desc">
            Microeconomic scenario simulator applies empirical price elasticity and marketing response curves to test pricing changes, restock buffers, and human-in-the-loop audited decision approvals.
          </p>
        </div>
      </div>

      <div className="callout info">
        <div className="callout-title">
          <Sparkles size={16} className="cyan" />
          Core Design Philosophy: Grounded Intelligence Over Stochastic Guesswork
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }}>
          Unlike generic chat wrappers that hallucinate financial metrics, DecisionPilot AI enforces strict separation between generative intent parsing and deterministic data execution. The LLM never synthesizes fake revenue or inventory numbers; all quantitative claims are computed directly by PostgreSQL / SQLite analytical engines.
        </p>
      </div>
    </section>
  )
}

function TrendingUpIcon(props: any) {
  return (
    <svg width={props.size || 18} height={props.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
      <polyline points="17 6 23 6 23 12"></polyline>
    </svg>
  )
}

