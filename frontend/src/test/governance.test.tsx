import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../api'
import { PreferencesProvider } from '../preferences'
import { ToastProvider } from '../ui'
import { XAIPanels } from '../features/recommendations-audit/XAIPanels'
import { RecommendationsCenter } from '../features/recommendations-audit/RecommendationsCenter'
import { AuditGovernanceCenter } from '../features/recommendations-audit/AuditGovernanceCenter'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    request: vi.fn(),
    getRecommendationsOverview: vi.fn(),
    getAuditOverview: vi.fn(),
    getAuditEvents: vi.fn(),
    getAuditModels: vi.fn(),
    getAuditRisks: vi.fn(),
    getAuditIntegrity: vi.fn(),
    postResolveAuditRisk: vi.fn(),
    downloadAuditExport: vi.fn(),
  }
})

beforeEach(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'vnd' }))
})

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <ToastProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  )
}

describe('Enterprise XAI Recommendations & Audit Governance', () => {
  it('XAIPanels shows causal disclaimer, native TreeSHAP plots, counterfactuals, and honest shap-unavailable state', () => {
    const activeXai: api.XAIPayload = {
      shap_available: true,
      causal_disclaimer: 'Associations explain predictions only, not causal proof.',
      feature_importance: {
        available: true,
        gain: [
          { feature: 'lag_7', label: 'Same Weekday Last Week', importance: 1200, normalized_pct: 52.0 },
          { feature: 'mean_7', label: '7-Day Moving Average', importance: 800, normalized_pct: 48.0 },
        ],
        permutation: [
          { feature: 'lag_7', label: 'Same Weekday Last Week', importance: 245.5, normalized_pct: 60.0 },
        ],
        split: [{ feature: 'lag_7', label: 'Same Weekday Last Week', importance: 44, normalized_pct: 100 }],
      },
      shap: {
        available: true,
        method: 'lightgbm_pred_contrib_exact_treeshap',
        scope: 'product:P001',
        sample_count: 30,
        base_value: 2500000,
        predicted_value: 2920000,
        additivity_error: 1e-8,
        waterfall_local: [
          {
            feature: 'lag_7',
            label: 'Same Weekday Last Week',
            feature_value: 2800000,
            shap_value: 420000,
            abs_shap: 420000,
            cumulative_after: 2920000,
            direction: 'positive',
          },
        ],
        global_summary: [
          {
            feature: 'lag_7',
            label: 'Same Weekday Last Week',
            mean_abs_shap: 310000,
            mean_signed_shap: 250000,
            direction: 'positive',
            beeswarm_points: [{ feature_value: 2800000, shap_value: 420000 }],
          },
        ],
        dependence: [
          {
            feature: 'lag_7',
            label: 'Same Weekday Last Week',
            points: [{ feature_value: 2800000, shap_value: 420000 }],
          },
        ],
      },
      counterfactuals: [
        {
          parameter: 'order_quantity',
          scenario_label: '0 units replenishment',
          predicted_revenue: 10000000,
          predicted_profit: 3500000,
          profit_delta: 0,
          is_recommended: false,
        },
        {
          parameter: 'order_quantity',
          scenario_label: '200 units replenishment',
          predicted_revenue: 14000000,
          predicted_profit: 5100000,
          profit_delta: 1600000,
          is_recommended: true,
        },
      ],
    }

    const { rerender } = wrap(<XAIPanels xai={activeXai} />)
    expect(screen.getByTestId('causal-disclaimer').textContent).toMatch(/not causal proof/i)

    fireEvent.click(screen.getByRole('button', { name: 'SHAP Explorer' }))
    expect(screen.getByTestId('shap-active-panel').textContent).toContain('Native LightGBM TreeSHAP Decomposition')
    expect(screen.getByTestId('shap-active-panel').textContent).toContain('Base E[f(X)]')

    fireEvent.click(screen.getByRole('button', { name: /Counterfactuals/i }))
    expect(screen.getByText('200 units replenishment')).toBeTruthy()
    expect(screen.getByText('RECOMMENDED')).toBeTruthy()

    const unavailableXai: api.XAIPayload = {
      shap_available: false,
      shap_unavailable_reason: 'Domain recommendation does not use a tree ensemble.',
      feature_importance: { available: true, domain_drivers: [] },
      shap: { available: false, reason: 'No tree model used for Facebook Ads rule.' },
    }
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PreferencesProvider>
          <ToastProvider>
            <MemoryRouter>
              <XAIPanels xai={unavailableXai} />
            </MemoryRouter>
          </ToastProvider>
        </PreferencesProvider>
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'SHAP Explorer' }))
    expect(screen.getByTestId('shap-unavailable-panel').textContent).toMatch(/Chưa khả dụng/)
  })

  it('RecommendationsCenter renders 8 KPIs, 4 Donuts, legacy actions, and honest unevaluated effective KPI', async () => {
    vi.mocked(api.request).mockImplementation(async (path: string) => {
      if (path === '/session') {
        return { actor: 'admin', role: 'admin', authentication: 'token', company_ids: ['comp-default'] }
      }
      if (path.startsWith('/audit')) {
        return { rows: [], next_before: null }
      }
      return {}
    })

    vi.mocked(api.getRecommendationsOverview).mockResolvedValue({
      company_id: 'comp-default',
      dataset_id: 'ds-demo',
      empty_workspace: false,
      kpis: {
        total_recommendations: 2,
        new_count: 1,
        pending_review_count: 1,
        approved_count: 0,
        implemented_count: 1,
        rejected_count: 0,
        sufficient_evidence_pct: 50,
        post_impl_effective_pct: null,
        evaluated_implemented_count: 0,
      },
      charts: {
        by_category: [
          { key: 'marketing', label: 'Marketing Optimization', count: 1, share: 0.5 },
          { key: 'inventory', label: 'Inventory & Supply Chain', count: 1, share: 0.5 },
        ],
        by_status: [
          { key: 'pending', label: 'Pending', count: 1, share: 0.5 },
          { key: 'implemented', label: 'Implemented', count: 1, share: 0.5 },
        ],
        by_priority: [
          { key: 'critical', label: 'Critical', count: 1, share: 0.5 },
          { key: 'high', label: 'High', count: 1, share: 0.5 },
        ],
        by_confidence: [
          { key: 'High', label: 'High', count: 1, share: 0.5 },
          { key: 'Low', label: 'Low', count: 1, share: 0.5 },
        ],
      },
      rows: [
        {
          id: 'marketing:facebook',
          record_id: 'rec-fb-1',
          rec_key: 'marketing:facebook',
          dataset_id: 'ds-demo',
          category_code: 'marketing',
          category_label: 'Marketing Optimization',
          title: 'Review Facebook Ads allocation',
          context: 'Facebook Ads ROAS fell below threshold.',
          action: 'Reduce spend by 15% and audit creatives.',
          priority: 'high',
          decision: 'pending',
          workflow_status: 'pending',
          is_new: true,
          confidence_level: 'High',
          confidence_score: 79,
          confidence_is_calibrated: false,
          sufficient_evidence: true,
          shap_available: false,
          expected_impact: { profit_delta_vnd: 12000000 },
          uncertainty: 'Subject to diminishing returns elasticity.',
          risk: 'Temporary reach reduction.',
          assumptions: ['Alpha = 0.65'],
          evidence: { kpis: [], charts: {} },
          tracking_kpi: 'Facebook Ads ROAS',
        },
        {
          id: 'inventory:P001',
          record_id: 'rec-inv-1',
          rec_key: 'inventory:P001',
          dataset_id: 'ds-demo',
          category_code: 'inventory',
          category_label: 'Inventory & Stock',
          title: 'Plan reorder for SmartDesk Mini',
          context: 'Stock below reorder point.',
          action: 'Order 200 units.',
          priority: 'critical',
          decision: 'accepted',
          workflow_status: 'implemented',
          is_new: false,
          confidence_level: 'Low',
          confidence_score: 51,
          confidence_is_calibrated: false,
          sufficient_evidence: true,
          shap_available: true,
          expected_impact: { avoided_stockout_units: 85 },
          uncertainty: 'Depends on 7d lead time.',
          risk: 'Warehouse tie-up.',
          assumptions: ['Lead time 7d'],
          evidence: { kpis: [], charts: {} },
          outcome_status: 'not_evaluated',
        },
      ],
    })

    wrap(<RecommendationsCenter />)

    expect(await screen.findByText('Review Facebook Ads allocation')).toBeTruthy()
    expect(screen.getByText('Total Recs')).toBeTruthy()
    expect(screen.getByText('% Post-Impl Effective')).toBeTruthy()
    expect(screen.getByText('Not yet evaluated')).toBeTruthy()
    expect(screen.getByText('Recommendations by Category')).toBeTruthy()
    expect(screen.getByText('Recommendations by Workflow Status')).toBeTruthy()
    expect(screen.getByText('Recommendations by Priority')).toBeTruthy()
    expect(screen.getByText('Recommendations by Confidence Level')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Try first in simulator' })).toBeTruthy()
    expect(screen.getAllByText('STATUS: PENDING').length).toBeGreaterThan(0)
    expect(screen.getByText(/IMPLEMENTED · OUTCOME: NOT_EVALUATED/)).toBeTruthy()
  })

  it('AuditGovernanceCenter renders SHA-256 hash-chain verification, 6 charts, separated metrics, and tabs', async () => {
    vi.mocked(api.request).mockResolvedValue({
      actor: 'admin',
      role: 'admin',
      authentication: 'token',
      company_ids: ['comp-default'],
    })
    vi.mocked(api.getAuditEvents).mockResolvedValue({
      rows: [],
      next_before: null,
    })
    vi.mocked(api.getAuditModels).mockResolvedValue({
      empty_workspace: false,
      company_id: 'comp-default',
      dataset_id: 'ds-demo',
      feature_schema: [{ name: 'lag_1', label: 'Previous Day', dtype: 'float64', required: true }],
      models: [
        {
          id: 'eval-1',
          company_id: 'comp-default',
          dataset_id: 'ds-demo',
          model_name: 'LightGBM Forecaster',
          model_version: 'dp-1.1',
          task_type: 'forecast',
          training_dataset_ref: 'ds-demo train',
          eval_dataset_ref: 'ds-demo test',
          train_date_start: '2025-01-01',
          train_date_end: '2026-08-31',
          metrics_json: { wape: 0.084 },
          baseline_comparison_json: { seasonal_naive: 0.121 },
          drift_status_json: { psi: 0.07, mean_z_shift: 0.21, drift_detected: false },
          feature_schema_json: [{ name: 'lag_1', label: 'Previous Day', dtype: 'float64', required: true }],
          owner: 'system',
          status: 'evaluated',
          evaluated_at: '2026-10-01T00:00:00Z',
        },
      ],
    })
    vi.mocked(api.getAuditRisks).mockResolvedValue({
      company_id: 'comp-default',
      items: [
        {
          id: 'risk-1',
          company_id: 'comp-default',
          risk_key: 'drift-review',
          severity: 'high',
          category: 'drift',
          title: 'Feature drift threshold review',
          description: 'Recent series shifted.',
          evidence_json: { psi: 0.14 },
          remediation: 'Retrain forecaster.',
          status: 'open',
          detected_at: '2026-10-01T00:00:00Z',
          resolved_at: null,
        },
      ],
    })
    const integrityMock: api.AuditIntegrityReport = {
      company_id: 'comp-default',
      chain_valid: true,
      total_audit_events: 12,
      chained_events: 12,
      pre_chain_events: 0,
      latest_seq_no: 12,
      latest_hash: 'abcdef1234567890'.repeat(4),
      broken_links: [],
      payload_mismatches: [],
      append_only_protection: true,
      verified_at: '2026-10-01T00:00:00Z',
    }
    vi.mocked(api.getAuditIntegrity).mockResolvedValue(integrityMock)
    vi.mocked(api.getAuditOverview).mockResolvedValue({
      company_id: 'comp-default',
      dataset_id: 'ds-demo',
      empty_workspace: false,
      kpis: {
        total_ai_decisions: 12,
        total_model_runs: 2,
        recommendations_generated: 5,
        approved_count: 1,
        implemented_count: 1,
        rejected_count: 0,
        failed_or_blocked_runs: 1,
        data_quality_warnings: 2,
        model_alerts: 1,
        insufficient_evidence_decisions: 1,
      },
      integrity: integrityMock,
      charts: {
        event_distribution: [{ key: 'rec_action', label: 'Recommendation Action', count: 5, share: 1 }],
        decision_status: [{ key: 'approved', label: 'Approved', count: 1, share: 1 }],
        model_performance_trend: {
          forecast_available: true,
          forecast_series: [
            {
              period: '2026-09',
              horizon: 30,
              split: 'test',
              selected_model: 'lightgbm',
              wape_pct: 8.4,
              mae: 120,
              baseline_wape_pct: 12.1,
              coverage_pct: 88.5,
            },
          ],
          anomaly_available: false,
          anomaly_series: [],
        },
        data_quality: {
          total: 95,
          overall_score: 95,
          source: 'quality_report',
          slices: [{ key: 'valid', label: 'Valid Rows', count: 95, share: 1 }],
        },
        risk_distribution: [{ key: 'high', label: 'High', count: 1, share: 1 }],
        outcome_comparison: [{ stage: 'Implemented', count: 1 }, { stage: 'Successful', count: 0 }],
      },
    })

    wrap(<AuditGovernanceCenter />)

    expect(await screen.findByTestId('hash-chain-banner')).toBeTruthy()
    expect(screen.getByTestId('audit-charts-grid')).toBeTruthy()
    expect(screen.getByTestId('chart-model-performance-trend').textContent).toMatch(/Anomaly Detector Benchmark/i)
    expect(screen.getByTestId('chart-outcome-comparison')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Verify Hash-Chain Integrity/i }))
    await waitFor(() => expect(api.getAuditIntegrity).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /Model Governance & PSI Drift/i }))
    expect(await screen.findByText('LightGBM Forecaster')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Risk & Compliance Alerts/i }))
    expect(await screen.findByText('Feature drift threshold review')).toBeTruthy()
  })
})
