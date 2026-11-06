import { InteractiveSimulatorDemo } from '../components/InteractiveSimulatorDemo'
import { CodeBlock } from '../components/CodeBlock'
import { Sliders, DollarSign, BarChart2, ShieldCheck } from 'lucide-react'

export function Section09Simulator() {
  const simulationCode = `# POST /api/simulate payload example
{
  "price_change_pct": -5.0,
  "marketing_budget_multiplier": 1.2,
  "inventory_buffer_days": 15,
  "target_sku": "P001"
}`

  return (
    <section id="sec-simulator">
      <h2>
        <span className="sec-badge">09</span>
        Microeconomic Scenario Simulator
      </h2>

      <p className="lead">
        Traditional BI tools are backward-looking dashboards that show what already happened. The DecisionPilot AI Scenario Simulator enables SME owners to test proactive interventions in a sandboxed microeconomic environment before allocating capital.
      </p>

      {/* Live Interactive Sandbox */}
      <InteractiveSimulatorDemo />

      <h3>Microeconomic Foundations</h3>
      <p>
        The simulation engine (<code>ai_service/simulation.py</code>) calculates projected changes by modeling three interacting business dimensions:
      </p>

      <div className="grid-3" style={{ margin: '20px 0' }}>
        <div className="card">
          <div className="card-title">
            <DollarSign size={18} className="cyan" />
            1. Price Elasticity (ΔP &rarr; ΔQ)
          </div>
          <p className="card-desc">
            Empirical log-log regression estimates SKU-level elasticity. When price drops by 5% on an elastic product like SmartDesk Mini (ε = -1.42), projected units increase by +7.1%, expanding total revenue and gross profit.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <BarChart2 size={18} className="violet" />
            2. Marketing Saturation Curve
          </div>
          <p className="card-desc">
            Ad spending does not scale linearly. The simulator uses a Hill saturation equation to account for diminishing returns and ad fatigue when channel budget multipliers exceed 1.5x.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="green" />
            3. Inventory Depletion Risk
          </div>
          <p className="card-desc">
            Stimulating demand without sufficient inventory leads to costly stockout events. The simulator factors in supplier lead times to compute stockout probabilities under elevated order volumes.
          </p>
        </div>
      </div>

      <h3>Simulation Payload Structure</h3>
      <p>
        Simulations can be triggered through the dashboard UI or via the REST API with structured parameters:
      </p>

      <CodeBlock code={simulationCode} label="request.json" />
    </section>
  )
}

