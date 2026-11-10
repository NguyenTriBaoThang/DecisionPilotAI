import { CodeBlock } from '../components/CodeBlock'
import { AlertCircle, HelpCircle, Sliders, CheckCircle2, TrendingUp } from 'lucide-react'

export function Section15CaseStudy() {
  const sampleChat = `// Executive asks Copilot:
"Tại sao doanh thu tháng này ở HCMC lại giảm?"

// DecisionPilot AI Copilot Grounded Output (Intent: explain, Period: September 2026):
"Phân tích đóng góp biến động doanh thu tháng 09/2026 (dữ liệu đến 2026-09-30):
1. Khu vực HCMC sụt giảm mạnh nhất khi trọng số lưu lượng giảm xuống 0.59x (2026-09-03 → 2026-09-30) và tỷ lệ khách hàng quay lại giảm từ 44% xuống 20%.
2. Chi phí Facebook Ads tăng 1.85x nhưng xác suất quy đổi đơn hàng giảm từ 25% xuống 5.5%, kéo ROAS kênh xuống mức thấp; đồng thời SmartDesk Mini (P001) phát cảnh báo nguy cơ thiếu hàng từ 2026-09-19."`

  return (
    <section id="sec-case-study">
      <h2>
        <span className="sec-badge">15</span>
        End-to-End Business Case Study
      </h2>

      <p className="lead">
        To illustrate how DecisionPilot AI transforms SME operations, this walkthrough traces a realistic crisis baked into the September 2026 synthetic retail snapshot—from early statistical warning to audited human decisions.
      </p>

      {/* 4-Step Narrative Progression */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '24px 0' }}>
        {/* Step 1 */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertCircle size={20} className="amber" />
            <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.05rem', textTransform: 'none' }}>
              Phase 1: Anomaly Alert Triggered (September 2026 Revenue &amp; Ad Shock)
            </h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }}>
            Between September 3 and September 30, 2026, the Anomaly Center flags a critical revenue contraction in the <strong>HCMC</strong> market, an abnormal 1.85x surge in Facebook Ads spend alongside ROAS/conversion collapse, and a late-month <code>stockout_risk</code> warning on SmartDesk Mini (P001).
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
            The operator opens <strong>Ask AI Copilot</strong> and asks in plain Vietnamese. The intent router compiles typed filters and executes parameterized SQLAlchemy Core queries across <code>sales_transactions</code>, <code>inventory_daily</code>, and <code>marketing_campaigns</code>:
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
            Rather than launching an unfocused discount campaign, the operator tests SmartDesk Mini (<code>P001</code>, list 2,490,000 ₫, cost 1,650,000 ₫, elasticity &epsilon; = -1.1) and Facebook Ads budget changes in <strong>POST /simulate</strong>. Linear elasticity reveals that deep discounting erodes gross profit, guiding the team to hold list price while capping overspent ads and planning replenishment around P001&apos;s 14-day supplier lead time.
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
            The operator navigates to <strong>Recommendations</strong> and logs <em>&ldquo;Accept&rdquo;</em> or <em>&ldquo;Reject&rdquo;</em> (or commits simulation feedback). Each decision is appended to <code>audit_events</code> bound to dataset snapshot <code>f32e87e3a5744333ff98d3bf</code> without silently mutating historical business records.
          </p>
        </div>
      </div>
    </section>
  )
}

