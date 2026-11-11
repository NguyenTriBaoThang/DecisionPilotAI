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
        The simulation engine (<code>ai_service/scenario.py</code>) calculates projected changes by modeling three interacting business dimensions:
      </p>

      <div className="grid-3" style={{ margin: '20px 0' }}>
        <div className="card">
          <div className="card-title">
            <DollarSign size={18} className="cyan" />
            1. Price Elasticity (ΔP &rarr; ΔQ)
          </div>
          <p className="card-desc">
            Each SKU carries a price-sensitivity (elasticity) value from the catalog, which an operator can override. Demand responds linearly to the percentage price change: for SmartDesk Mini (ε = -1.1) a 5% price cut raises projected units by about 5.5%, and the simulator then shows the effect on revenue, profit and stock.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <BarChart2 size={18} className="violet" />
            2. Marketing Saturation Curve
          </div>
          <p className="card-desc">
            Ad spending does not scale linearly. Attributed revenue scales with the budget ratio raised to a power below 1 (default 0.65), so each extra dong returns less than the previous one.
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

