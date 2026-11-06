import { CodeBlock } from '../components/CodeBlock'
import { AlertCircle, HelpCircle, Sliders, CheckCircle2, TrendingUp } from 'lucide-react'

export function Section15CaseStudy() {
  const sampleChat = `// Executive asks Copilot:
"Tại sao doanh thu tháng 10/2026 tại chi nhánh TP.HCM lại giảm 24% so với tháng 9?"

// DecisionPilot AI Copilot Response:
"Doanh thu tháng 10/2026 tại TP.HCM đạt 318,000,000 ₫ (-24.3% so với tháng 9).
Phân tích nguyên nhân gốc rễ:
1. Sản phẩm P003 (FocusCam Pro) bị đứt hàng cục bộ từ ngày 12/10 đến 25/10 do gián đoạn nhà cung ứng, khiến doanh số SKU này giảm 68% (-62 triệu ₫).
2. Chi phí quảng cáo Facebook Ads tăng 1.85x (đạt 48 triệu ₫) nhưng tỷ lệ chuyển đổi khách hàng giảm mạnh từ 25% xuống 5.5%, làm ROAS giảm từ 4.12x xuống 1.25x."`

  return (
    <section id="sec-case-study">
      <h2>
        <span className="sec-badge">15</span>
        End-to-End Business Case Study
      </h2>

      <p className="lead">
        To illustrate how DecisionPilot AI transforms SME operations, this walkthrough demonstrates the full lifecycle: from detecting an operational crisis to executing an audited, profit-maximizing countermeasure.
      </p>

      {/* 4-Step Narrative Progression */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '24px 0' }}>
        {/* Step 1 */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertCircle size={20} className="amber" />
            <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.05rem', textTransform: 'none' }}>
              Phase 1: Anomaly Alert Triggered (Revenue Dip in HCMC)
            </h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }}>
            On October 2026, the Anomaly Center alerts the business owner: gross revenue across the Hồ Chí Minh market dropped <strong>24.3%</strong> below forecast expectation (Z-score: -3.84). Simultaneously, advertising expenditure on Facebook spiked without proportional sales lift.
          </p>
        </div>

        {/* Step 2 */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <HelpCircle size={20} className="cyan" />
            <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.05rem', textTransform: 'none' }}>
              Phase 2: Conversational Diagnosis via Ask AI Copilot
            </h4>
          </div>
          <p style={{ fontSize: '0.9rem', color: '#CBD5E1', marginBottom: '12px' }}>
            The business manager opens <strong>Ask AI Copilot</strong> and inquires in plain Vietnamese. The orchestrator generates deterministic SQL queries across <code>sales_transactions</code>, <code>inventory_daily</code>, and <code>marketing_campaigns</code>:
          </p>
          <CodeBlock code={sampleChat} label="Copilot Dialogue" />
        </div>

        {/* Step 3 */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Sliders size={20} className="violet" />
            <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.05rem', textTransform: 'none' }}>
              Phase 3: What-If Simulation in 3D Scenario Simulator
            </h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }}>
            Instead of slashing ad spend indiscriminately, the analyst tests a <strong>5% promotional discount on SmartDesk Mini (P001)</strong>, an elastic SKU (ε = -1.42) with ample warehouse stock (500 units), while setting a 15-day reorder buffer. The simulator computes a +17.1% demand surge, projecting <strong>+42.5 million ₫ in gross revenue</strong> and <strong>+10.2 million ₫ in incremental gross profit</strong>.
          </p>
        </div>

        {/* Step 4 */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <CheckCircle2 size={20} className="green" />
            <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.05rem', textTransform: 'none' }}>
              Phase 4: Executive Decision Approval &amp; Immutable Audit Record
            </h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }}>
            The executive navigates to the <strong>Recommendations Workspace</strong> and clicks <em>&ldquo;Approve Campaign&rdquo;</em>. The decision is committed to PostgreSQL with dataset lock <code>f32e87e3a5744333ff98d3bf</code>. The marketing team adjusts ad creatives, inventory managers confirm stock allocations, and business profitability rebounds.
          </p>
        </div>
      </div>
    </section>
  )
}

