import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Database, FileSpreadsheet, HardDrive, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react'
import { dateLabel, integer, request, uploadSnapshot, type Dataset, type Session } from '../api'
import { Button, Card, Empty, ErrorState, Heading, Loading, Pill, SectionTitle, Source, Table } from '../ui'

export function DataSourcesPage({ dataset, session }: { dataset?: Dataset; session: Session }) {
  const [token, setToken] = useState('')
  const client = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [notice, setNotice] = useState(() => sessionStorage.getItem('dp-import-notice') || '')
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !confirmed) throw new Error('Choose a file and confirm snapshot replacement.')
      return uploadSnapshot(file, dataset?.dataset_id || 'empty', token)
    },
    onSuccess: async (next) => {
      setToken(''); setFile(null); setConfirmed(false)
      setNotice('Snapshot imported successfully. Forecasts and price/inventory simulations require a model trained for this dataset.')
      sessionStorage.setItem('dp-import-notice', 'Snapshot imported successfully. Train a matching model before requesting forecasts or price/inventory simulations.')
      await client.cancelQueries({ predicate: query => !['session'].includes(String(query.queryKey[0])) })
      client.removeQueries({ predicate: query => !['session', 'dataset'].includes(String(query.queryKey[0])) })
      client.setQueryData(['dataset'], next)
      await client.invalidateQueries({ queryKey: ['dataset'] })
    },
  })
  const selectFile = (next: File | null) => {
    if (upload.isPending) return
    setFile(next); setConfirmed(false); setNotice(''); sessionStorage.removeItem('dp-import-notice'); upload.reset()
  }
  const duration = dataset ? Math.round((Date.parse(dataset.end) - Date.parse(dataset.start)) / 86_400_000) + 1 : 0

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () =>
      request<{ status: string; database: string; database_dialect: string; dataset_ready: boolean; model_ready: boolean; model_version: string }>(
        '/health'
      ),
  })

  const tableRows = Object.entries(dataset?.counts || {}).map(([name, count]) => {
    let grain = '1 row per transaction'
    if (name === 'calendar_events') grain = '1 row per business date'
    if (name === 'products') grain = '1 row per SKU'
    if (name === 'customers') grain = '1 row per customer'
    if (name === 'marketing_campaigns') grain = '1 row per campaign-date'
    if (name === 'inventory_daily') grain = '1 row per physical SKU-date'

    return {
      table: name,
      grain,
      count,
      status: 'Reconciled & Validated',
    }
  })

  return (
    <>
      <Heading
        eyebrow="DATA ARCHITECTURE"
        title="Data Sources & Integrity"
        subtitle="Review the active business dataset snapshot, schema contracts, record counts and import pipelines."
      />

      <ErrorState error={health.error} retry={() => void health.refetch()} />
      {/* Snapshot Overview Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-indigo-500/20 bg-gradient-to-br from-[#111a30] to-[#070b17]">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Database size={22} />
            </div>
            <div>
              <small className="text-xs text-slate-400">Dataset Identity (SHA-256)</small>
              <div className="font-mono text-sm font-bold text-white tracking-wider">{dataset?.dataset_id || 'No active snapshot'}</div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Snapshot Type</span>
            <Pill tone="accent">{dataset?.kind.toUpperCase() || 'EMPTY'}</Pill>
          </div>
        </Card>

        <Card className="border-cyan-500/20 bg-gradient-to-br from-[#111a30] to-[#070b17]">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400">
              <HardDrive size={22} />
            </div>
            <div>
              <small className="text-xs text-slate-400">Date Range Boundary</small>
              <div className="text-sm font-bold text-white">
                {dataset ? `${dateLabel(dataset.start)} – ${dateLabel(dataset.end)}` : 'No active dataset'}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Total Duration</span>
            <span className="font-semibold text-cyan-300">{integer(duration)} Calendar Days</span>
          </div>
        </Card>

        <Card className="border-emerald-500/20 bg-gradient-to-br from-[#111a30] to-[#070b17]">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
              <ShieldCheck size={22} />
            </div>
            <div>
              <small className="text-xs text-slate-400">Pipeline Quality Status</small>
              <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={16} /> {dataset ? 'Validated snapshot' : 'Awaiting import'}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Database Dialect</span>
            <span className="font-semibold text-slate-200 capitalize">
              {health.data?.database_dialect || 'SQLite / PostgreSQL'}
            </span>
          </div>
        </Card>
      </div>

      {/* Six Reconciled Core Tables */}
      <Card>
        <SectionTitle
          title="Reconciled Relational Schema"
          detail="All 6 date-indexed tables are verified against foreign keys, accounting formulas and stock balance."
          aside={<Pill tone="success">{tableRows.length} Active Tables</Pill>}
        />
        <Table
          rows={tableRows}
          columns={[
            { key: 'table', title: 'Table Name' },
            { key: 'grain', title: 'Data Grain' },
            { key: 'count', title: 'Verified Records', format: integer },
            { key: 'status', title: 'Integrity Check' },
          ]}
        />
        <Source>
          SQLite / PostgreSQL engine · Point-in-time snapshot · Non-leaking features
        </Source>
      </Card>

      {/* Snapshot Import & Replacement Portal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle
            title="Import New Business Snapshot"
            detail="Replace current dataset with a validated ZIP of 6 CSVs or a 6-sheet Excel workbook (.xlsx)."
            aside={<UploadCloud size={20} className="text-indigo-400" />}
          />
          <div className="space-y-4 pt-2">
            <p className="text-xs text-slate-400 leading-relaxed">
              Import enforces atomic loading: if any row violates accounting balance (e.g. Sales Revenue ≠ Quantity × Price × (1 - Discount)) or breaks inventory movement, the entire upload is rejected with HTTP 422.
            </p>

            <label className="field">
              <span>Security Import Token (X-Import-Token)</span>
              <input
                type="password"
                placeholder="Enter IMPORT_TOKEN from server .env"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>

            <input type="file" aria-label="Business snapshot file" accept=".zip,.xlsx" disabled={upload.isPending} onChange={e => selectFile(e.target.files?.[0] || null)} />
            <div className="border-2 border-dashed border-indigo-500/20 rounded-xl p-6 text-center hover:border-indigo-500/40 transition-colors"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); selectFile(e.dataTransfer.files[0] || null) }}>
              <FileSpreadsheet className="mx-auto text-indigo-400 mb-2" size={32} />
              <div className="text-sm font-semibold text-slate-200">Drag and drop business.zip or business.xlsx here</div>
              <div className="text-xs text-slate-400 mt-1">Maximum file size: 40 MiB</div>
            </div>

            {file && <p className="text-xs">Selected: {file.name} · {integer(file.size)} bytes</p>}
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={confirmed} disabled={upload.isPending} onChange={e => setConfirmed(e.target.checked)} />
              I understand that importing replaces the active business data. Existing decision history is retained.
            </label>
            <p className="text-xs text-slate-400">{!session.import_enabled ? 'Import is disabled on this server.' : session.role !== 'admin' ? 'An administrator role is required to replace data.' : 'Ready to accept validated snapshots.'}</p>
            <Button className="primary" disabled={!file || !confirmed || !token.trim() || upload.isPending || !session.import_enabled || session.role !== 'admin'} onClick={() => upload.mutate()}>
              {upload.isPending ? 'Validating and importing…' : 'Replace snapshot'}
            </Button>
            <ErrorState error={upload.error} />
            {notice && <p role="status" className="text-xs text-amber-300">{notice}</p>}
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Model Artifact Lineage"
            detail="Trained models are pinned to the active dataset SHA-256 identifier."
            aside={<RefreshCw size={18} className="text-cyan-400" />}
          />
          <div className="space-y-3 pt-1 text-xs text-slate-300">
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Forecasting Model Bundle:</span>
              <span className="font-mono font-semibold text-white">{health.data?.model_version || 'No matching trained artifact'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Model Readiness:</span>
              <Pill tone={health.data?.model_ready ? 'success' : 'critical'}>
                {health.data?.model_ready ? 'READY FOR INFERENCE' : 'TRAINING REQUIRED'}
              </Pill>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Anomaly Radar Engine:</span>
              <span className="font-semibold text-white">Hybrid Isolation Forest + Rolling Z-Score</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">What-If Simulation Engine:</span>
              <span className="font-semibold text-white">Microeconomic Elasticity + Lead Time Cap</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400">Intent Routing Abstraction:</span>
              <span className="font-semibold text-indigo-300">Google Gemini / OpenAI / Local Rule-based</span>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}

