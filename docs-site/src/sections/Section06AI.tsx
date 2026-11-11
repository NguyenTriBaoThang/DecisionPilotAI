import { CodeBlock } from '../components/CodeBlock'
import { Cpu, LineChart, AlertTriangle, Scale, Brain } from 'lucide-react'

export function Section06AI() {
  const elasticityFormula = `
// 1. Price response (linear in the percentage price change)
Q_new = Q_base * max(0, 1 + epsilon * (P_new / P_base - 1))

where:
  epsilon < 0 is the price-sensitivity value (catalog assumption; operator can override).
  P001 SmartDesk Mini: epsilon = -1.1. A sensitivity of epsilon +/- 0.3 is shown with every result.

// 2. Advertising response (diminishing returns)
Attributed_Revenue(new) = Attributed_Revenue(base) * (Spend_new / Spend_base) ^ alpha

where:
  alpha in [0.2, 0.95], default 0.65. Smaller alpha means faster saturation.
  Results are conditional estimates, not verified causal effects.`

  const featureEngineering = `
// 14 Engineered Chronological Forecasting Features (ai_service/forecasting.py)
[
  "lag_1d", "lag_2d", "lag_7d", "lag_14d", "lag_28d",
  "rolling_mean_7d", "rolling_std_7d",
  "rolling_mean_28d", "rolling_std_28d",
  "day_of_week", "month", "is_weekend",
  "is_holiday", "is_major_sale_day"
]`

  return (
    <section id="sec-ai-engine">
      <h2>
        <span className="sec-badge">06</span>
        AI &amp; Machine Learning Engine
      </h2>

      <p className="lead">
        DecisionPilot AI deliberately pairs gradient boosted tree algorithms and robust statistical estimators with microeconomic domain logic, avoiding fragile black-box models.
      </p>

      <div className="grid-3" style={{ margin: '24px 0' }}>
        <div className="card">
          <div className="card-title">
            <LineChart size={18} className="cyan" />
            1. LightGBM Regressors
          </div>
          <p className="card-desc">
            Fast, memory-efficient histogram-based gradient boosted decision trees. Specialized in non-linear seasonal interactions, holiday spikes, and SKU demand forecasting with rolling temporal windows.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <AlertTriangle size={18} className="amber" />
            2. Isolation Forest Hybrids
          </div>
          <p className="card-desc">
            Unsupervised tree ensemble that isolates multi-dimensional outliers by randomly partitioning feature space. Coupled with 3-sigma rolling Z-score thresholds to detect sudden anomalies.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <Scale size={18} className="green" />
            3. Microeconomic Formulations
          </div>
          <p className="card-desc">
            Rigorous econometric formulations for price elasticity and marketing saturation, ensuring simulated outcomes obey fundamental business realities like diminishing marginal returns.
          </p>
        </div>
      </div>

      <h3>Feature Engineering Pipeline</h3>
      <p>
        To preserve chronological validity and eliminate data leakage, models use strictly backward-looking lag and rolling statistics calculated up to time <code>t - 1</code>:
      </p>

      <CodeBlock code={featureEngineering.trim()} label="Feature Vector (Python / NumPy)" />

      <h3>Microeconomic Equations for Scenario Simulation</h3>
      <p>
        Rather than relying on ungrounded generative predictions, the simulation engine (<code>ai_service/scenario.py</code>) applies simple, documented response equations:
      </p>

      <CodeBlock code={elasticityFormula.trim()} label="Microeconomic Equations" />
    </section>
  )
}

