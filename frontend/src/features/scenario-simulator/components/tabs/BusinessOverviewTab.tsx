import { CircleDollarSign, Percent, ShoppingBag, Wallet } from 'lucide-react'
import { integer, moneyCompact, percent, type KPI } from '../../../../api'

interface BusinessOverviewTabProps {
  kpiData?: KPI
}

export function BusinessOverviewTab({ kpiData }: BusinessOverviewTabProps) {
  const summary = kpiData?.summary
  const changes = kpiData?.changes

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className="rounded-lg border p-3"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            <CircleDollarSign size={13} style={{ color: 'var(--primary)' }} />
            <span>Total Revenue</span>
          </div>
          <div className="text-base font-bold tabular-nums mt-1" style={{ color: 'var(--heading)' }}>
            {summary ? moneyCompact(summary.revenue) : '—'}
          </div>
          {changes?.revenue != null && (
            <div
              className="text-[11px] font-medium mt-0.5"
              style={{ color: changes.revenue < 0 ? 'var(--danger-text)' : 'var(--success-text)' }}
            >
              {percent(changes.revenue)} vs prior period
            </div>
          )}
        </div>

        <div
          className="rounded-lg border p-3"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            <Wallet size={13} style={{ color: 'var(--info)' }} />
            <span>Gross Profit</span>
          </div>
          <div className="text-base font-bold tabular-nums mt-1" style={{ color: 'var(--heading)' }}>
            {summary ? moneyCompact(summary.gross_profit) : '—'}
          </div>
          {changes?.gross_profit != null && (
            <div
              className="text-[11px] font-medium mt-0.5"
              style={{ color: changes.gross_profit < 0 ? 'var(--danger-text)' : 'var(--success-text)' }}
            >
              {percent(changes.gross_profit)} vs prior period
            </div>
          )}
        </div>

        <div
          className="rounded-lg border p-3"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            <Percent size={13} style={{ color: 'var(--primary)' }} />
            <span>Gross Margin</span>
          </div>
          <div className="text-base font-bold tabular-nums mt-1" style={{ color: 'var(--primary-text)' }}>
            {summary?.margin != null ? percent(summary.margin) : '—'}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Direct Cost Reconciled
          </div>
        </div>

        <div
          className="rounded-lg border p-3"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            <ShoppingBag size={13} style={{ color: 'var(--success)' }} />
            <span>Total Orders</span>
          </div>
          <div className="text-base font-bold tabular-nums mt-1" style={{ color: 'var(--heading)' }}>
            {summary ? integer(summary.orders) : '—'}
          </div>
          <div className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--success-text)' }}>
            Verified Snapshot
          </div>
        </div>
      </div>

      <div
        className="rounded-lg border p-3 text-xs space-y-1"
        style={{ background: 'var(--info-bg)', borderColor: 'var(--info-border)' }}
      >
        <div className="font-semibold text-[11px] uppercase tracking-wide" style={{ color: 'var(--info-text)' }}>
          Current Performance Baseline
        </div>
        <p className="leading-relaxed text-[11px]" style={{ color: 'var(--text)' }}>
          Historical operations provide the unconstrained baseline for simulation. Switch tabs to simulate promotional pricing elasticity, reallocate ad spend, or evaluate inventory lead-time shocks.
        </p>
      </div>
    </div>
  )
}
