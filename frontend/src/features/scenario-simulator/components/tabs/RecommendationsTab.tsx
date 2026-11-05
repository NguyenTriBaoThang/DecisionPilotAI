import { useState } from 'react'
import { Check, ShieldAlert, Sparkles, X } from 'lucide-react'
import { moneyCompact, percent, type Recommendation, type Scenario } from '../../../../api'
import { Button, Pill } from '../../../../ui'

interface RecommendationsTabProps {
  scenarioData?: Scenario | null
  activeRecommendation?: Recommendation | null
  onAcceptDecision?: (id: string) => void
  onRejectDecision?: (id: string) => void
  isSubmittingFeedback?: boolean
}

export function RecommendationsTab({
  scenarioData,
  activeRecommendation,
  onAcceptDecision,
  onRejectDecision,
  isSubmittingFeedback,
}: RecommendationsTabProps) {
  const [decisionState, setDecisionState] = useState<'pending' | 'accepted' | 'rejected'>('pending')
  const recommended = scenarioData?.recommended
  const assumptions = scenarioData?.assumptions || []

  const handleAccept = () => {
    setDecisionState('accepted')
    if (activeRecommendation && onAcceptDecision) {
      onAcceptDecision(activeRecommendation.id)
    }
  }

  const handleReject = () => {
    setDecisionState('rejected')
    if (activeRecommendation && onRejectDecision) {
      onRejectDecision(activeRecommendation.id)
    }
  }

  return (
    <div className="space-y-4">
      {/* Primary Recommendation Card */}
      <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              AI Decision Synthesis
            </span>
          </div>
          <Pill tone={decisionState === 'accepted' ? 'success' : decisionState === 'rejected' ? 'critical' : 'accent'}>
            STATUS: {decisionState.toUpperCase()}
          </Pill>
        </div>

        <div>
          <h4 className="text-sm font-bold text-white">
            {recommended
              ? `Adopt Strategy: ${String(recommended.name)}`
              : activeRecommendation?.title || 'Synthesizing Recommended Action…'}
          </h4>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {activeRecommendation?.action ||
              'Based on microeconomic elasticity simulation, this scenario maximizes contribution profit while maintaining stock availability above safety thresholds.'}
          </p>
        </div>

        {/* Financial Impact Highlights */}
        {recommended && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-indigo-500/15 text-xs">
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase">Profit Delta</span>
              <strong className="text-emerald-400 font-mono text-sm">
                +{moneyCompact(Number(recommended.profit_delta))}
              </strong>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase">Gross Margin</span>
              <strong className="text-cyan-300 font-mono text-sm">{percent(Number(recommended.margin))}</strong>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 col-span-2 sm:col-span-1">
              <span className="text-slate-400 text-[10px] block uppercase">Fulfillment Risk</span>
              <strong className="text-white font-mono text-sm">
                {recommended.risk != null && Number(recommended.risk) > 0
                  ? `${recommended.risk} unfulfilled`
                  : 'Zero Stockouts'}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Assumptions & Risks */}
      {assumptions.length > 0 && (
        <div className="space-y-1.5 text-xs text-slate-300">
          <span className="font-semibold text-slate-400 uppercase text-[10px] tracking-wider block">
            Mathematical Assumptions:
          </span>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
            {assumptions.slice(0, 3).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Human-in-the-Loop Action Approval Buttons */}
      <div className="pt-2 flex items-center gap-3">
        <Button
          className="primary flex-1 py-2.5 text-xs flex items-center justify-center gap-2"
          onClick={handleAccept}
          disabled={isSubmittingFeedback || decisionState === 'accepted'}
        >
          <Check size={16} />
          <span>{decisionState === 'accepted' ? 'Decision Recorded: Accepted' : 'Accept Scenario'}</span>
        </Button>

        <Button
          className="flex-1 py-2.5 text-xs flex items-center justify-center gap-2 border border-slate-700 bg-slate-900/60 hover:bg-rose-950/40 text-rose-300"
          onClick={handleReject}
          disabled={isSubmittingFeedback || decisionState === 'rejected'}
        >
          <X size={16} />
          <span>{decisionState === 'rejected' ? 'Decision Recorded: Rejected' : 'Reject'}</span>
        </Button>
      </div>
    </div>
  )
}

