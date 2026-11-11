import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Award, CheckCircle2, X, XCircle } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  compact,
  compareTwinScenarios,
  moneyCompact,
  type TwinObjective,
  type TwinScenario,
} from '../../../api'
import { Button, ErrorState, Pill } from '../../../ui'

interface MultiScenarioComparisonModalProps {
  open: boolean
  onClose: () => void
  scenarios: TwinScenario[]
  currency: string
}

export function MultiScenarioComparisonModal({
  open,
  onClose,
  scenarios,
  currency,
}: MultiScenarioComparisonModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [objective, setObjective] = useState<TwinObjective>('balanced')
  const [minMarginPct, setMinMarginPct] = useState<string>('')
  const [maxStockoutUnits, setMaxStockoutUnits] = useState<string>('')
  const [maxSpendIncPct, setMaxSpendIncPct] = useState<string>('')

  useEffect(() => {
    if (open && scenarios.length >= 2) {
      setSelectedIds(scenarios.slice(0, 4).map((s) => s.id))
    }
  }, [open, scenarios])

  const compareMut = useMutation({
    mutationFn: () =>
      compareTwinScenarios({
        scenario_ids: selectedIds,
        objective,
        constraints: {
          ...(minMarginPct !== '' ? { min_margin: Number(minMarginPct) / 100 } : {}),
          ...(maxStockoutUnits !== '' ? { max_stockout_risk_units: Number(maxStockoutUnits) } : {}),
          ...(maxSpendIncPct !== '' ? { max_spend_increase_pct: Number(maxSpendIncPct) } : {}),
        },
      }),
  })

  useEffect(() => {
    if (open && selectedIds.length >= 2 && !compareMut.data && !compareMut.isPending) {
      compareMut.mutate()
    }
  }, [open, selectedIds.length])

  if (!open) return null

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : prev.length < 6 ? [...prev, id] : prev
    )
  }

  const res = compareMut.data

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Multi-Scenario Comparison Studio"
      data-testid="multi-scenario-compare-modal"
    >
      <div
        className="w-full max-w-6xl rounded-2xl border shadow-2xl p-5 space-y-5 max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--heading)' }}>
              Multi-Scenario Comparison &amp; Constraint-Enforced Ranking
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Compare 2 to 6 scenarios side-by-side with explicit guardrails (feasible plans always outrank infeasible high-revenue extremes).
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close comparison dialog">
            <X size={16} />
          </Button>
        </div>

        {/* Scenario Selector & Constraints Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
          <div className="lg:col-span-5 space-y-2 rounded-xl border p-3" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
            <strong style={{ color: 'var(--heading)' }}>Select Scenarios (min 2):</strong>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {scenarios.map((s) => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleId(s.id)}
                    className="accent-[#2563EB]"
                  />
                  <span className="truncate font-medium" style={{ color: 'var(--heading)' }}>
                    {s.name}
                  </span>
                  {s.is_baseline && <Pill tone="muted">BASE</Pill>}
                </label>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-3 rounded-xl border p-3" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <label className="dp-field">
                <span className="dp-field-label">Ranking Objective</span>
                <select
                  aria-label="Comparison Objective"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value as TwinObjective)}
                  className="dp-select text-xs"
                >
                  <option value="balanced">Balanced (Profit + Growth - Risk)</option>
                  <option value="profit">Maximize Profit</option>
                  <option value="revenue">Maximize Revenue</option>
                  <option value="margin">Maximize Gross Margin</option>
                  <option value="stockout">Minimize Stockout Risk</option>
                  <option value="resilience">Supply Chain Resilience</option>
                </select>
              </label>

              <label className="dp-field">
                <span className="dp-field-label">Min Margin (%)</span>
                <input
                  type="number"
                  placeholder="e.g. 25"
                  value={minMarginPct}
                  onChange={(e) => setMinMarginPct(e.target.value)}
                  className="dp-input text-xs"
                />
              </label>

              <label className="dp-field">
                <span className="dp-field-label">Max Stockout (units)</span>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  value={maxStockoutUnits}
                  onChange={(e) => setMaxStockoutUnits(e.target.value)}
                  className="dp-input text-xs"
                />
              </label>

              <label className="dp-field">
                <span className="dp-field-label">Max Ad Spend +%</span>
                <input
                  type="number"
                  placeholder="e.g. 30"
                  value={maxSpendIncPct}
                  onChange={(e) => setMaxSpendIncPct(e.target.value)}
                  className="dp-input text-xs"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="primary"
                disabled={selectedIds.length < 2 || compareMut.isPending}
                onClick={() => compareMut.mutate()}
              >
                <span>{compareMut.isPending ? 'Evaluating Scenarios…' : 'Run Multi-Scenario Ranking'}</span>
              </Button>
            </div>
          </div>
        </div>

        <ErrorState error={compareMut.error as Error | null} />

        {res && (
          <div className="space-y-4">
            <div
              className="rounded-xl border px-3.5 py-2.5 text-xs flex items-center justify-between gap-2"
              style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary-border)', color: 'var(--primary-text)' }}
            >
              <span className="font-medium">{res.ranking_method}</span>
              <Pill tone="accent">
                TOP PICK:{' '}
                {res.comparison.find((c) => c.scenario_id === res.recommended_scenario_id)?.name || '—'}
              </Pill>
            </div>

            {/* Comparison Table */}
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                    <th className="p-2.5 border-b">Rank</th>
                    <th className="p-2.5 border-b">Scenario</th>
                    <th className="p-2.5 border-b">Feasibility</th>
                    <th className="p-2.5 border-b text-right">Revenue</th>
                    <th className="p-2.5 border-b text-right">Profit</th>
                    <th className="p-2.5 border-b text-right">Margin</th>
                    <th className="p-2.5 border-b text-right">Stockout Risk</th>
                    <th className="p-2.5 border-b text-right">Fulfillment</th>
                  </tr>
                </thead>
                <tbody>
                  {res.comparison.map((row) => (
                    <tr key={row.scenario_id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                      <td className="p-2.5 font-bold">
                        {row.rank === 1 ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <Award size={14} /> #1
                          </span>
                        ) : (
                          `#${row.rank}`
                        )}
                      </td>
                      <td className="p-2.5">
                        <div className="font-semibold" style={{ color: 'var(--heading)' }}>
                          {row.name}
                        </div>
                        {row.violations.length > 0 && (
                          <div className="text-[10px] text-red-600 mt-0.5">{row.violations.join(' · ')}</div>
                        )}
                      </td>
                      <td className="p-2.5">
                        {row.feasible ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 size={13} /> Feasible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                            <XCircle size={13} /> Violates Guardrail
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right tabular-nums font-semibold">
                        {moneyCompact(row.revenue, currency)}
                      </td>
                      <td className="p-2.5 text-right tabular-nums font-semibold">
                        {row.profit != null ? moneyCompact(row.profit, currency) : 'Unavailable'}
                      </td>
                      <td className="p-2.5 text-right tabular-nums">
                        {row.margin_pct != null ? `${row.margin_pct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-2.5 text-right tabular-nums">
                        {row.stockout_risk != null ? `${row.stockout_risk} u` : '—'}
                      </td>
                      <td className="p-2.5 text-right tabular-nums">
                        {row.fulfillment_pct != null ? `${row.fulfillment_pct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dual Charts: Financial Comparison + Parameter Sensitivity Sweep */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border p-3 space-y-2" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                <strong style={{ color: 'var(--heading)' }}>Scenario Revenue vs Profit Comparison</strong>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={res.comparison.map((c) => ({
                        name: c.name.slice(0, 18),
                        Revenue: c.revenue ?? 0,
                        Profit: c.profit ?? 0,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => compact(Number(v))} tick={{ fontSize: 10 }} width={52} />
                      <Tooltip formatter={(val: unknown) => moneyCompact(Number(val), currency)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Revenue" fill="#2563EB" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Profit" fill="#16A34A" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border p-3 space-y-2" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                <strong style={{ color: 'var(--heading)' }}>
                  Sensitivity Curve ({res.sensitivity.variable_name.replaceAll('_', ' ')})
                </strong>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={res.sensitivity.points}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => compact(Number(v))} tick={{ fontSize: 10 }} width={52} />
                      <Tooltip formatter={(val: unknown) => moneyCompact(Number(val), currency)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="estimated_revenue" name="Est. Revenue" stroke="#2563EB" strokeWidth={2.5} />
                      <Line type="monotone" dataKey="estimated_profit" name="Est. Profit" stroke="#EA580C" strokeWidth={2.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
