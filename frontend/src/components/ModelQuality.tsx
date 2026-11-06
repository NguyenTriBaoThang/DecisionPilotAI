import { useQuery } from '@tanstack/react-query'
import { request, percent, type Row } from '../api'
import { Card, ErrorState, SectionTitle, Table } from '../ui'

type Quality = { dataset_kind: string; model_version: string | null; anomaly: Row[]; limitations: string[] }
export function ModelQuality() {
  const quality = useQuery({ queryKey: ['model-quality'], queryFn: () => request<Quality>('/models/quality') })
  return <Card>
    <SectionTitle title="Model evidence & limitations" detail={quality.data ? `${quality.data.dataset_kind} data · ${quality.data.model_version || 'No trained artifact'}` : 'Loading evaluation evidence'} />
    <ErrorState error={quality.error} retry={() => void quality.refetch()} />
    {quality.data && <>
      <Table rows={quality.data.anomaly} columns={[
        { key: 'metric', title: 'Signal' }, { key: 'precision', title: 'Precision', format: percent },
        { key: 'recall', title: 'Recall', format: percent }, { key: 'f1', title: 'F1', format: percent },
        { key: 'status', title: 'Evidence status' },
      ]} />
      <ul className="list-disc list-inside text-xs space-y-2 mt-3">{quality.data.limitations.map(item => <li key={item}>{item}</li>)}</ul>
      {quality.data.anomaly.some(row => row.status === 'limited') && <p role="note" className="text-xs text-amber-300 mt-3">Some signals have limited measured precision or recall. Review underlying data and use additional checks; an absence of alerts does not establish that the business is healthy.</p>}
    </>}
  </Card>
}
