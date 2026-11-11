import { Sparkles, Target, Zap, HelpCircle, ArrowRight } from 'lucide-react'
import { APP_DEMO_URL, REPO_URL } from '../data/site'
import { buildHref, type IntelTabId, type PageId } from '../routes'

interface Section01OverviewProps {
  onNavigate?: (page: PageId, options?: { tab?: IntelTabId; hashId?: string }) => void
}

export function Section01Overview({ onNavigate }: Section01OverviewProps) {
  return (
    <section id="sec-overview">
      <h2>
        <span className="sec-badge">01</span>
        Project Overview &amp; Executive Summary
      </h2>

      <p className="lead" style={{ fontSize: '1.05rem', color: '#E2E8F0', marginBottom: '1.5rem' }}>
        DecisionPilot AI is an AI-powered business data analysis, demand forecasting, and decision support system designed for Small and Medium Enterprises (SMEs). In Vietnam and emerging Southeast Asian markets, more than 97% of enterprises are SMEs operating across <strong>Online</strong>, <strong>Retail</strong>, and <strong>B2B</strong> channels with fragmented spreadsheets and disconnected ad accounts.
      </p>

      <div className="hero-cta-row" style={{ marginBottom: '24px' }}>
        <a href={APP_DEMO_URL} target="_blank" rel="noreferrer" className="btn-primary">
          <Zap size={16} />
          Launch Live Interactive App
        </a>
        <a
          href={buildHref('quickstart')}
          onClick={(e) => {
            if (onNavigate) {
              e.preventDefault()
              onNavigate('quickstart')
            }
          }}
          className="btn-secondary"
        >
          Quick Start Guide
          <ArrowRight size={14} />
        </a>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-secondary">
          View on GitHub
        </a>
      </div>

      <h3>Core 3-Layer Intelligence Loop</h3>
      <div className="grid-3">
        <div className="card">
          <div className="card-title">
            <HelpCircle size={18} className="cyan" />
            1. Ask (Khám phá)
          </div>
          <p className="card-desc">
            Executive natural language Copilot classifies Vietnamese and English questions into structured intents and runs fixed, tested read-only analytics tools. Zero model-written SQL and zero hallucinated numbers.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <TrendingUpIcon size={18} className="violet" />
            2. Predict (Dự báo)
          </div>
          <p className="card-desc">
            Chronological LightGBM regressors and simple baselines (selected via a strict 2% validation gate across 17 temporal features) project 7-day and 30-day revenue and SKU demand with 90% prediction intervals and hybrid anomaly alerts.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Target size={18} className="green" />
            3. Decide (Hành động)
          </div>
          <p className="card-desc">
            What-If scenario simulator applies documented price-elasticity and diminishing-returns ad-spend formulas with stockout constraints before humans record audited Accept/Reject decisions in PostgreSQL or SQLite.
          </p>
        </div>
      </div>

      <div className="callout info">
        <div className="callout-title">
          <Sparkles size={16} className="cyan" />
          Core Design Philosophy: Grounded Analytics Over Stochastic Guesswork
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }}>
          Unlike chat wrappers that invent financial numbers, DecisionPilot AI separates intent classification from deterministic computation. Optional Gemini or OpenAI calls extract only a typed intent schema, while every metric on screen is calculated directly by SQLAlchemy queries, pandas pipelines, or serialized ML models.
        </p>
      </div>
    </section>
  )
}

function TrendingUpIcon(props: { size?: number; className?: string }) {
  return (
    <svg
      width={props.size || 18}
      height={props.size || 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}
