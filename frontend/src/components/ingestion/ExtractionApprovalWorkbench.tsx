import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileAudio,
  FileText,
  Film,
  Image as ImageIcon,
  Save,
  ShieldCheck,
  Sparkles,
  Table2,
  X,
  XCircle,
} from 'lucide-react'
import {
  approveImportFile,
  getFileExtractions,
  integer,
  patchExtractedRecord,
  type CurrencyCode,
  type ExtractedRecord,
  type MultimodalApproveResult,
  type MultimodalFile,
  type Session,
} from '../../api'
import { Button, Card, ErrorState, Loading, Pill, SectionTitle, useToast } from '../../ui'

const EDITABLE_BUSINESS_KEYS = [
  'date',
  'product',
  'category',
  'quantity',
  'revenue',
  'cost',
  'profit',
  'customer',
  'region',
  'channel',
  'order_id',
  'title',
  'summary',
  'transcript',
] as const

export function ExtractionApprovalWorkbench({
  companyId,
  file,
  session,
  onClose,
  onApproved,
}: {
  companyId: string
  file: MultimodalFile
  session: Session
  onClose: () => void
  onApproved?: (res: MultimodalApproveResult) => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useToast()

  const extractionsQuery = useQuery({
    queryKey: ['multimodal-extractions', companyId, file.file_id],
    queryFn: () => getFileExtractions(file.file_id),
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftFields, setDraftFields] = useState<Record<string, string>>({})
  const [initialDraftFields, setInitialDraftFields] = useState<Record<string, string>>({})
  const [currency, setCurrency] = useState<CurrencyCode>('USD')
  const [overrideLowConf, setOverrideLowConf] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    setEditingId(null)
    setDraftFields({})
    setOverrideLowConf(false)
    setConfirmed(false)
  }, [file.file_id])

  const patchMutation = useMutation({
    mutationFn: ({
      recordId,
      corrected_data,
      validation_status,
    }: {
      recordId: string
      corrected_data?: Record<string, unknown>
      validation_status?: ExtractedRecord['validation_status']
    }) => patchExtractedRecord(recordId, { corrected_data, validation_status }),
    onSuccess: async () => {
      setEditingId(null)
      notify({ tone: 'success', title: 'Extraction updated', description: 'Human correction saved to audit trail.' })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-extractions', companyId, file.file_id] })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-files', companyId] })
    },
  })

  const approveMutation = useMutation({
    mutationFn: () =>
      approveImportFile(file.file_id, {
        confirmed,
        approve_below_threshold: overrideLowConf,
        activate: true,
        currency,
      }),
    onSuccess: async (res) => {
      notify({
        tone: 'success',
        title: 'Extracted intelligence approved & imported',
        description: `Promoted ${res.promoted_financial_rows} financial record(s) and ${res.promoted_insights} insight(s).`,
      })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-files', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-extractions', companyId, file.file_id] })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-insights', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['enterprise-datasets', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['dataset'] })
      await queryClient.invalidateQueries({ queryKey: ['options'] })
      await queryClient.invalidateQueries({ queryKey: ['health'] })
      onApproved?.(res)
    },
  })

  const isViewerOnly = session.role === 'viewer'
  const bundle = extractionsQuery.data
  const items = bundle?.items || []
  const meta = file.source_metadata || {}
  const sampledFrames = meta.sampled_frames || []
  const audioMeta =
    (meta.audio_metadata as Record<string, unknown> | undefined) ??
    (file.modality === 'audio' ? (meta as Record<string, unknown>) : undefined)

  const startEditing = (rec: ExtractedRecord) => {
    const init: Record<string, string> = {}
    for (const k of EDITABLE_BUSINESS_KEYS) {
      const val = rec.effective_data?.[k]
      if (val !== undefined && val !== null) {
        init[k] = String(val)
      }
    }
    if (!Object.keys(init).length && rec.effective_data) {
      Object.entries(rec.effective_data).forEach(([k, v]) => {
        if (v !== null && v !== undefined && typeof v !== 'object') {
          init[k] = String(v)
        }
      })
    }
    setDraftFields(init)
    setInitialDraftFields(init)
    setEditingId(rec.id)
  }

  const saveEdit = (recId: string) => {
    const corrected: Record<string, unknown> = {}
    const revOrCostChanged =
      draftFields.revenue !== initialDraftFields.revenue || draftFields.cost !== initialDraftFields.cost
    const profitUnchanged = draftFields.profit === initialDraftFields.profit
    for (const [k, raw] of Object.entries(draftFields)) {
      if (k === 'profit' && revOrCostChanged && profitUnchanged) {
        continue
      }
      const trimmed = raw.trim()
      if (trimmed !== '') {
        if (['quantity', 'revenue', 'cost', 'profit'].includes(k) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
          corrected[k] = Number(trimmed)
        } else {
          corrected[k] = trimmed
        }
      }
    }
    patchMutation.mutate({ recordId: recId, corrected_data: corrected, validation_status: 'edited' })
  }

  return (
    <Card className="space-y-5 border-2 border-[var(--primary-border)]">
      <SectionTitle
        title={`Human-in-the-Loop Verification: ${file.file_name}`}
        detail="Inspect original source provenance alongside extracted entities, edit mistakes, and confirm before BI promotion."
        aside={
          <div className="flex items-center gap-2">
            <Pill tone="accent">{file.modality.toUpperCase()}</Pill>
            <Pill tone={file.processing_status === 'imported' ? 'success' : 'warning'}>
              {file.processing_status.replaceAll('_', ' ').toUpperCase()}
            </Pill>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close verification workbench">
              <X size={14} />
              <span>Close</span>
            </Button>
          </div>
        }
      />

      <ErrorState error={extractionsQuery.error || patchMutation.error || approveMutation.error} />
      {extractionsQuery.isLoading && <Loading />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Source Preview & Provenance */}
        <div
          className="lg:col-span-5 rounded-xl border p-4 space-y-3 text-xs"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-2 font-semibold" style={{ color: 'var(--heading)' }}>
            <span className="inline-flex items-center gap-1.5">
              <Eye size={14} style={{ color: 'var(--primary)' }} />
              Source Media & Provenance
            </span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              SHA256: {file.checksum_sha256.slice(0, 12)}…
            </span>
          </div>

          {file.modality === 'image' && file.signed_content_url && (
            <div className="rounded-lg overflow-hidden border bg-white" style={{ borderColor: 'var(--border)' }}>
              <img
                src={file.signed_content_url}
                alt={file.file_name}
                className="w-full max-h-72 object-contain mx-auto"
              />
            </div>
          )}

          {file.modality === 'video' && (
            <div className="space-y-2.5">
              <div
                className="rounded-lg border px-3 py-2 flex items-center justify-between"
                style={{ background: 'var(--info-bg)', borderColor: 'var(--info-border)', color: 'var(--info-text)' }}
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Film size={13} /> Sampled Keyframes ({sampledFrames.length})
                </span>
                <span className="text-[10px] font-semibold uppercase">Facial Recognition Off</span>
              </div>
              {sampledFrames.length > 0 && (
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {sampledFrames.map((fr) => (
                    <div
                      key={fr.frame_index}
                      className="rounded-lg border p-1.5 bg-white space-y-1"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {fr.signed_url && (
                        <img
                          src={fr.signed_url}
                          alt={`Frame ${fr.frame_index}`}
                          className="w-full h-24 object-cover rounded"
                        />
                      )}
                      <div className="text-[10px] flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                        <span>t={fr.timestamp_sec}s</span>
                        <span>Δ={fr.scene_delta ?? fr.scene_change_score ?? 0}</span>
                      </div>
                      {fr.ocr_text && (
                        <div className="text-[10px] truncate font-medium" style={{ color: 'var(--heading)' }}>
                          OCR: {fr.ocr_text}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {file.modality === 'audio' && (
            <div className="space-y-2.5">
              {file.signed_content_url && (
                <audio controls className="w-full" src={file.signed_content_url}>
                  Audio preview unsupported in this browser.
                </audio>
              )}
              {audioMeta && (
                <div
                  className="rounded-lg border p-3 space-y-1 text-[11px]"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--heading)' }}>
                    <FileAudio size={13} style={{ color: 'var(--primary)' }} />
                    Acoustic Signal Metadata
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Duration: {String(audioMeta.duration_sec ?? '—')}s · Sample rate:{' '}
                    {String(audioMeta.sample_rate ?? '—')} Hz · Channels: {String(audioMeta.channels ?? '—')}
                  </div>
                  {audioMeta.peak_dbfs != null && (
                    <div style={{ color: 'var(--text-secondary)' }}>Peak level: {String(audioMeta.peak_dbfs)} dBFS</div>
                  )}
                </div>
              )}
            </div>
          )}

          {file.modality === 'document' && (
            <div
              className="rounded-lg border p-3 space-y-1.5"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--heading)' }}>
                <FileText size={13} style={{ color: 'var(--primary)' }} />
                Document Extraction Provenance
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Format: .{file.file_format.toUpperCase()} · Size: {integer(file.file_size_bytes)} bytes
                {meta.page_count != null && ` · Pages: ${String(meta.page_count)}`}
                {meta.slide_count != null && ` · Slides: ${String(meta.slide_count)}`}
              </div>
            </div>
          )}

          {file.modality === 'structured' && (
            <div
              className="rounded-lg border p-3 space-y-1.5"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--heading)' }}>
                <Table2 size={13} style={{ color: 'var(--primary)' }} />
                Tabular Structure Summary
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Format: .{file.file_format.toUpperCase()} · Size: {integer(file.file_size_bytes)} bytes · Confidence
                threshold: {Math.round(file.confidence_threshold * 100)}%
              </div>
            </div>
          )}

          {meta.warnings && meta.warnings.length > 0 && (
            <div
              className="rounded-lg border p-2.5 space-y-1 text-[11px]"
              style={{
                background: 'var(--warning-bg)',
                borderColor: 'var(--warning-border)',
                color: 'var(--warning-text)',
              }}
            >
              <div className="font-semibold">Extraction Notices:</div>
              {meta.warnings.slice(0, 4).map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Editable Extracted Records */}
        <div className="lg:col-span-7 space-y-3">
          {bundle && bundle.below_threshold_count > 0 && (
            <div
              className="rounded-xl border px-3.5 py-2.5 flex items-start gap-2 text-xs"
              style={{
                background: 'var(--warning-bg)',
                borderColor: 'var(--warning-border)',
                color: 'var(--warning-text)',
              }}
            >
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              <div>
                <strong>{bundle.below_threshold_count} extracted record(s)</strong> fall below the{' '}
                <strong>{Math.round(bundle.confidence_threshold * 100)}%</strong> confidence threshold. Edit or review
                these fields before confirming BI import.
              </div>
            </div>
          )}

          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {items.map((rec) => {
              const isEditing = editingId === rec.id
              const pct = rec.confidence_score != null ? Math.round(rec.confidence_score * 100) : null
              const statusTone =
                rec.validation_status === 'approved' || rec.validation_status === 'edited'
                  ? 'success'
                  : rec.validation_status === 'rejected'
                  ? 'critical'
                  : 'warning'

              return (
                <div
                  key={rec.id}
                  className="rounded-xl border p-3.5 space-y-2.5 text-xs"
                  style={{
                    background: 'var(--surface)',
                    borderColor: rec.below_threshold ? 'var(--warning-border)' : 'var(--border)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone="accent">{rec.entity_type.toUpperCase()}</Pill>
                      <Pill tone={statusTone}>{rec.validation_status.replaceAll('_', ' ').toUpperCase()}</Pill>
                      {pct != null && (
                        <Pill tone={rec.below_threshold ? 'warning' : 'success'}>
                          Conf: {pct}%{rec.below_threshold ? ' (Low)' : ''}
                        </Pill>
                      )}
                      <span className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {rec.extraction_method}
                      </span>
                    </div>

                    {!isViewerOnly && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => (isEditing ? setEditingId(null) : startEditing(rec))}
                        >
                          {isEditing ? 'Cancel' : 'Edit Fields'}
                        </Button>
                        {rec.validation_status !== 'approved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={patchMutation.isPending}
                            onClick={() => patchMutation.mutate({ recordId: rec.id, validation_status: 'approved' })}
                          >
                            <CheckCircle2 size={12} />
                            <span>Mark Valid</span>
                          </Button>
                        )}
                        {rec.validation_status !== 'rejected' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={patchMutation.isPending}
                            onClick={() => patchMutation.mutate({ recordId: rec.id, validation_status: 'rejected' })}
                          >
                            <XCircle size={12} />
                            <span>Reject</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Provenance Location */}
                  <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    Source: {JSON.stringify(rec.source_location)}
                  </div>

                  {/* Key Fields View or Inline Edit Form */}
                  {isEditing ? (
                    <div
                      className="rounded-lg border p-3 space-y-2.5"
                      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {['date', 'product', 'revenue', 'cost', 'profit', 'quantity', 'customer', 'order_id', 'title', 'summary', 'transcript'].map(
                          (key) => (
                            <label key={key} className={`dp-field ${key === 'summary' || key === 'transcript' ? 'sm:col-span-2' : ''}`}>
                              <span className="dp-field-label">Edit {key}</span>
                              <input
                                type="text"
                                aria-label={`Edit ${key} for ${rec.id}`}
                                value={draftFields[key] ?? ''}
                                onChange={(e) => setDraftFields((prev) => ({ ...prev, [key]: e.target.value }))}
                                className="dp-input py-1.5 text-xs"
                                placeholder={`Enter verified ${key}…`}
                              />
                            </label>
                          )
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={patchMutation.isPending}
                          onClick={() => saveEdit(rec.id)}
                        >
                          <Save size={13} />
                          <span>Save Correction</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(rec.effective_data)
                        .filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
                        .slice(0, 9)
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="rounded-lg border px-2.5 py-1.5"
                            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                          >
                            <div className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>
                              {k.replaceAll('_', ' ')}
                            </div>
                            <div className="text-xs font-medium break-words" style={{ color: 'var(--heading)' }}>
                              {String(v)}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {rec.transformation_history && rec.transformation_history.length > 0 && (
                    <details className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      <summary className="cursor-pointer font-medium" style={{ color: 'var(--primary-text)' }}>
                        Transformation & Human Edit Log ({rec.transformation_history.length})
                      </summary>
                      <pre className="mt-1 p-2 rounded border overflow-x-auto bg-slate-50 text-[10px]">
                        {JSON.stringify(rec.transformation_history, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )
            })}
          </div>

          {/* Human Approval & Promotion Bar */}
          {items.length > 0 && (
            <div
              className="rounded-xl border p-4 space-y-3 text-xs"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="dp-field">
                  <span className="dp-field-label">Normalized Currency</span>
                  <select
                    aria-label="Multimodal Import Currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="dp-select"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="VND">VND (₫)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </label>

                {bundle && bundle.below_threshold_count > 0 && (
                  <div className="flex items-end pb-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={overrideLowConf}
                      aria-label="Allow importing below-threshold extracted records"
                      onClick={() => setOverrideLowConf((v) => !v)}
                      className="flex items-center gap-2 text-left text-xs font-medium"
                      style={{ color: 'var(--heading)' }}
                    >
                      <span
                        className="inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors"
                        style={{ background: overrideLowConf ? 'var(--warning)' : 'var(--border-strong)' }}
                      >
                        <span
                          className="h-4 w-4 rounded-full bg-white transition-transform"
                          style={{ transform: overrideLowConf ? 'translateX(16px)' : 'translateX(0)' }}
                        />
                      </span>
                      <span>Include low-confidence records after review</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={confirmed}
                  aria-label="Confirm extracted data is verified for BI ingestion"
                  disabled={isViewerOnly}
                  onClick={() => setConfirmed((v) => !v)}
                  className="flex items-center gap-2 text-left text-xs font-medium"
                  style={{ color: 'var(--heading)' }}
                >
                  <span
                    className="inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors flex-shrink-0"
                    style={{ background: confirmed ? 'var(--primary)' : 'var(--border-strong)' }}
                  >
                    <span
                      className="h-4 w-4 rounded-full bg-white transition-transform"
                      style={{ transform: confirmed ? 'translateX(16px)' : 'translateX(0)' }}
                    />
                  </span>
                  <span>I have reviewed these extractions and confirm BI import (no AI data enters unverified).</span>
                </button>

                <Button
                  variant="primary"
                  disabled={isViewerOnly || !confirmed || approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                >
                  <ShieldCheck size={14} />
                  <span>{approveMutation.isPending ? 'Promoting to BI…' : 'Confirm & Import to BI'}</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
