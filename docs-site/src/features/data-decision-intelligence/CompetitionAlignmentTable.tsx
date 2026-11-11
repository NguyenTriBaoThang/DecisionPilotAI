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
        { name: 'backend/app/main.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/main.py' },
      ],
      capabilities: 'Intent routing (local rules; Gemini/OpenAI optional), refusal rules, fixed read-only analytics tools, automated KPI computation, chart generation.',
      artifact: 'artifacts/query_benchmark.json',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/query_benchmark.json',
      metrics: '46 curated cases on local rules: 100% pass, median 1,432 ms. No model-written SQL is executed.',
      status: 'Implemented',
    },
    {
      num: '02',
      challengeReq: 'AI phân tích doanh thu và nhận diện các biến động đáng chú ý.',
      challengeReqEn: 'AI analyzes revenue and detects significant business anomalies.',
      module: 'Anomaly Center & Revenue Diagnostics',
      files: [
        { name: 'ai_service/anomaly.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/anomaly.py' },
        { name: 'backend/app/analytics.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/analytics.py' },
      ],
      capabilities: 'Isolation Forest, 56-day past-only trailing baseline, rolling z-score and IQR bounds, SKU/channel variance decomposition.',
      artifact: 'artifacts/MODEL_EVALUATION.md',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/MODEL_EVALUATION.md',
      metrics: 'Facebook spend: precision 100%, recall 82.1%. Revenue: precision 86.7%, recall 38.2%. Labels are periods where the synthetic generator changed its rules.',
      status: 'Implemented',
    },
    {
      num: '03',
      challengeReq: 'AI dự báo nhu cầu sản phẩm hoặc dịch vụ dựa trên dữ liệu lịch sử.',
      challengeReqEn: 'AI forecasts product or service demand based on historical data.',
      module: 'Forecast Center & Demand Forecasting',
      files: [
        { name: 'ai_service/forecasting.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/forecasting.py' },
        { name: 'backend/app/services.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/services.py' },
      ],
      capabilities: 'LightGBM multi-quantile gradient boosting, lag features (7, 14, 28), rolling window aggregates, 70/15/15 chronological split, 2% Rule selection gate.',
      artifact: 'artifacts/MODEL_EVALUATION.md',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/MODEL_EVALUATION.md',
      metrics: 'Revenue (all): moving average selected, WAPE 24.14%, coverage 83.81%. SKU P001: LightGBM, WAPE 41.87%, coverage 92.86%.',
      status: 'Implemented',
    },
    {
      num: '04',
      challengeReq: 'AI so sánh các kịch bản kinh doanh để hỗ trợ ra quyết định.',
      challengeReqEn: 'AI compares business scenarios to support strategic decision making.',
      module: '3D Scenario Simulator & Recommendations',
      files: [
        { name: 'ai_service/scenario.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/scenario.py' },
        { name: 'backend/app/main.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/main.py' },
      ],
      capabilities: 'Linear price-elasticity response (P001 ε = -1.1), concave ad-spend response (ratio^α), lead-time replenishment modeling, sensitivity analysis.',
      artifact: 'artifacts/scenario_backtest.json',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/scenario_backtest.json',
      metrics: 'Holdout replay WAPE: price scenario 23.99% vs 24.24% baseline; marketing scenario 33.00% vs 25.44% baseline (worse). Conditional estimates.',
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

