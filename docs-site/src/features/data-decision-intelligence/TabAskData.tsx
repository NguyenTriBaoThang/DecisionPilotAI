import { useState } from 'react'
import { SAMPLE_QUERIES, type QuerySample } from './mockIntelligenceData'
import { CodeBlock } from '../../components/CodeBlock'
import { MessageSquareText, Sparkles, Terminal, CheckCircle2, ShieldCheck, Database, Layers, ArrowRight } from 'lucide-react'

export function TabAskData() {
  const [selectedQuery, setSelectedQuery] = useState<QuerySample>(SAMPLE_QUERIES[0])

  const pipelineSteps = [
    { step: '01', title: 'User Question Ingestion', desc: 'Natural language input via web UI in Vietnamese (diacritic-folded) or English.' },
    { step: '02', title: 'Typed Intent Extraction', desc: 'OpenAI, Gemini, or deterministic regex rules map text to a strict Pydantic Intent.' },
    { step: '03', title: 'Allowlist & Injection Guard', desc: 'Regex blocker + Pydantic extra="forbid" reject SQL injection and off-domain prompts.' },
    { step: '04', title: 'Parameterized SQLAlchemy Core', desc: 'Executes allowlisted backend analytics queries rather than LLM-generated raw SQL.' },
    { step: '05', title: 'Deterministic DB Execution', desc: 'PostgreSQL / SQLite computes exact aggregates over read-only database sessions.' },
    { step: '06', title: 'Grounded Narrative & Visuals', desc: 'Formats evidence-backed prose, formulas, provenance, and interactive charts.' },
  ]

  const maxVal = Math.max(...selectedQuery.chartData.map((d) => d.value))

  const formatVND = (v: number) => {
    return (v / 1_000_000).toFixed(1) + 'M ₫'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header & Subtitle */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="badge badge-indigo">NĂNG LỰC 01 · CAPABILITY 1</span>
          <span className="badge badge-green">IMPLEMENTED IN CODEBASE</span>
        </div>
        <h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
          Ask Your Business Data
        </h3>
        <p style={{ color: 'var(--cyan)', fontSize: '1.05rem', fontWeight: 600, marginTop: '4px', marginBottom: '12px' }}>
          &ldquo;Turn natural language questions into actionable business reports.&rdquo;
        </p>
        <p style={{ color: '#CBD5E1', fontSize: '0.95rem', maxWidth: '850px', lineHeight: 1.6 }}>
          Small and medium enterprises often waste days compiling manual Excel spreadsheets and pivot tables just to diagnose a metric change. DecisionPilot AI provides an executive conversational intelligence layer that maps plain business questions into strict typed intents, executes parameterized read-only SQLAlchemy Core queries, and returns grounded analytical reports (median local-rules benchmark latency: 1.43 seconds).
        </p>
      </div>

      {/* Pipeline Flow Diagram */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
        <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '14px' }}>
          End-to-End Analytical Query Processing Pipeline
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
          {pipelineSteps.map((p, idx) => (
            <div
              key={p.step}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '12px',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span className="mono cyan" style={{ fontSize: '0.72rem', fontWeight: 700 }}>STEP {p.step}</span>
                <CheckCircle2 size={13} className="green" />
              </div>
              <strong style={{ display: 'block', fontSize: '0.82rem', color: '#FFFFFF', marginBottom: '4px' }}>{p.title}</strong>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4, display: 'block' }}>{p.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Try Sample Questions Explorer */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} className="cyan" />
            <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.1rem', textTransform: 'none' }}>
              Interactive Question Sandbox
            </h4>
          </div>
          <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>
            Documented Demo Result — Synthetic Dataset
          </span>
        </div>

        {/* Question Selector Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {SAMPLE_QUERIES.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setSelectedQuery(q)}
              style={{
                background: selectedQuery.id === q.id ? 'var(--indigo)' : 'var(--panel)',
                color: selectedQuery.id === q.id ? '#FFFFFF' : 'var(--text-muted)',
                border: `1px solid ${selectedQuery.id === q.id ? 'var(--cyan)' : 'var(--line)'}`,
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {q.question}
            </button>
          ))}
        </div>

        {/* Selected Query Output Card */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line-bright)',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {/* Top metadata */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid var(--line)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-indigo">INTENT: {selectedQuery.intent}</span>
              <span className="badge badge-green">EXECUTION: 200 OK</span>
              <span className="mono dim" style={{ fontSize: '0.75rem' }}>Latency: {selectedQuery.latencyMs} ms</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              <span>Sources: {selectedQuery.sources.join(', ')}</span>
            </div>
          </div>

          {/* User Question Bubble */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '16px' }}>
            <span style={{ background: 'var(--surface)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '0.75rem', fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>
              USER
            </span>
            <strong style={{ fontSize: '1.05rem', color: '#FFFFFF', paddingTop: '3px' }}>
              &ldquo;{selectedQuery.question}&rdquo;
            </strong>
          </div>

          {/* AI Grounded Answer Bubble */}
          <div style={{ background: 'rgba(12, 18, 36, 0.7)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'var(--cyan)', fontSize: '0.8rem', fontWeight: 700 }}>
              <Sparkles size={14} />
              <span>DECISIONPILOT AI SYNTHESIZED ANSWER (GROUNDED)</span>
            </div>
            <p style={{ margin: 0, color: '#E2E8F0', fontSize: '0.94rem', lineHeight: 1.6 }}>
              {selectedQuery.answer}
            </p>
          </div>

          {/* Chart Visualization */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '10px' }}>
              Visual Data Breakdown (Auto-Generated Artifact)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedQuery.chartData.map((item, idx) => {
                const pct = Math.max(8, Math.round((item.value / maxVal) * 100))
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.84rem' }}>
                    <span style={{ width: '180px', color: '#CBD5E1', flexShrink: 0, textAlign: 'left' }} className="truncate">
                      {item.label}
                    </span>
                    <div style={{ flex: 1, background: 'var(--surface)', height: '22px', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--indigo) 0%, var(--cyan) 100%)',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: '8px',
                          color: '#FFFFFF',
                          fontFamily: 'var(--mono)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          transition: 'width 0.4s ease',
                        }}
                      >
                        {formatVND(item.value)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Executed Query Reference */}
          <div>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--indigo)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Equivalent Parameterized SQL Query Executed via SQLAlchemy Core
            </span>
            <CodeBlock code={selectedQuery.sql} label="sql" />
          </div>
        </div>
      </div>

      {/* Technical Architecture Deep-Dive */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="cyan" />
            Zero-Hallucination Grounding Architecture
          </div>
          <p className="card-desc">
            The intent router (orchestrated in <code>ai_service/llm_orchestrator.py</code>) never asks an LLM to generate raw SQL or perform arithmetic. Instead, the model or bilingual rule parser outputs a strict Pydantic <code>Intent</code> object. Parameterized SQLAlchemy Core functions in <code>backend/app/analytics.py</code> compute every metric over a read-only database session before assembling the grounded response.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Terminal size={18} className="violet" />
            Typed Schema Validation &amp; Refusal Protocol
          </div>
          <p className="card-desc">
            Requests pass a regex prompt-injection and SQL-keyword guard plus <code>ConfigDict(extra=&quot;forbid&quot;)</code> validation, disallowing unapproved fields or destructive verbs (<code>DROP</code>, <code>DELETE</code>, <code>INSERT</code>, <code>UPDATE</code>, <code>SELECT ... FROM</code>). Unsupported financial topics (tax, net profit, balance sheet) or arbitrary windows trigger an explicit <code>unsupported</code> refusal without DB fabrication.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-dim)', paddingTop: '8px' }}>
        <span>Source Code References:</span>
        <code style={{ fontSize: '0.75rem' }}>ai_service/llm_orchestrator.py</code>
        <code style={{ fontSize: '0.75rem' }}>backend/app/main.py (POST /query)</code>
        <code style={{ fontSize: '0.75rem' }}>artifacts/query_benchmark.json</code>
      </div>
    </div>
  )
}

