import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Layers, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { decimal, moneyCompact, type CounterfactualRow, type FeatureImportanceEntry, type XAIPayload } from '../../api'
import { useT } from '../../preferences'
import { Card, Pill, SectionHeader } from '../../ui'

interface XAIPanelsProps {
  xai: XAIPayload
  currency?: string
}

export function XAIPanels({ xai, currency = 'VND' }: XAIPanelsProps) {
  const { t, language } = useT()
  const [activeTab, setActiveTab] = useState<'importance' | 'shap' | 'local_global' | 'counterfactuals'>('importance')
  const [importanceMethod, setImportanceMethod] = useState<'default' | 'gain' | 'permutation' | 'split'>('default')
  const [selectedDepIdx, setSelectedDepIdx] = useState(0)

  const fi = xai.feature_importance
  const primaryShap = xai.shap
  const companionShap = !primaryShap?.available && xai.forecast_shap?.available ? xai.forecast_shap : null
  const activeShap = primaryShap?.available ? primaryShap : companionShap

  const activeImportanceRows: FeatureImportanceEntry[] = useMemo(() => {
    if (!fi) return []
    if (importanceMethod === 'gain' && fi.gain?.length) return fi.gain
    if (importanceMethod === 'permutation' && fi.permutation?.length) return fi.permutation
    if (importanceMethod === 'split' && fi.split?.length) return fi.split
    if (fi.domain_drivers?.length) return fi.domain_drivers
    if (fi.gain?.length) return fi.gain
    if (fi.forecast_model_gain?.length) return fi.forecast_model_gain
    return []
  }, [fi, importanceMethod])

  const hasGain = Boolean(fi?.gain?.length || fi?.forecast_model_gain?.length)
  const hasPerm = Boolean(fi?.permutation?.length)
  const hasSplit = Boolean(fi?.split?.length)
  const depSeries = activeShap?.dependence || []
  const selectedDep = depSeries[selectedDepIdx] || depSeries[0]
  const counterfactuals: CounterfactualRow[] = xai.counterfactuals || []

  return (
    <Card className="space-y-5" data-testid="xai-explorer-card">
      <SectionHeader
        title="Explainable AI (XAI) & Driver Attribution"
        detail={
          xai.shap_available
            ? t('Native LightGBM TreeSHAP, Permutation MAE & Gain Importance')
            : t('Quantitative Driver Attribution & Sensitivity Sweeps')
        }
        aside={
          <div className="flex items-center gap-2">
            <Pill tone={xai.shap_available ? 'success' : 'muted'}>
              {xai.shap_available ? 'TreeSHAP Exact' : t('Statistical / Domain')}
            </Pill>
          </div>
        }
      />

      {/* Non-causality Mandatory Scientific Honesty Disclosure */}
      <div
        data-testid="causal-disclaimer"
        className="rounded-xl border px-4 py-3 flex items-start gap-3 text-xs leading-relaxed"
        style={{
          background: 'var(--warning-bg)',
          borderColor: 'var(--warning-border)',
          color: 'var(--warning-text)',
        }}
      >
        <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block">
            {t('Statistical Association & Model Attribution — Not Causal Proof')}
          </strong>
          <span>
            {xai.causal_disclaimer ||
              'Feature importance and SHAP values explain how the model generated predictions; they do NOT constitute statistical proof of real-world causal effect without controlled A/B holdout testing.'}
          </span>
        </div>
      </div>

      {/* XAI Sub-Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'importance', label: t('Feature Importance'), icon: BarChart3 },
          { key: 'shap', label: 'SHAP Explorer', icon: Sparkles },
          { key: 'local_global', label: t('Local vs Global'), icon: Layers },
          { key: 'counterfactuals', label: `${t('Counterfactuals')} (${counterfactuals.length})`, icon: TrendingUp },
        ].map(({ key, label: lbl, icon: Icon }) => {
          const active = activeTab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as typeof activeTab)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={
                active
                  ? {
                      background: 'var(--primary-soft)',
                      borderColor: 'var(--primary-border)',
                      color: 'var(--primary-text)',
                    }
                  : {
                      background: 'var(--surface)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                    }
              }
            >
              <Icon size={14} />
              <span>{lbl}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: FEATURE IMPORTANCE */}
      {activeTab === 'importance' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('Compare ranking across attribution methods:')}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setImportanceMethod('default')}
                className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                style={
                  importanceMethod === 'default'
                    ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                    : { background: 'var(--surface-muted)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
                }
              >
                {fi?.domain_drivers?.length ? t('Domain Drivers') : t('Primary')}
              </button>
              {hasGain && (
                <button
                  type="button"
                  onClick={() => setImportanceMethod('gain')}
                  className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                  style={
                    importanceMethod === 'gain'
                      ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                      : { background: 'var(--surface-muted)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
                  }
                >
                  LightGBM Gain
                </button>
              )}
              {hasPerm && (
                <button
                  type="button"
                  onClick={() => setImportanceMethod('permutation')}
                  className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                  style={
                    importanceMethod === 'permutation'
                      ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                      : { background: 'var(--surface-muted)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
                  }
                >
                  Permutation MAE
                </button>
              )}
              {hasSplit && (
                <button
                  type="button"
                  onClick={() => setImportanceMethod('split')}
                  className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                  style={
                    importanceMethod === 'split'
                      ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                      : { background: 'var(--surface-muted)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
                  }
                >
                  Split Frequency
                </button>
              )}
            </div>
          </div>

          {activeImportanceRows.length === 0 ? (
            <div
              className="rounded-lg border p-4 text-xs"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {t('Feature importance is unavailable for this statistical / non-parameterized recommendation.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={activeImportanceRows.slice(0, 8).map((r) => ({
                      ...r,
                      displayName: (language === 'vi' && r.label_vi ? r.label_vi : r.label).slice(0, 30),
                      scorePct: r.normalized_pct ?? r.importance,
                    }))}
                    layout="vertical"
                    margin={{ top: 4, right: 20, bottom: 4, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <YAxis
                      type="category"
                      dataKey="displayName"
                      width={145}
                      tick={{ fontSize: 11, fill: 'var(--heading)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--chart-tooltip-bg)',
                        borderColor: 'var(--chart-tooltip-border)',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="scorePct" name={t('Relative Share / Weight (%)')} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {activeImportanceRows.slice(0, 8).map((entry, idx) => (
                        <Cell
                          key={entry.feature}
                          fill={
                            entry.direction === 'negative'
                              ? '#EA580C'
                              : entry.direction === 'positive'
                                ? '#059669'
                                : idx === 0
                                  ? '#2563EB'
                                  : '#38BDF8'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {activeImportanceRows.slice(0, 6).map((item) => (
                  <div
                    key={item.feature}
                    className="rounded-lg border px-3 py-2 flex items-center justify-between gap-3 text-xs"
                    style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
                        {language === 'vi' && item.label_vi ? item.label_vi : item.label}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <code>{item.feature}</code>
                        {item.current_value != null && ` · Current: ${String(item.current_value)}${item.unit ? ` ${item.unit}` : ''}`}
                      </div>
                    </div>
                    <span className="font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--primary-text)' }}>
                      {item.normalized_pct != null ? `${item.normalized_pct.toFixed(1)}%` : decimal(item.importance)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SHAP EXPLORER */}
      {activeTab === 'shap' && (
        <div className="space-y-5">
          {!primaryShap?.available && (
            <div
              data-testid="shap-unavailable-panel"
              className="rounded-xl border p-4 space-y-2 text-xs"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--heading)' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--warning-text)' }} />
                  <span>TreeSHAP trực tiếp cho quyết định này: Chưa khả dụng</span>
                </div>
                <Pill tone="muted">Honest Availability Check</Pill>
              </div>
              <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {xai.shap_unavailable_reason ||
                  primaryShap?.reason ||
                  'SHAP requires a trained tree model (LightGBM). This recommendation relies on domain accounting rules or statistical bounds.'}
              </p>
              {xai.alternative_explanation && (
                <p className="font-medium" style={{ color: 'var(--heading)' }}>
                  {t('Verified Alternative Explanation:')} {xai.alternative_explanation}
                </p>
              )}
            </div>
          )}

          {activeShap?.available && (
            <div className="space-y-5" data-testid="shap-active-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-xs" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                <div>
                  <span className="font-semibold block" style={{ color: 'var(--heading)' }}>
                    {companionShap
                      ? t('Companion LightGBM Forecast TreeSHAP')
                      : t('Native LightGBM TreeSHAP Decomposition')}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {activeShap.method} · Scope: <code>{activeShap.scope}</code> ({activeShap.sample_count} eval points)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 tabular-nums">
                  <div>
                    <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>Base E[f(X)]</span>
                    <strong style={{ color: 'var(--heading)' }}>{decimal(activeShap.base_value)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>Predicted</span>
                    <strong style={{ color: 'var(--primary-text)' }}>{decimal(activeShap.predicted_value)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase block" style={{ color: 'var(--text-secondary)' }}>Additivity |err|</span>
                    <strong style={{ color: 'var(--success-text)' }}>{activeShap.additivity_error?.toExponential(2) ?? '0'}</strong>
                  </div>
                </div>
              </div>

              {/* Local SHAP Waterfall + Global Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--heading)' }}>
                    {t('SHAP Local Waterfall (Latest Day Attribution)')}
                  </h4>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(activeShap.waterfall_local || []).map((step) => ({
                          ...step,
                          name: (language === 'vi' && step.label_vi ? step.label_vi : step.label).slice(0, 26),
                        }))}
                        layout="vertical"
                        margin={{ top: 4, right: 20, bottom: 4, left: 6 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: 'var(--heading)' }} />
                        <ReferenceLine x={0} stroke="var(--border-strong)" />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--chart-tooltip-bg)',
                            borderColor: 'var(--chart-tooltip-border)',
                            borderRadius: '10px',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="shap_value" name="SHAP φᵢ" isAnimationActive={false}>
                          {(activeShap.waterfall_local || []).map((entry) => (
                            <Cell key={entry.feature} fill={entry.shap_value >= 0 ? '#2563EB' : '#EA580C'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Global SHAP Summary + Mini Beeswarm */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--heading)' }}>
                    {t('Global Mean |SHAP| & Beeswarm Spread')}
                  </h4>
                  <div className="space-y-2.5">
                    {(activeShap.global_summary || []).slice(0, 6).map((item) => {
                      const maxMean = Math.max(
                        ...(activeShap.global_summary || []).map((g) => g.mean_abs_shap),
                        1e-6
                      )
                      const widthPct = Math.min(100, (item.mean_abs_shap / maxMean) * 100)
                      const pts = item.beeswarm_points || []
                      const maxAbsPt = Math.max(...pts.map((p) => Math.abs(p.shap_value)), 1e-6)
                      return (
                        <div
                          key={item.feature}
                          className="rounded-lg border px-3 py-2 text-xs space-y-1.5"
                          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
                              {language === 'vi' && item.label_vi ? item.label_vi : item.label}
                            </span>
                            <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--primary-text)' }}>
                              mean|φ| = {decimal(item.mean_abs_shap)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-subtle)' }}>
                              <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: '#2563EB' }} />
                            </div>
                            {/* Mini Beeswarm variance strip */}
                            <div className="relative flex-1 h-4 rounded" style={{ background: 'var(--surface-muted)' }}>
                              <div className="absolute top-0 bottom-0 left-1/2 w-px" style={{ background: 'var(--border-strong)' }} />
                              {pts.slice(0, 28).map((p, idx) => {
                                const leftPct = 50 + (p.shap_value / maxAbsPt) * 44
                                const topPct = 22 + ((idx * 37) % 56)
                                return (
                                  <span
                                    key={idx}
                                    title={`value=${decimal(p.feature_value)}, shap=${decimal(p.shap_value)}`}
                                    className="absolute h-1.5 w-1.5 rounded-full -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                      left: `${leftPct}%`,
                                      top: `${topPct}%`,
                                      background: p.shap_value >= 0 ? '#2563EB' : '#EA580C',
                                      opacity: 0.78,
                                    }}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* SHAP Dependence Scatter (Top 3) */}
              {depSeries.length > 0 && selectedDep && (
                <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--heading)' }}>
                        {t('SHAP Feature Dependence Plot')}
                      </h4>
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('Scatter of observed feature values vs TreeSHAP marginal contribution')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {depSeries.map((d, i) => (
                        <button
                          key={d.feature}
                          type="button"
                          onClick={() => setSelectedDepIdx(i)}
                          className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                          style={
                            selectedDep.feature === d.feature
                              ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                              : { background: 'var(--surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
                          }
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis type="number" dataKey="feature_value" name={selectedDep.label} tick={{ fontSize: 10 }} />
                        <YAxis type="number" dataKey="shap_value" name="SHAP φ" tick={{ fontSize: 10 }} />
                        <ReferenceLine y={0} stroke="var(--border-strong)" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                        <Scatter data={selectedDep.points} fill="#2563EB" isAnimationActive={false} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LOCAL VS GLOBAL EXPLANATION */}
      {activeTab === 'local_global' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="rounded-xl border p-4 space-y-2"
            style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary-border)' }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
              {t('Local Explanation (Specific to This Recommendation)')}
            </span>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--heading)' }}>
              {xai.local_explanation?.summary || t('Derived from current window metric deviations.')}
            </p>
          </div>
          <div
            className="rounded-xl border p-4 space-y-2"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {t('Global Explanation (How Engine Evaluates All Cases)')}
            </span>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
              {xai.global_explanation?.summary || t('Evaluates historical baseline models and structural constraints.')}
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: COUNTERFACTUAL ANALYSIS */}
      {activeTab === 'counterfactuals' && (
        <div className="space-y-3">
          {counterfactuals.length === 0 ? (
            <div
              className="rounded-lg border p-4 text-xs"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {t('Counterfactual parameter sweeps are unavailable for non-simulated domains. Run controlled holdout testing instead of synthetic guessing.')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    <th className="py-2 pr-3 font-semibold">{t('Counterfactual Lever')}</th>
                    <th className="py-2 px-3 font-semibold text-right">{t('Predicted Revenue')}</th>
                    <th className="py-2 px-3 font-semibold text-right">{t('Predicted Profit')}</th>
                    <th className="py-2 px-3 font-semibold text-right">{t('Profit / Risk Delta')}</th>
                    <th className="py-2 pl-3 font-semibold">{t('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {counterfactuals.map((cf, i) => (
                    <tr
                      key={`${cf.parameter}-${i}`}
                      className="border-b"
                      style={{
                        borderColor: 'var(--border)',
                        background: cf.is_recommended ? 'var(--primary-soft)' : 'transparent',
                      }}
                    >
                      <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--heading)' }}>
                        {cf.scenario_label}
                        {cf.arrival_date && (
                          <span className="block text-[11px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                            Arrival: {cf.arrival_date}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: 'var(--text)' }}>
                        {cf.predicted_revenue != null ? moneyCompact(cf.predicted_revenue, currency) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: 'var(--heading)' }}>
                        {cf.predicted_profit != null ? moneyCompact(cf.predicted_profit, currency) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold tabular-nums" style={{ color: (cf.profit_delta || 0) >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                        {cf.profit_delta != null
                          ? `${cf.profit_delta >= 0 ? '+' : ''}${moneyCompact(cf.profit_delta, currency)}`
                          : cf.unfulfilled_risk != null
                            ? `${decimal(cf.unfulfilled_risk)} risk units`
                            : '—'}
                      </td>
                      <td className="py-2.5 pl-3">
                        {cf.is_recommended ? <Pill tone="success">{t('RECOMMENDED')}</Pill> : <Pill tone="muted">{t('TESTED')}</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

