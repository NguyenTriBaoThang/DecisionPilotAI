import { CodeBlock } from '../components/CodeBlock'
import { CheckCircle2, ArrowDown, Database, Cpu, ShieldCheck } from 'lucide-react'

export function Section05Pipeline() {
  const steps = [
    {
      step: '01',
      title: 'Multi-Source CSV Ingestion & Encoding Sanitization',
      desc: 'Streams tabular records from sales terminals, e-commerce webhooks, and ERP feeds. Enforces UTF-8 encoding and strips BOM headers.',
    },
    {
      step: '02',
      title: 'Relational Key & Foreign Key Referential Integrity Check',
      desc: 'Validates that every transaction references an existing product_id in products and customer_id in customers. Orphaned records are rejected.',
    },
    {
      step: '03',
      title: 'Monetary Integer Enforcement (VND Precision)',
      desc: 'Vietnamese Dong lacks fractional decimal currency. Float values are rejected or converted to integer đ to prevent floating-point rounding drifts.',
    },
    {
      step: '04',
      title: 'Calendar Alignment & Vietnamese Holiday Synchronization',
      desc: 'Maps every date to the official fiscal calendar, tagging Tết Nguyên Đán, National Day (2/9), and e-commerce mega-sales (11.11, 12.12).',
    },
    {
      step: '05',
      title: 'Multi-Channel Marketing Attribution Reconciliation',
      desc: 'Aligns ad spend from Facebook Ads, Google Ads, and TikTok Shop with downstream sales attribution, computing daily ROAS.',
    },
    {
      step: '06',
      title: 'Warehouse Inventory Continuity & Stockout Audit',
      desc: 'Enforces mathematical identity: Closing Stock = Opening Stock + Received Stock - Shipped Units. Flags negative inventory or unaccounted shrinkage.',
    },
    {
      step: '07',
      title: 'Cryptographic Snapshot Hashing & Artifact Export',
      desc: 'Computes SHA-256 fingerprint of the complete relational dataset, producing immutable artifacts (daily_features.csv.gz, data_quality.json).',
    },
  ]

  const pipelineCli = `# Execute end-to-end data processing and validation pipeline
python -m scripts.pipeline --dataset-dir data/raw --output-dir artifacts

# Run relational integrity verification tests
pytest tests/test_pipeline.py -v`

  return (
    <section id="sec-etl-pipeline">
      <h2>
        <span className="sec-badge">05</span>
        Data Processing &amp; ETL Pipeline
      </h2>

      <p className="lead">
        Data quality is the prerequisite of trustworthy AI. DecisionPilot AI employs a deterministic 7-step data engineering pipeline (<code>scripts/pipeline.py</code>) to clean, reconcile, and validate enterprise data before any model training or inferencing.
      </p>

      {/* 7-Step Pipeline list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '24px 0' }}>
        {steps.map((st, idx) => (
          <div
            key={st.step}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
            }}
          >
            <div
              style={{
                background: 'rgba(34, 211, 238, 0.12)',
                border: '1px solid rgba(34, 211, 238, 0.3)',
                color: 'var(--cyan)',
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                fontSize: '0.95rem',
                padding: '6px 12px',
                borderRadius: '6px',
                flexShrink: 0,
              }}
            >
              STEP {st.step}
            </div>

            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#FFFFFF', fontSize: '1rem', textTransform: 'none' }}>
                {st.title}
              </h4>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#CBD5E1' }}>
                {st.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h3>Running Pipeline Ingestion &amp; Verification</h3>
      <p>
        The pipeline can be triggered directly via Python CLI or integrated into automated CI/CD schedules:
      </p>

      <CodeBlock code={pipelineCli} label="bash" />
    </section>
  )
}

