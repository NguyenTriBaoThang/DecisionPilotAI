import { CodeBlock } from '../components/CodeBlock'
import { Cpu, LineChart, AlertTriangle, Scale, Brain } from 'lucide-react'

export function Section06AI() {
  const elasticityFormula = `
// 1. Price Elasticity of Demand (Linear % Change Relative to 90-Day Realized Price)
demand(P) = base_demand * max(0, 1 + elasticity * (new_price / base_price - 1))

where:
  elasticity in [-5.0, 0.0] is the SKU catalog or operator-specified coefficient.
  demand_at_price is evaluated against the weighted 90-day realized price baseline,
  with physical fulfillment capped at current stock on hand.

// 2. Marketing Power-Law Diminishing Returns Curve (ai_service/scenario.py)
budget_response(ratio, exponent) = ratio ** response_exponent

where:
  ratio = 1 + spend_change (e.g., 1.2 for +20% spend)
  response_exponent defaults to 0.65 (bounded sensitivity sweep in [0.20, 0.95])`

  const featureEngineering = `
// 17 Engineered Point-in-Time Forecasting Features (ai_service/features.py)
[
  "lag_1", "lag_7", "lag_14", "lag_28",
  "mean_7", "std_7", "mean_14", "std_14",
  "mean_28", "std_28", "growth_7",
  "weekday", "month", "quarter", "weekend",
  "holiday", "scale"
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
            Unsupervised tree ensemble (<code>IsolationForest</code>) paired with IQR bounds and robust Z-scores on a shifted 56-day baseline (+ sustained weekly contraction and physical stockout rules).
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
        Rather than relying on ungrounded generative predictions, the simulation engine (<code>ai_service/scenario.py</code>) solves deterministic counterfactual equations:
      </p>

      <CodeBlock code={elasticityFormula.trim()} label="Microeconomic Equations" />
    </section>
  )
}

