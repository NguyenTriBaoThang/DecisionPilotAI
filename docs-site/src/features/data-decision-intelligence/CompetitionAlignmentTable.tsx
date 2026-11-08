import { Award, CheckCircle2, FileText, Cpu, ExternalLink } from 'lucide-react'

export function CompetitionAlignmentTable() {
  const criteria = [
    {
      num: '01',
      challengeReq: 'AI chuyển câu hỏi bằng ngôn ngữ tự nhiên thành báo cáo dữ liệu.',
      challengeReqEn: 'AI converts natural language questions into structured data reports.',
      module: 'Ask AI Copilot (Natural Language Analytics)',
      files: [
        { name: 'ai_service/nl_query.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/nl_query.py' },
        { name: 'backend/app/routers/ask.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/routers/ask.py' },
      ],
      capabilities: 'Intent extraction, read-only SQL code synthesis, AST security validation sandbox, automated KPI computation, dynamic chart generation.',
      artifact: 'artifacts/query_benchmark.json',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/query_benchmark.json',
      metrics: '1,432 ms avg latency, 100% AST pass rate, zero mutation injections allowed.',
      status: 'Implemented',
    },
    {
      num: '02',
      challengeReq: 'AI phân tích doanh thu và nhận diện các biến động đáng chú ý.',
      challengeReqEn: 'AI analyzes revenue and detects significant business anomalies.',
      module: 'Anomaly Center & Revenue Diagnostics',
      files: [
        { name: 'ai_service/anomaly.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/anomaly.py' },
        { name: 'backend/app/routers/anomalies.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/routers/anomalies.py' },
      ],
      capabilities: 'Multidimensional Isolation Forest, 28-day rolling baseline with seasonal day-of-week adjustment, 3-sigma z-score ranking, SKU/channel variance decomposition.',
      artifact: 'artifacts/MODEL_EVALUATION.md',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/MODEL_EVALUATION.md',
      metrics: 'Precision: 87.5%, Recall: 91.3%, detected 5 real ground-truth incidents.',
      status: 'Implemented',
    },
    {
      num: '03',
      challengeReq: 'AI dự báo nhu cầu sản phẩm hoặc dịch vụ dựa trên dữ liệu lịch sử.',
      challengeReqEn: 'AI forecasts product or service demand based on historical data.',
      module: 'Forecast Center & Demand Forecasting',
      files: [
        { name: 'ai_service/forecasting.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/forecasting.py' },
        { name: 'backend/app/routers/forecast.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/routers/forecast.py' },
      ],
      capabilities: 'LightGBM multi-quantile gradient boosting, lag features (7, 14, 28), rolling window aggregates, 70/15/15 chronological split, 2% Rule selection gate.',
      artifact: 'artifacts/MODEL_EVALUATION.md',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/MODEL_EVALUATION.md',
      metrics: 'Aggregated WAPE: 11.24%, SKU P001 90% interval coverage: 92.86%, beats Seasonal Naive.',
      status: 'Implemented',
    },
    {
      num: '04',
      challengeReq: 'AI so sánh các kịch bản kinh doanh để hỗ trợ ra quyết định.',
      challengeReqEn: 'AI compares business scenarios to support strategic decision making.',
      module: '3D Scenario Simulator & Recommendations',
      files: [
        { name: 'ai_service/simulation.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/ai_service/simulation.py' },
        { name: 'backend/app/routers/scenarios.py', url: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/backend/app/routers/scenarios.py' },
      ],
      capabilities: 'Empirical log-log price elasticity (ε = -1.42 for P001), Hill saturation curve marketing ROAS, lead-time replenishment modeling, multi-scenario risk scoring.',
      artifact: 'artifacts/scenario_backtest.json',
      artifactUrl: 'https://github.com/NguyenTriBaoThang/DecisionPilotAI/blob/main/artifacts/scenario_backtest.json',
      metrics: 'Holdout replay WAPE: 23.99% (scenario) vs 24.24% (baseline), 100% deterministic reproducibility.',
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

