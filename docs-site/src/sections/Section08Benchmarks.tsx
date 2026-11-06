import { FORECAST_BENCHMARKS, ANOMALY_BENCHMARKS, COPILOT_BENCHMARKS, SCENARIO_REPLAY } from '../data/benchmarks'
import { Award, CheckCircle, BarChart3, Database } from 'lucide-react'

export function Section08Benchmarks() {
  return (
    <section id="sec-benchmarks">
      <h2>
        <span className="sec-badge">08</span>
        Model Evaluation &amp; Benchmark Results
      </h2>

      <p className="lead">
        All quantitative metrics reported below are empirically verified against serialized test artifacts in <code>artifacts/MODEL_EVALUATION.md</code> and <code>artifacts/query_benchmark.json</code>.
      </p>

      {/* Topline highlights */}
      <div className="grid-3" style={{ marginBottom: '24px' }}>
        <div className="stat-box">
          <div className="stat-value">11.24%</div>
          <div className="stat-label">Aggregated Forecast WAPE</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">100.0%</div>
          <div className="stat-label">Copilot Grounding Consistency</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">1,432 ms</div>
          <div className="stat-label">Copilot Median Latency</div>
        </div>
      </div>

      <h3>1. Selected 30-Day Forecast Benchmarks (Holdout Test Split)</h3>
      <p>
        Bands maintain 90% nominal coverage. Models are evaluated across total revenue, orders, overall demand, and individual SKU demand:
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>Scope</th>
              <th>Selected Model</th>
              <th>Test MAE</th>
              <th>Test WAPE</th>
              <th>90% Interval Coverage</th>
            </tr>
          </thead>
          <tbody>
            {FORECAST_BENCHMARKS.map((b, idx) => (
              <tr key={idx}>
                <td className="mono" style={{ color: '#FFFFFF', fontWeight: 600 }}>{b.target}</td>
                <td className="mono dim">{b.scope}</td>
                <td>
                  <span className={`badge ${b.model === 'lightgbm' ? 'badge-indigo' : 'badge-cyan'}`}>
                    {b.model}
                  </span>
                </td>
                <td className="mono">{b.mae}</td>
                <td className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{b.wape}</td>
                <td className="mono" style={{ color: 'var(--cyan)' }}>{b.coverage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>2. Labeled Anomaly Detection Benchmark (Ground Truth Injections)</h3>
      <p>
        Evaluated against 8 injected realistic business anomalies (sudden Facebook ad spend surge, demand dips, stockouts):
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Signal</th>
              <th>Method</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>F1-Score</th>
              <th>False-Positive Rate</th>
            </tr>
          </thead>
          <tbody>
            {ANOMALY_BENCHMARKS.map((a, idx) => (
              <tr key={idx}>
                <td className="mono" style={{ color: '#FFFFFF' }}>{a.signal}</td>
                <td>
                  <span className={`badge ${a.method === 'hybrid' ? 'badge-cyan' : 'badge-amber'}`}>
                    {a.method}
                  </span>
                </td>
                <td className="mono" style={{ color: Number(a.precision.replace('%', '')) > 80 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
                  {a.precision}
                </td>
                <td className="mono">{a.recall}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{a.f1}</td>
                <td className="mono dim">{a.fpr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>3. AI Copilot Analytical Benchmark (46 Curated Test Cases)</h3>
      <p>
        Benchmarked across 46 complex Vietnamese and English executive business questions with refusal edge cases:
      </p>

      <div className="grid-2">
        {COPILOT_BENCHMARKS.map((m, idx) => (
          <div key={idx} className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#FFFFFF' }}>{m.metric}</span>
              <span className="badge badge-green" style={{ fontSize: '0.8rem' }}>{m.score}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>{m.description}</p>
          </div>
        ))}
      </div>

      <h3>4. Conditional Scenario Replay (Holdout Backtest)</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Replay Target</th>
              <th>Baseline WAPE</th>
              <th>Scenario WAPE</th>
              <th>Observations</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono" style={{ color: '#FFFFFF' }}>{SCENARIO_REPLAY.priceReplay.target}</td>
              <td className="mono dim">{SCENARIO_REPLAY.priceReplay.baselineWape}</td>
              <td className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{SCENARIO_REPLAY.priceReplay.scenarioWape}</td>
              <td className="mono">{SCENARIO_REPLAY.priceReplay.observations} weeks</td>
            </tr>
            <tr>
              <td className="mono" style={{ color: '#FFFFFF' }}>{SCENARIO_REPLAY.marketingReplay.target}</td>
              <td className="mono dim">{SCENARIO_REPLAY.marketingReplay.baselineWape}</td>
              <td className="mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>{SCENARIO_REPLAY.marketingReplay.scenarioWape}</td>
              <td className="mono">{SCENARIO_REPLAY.marketingReplay.observations} weeks</td>
            </tr>
            <tr>
              <td className="mono" style={{ color: '#FFFFFF' }}>{SCENARIO_REPLAY.inventoryReplay.target}</td>
              <td className="mono dim">2 depletion weeks</td>
              <td className="mono" style={{ color: 'var(--cyan)', fontWeight: 700 }}>2 predicted weeks (100%)</td>
              <td className="mono">{SCENARIO_REPLAY.inventoryReplay.matches} weeks</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

