import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Database, FileSpreadsheet, HardDrive, Layers, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react'
import { dateLabel, getActiveCompanyId, integer, request, uploadSnapshot, type Dataset, type Session } from '../api'
import { Button, Card, ErrorState, Heading, Pill, SectionTitle, Source, Table, useToast } from '../ui'
import { ConnectorsHub } from './ingestion/ConnectorsHub'
import { DatasetCatalogPanel } from './ingestion/DatasetCatalogPanel'
import { EnterpriseIngestionWizard } from './ingestion/EnterpriseIngestionWizard'
import { MultimodalWorkspacePanel } from './ingestion/MultimodalWorkspacePanel'

export function DataSourcesPage({
  companyId = getActiveCompanyId(),
  dataset,
  session,
}: {
  companyId?: string
  dataset?: Dataset
  session: Session
}) {
  const [token, setToken] = useState('')
  const client = useQueryClient()
  const { notify } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [resumeDatasetId, setResumeDatasetId] = useState<string | null>(null)
  const [ingestionMode, setIngestionMode] = useState<'tabular' | 'multimodal'>('tabular')
  const [notice, setNotice] = useState(() => sessionStorage.getItem('dp-import-notice') || '')

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !confirmed) throw new Error('Choose a file and confirm snapshot replacement.')
      return uploadSnapshot(file, dataset?.dataset_id || 'empty', token)
    },
    onSuccess: async (next) => {
      setToken('')
      setFile(null)
      setConfirmed(false)
      const msg =
        'Snapshot imported successfully. Forecasts and price/inventory simulations require a model trained for this dataset.'
      setNotice(msg)
      sessionStorage.setItem(
        'dp-import-notice',
        'Snapshot imported successfully. Train a matching model before requesting forecasts or price/inventory simulations.'
      )
      notify({
        tone: 'success',
        title: 'Dataset snapshot updated',
        description: `Active dataset ID: ${next.dataset_id.slice(0, 12)}…`,
      })
      await client.cancelQueries({ predicate: (query) => !['session', 'companies'].includes(String(query.queryKey[0])) })
      client.removeQueries({ predicate: (query) => !['session', 'companies', 'dataset'].includes(String(query.queryKey[0])) })
      client.setQueryData(['dataset', companyId], next)
      await client.invalidateQueries({ queryKey: ['dataset'] })
      await client.invalidateQueries({ queryKey: ['enterprise-datasets'] })
    },
  })

  const selectFile = (next: File | null) => {
    if (upload.isPending) return
    setFile(next)
    setConfirmed(false)
    setNotice('')
    sessionStorage.removeItem('dp-import-notice')
    upload.reset()
  }

  const duration = dataset ? Math.round((Date.parse(dataset.end) - Date.parse(dataset.start)) / 86_400_000) + 1 : 0

  const health = useQuery({
    queryKey: ['health', companyId, dataset?.dataset_id],
    queryFn: () =>
      request<{
        status: string
        database: string
        database_dialect: string
        dataset_ready: boolean
        model_ready: boolean
        model_version: string
      }>('/health'),
  })

  const tableRows = Object.entries(dataset?.counts || {}).map(([name, count]) => {
    let grain = '1 row per transaction'
    if (name === 'calendar_events') grain = '1 row per business date'
    if (name === 'products') grain = '1 row per SKU'
    if (name === 'customers') grain = '1 row per customer'
    if (name === 'marketing_campaigns') grain = '1 row per campaign-date'
    if (name === 'inventory_daily') grain = '1 row per physical SKU-date'
    if (name === 'orders') grain = '1 row per order'
    if (name === 'multimodal_insights') grain = '1 row per approved extraction'

    return {
      table: name,
      grain,
      count,
      status: 'Reconciled & Validated',
    }
  })

  return (
    <div className="space-y-6">
      <Heading
        eyebrow="DATA ARCHITECTURE"
        title="Data Sources & Integrity"
        subtitle="Review the active business dataset snapshot, schema contracts, record counts and import pipelines."
      />

      <ErrorState error={health.error} retry={() => void health.refetch()} />

      {/* Snapshot Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg border flex-shrink-0"
              style={{
                background: 'var(--primary-soft)',
                borderColor: 'var(--primary-border)',
                color: 'var(--primary)',
              }}
            >
              <Database size={18} />
            </div>
            <div className="min-w-0">
              <small className="block text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                Dataset Identity (SHA-256)
              </small>
              <div className="font-mono text-xs font-bold truncate mt-0.5" style={{ color: 'var(--heading)' }}>
                {dataset?.dataset_id || 'No active snapshot'}
              </div>
            </div>
          </div>
          <div
            className="pt-3 border-t text-xs flex items-center justify-between"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <span>Snapshot Type</span>
            <Pill tone="accent">{dataset?.kind.toUpperCase() || 'EMPTY'}</Pill>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg border flex-shrink-0"
              style={{
                background: 'var(--info-bg)',
                borderColor: 'var(--info-border)',
                color: 'var(--info)',
              }}
            >
              <HardDrive size={18} />
            </div>
            <div className="min-w-0">
              <small className="block text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                Date Range Boundary
              </small>
              <div className="text-xs font-bold mt-0.5" style={{ color: 'var(--heading)' }}>
                {dataset ? `${dateLabel(dataset.start)} – ${dateLabel(dataset.end)}` : 'No active dataset'}
              </div>
            </div>
          </div>
          <div
            className="pt-3 border-t text-xs flex items-center justify-between"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <span>Total Duration</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--heading)' }}>
              {integer(duration)} Calendar Days
            </span>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg border flex-shrink-0"
              style={{
                background: 'var(--success-bg)',
                borderColor: 'var(--success-border)',
                color: 'var(--success)',
              }}
            >
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <small className="block text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                Pipeline Quality Status
              </small>
              <div className="text-xs font-bold flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--success-text)' }}>
                <CheckCircle2 size={14} /> {dataset ? 'Validated snapshot' : 'Awaiting import'}
              </div>
            </div>
          </div>
          <div
            className="pt-3 border-t text-xs flex items-center justify-between"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <span>Database Dialect</span>
            <span className="font-semibold capitalize" style={{ color: 'var(--heading)' }}>
              {health.data?.database_dialect || 'SQLite / PostgreSQL'}
            </span>
          </div>
        </Card>
      </div>

      {/* Six Reconciled Core Tables */}
      <Card>
        <SectionTitle
          title="Reconciled Relational Schema"
          detail={
            dataset?.kind === 'uploaded'
              ? 'Normalized tenant analytical partitions populated from your mapped dataset.'
              : 'All 6 date-indexed tables are verified against foreign keys, accounting formulas and stock balance.'
          }
          aside={<Pill tone="success">{tableRows.length} Active Tables</Pill>}
        />
        <Table
          rows={tableRows}
          columns={[
            { key: 'table', title: 'Table Name' },
            { key: 'grain', title: 'Data Grain' },
            { key: 'count', title: 'Verified Records', format: integer, align: 'right' },
            { key: 'status', title: 'Integrity Check' },
          ]}
        />
        <Source>SQLite / PostgreSQL engine · Tenant-isolated workspace · Non-leaking features</Source>
      </Card>

      {/* Ingestion Mode Selector Bar */}
      <div
        role="tablist"
        aria-label="Data Ingestion Mode"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-2.5"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={ingestionMode === 'tabular'}
            onClick={() => setIngestionMode('tabular')}
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors"
            style={
              ingestionMode === 'tabular'
                ? { background: 'var(--primary)', color: '#fff' }
                : { background: 'var(--surface-muted)', color: 'var(--heading)' }
            }
          >
            <FileSpreadsheet size={14} />
            <span>Structured Tabular Pipeline (CSV · Excel · JSON · XML)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ingestionMode === 'multimodal'}
            onClick={() => setIngestionMode('multimodal')}
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors"
            style={
              ingestionMode === 'multimodal'
                ? { background: 'var(--primary)', color: '#fff' }
                : { background: 'var(--surface-muted)', color: 'var(--heading)' }
            }
          >
            <Layers size={14} />
            <span>Multimodal &amp; Media Studio (PDF · DOCX · Image · Video · Audio)</span>
          </button>
        </div>
        <span className="text-[11px] font-medium px-2" style={{ color: 'var(--text-secondary)' }}>
          Human-in-the-Loop Verification Active
        </span>
      </div>

      {/* Primary Ingestion Workbench */}
      {ingestionMode === 'tabular' ? (
        <EnterpriseIngestionWizard
          companyId={companyId}
          session={session}
          resumeDatasetId={resumeDatasetId}
          onClearResume={() => setResumeDatasetId(null)}
        />
      ) : (
        <MultimodalWorkspacePanel companyId={companyId} session={session} />
      )}

      {/* Company Dataset Catalog, Activation, History & Deletion */}
      <DatasetCatalogPanel
        companyId={companyId}
        session={session}
        onResumeDataset={(dsId) => {
          setResumeDatasetId(dsId)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {/* Extensible Data Connectors & Integrations Hub */}
      <ConnectorsHub companyId={companyId} session={session} />

      {/* Legacy Import Portal & Model Lineage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <SectionTitle
            title="Import New Business Snapshot"
            detail="Replace current dataset with a validated ZIP of 6 CSVs or a 6-sheet Excel workbook (.xlsx)."
            aside={<UploadCloud size={18} style={{ color: 'var(--primary)' }} />}
          />
          <div className="space-y-4 pt-1">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Import enforces atomic loading: if any row violates accounting balance (e.g. Sales Revenue ≠ Quantity × Price × (1 - Discount)) or breaks inventory movement, the entire upload is rejected with HTTP 422.
            </p>

            <label className="dp-field">
              <span className="dp-field-label">Security Import Token (X-Import-Token)</span>
              <input
                type="password"
                placeholder="Enter IMPORT_TOKEN from server .env"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="dp-input"
              />
            </label>

            <div className="space-y-2">
              <input
                type="file"
                aria-label="Business snapshot file"
                accept=".zip,.xlsx"
                disabled={upload.isPending}
                onChange={(e) => selectFile(e.target.files?.[0] || null)}
                className="block w-full text-xs"
                style={{ color: 'var(--text-secondary)' }}
              />
              <div
                className="border-2 border-dashed rounded-xl p-6 text-center transition-colors"
                style={{
                  background: 'var(--surface-muted)',
                  borderColor: 'var(--border-strong)',
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  selectFile(e.dataTransfer.files[0] || null)
                }}
              >
                <FileSpreadsheet className="mx-auto mb-2" size={28} style={{ color: 'var(--primary)' }} />
                <div className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                  Drag and drop business.zip or business.xlsx here
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Maximum file size: 40 MiB
                </div>
              </div>
            </div>

            {file && (
              <p className="text-xs font-medium" style={{ color: 'var(--heading)' }}>
                Selected: {file.name} · {integer(file.size)} bytes
              </p>
            )}

            <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={upload.isPending}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-[#2563EB]"
              />
              <span>
                I understand that importing replaces the active business data. Existing decision history is retained.
              </span>
            </label>

            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {!session.import_enabled
                ? 'Import is disabled on this server.'
                : session.role !== 'admin'
                ? 'An administrator role is required to replace data.'
                : 'Ready to accept validated snapshots.'}
            </p>

            <Button
              variant="primary"
              disabled={
                !file ||
                !confirmed ||
                !token.trim() ||
                upload.isPending ||
                !session.import_enabled ||
                session.role !== 'admin'
              }
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? 'Validating and importing…' : 'Replace snapshot'}
            </Button>

            <ErrorState error={upload.error} />
            {notice && (
              <p
                role="status"
                className="rounded-lg border px-3 py-2 text-xs font-medium"
                style={{
                  background: 'var(--warning-bg)',
                  borderColor: 'var(--warning-border)',
                  color: 'var(--warning-text)',
                }}
              >
                {notice}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Model Artifact Lineage"
            detail="Trained models are pinned to the active dataset SHA-256 identifier."
            aside={<RefreshCw size={16} style={{ color: 'var(--primary)' }} />}
          />
          <div className="space-y-3 pt-1 text-xs">
            <div className="flex justify-between gap-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Forecasting Model Bundle:</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--heading)' }}>
                {health.data?.model_version || 'No matching trained artifact'}
              </span>
            </div>
            <div className="flex justify-between gap-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Model Readiness:</span>
              <Pill tone={health.data?.model_ready ? 'success' : 'critical'}>
                {health.data?.model_ready ? 'READY FOR INFERENCE' : 'TRAINING REQUIRED'}
              </Pill>
            </div>
            <div className="flex justify-between gap-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Anomaly Radar Engine:</span>
              <span className="font-medium text-right" style={{ color: 'var(--heading)' }}>
                Hybrid Isolation Forest + Rolling Z-Score
              </span>
            </div>
            <div className="flex justify-between gap-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>What-If Simulation Engine:</span>
              <span className="font-medium text-right" style={{ color: 'var(--heading)' }}>
                Microeconomic Elasticity + Lead Time Cap
              </span>
            </div>
            <div className="flex justify-between gap-3 py-2.5">
              <span style={{ color: 'var(--text-secondary)' }}>Intent Routing Abstraction:</span>
              <span className="font-medium text-right" style={{ color: 'var(--primary-text)' }}>
                Google Gemini / OpenAI / Local Rule-based
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
