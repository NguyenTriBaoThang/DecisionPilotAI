import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ShieldCheck, X } from 'lucide-react'
import { moneyCompact, percent, request, type Scenario, type Session } from '../../../../api'
import { Button, Empty, ErrorState, Pill, useToast } from '../../../../ui'

export function RecommendationsTab({
  scenarioData,
  isSimulating = false,
  recommendationId,
}: {
  scenarioData?: Scenario | null
  isSimulating?: boolean
  recommendationId?: string
}) {
  const client = useQueryClient()
  const { notify } = useToast()
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Session>('/session') })
  const feedback = useMutation({
    mutationFn: async (decision: 'accepted' | 'rejected') => {
      if (!scenarioData?.simulation_id) throw new Error('Run a scenario before recording a decision.')
      return request<{ decision: 'accepted' | 'rejected'; id: number }>('/scenarios/feedback', {
        simulation_id: scenarioData.simulation_id,
        dataset_id: scenarioData.dataset_id,
        decision,
        ...(recommendationId ? { recommendation_id: recommendationId } : {}),
      })
    },
    onSuccess: (res) => {
      notify({
        tone: res.decision === 'accepted' ? 'success' : 'info',
        title: 'Scenario decision saved',
        description: `Status: ${res.decision.toUpperCase()} · Audit event #${res.id} persisted to ledger.`,
      })
      void client.invalidateQueries({ queryKey: ['audit'] })
      void client.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })

  if (!scenarioData) return <Empty text="Run a scenario to review its recommendation and record a decision." />

  const recommended = scenarioData.recommended
  const parameters = scenarioData.evidence.parameters as
    | { horizon?: number; parameters?: { product?: string; channel?: string } }
    | undefined
  const decision = feedback.data?.decision || scenarioData.decision
  const disabled = isSimulating || feedback.isPending || !session.data || session.data.role === 'viewer'

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary-border)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
            <ShieldCheck size={15} />
            <span>Scenario recommendation</span>
          </span>
          <Pill tone={decision === 'accepted' ? 'success' : decision === 'rejected' ? 'critical' : 'accent'}>
            STATUS: {decision.toUpperCase()}
          </Pill>
        </div>

        <h4 className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
          Review strategy: {String(recommended.name)}
        </h4>
        <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
          Last completed scenario: {parameters?.parameters?.product || parameters?.parameters?.channel || scenarioData.type} ·{' '}
          {parameters?.horizon || '—'} days
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {scenarioData.type} · objective: {scenarioData.objective}. Estimates depend on the assumptions below. Recording a
          decision does not execute a business action.
        </p>

        <div className="grid grid-cols-3 gap-2.5 text-xs pt-1">
          <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              Profit change
            </span>
            <strong className="block font-bold tabular-nums mt-0.5" style={{ color: 'var(--heading)' }}>
              {moneyCompact(Number(recommended.profit_delta))}
            </strong>
          </div>
          <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              Gross margin
            </span>
            <strong className="block font-bold tabular-nums mt-0.5" style={{ color: 'var(--heading)' }}>
              {recommended.margin == null ? 'Unavailable' : percent(Number(recommended.margin))}
            </strong>
          </div>
          <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              Unfulfilled units
            </span>
            <strong className="block font-bold tabular-nums mt-0.5" style={{ color: 'var(--heading)' }}>
              {recommended.risk == null ? 'Not estimated' : String(recommended.risk)}
            </strong>
          </div>
        </div>
      </div>

      <ul className="list-disc list-inside text-xs space-y-1.5" style={{ color: 'var(--text)' }}>
        {scenarioData.assumptions.map((assumption, i) => (
          <li key={i}>{assumption}</li>
        ))}
      </ul>

      <details
        className="rounded-lg border p-3 text-xs"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      >
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--primary-text)' }}>
          Scenario parameters and evidence
        </summary>
        <pre className="overflow-auto mt-2 text-[11px] font-mono">{JSON.stringify(scenarioData.evidence, null, 2)}</pre>
        <p className="mt-1 font-mono text-[11px]">Scenario: {scenarioData.simulation_id}</p>
      </details>

      <ErrorState error={feedback.error || session.error} />
      {feedback.isSuccess && (
        <p role="status" className="text-xs font-medium" style={{ color: 'var(--success-text)' }}>
          Decision recorded: {feedback.data.decision}. Audit event #{feedback.data.id}.
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="primary"
          disabled={disabled || decision === 'accepted'}
          onClick={() => feedback.mutate('accepted')}
        >
          <Check size={15} />
          <span>Accept scenario</span>
        </Button>
        <Button
          variant="danger"
          disabled={disabled || decision === 'rejected'}
          onClick={() => feedback.mutate('rejected')}
        >
          <X size={15} />
          <span>Reject scenario</span>
        </Button>
      </div>

      {feedback.isPending && (
        <p role="status" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Recording decision…
        </p>
      )}
      {session.data?.role === 'viewer' && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          An analyst or administrator must record decisions.
        </p>
      )}
    </div>
  )
}
