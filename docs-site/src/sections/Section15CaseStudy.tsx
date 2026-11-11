import { CodeBlock } from '../components/CodeBlock'
import { AlertCircle, HelpCircle, Sliders, CheckCircle2 } from 'lucide-react'

export function Section15CaseStudy() {
  const sampleChat = `// Lan asks (in Vietnamese):
"Kênh quảng cáo nào đang kém hiệu quả nhất?"

// DecisionPilot AI answer (tool: marketing; every number is computed from the database):
"Facebook Ads had the largest decline in roas: 6.53x to 0.76x."

// Same question in English:
"Which marketing channel had the lowest ROAS?"
"All campaigns recorded roas of 2.76x from 01 Sep 2026 to 30 Sep 2026. Facebook Ads is lowest at 0.76x."`

  const card = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '20px' }
  const head = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }
  const title = { margin: 0, color: '#FFFFFF', fontSize: '1.05rem', textTransform: 'none' as const }
  const body = { margin: 0, fontSize: '0.9rem', color: '#CBD5E1' }

  return (
    <section id="sec-case-study">
      <h2>
        <span className="sec-badge">15</span>
        End-to-End Business Case Study
      </h2>

      <p className="lead">
        <strong>Illustrative example.</strong> Lan is a made-up owner of an online office-supplies shop. The numbers below are real outputs of DecisionPilot AI on its built-in <em>synthetic</em> demo dataset (September 2026), not results from a real business.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '24px 0' }}>
        <div style={card}>
          <div style={head}>
            <AlertCircle size={20} className="amber" />
            <h4 style={title}>Phase 1: Something is wrong</h4>
          </div>
          <p style={body}>
            The dashboard shows September revenue of <strong>3.38 billion ₫, down 30.6%</strong> on August. The Anomaly Center flags a <strong>critical Facebook Ads spend spike</strong> (23 Sept: 7.38 million ₫ per day against a 4.01 million ₫ baseline, +84%).
          </p>
        </div>

        <div style={card}>
          <div style={head}>
            <HelpCircle size={20} className="cyan" />
            <h4 style={title}>Phase 2: Ask in plain language</h4>
          </div>
          <p style={{ ...body, marginBottom: '12px' }}>
            Lan types a question. The router picks one of a fixed set of analytics tools, which reads the database; nothing is estimated by a language model. Facebook Ads spent about <strong>215 million ₫ and returned 0.76 ₫ per 1 ₫</strong>, while Email returned about 12.9 ₫.
          </p>
          <CodeBlock code={sampleChat} label="Copilot Dialogue" />
        </div>

        <div style={card}>
          <div style={head}>
            <Sliders size={20} className="violet" />
            <h4 style={title}>Phase 3: Try it before doing it</h4>
          </div>
          <p style={body}>
            From the recommendation card, Lan opens the simulator with Facebook Ads and a <strong>15% budget cut</strong> already run. The estimate: <strong>+28.8 million ₫ contribution profit and &minus;11.2 million ₫ attributed revenue</strong>. It is a conditional estimate (the marketing replay is weaker than the baseline), so the system recommends a small controlled trial with a comparison group rather than a blind cut.
          </p>
        </div>

        <div style={card}>
          <div style={head}>
            <CheckCircle2 size={20} className="green" />
            <h4 style={title}>Phase 4: A named decision and a record</h4>
          </div>
          <p style={body}>
            Lan accepts the scenario. One action marks both the scenario and the recommendation card as accepted, and the decision log stores who decided, when, and the evidence reviewed. Nothing is executed automatically. The log is append-only for ordinary database users.
          </p>
        </div>
      </div>
    </section>
  )
}
