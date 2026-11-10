import { InteractiveSimulatorDemo } from '../components/InteractiveSimulatorDemo'
import { CodeBlock } from '../components/CodeBlock'
import { Sliders, DollarSign, BarChart2, ShieldCheck } from 'lucide-react'

export function Section09Simulator() {
  const simulationCode = `// POST /simulate (PriceRequest)
{
  "type": "price",
  "objective": "profit",
  "horizon": 30,
  "parameters": {
    "product": "P001",
    "discounts": [0, 0.05, 0.15]
  }
}`

  return (
    <section id="sec-simulator">
      <h2>
        <span className="sec-badge">09</span>
        Microeconomic Scenario Simulator
      </h2>

      <p className="lead">
        Traditional BI tools are backward-looking dashboards that show what already happened. The DecisionPilot AI Scenario Simulator enables SME owners to test proactive interventions in a deterministic counterfactual environment before allocating capital.
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
            Demand responds linearly in percentage change relative to the past 90-day weighted realized price (<code>base_demand * max(0, 1 + e * (new_price/base_price - 1))</code>). On SmartDesk Mini (P001, list 2,490,000 ₫, unit cost 1,650,000 ₫, catalog &epsilon; = -1.1), a 5% discount grows unit demand +5.5% while surfacing profit vs. volume trade-offs.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <BarChart2 size={18} className="violet" />
            2. Marketing Diminishing Returns
          </div>
          <p className="card-desc">
            Ad spending does not scale linearly. The simulator applies a power-law response curve (<code>ratio ** response_exponent</code>, default <code>0.65</code>, sensitivity bounds <code>0.20..0.95</code>) to capture diminishing marginal returns at higher budgets.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="green" />
            3. Inventory Replenishment &amp; Lead Time
          </div>
          <p className="card-desc">
            Simulates day-by-day opening stock, scheduled receipts arriving after <code>lead_time_days</code> full days, lost sales on stockout days, and purchase commitments relative to safety stock targets.
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

