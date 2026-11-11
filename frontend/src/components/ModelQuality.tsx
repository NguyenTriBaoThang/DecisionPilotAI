import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { getActiveCompanyId, request, percent, type Row } from '../api'
import { Card, ErrorState, SectionTitle, Table } from '../ui'

type Quality = {
  dataset_kind: string
  model_version: string | null
  anomaly: Row[]
  limitations: string[]
}

export function ModelQuality({ datasetId }: { datasetId?: string }) {
  const companyId = getActiveCompanyId()
  const quality = useQuery({
    queryKey: ['model-quality', companyId, datasetId],
    queryFn: () => request<Quality>('/models/quality'),
  })

  return (
    <Card>
      <SectionTitle
        title="Model evidence & limitations"
        detail={
          quality.data
            ? `${quality.data.dataset_kind} data · ${quality.data.model_version || 'No trained artifact'}`
            : 'Loading evaluation evidence'
        }
      />
      <ErrorState error={quality.error} retry={() => void quality.refetch()} />
      {quality.data && (
        <div className="space-y-3">
          <Table
            rows={quality.data.anomaly}
            columns={[
              { key: 'metric', title: 'Signal' },
              { key: 'precision', title: 'Precision', format: percent, align: 'right' },
              { key: 'recall', title: 'Recall', format: percent, align: 'right' },
              { key: 'f1', title: 'F1', format: percent, align: 'right' },
              { key: 'status', title: 'Evidence status' },
            ]}
          />
          {quality.data.limitations?.length > 0 && (
            <ul
              className="list-disc list-inside text-xs space-y-1.5 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {quality.data.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {quality.data.anomaly.some((row) => row.status === 'limited') && (
            <div
              role="note"
              className="flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed"
              style={{
                background: 'var(--warning-bg)',
                borderColor: 'var(--warning-border)',
                color: 'var(--warning-text)',
              }}
            >
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              <span>
                Some signals have limited measured precision or recall. Review underlying data and use additional checks; an absence of alerts does not establish that the business is healthy.
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
