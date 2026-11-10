import { CodeBlock } from '../components/CodeBlock'
import { Calendar, ShieldAlert, GitBranch, Terminal } from 'lucide-react'

export function Section07Training() {
  const trainCli = `# Run model training across all targets, categories, SKUs, and horizons (7d / 30d)
python -m scripts.train --out artifacts

# Expected JSON summary output:
# {
#   "dataset_id": "f32e87e3a5744333ff98d3bf",
#   "version": "dp-1.1",
#   "split": { "train_end": "2026-02-22", "validation_end": "2026-06-12", "test_end": "2026-09-30" },
#   "evaluated_forecast_variants": ...
# }
# Serializes model bundle artifacts/f32e87e3a5744333ff98d3bf.joblib + evaluation.json + *.csv.gz`

  return (
    <section id="sec-training-workflow">
      <h2>
        <span className="sec-badge">07</span>
        Model Training Workflow
      </h2>

      <p className="lead">
        Time-series and business analytics models must never use standard random k-fold cross-validation, as random shuffling leaks future events into past training steps. DecisionPilot AI enforces strict chronological splits.
      </p>

      {/* Chronological split visualization */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line-bright)',
          borderRadius: '10px',
          padding: '24px',
          margin: '24px 0',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, display: 'block', marginBottom: '14px' }}>
          Chronological Dataset Partition (730 Days Total History)
        </span>

        {/* Visual segmented timeline bar */}
        <div style={{ display: 'flex', height: '28px', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ width: '70%', background: 'linear-gradient(90deg, #3730A3, #4F46E5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#FFFFFF' }}>
            TRAIN (70%) · 2024-10-01 &rarr; 2026-02-22 (509 Days)
          </div>
          <div style={{ width: '15%', background: 'linear-gradient(90deg, #7C3AED, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#FFFFFF' }}>
            VAL (15%)
          </div>
          <div style={{ width: '15%', background: 'linear-gradient(90deg, #0284C7, #0EA5E9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#FFFFFF' }}>
            TEST (15%)
          </div>
        </div>

        <div className="grid-3" style={{ margin: 0 }}>
          <div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#A5B4FC' }}>Training Segment (70%)</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Used exclusively to fit gradient boosting tree splits, compute rolling window priors, and estimate baseline averages.
            </p>
          </div>
          <div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#C4B5FD' }}>Validation Segment (15%)</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Used for early stopping, hyperparameter tuning, and model selection rule evaluation.
            </p>
          </div>
          <div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7DD3FC' }}>Holdout Test Segment (15%)</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Untouched during training; strictly reserved for final unbiased WAPE, MAE, and interval coverage reporting.
            </p>
          </div>
        </div>
      </div>

      <div className="callout warn">
        <div className="callout-title">
          <ShieldAlert size={16} className="amber" />
          The 2% Rule: Conservative Model Selection Protocol
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }}>
          Complex ML models are not deployed blindly. In <code>ai_service/forecasting.py</code>, LightGBM is only promoted to production if its validation MAE improves upon the better statistical baseline (Seasonal Naive or Moving Average) by more than <strong>2.0%</strong>. For series where statistical noise dominates, the system transparently selects the stronger baseline.
        </p>
      </div>

      <h3>Executing Model Training</h3>
      <CodeBlock code={trainCli} label="bash" />
    </section>
  )
}

