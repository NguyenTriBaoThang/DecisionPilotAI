import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Sparkles, X } from 'lucide-react'
import { moneyCompact, percent, request, type Scenario, type Session } from '../../../../api'
import { Button, Empty, ErrorState, Pill } from '../../../../ui'

export function RecommendationsTab({ scenarioData, isSimulating = false }: { scenarioData?: Scenario | null; isSimulating?: boolean }) {
  const client = useQueryClient()
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Session>('/session') })
  const feedback = useMutation({
    mutationFn: async (decision: 'accepted' | 'rejected') => {
      if (!scenarioData?.simulation_id) throw new Error('Run a scenario before recording a decision.')
      return request<{ decision: 'accepted' | 'rejected'; id: number }>('/scenarios/feedback', {
        simulation_id: scenarioData.simulation_id, dataset_id: scenarioData.dataset_id, decision,
      })
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['audit'] }) },
  })
  if (!scenarioData) return <Empty text="Run a scenario to review its recommendation and record a decision." />
  const recommended = scenarioData.recommended
  const parameters = scenarioData.evidence.parameters as { horizon?: number; parameters?: { product?: string; channel?: string } } | undefined
  const decision = feedback.data?.decision || scenarioData.decision
  const disabled = isSimulating || feedback.isPending || !session.data || session.data.role === 'viewer'
  return <div className="space-y-4">
    <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold"><Sparkles size={16} />Scenario recommendation</span>
        <Pill tone={decision === 'accepted' ? 'success' : decision === 'rejected' ? 'critical' : 'accent'}>STATUS: {decision.toUpperCase()}</Pill>
      </div>
      <h4 className="text-sm font-bold">Review strategy: {String(recommended.name)}</h4>
      <p className="text-xs">Last completed scenario: {parameters?.parameters?.product || parameters?.parameters?.channel || scenarioData.type} · {parameters?.horizon || '—'} days</p>
      <p className="text-xs text-slate-400">{scenarioData.type} · objective: {scenarioData.objective}. Estimates depend on the assumptions below. Recording a decision does not execute a business action.</p>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>Profit change<strong className="block">{moneyCompact(Number(recommended.profit_delta))}</strong></div>
        <div>Gross margin<strong className="block">{recommended.margin == null ? 'Unavailable' : percent(Number(recommended.margin))}</strong></div>
        <div>Unfulfilled units<strong className="block">{recommended.risk == null ? 'Not estimated' : String(recommended.risk)}</strong></div>
      </div>
    </div>
    <ul className="list-disc list-inside text-xs space-y-2">{scenarioData.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul>
    <details className="text-xs"><summary>Scenario parameters and evidence</summary><pre className="overflow-auto">{JSON.stringify(scenarioData.evidence, null, 2)}</pre><p>Scenario: {scenarioData.simulation_id}</p></details>
    <ErrorState error={feedback.error || session.error} />
    {feedback.isSuccess && <p role="status" className="text-xs">Decision recorded: {feedback.data.decision}. Audit event #{feedback.data.id}.</p>}
    <div className="flex gap-3">
      <Button className="primary" disabled={disabled || decision === 'accepted'} onClick={() => feedback.mutate('accepted')}><Check size={16} />Accept scenario</Button>
      <Button disabled={disabled || decision === 'rejected'} onClick={() => feedback.mutate('rejected')}><X size={16} />Reject scenario</Button>
    </div>
    {feedback.isPending && <p role="status">Recording decision…</p>}
    {session.data?.role === 'viewer' && <p className="text-xs">An analyst or administrator must record decisions.</p>}
  </div>
}
