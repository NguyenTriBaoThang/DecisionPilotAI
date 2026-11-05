import { CircleDollarSign, Percent, ShoppingBag, TrendingUp, Users, Wallet } from 'lucide-react'
import { integer, moneyCompact, percent, type KPI } from '../../../../api'

interface BusinessOverviewTabProps {
  kpiData?: KPI
}

export function BusinessOverviewTab({ kpiData }: BusinessOverviewTabProps) {
  const summary = kpiData?.summary
  const changes = kpiData?.changes

  return (
    <div className="space-y-4">
      {/* 4 Core Quick Metrics */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
            <CircleDollarSign size={13} className="text-cyan-400" />
            <span>Total Revenue</span>
          </div>
          <div className="text-lg font-black text-white font-mono mt-0.5">
            {summary ? moneyCompact(summary.revenue) : '₫14.8B'}
          </div>
          {changes?.revenue != null && (
            <div className="text-[10px] text-rose-400 font-semibold mt-1">
              {percent(changes.revenue)} vs prior period
            </div>
          )}
        </div>

        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
            <Wallet size={13} className="text-indigo-400" />
            <span>Gross Profit</span>
          </div>
          <div className="text-lg font-black text-white font-mono mt-0.5">
            {summary ? moneyCompact(summary.gross_profit) : '₫6.2B'}
          </div>
          {changes?.gross_profit != null && (
            <div className="text-[10px] text-rose-400 font-semibold mt-1">
              {percent(changes.gross_profit)} vs prior period
            </div>
          )}
        </div>

        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
            <Percent size={13} className="text-violet-400" />
            <span>Gross Margin</span>
          </div>
          <div className="text-lg font-black text-cyan-300 font-mono mt-0.5">
            {summary?.margin != null ? percent(summary.margin) : '41.8%'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Direct Cost Reconciled</div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
            <ShoppingBag size={13} className="text-emerald-400" />
            <span>Total Orders</span>
          </div>
          <div className="text-lg font-black text-white font-mono mt-0.5">
            {summary ? integer(summary.orders) : '50,000'}
          </div>
          <div className="text-[10px] text-emerald-400 font-semibold mt-1">Across 730 Days</div>
        </div>
      </div>

      {/* Baseline Performance Summary */}
      <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-slate-300 space-y-1">
        <div className="font-bold text-cyan-300 uppercase tracking-wider text-[10px]">
          Current Performance Baseline
        </div>
        <p className="leading-relaxed text-[11px] text-slate-400">
          Historical operations provide the unconstrained baseline for simulation. Use adjacent panels to simulate
          promotional pricing elasticity, reallocate ad spend, or evaluate inventory lead-time shocks.
        </p>
      </div>
    </div>
  )
}
