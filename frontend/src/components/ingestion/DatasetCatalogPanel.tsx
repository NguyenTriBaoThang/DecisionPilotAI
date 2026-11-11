import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, Database, PlayCircle, Trash2 } from 'lucide-react'
import {
  activateEnterpriseDataset,
  deleteEnterpriseDataset,
  getDatasetHistory,
  integer,
  listEnterpriseDatasets,
  type EnterpriseDatasetSummary,
  type Session,
} from '../../api'
import { useT } from '../../preferences'
import { Button, Card, ConfirmDialog, ErrorState, Loading, Pill, SectionTitle, useToast } from '../../ui'

export function DatasetCatalogPanel({
  companyId,
  session,
  onResumeDataset,
}: {
  companyId: string
  session: Session
  onResumeDataset: (datasetId: string) => void
}) {
  const { t } = useT()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [historyDatasetId, setHistoryDatasetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EnterpriseDatasetSummary | null>(null)

  const listQuery = useQuery({
    queryKey: ['enterprise-datasets', companyId],
    queryFn: listEnterpriseDatasets,
  })

  const historyQuery = useQuery({
    queryKey: ['dataset-history', companyId, historyDatasetId],
    queryFn: () => getDatasetHistory(historyDatasetId as string),
    enabled: !!historyDatasetId,
  })

  const activateMutation = useMutation({
    mutationFn: (datasetId: string) => activateEnterpriseDataset(datasetId),
    onSuccess: async (activated) => {
      notify({
        tone: 'success',
        title: 'Workspace dataset switched',
        description: `Active dataset: ${activated.name}`,
      })
      await queryClient.invalidateQueries({ queryKey: ['enterprise-datasets', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['companies'] })
      await queryClient.invalidateQueries({ queryKey: ['dataset'] })
      await queryClient.invalidateQueries({ queryKey: ['options'] })
      await queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (datasetId: string) => deleteEnterpriseDataset(datasetId),
    onSuccess: async () => {
      setDeleteTarget(null)
      notify({
        tone: 'info',
        title: 'Dataset deleted',
        description: 'Tenant analytics tables, quality reports, and object artifacts were cleaned up.',
      })
      await queryClient.invalidateQueries({ queryKey: ['enterprise-datasets', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['companies'] })
      await queryClient.invalidateQueries({ queryKey: ['dataset'] })
      await queryClient.invalidateQueries({ queryKey: ['options'] })
      await queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })

  const items = listQuery.data?.items || []
  const canWrite = session.role !== 'viewer'
  const isAdmin = session.role === 'admin'

  return (
    <Card className="space-y-4">
      <SectionTitle
        title="Dataset Catalog & History"
        detail={
          listQuery.data
            ? `Isolated datasets owned by ${listQuery.data.company_name} (${items.length} total)`
            : 'Manage uploaded & imported datasets in this company workspace.'
        }
        aside={<Database size={17} style={{ color: 'var(--primary)' }} />}
      />

      <ErrorState error={listQuery.error || activateMutation.error || deleteMutation.error} />
      {listQuery.isLoading && <Loading />}

      {!listQuery.isLoading && items.length === 0 && (
        <div
          className="rounded-xl border p-5 text-xs text-center"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          No datasets uploaded for this company yet. Use the Enterprise Ingestion Pipeline above to upload your first file.
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((ds) => {
            const isLegacy = ds.storage_mode === 'legacy_snapshot'
            const statusTone =
              ds.status === 'imported'
                ? 'success'
                : ds.status === 'failed'
                ? 'critical'
                : ds.status === 'validated'
                ? 'info'
                : 'warning'

            return (
              <div
                key={ds.dataset_id}
                className="rounded-xl border p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
                style={{
                  background: ds.is_active ? 'var(--primary-soft)' : 'var(--surface)',
                  borderColor: ds.is_active ? 'var(--primary-border)' : 'var(--border)',
                }}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-semibold truncate" style={{ color: 'var(--heading)' }}>
                      {ds.name}
                    </strong>
                    {ds.is_active && (
                      <Pill tone="success">
                        <CheckCircle2 size={11} />
                        <span>{t('Active')}</span>
                      </Pill>
                    )}
                    <Pill tone={statusTone}>{ds.status.toUpperCase()}</Pill>
                    <Pill tone="muted">{(ds.file_format || ds.kind).toUpperCase()}</Pill>
                    {ds.currency && <Pill tone="accent">{ds.currency}</Pill>}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-mono">{ds.dataset_id.slice(0, 12)}</span>
                    <span>{integer(ds.row_count)} rows</span>
                    {ds.status !== 'uploaded' && (
                      <span>
                        Valid: {integer(ds.valid_rows)} · Invalid: {integer(ds.invalid_rows)}
                      </span>
                    )}
                    {ds.quality_score != null && <span>Quality: {ds.quality_score.toFixed(1)}%</span>}
                    {ds.date_start && ds.date_end && (
                      <span>
                        {ds.date_start} – {ds.date_end}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  {!isLegacy && (
                    <Button size="sm" variant="outline" onClick={() => onResumeDataset(ds.dataset_id)}>
                      <PlayCircle size={13} />
                      <span>{ds.status === 'imported' ? 'Re-inspect' : t('Resume')}</span>
                    </Button>
                  )}

                  {canWrite && ds.status === 'imported' && !ds.is_active && (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={activateMutation.isPending}
                      onClick={() => activateMutation.mutate(ds.dataset_id)}
                    >
                      <span>{t('Activate')}</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHistoryDatasetId((cur) => (cur === ds.dataset_id ? null : ds.dataset_id))}
                  >
                    <Clock size={13} />
                    <span>{t('History')}</span>
                  </Button>

                  {isAdmin && !isLegacy && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleteTarget(ds)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lifecycle History Drawer */}
      {historyDatasetId && (
        <div
          className="rounded-xl border p-4 space-y-2.5 text-xs"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <strong style={{ color: 'var(--heading)' }}>
              Ingestion Audit &amp; Lifecycle History ({historyQuery.data?.dataset_name || historyDatasetId.slice(0, 12)})
            </strong>
            <Button size="sm" variant="ghost" onClick={() => setHistoryDatasetId(null)}>
              Close
            </Button>
          </div>
          {historyQuery.isLoading && <Loading />}
          <ErrorState error={historyQuery.error} />
          {historyQuery.data && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {historyQuery.data.items.map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center gap-2">
                    <Pill tone={ev.status === 'failed' ? 'critical' : 'accent'}>{ev.stage.toUpperCase()}</Pill>
                    <span className="font-medium" style={{ color: 'var(--heading)' }}>
                      {ev.actor}
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {ev.error_message || JSON.stringify(ev.details)}
                    </span>
                  </div>
                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title="Delete Company Dataset"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}" along with its imported tenant records, quality reports, model bundle, and object storage files?`
            : ''
        }
        confirmLabel="Delete Dataset"
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.dataset_id)}
      />
    </Card>
  )
}

