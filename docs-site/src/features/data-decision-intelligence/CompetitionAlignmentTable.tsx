import { Award, CheckCircle2, FileText, Cpu, ExternalLink } from 'lucide-react'

export function CompetitionAlignmentTable() {
  const criteria = [
    {
      num: '01',
      challengeReq: 'AI chuyển câu hỏi bằng ngôn ngữ tự nhiên thành báo cáo dữ liệu.',
      challengeReqEn: 'AI converts natural language questions into structured data reports.',
      module: 'Ask AI Copilot (Natural Language Analytics)',
      files: [
        { name: 'ai_service/llm_orchestrator.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/llm_orchestrator.py' },
        { name: 'backend/app/main.py (POST /query)', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/main.py' },
      ],
      capabilities: 'Typed Pydantic Intent extraction (OpenAI, Gemini, or local bilingual rules), regex prompt-injection guard, allowlisted parameterized SQLAlchemy Core execution, grounded chart & prose generation.',
      artifact: 'artifacts/query_benchmark.json',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/query_benchmark.json',
      metrics: '46/46 benchmark cases passed (100% intent, execution, numerical & grounded accuracy); 1,432.2 ms median latency (local rules).',
      status: 'Implemented',
    },
    {
      num: '02',
      challengeReq: 'AI phân tích doanh thu và nhận diện các biến động đáng chú ý.',
      challengeReqEn: 'AI analyzes revenue and detects significant business anomalies.',
      module: 'Anomaly Center & Revenue Diagnostics',
      files: [
        { name: 'ai_service/anomaly.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/anomaly.py' },
        { name: 'ai_service/root_cause.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/root_cause.py' },
        { name: 'backend/app/main.py (GET /anomalies)', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/main.py' },
      ],
      capabilities: 'Hybrid Isolation Forest + IQR + robust Z-score on a 56-day baseline shifted 7 days, sustained weekly drop detection, stockout lead-time checks, and multi-dimensional variance decomposition.',
      artifact: 'artifacts/MODEL_EVALUATION.md',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/MODEL_EVALUATION.md',
      metrics: 'facebook_spend: 100.00% P / 82.14% R (0% FPR); revenue: 86.67% P / 38.24% R (2.63% FPR); facebook_conversion: 75.0% P / 75.0% R.',
      status: 'Implemented',
    },
    {
      num: '03',
      challengeReq: 'AI dự báo nhu cầu sản phẩm hoặc dịch vụ dựa trên dữ liệu lịch sử.',
      challengeReqEn: 'AI forecasts product or service demand based on historical data.',
      module: 'Forecast Center & Demand Forecasting',
      files: [
        { name: 'ai_service/forecasting.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/forecasting.py' },
        { name: 'ai_service/features.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/features.py' },
        { name: 'backend/app/main.py (POST /forecast)', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/main.py' },
      ],
      capabilities: 'LightGBM vs Seasonal Naive & Moving Average across 7d/30d horizons, 17 point-in-time lag/rolling/calendar features, >2% validation MAE gate, empirical validation-residual 90% intervals.',
      artifact: 'artifacts/MODEL_EVALUATION.md',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/MODEL_EVALUATION.md',
      metrics: 'All-revenue 30d WAPE: 24.14% (Moving Avg, 83.81% cov); SKU P001 30d LightGBM WAPE: 41.87% (MAE 2.68 units, 92.86% coverage).',
      status: 'Implemented',
    },
    {
      num: '04',
      challengeReq: 'AI so sánh các kịch bản kinh doanh để hỗ trợ ra quyết định.',
      challengeReqEn: 'AI compares business scenarios to support strategic decision making.',
      module: 'Scenario Simulator & Decision Audit Log',
      files: [
        { name: 'ai_service/scenario.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/scenario.py' },
        { name: 'backend/app/main.py (POST /simulate)', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/main.py' },
      ],
      capabilities: 'Linear percentage price elasticity relative to 90d realized price, power-curve marketing response (ratio^0.65), daily stock-balance replenishment simulation, sensitivity & Accept/Reject audit.',
      artifact: 'artifacts/scenario_backtest.json',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/scenario_backtest.json',
      metrics: '7-day replay: P001 units WAPE 23.99% (vs 24.24% baseline); P003 depletion 15/15 weeks matched; FB Ads replay WAPE 33.00% (disclosed miss).',
      status: 'Implemented',
    },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <Award size={16} color="var(--indigo)" />
        <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--indigo)', fontWeight: 700 }}>
          Competition Compliance &amp; Traceability Matrix
        </span>
      </div>
      <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
        LIKELION &mdash; AI for Business Innovation 2026 Alignment
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', margin: '4px 0 20px 0' }}>
        Direct mapping between the four official challenge requirements and the DecisionPilot AI verified codebase implementations.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: '#94A3B8' }}>
              <th style={{ padding: '12px 14px', width: '50px' }}>#</th>
              <th style={{ padding: '12px 14px', minWidth: '220px' }}>Challenge Requirement (Đề thi)</th>
              <th style={{ padding: '12px 14px', minWidth: '200px' }}>Product Module &amp; Source Code</th>
              <th style={{ padding: '12px 14px', minWidth: '220px' }}>Verified Empirical Evidence</th>
              <th style={{ padding: '12px 14px', width: '110px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={c.num} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--mono)', color: 'var(--cyan)', fontWeight: 800, verticalAlign: 'top' }}>
                  {c.num}
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>
                    {c.challengeReq}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8', fontStyle: 'italic' }}>
                    {c.challengeReqEn}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#CBD5E1', marginTop: '6px', lineHeight: 1.4 }}>
                    {c.capabilities}
                  </div>
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 600, color: 'var(--indigo)', marginBottom: '6px' }}>
                    {c.module}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {c.files.map((f, fi) => (
                      <a
                        key={fi}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: '#38BDF8',
                          textDecoration: 'none',
                          fontSize: '0.72rem',
                          fontFamily: 'var(--mono)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Cpu size={12} /> {f.name} <ExternalLink size={10} style={{ opacity: 0.6 }} />
                      </a>
                    ))}
                  </div>
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                  <a
                    href={c.artifactUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: 'var(--green)',
                      textDecoration: 'none',
                      fontSize: '0.74rem',
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginBottom: '4px',
                    }}
                  >
                    <FileText size={12} /> {c.artifact}
                  </a>
                  <div style={{ fontSize: '0.74rem', color: '#CBD5E1', lineHeight: 1.4 }}>
                    {c.metrics}
                  </div>
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'center' }}>
                  <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} /> {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

