import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Eye,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  deleteMultimodalFile,
  integer,
  listEnterpriseDatasets,
  listIngestionJobs,
  listMultimodalFiles,
  listMultimodalInsights,
  retryIngestionJob,
  uploadMultimodalFiles,
  type MultimodalFile,
  type Session,
} from '../../api'
import { Button, Card, ConfirmDialog, ErrorState, Loading, Pill, SectionTitle, useToast } from '../../ui'
import { ExtractionApprovalWorkbench } from './ExtractionApprovalWorkbench'

const ACCEPTED_MULTIMODAL =
  '.csv,.xlsx,.xls,.json,.xml,.pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp,.mp4,.mov,.avi,.mp3,.wav,.m4a'

export function MultimodalWorkspacePanel({ companyId, session }: { companyId: string; session: Session }) {
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [batchName, setBatchName] = useState('')
  const [targetDatasetId, setTargetDatasetId] = useState('')
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.8)
  const [samplingInterval, setSamplingInterval] = useState(5)
  const [maxFrames, setMaxFrames] = useState(10)
  const [retentionDays, setRetentionDays] = useState(90)
  const [privacyAccepted, setPrivacyAccepted] = useState(true)
  const [consentExternalAi, setConsentExternalAi] = useState(false)

  const [modalityFilter, setModalityFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [reviewFile, setReviewFile] = useState<MultimodalFile | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MultimodalFile | null>(null)

  const filesQuery = useQuery({
    queryKey: ['multimodal-files', companyId, modalityFilter, statusFilter],
    queryFn: () =>
      listMultimodalFiles({
        modality: modalityFilter || undefined,
        processing_status: statusFilter || undefined,
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.items || []
      return items.some((f) => f.processing_status === 'uploaded' || f.processing_status === 'processing')
        ? 1500
        : false
    },
  })

  const jobsQuery = useQuery({
    queryKey: ['multimodal-jobs', companyId],
    queryFn: () => listIngestionJobs(),
    refetchInterval: (query) => {
      const items = query.state.data?.items || []
      return items.some((j) => j.status === 'queued' || j.status === 'running') ? 1500 : false
    },
  })

  const datasetsQuery = useQuery({
    queryKey: ['enterprise-datasets', companyId],
    queryFn: listEnterpriseDatasets,
  })

  const insightsQuery = useQuery({
    queryKey: ['multimodal-insights', companyId],
    queryFn: () => listMultimodalInsights({ limit: '15' }),
  })

  const uploadMutation = useMutation({
    mutationFn: () =>
      uploadMultimodalFiles(selectedFiles, {
        datasetId: targetDatasetId || undefined,
        datasetName: batchName.trim() || undefined,
        confidenceThreshold,
        samplingIntervalSec: samplingInterval,
        maxFrames,
        retentionDays,
        privacyNoticeAccepted: privacyAccepted,
        consentExternalAi,
      }),
    onSuccess: async (res) => {
      setSelectedFiles([])
      setBatchName('')
      notify({
        tone: 'success',
        title: 'Multimodal files queued (HTTP 202)',
        description: `${res.files.length} file(s) accepted into async extraction pipeline.`,
      })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-files', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-jobs', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['enterprise-datasets', companyId] })
    },
  })

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => retryIngestionJob(jobId),
    onSuccess: async () => {
      notify({ tone: 'info', title: 'Job re-queued', description: 'Background extraction job restarted.' })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-jobs', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-files', companyId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteMultimodalFile(fileId),
    onSuccess: async (res) => {
      if (reviewFile?.file_id === res.file_id) setReviewFile(null)
      setDeleteTarget(null)
      notify({
        tone: 'info',
        title: 'Multimodal file permanently shredded',
        description: `Deleted file records and ${res.removed_storage_objects} stored media object(s).`,
      })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-files', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-jobs', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['multimodal-insights', companyId] })
    },
  })

  const isViewerOnly = session.role === 'viewer'
  const isAdmin = session.role === 'admin'
  const files = filesQuery.data?.items || []
  const jobs = jobsQuery.data?.items || []
  const insights = insightsQuery.data?.items || []
  const enterpriseDatasets = (datasetsQuery.data?.items || []).filter((d) => d.storage_mode !== 'legacy_snapshot')

  const modalityIcon = (modality: string) => {
    if (modality === 'document') return <FileText size={14} style={{ color: 'var(--primary)' }} />
    if (modality === 'image') return <ImageIcon size={14} style={{ color: 'var(--primary)' }} />
    if (modality === 'video') return <Film size={14} style={{ color: 'var(--primary)' }} />
    if (modality === 'audio') return <FileAudio size={14} style={{ color: 'var(--primary)' }} />
    return <FileSpreadsheet size={14} style={{ color: 'var(--primary)' }} />
  }

  return (
    <div className="space-y-6">
      {/* 1. Multi-format Batch Uploader + Governance Controls */}
      <Card className="space-y-4">
        <SectionTitle
          title="Multimodal Data & Intelligence Studio"
          detail="Ingest Documents (PDF, DOCX, PPTX, TXT), Images (PNG, JPG, WEBP), Video (MP4, MOV, AVI), Audio (WAV, MP3, M4A), and Structured (CSV, Excel, JSON, XML)."
          aside={<Pill tone="accent">19 FORMATS · ASYNC QUEUE · HITL</Pill>}
        />

        <ErrorState error={uploadMutation.error || retryMutation.error || deleteMutation.error} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="dp-field">
            <span className="dp-field-label">Batch Name (Optional)</span>
            <input
              type="text"
              placeholder="e.g. Q3 Invoices & Executive Briefings"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              disabled={isViewerOnly || uploadMutation.isPending}
              className="dp-input"
            />
          </label>

          <label className="dp-field">
            <span className="dp-field-label">Attach to Dataset</span>
            <select
              aria-label="Attach to Dataset"
              value={targetDatasetId}
              onChange={(e) => setTargetDatasetId(e.target.value)}
              disabled={isViewerOnly || uploadMutation.isPending}
              className="dp-select"
            >
              <option value="">Create new multimodal dataset batch</option>
              {enterpriseDatasets.map((ds) => (
                <option key={ds.dataset_id} value={ds.dataset_id}>
                  {ds.name} ({ds.status})
                </option>
              ))}
            </select>
          </label>

          <label className="dp-field">
            <span className="dp-field-label">Confidence Review Threshold</span>
            <input
              type="number"
              min={0.5}
              max={0.99}
              step={0.05}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value) || 0.8)}
              className="dp-input"
            />
          </label>
        </div>

        {/* Bounded Video & Privacy Governance Settings */}
        <div
          className="rounded-xl border p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <label className="dp-field">
            <span className="dp-field-label">Video Keyframe Interval (sec)</span>
            <input
              type="number"
              min={1}
              max={60}
              value={samplingInterval}
              onChange={(e) => setSamplingInterval(Math.max(1, Math.min(60, Number(e.target.value) || 5)))}
              className="dp-input"
            />
          </label>
          <label className="dp-field">
            <span className="dp-field-label">Max Video Frames Cap (≤ 20)</span>
            <input
              type="number"
              min={1}
              max={20}
              value={maxFrames}
              onChange={(e) => setMaxFrames(Math.max(1, Math.min(20, Number(e.target.value) || 10)))}
              className="dp-input"
            />
          </label>
          <label className="dp-field">
            <span className="dp-field-label">Retention Period (days)</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={retentionDays}
              onChange={(e) => setRetentionDays(Math.max(1, Number(e.target.value) || 90))}
              className="dp-input"
            />
          </label>

          <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={privacyAccepted}
              aria-label="Accept local processing and privacy governance notice"
              onClick={() => setPrivacyAccepted((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium"
              style={{ color: 'var(--heading)' }}
            >
              <span
                className="inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors"
                style={{ background: privacyAccepted ? 'var(--primary)' : 'var(--border-strong)' }}
              >
                <span
                  className="h-4 w-4 rounded-full bg-white transition-transform"
                  style={{ transform: privacyAccepted ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </span>
              <span>Privacy Policy: No facial recognition; local OCR/CV extraction runs first</span>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={consentExternalAi}
              aria-label="Opt-in external cloud Vision or Speech AI fallback"
              onClick={() => setConsentExternalAi((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium"
              style={{ color: 'var(--heading)' }}
            >
              <span
                className="inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors"
                style={{ background: consentExternalAi ? 'var(--primary)' : 'var(--border-strong)' }}
              >
                <span
                  className="h-4 w-4 rounded-full bg-white transition-transform"
                  style={{ transform: consentExternalAi ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </span>
              <span>Opt-in external Vision/STT AI fallback (when API key configured)</span>
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          aria-label="Multimodal batch files"
          accept={ACCEPTED_MULTIMODAL}
          disabled={isViewerOnly || uploadMutation.isPending}
          onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
          className="block w-full text-xs"
          style={{ color: 'var(--text-secondary)' }}
        />

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (isViewerOnly || uploadMutation.isPending) return
            setSelectedFiles(Array.from(e.dataTransfer.files || []))
          }}
          onClick={() => !isViewerOnly && inputRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-[var(--primary)]"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border-strong)' }}
        >
          <UploadCloud className="mx-auto mb-2" size={28} style={{ color: 'var(--primary)' }} />
          <div className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
            Drag &amp; drop single or multi-file multimodal batches here
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            {selectedFiles.length > 0
              ? `${selectedFiles.length} file(s) staged: ${selectedFiles.map((f) => f.name).join(', ')}`
              : 'Magic-byte inspected, malware/XXE scanned, tenant-isolated object storage'}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!selectedFiles.length || isViewerOnly || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            <Sparkles size={14} />
            <span>{uploadMutation.isPending ? 'Uploading & Queuing…' : 'Upload & Queue Extraction Job(s)'}</span>
          </Button>
        </div>
      </Card>

      {/* 2. Human-in-the-Loop Extraction Workbench (when reviewing a file) */}
      {reviewFile && (
        <ExtractionApprovalWorkbench
          companyId={companyId}
          file={reviewFile}
          session={session}
          onClose={() => setReviewFile(null)}
          onApproved={() => setReviewFile(null)}
        />
      )}

      {/* 3. Multimodal File Catalog & Async Job Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-7 space-y-4">
          <SectionTitle
            title="Multimodal File Catalog"
            detail="Filter ingested files across modalities and launch Human-in-the-Loop review."
            aside={
              <div className="flex items-center gap-2">
                <select
                  aria-label="Filter by modality"
                  value={modalityFilter}
                  onChange={(e) => setModalityFilter(e.target.value)}
                  className="dp-select py-1 text-xs"
                >
                  <option value="">All Modalities</option>
                  <option value="structured">Structured</option>
                  <option value="document">Document</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                </select>
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="dp-select py-1 text-xs"
                >
                  <option value="">All Statuses</option>
                  <option value="awaiting_approval">Awaiting Approval</option>
                  <option value="imported">Imported</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            }
          />

          <ErrorState error={filesQuery.error} retry={() => void filesQuery.refetch()} />
          {filesQuery.isLoading && <Loading />}

          {!filesQuery.isLoading && files.length === 0 && (
            <div
              className="rounded-xl border p-5 text-xs text-center"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              No multimodal files match the active filter yet. Upload PDFs, receipts, audio, video, or XML above.
            </div>
          )}

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {files.map((f) => {
              const summary = f.extraction_summary || {}
              const stTone =
                f.processing_status === 'imported'
                  ? 'success'
                  : f.processing_status === 'failed'
                  ? 'critical'
                  : f.processing_status === 'awaiting_approval'
                  ? 'warning'
                  : 'info'
              return (
                <div
                  key={f.file_id}
                  className="rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {modalityIcon(f.modality)}
                      <strong className="truncate" style={{ color: 'var(--heading)' }}>
                        {f.file_name}
                      </strong>
                      <Pill tone={stTone}>{f.processing_status.replaceAll('_', ' ').toUpperCase()}</Pill>
                      <Pill tone="muted">{f.file_format.toUpperCase()}</Pill>
                    </div>
                    <div className="text-[11px] flex flex-wrap gap-x-3" style={{ color: 'var(--text-secondary)' }}>
                      <span>{integer(f.file_size_bytes)} B</span>
                      {summary.total_extracted != null && <span>Extracted: {summary.total_extracted} record(s)</span>}
                      {summary.average_confidence != null && (
                        <span>Avg Conf: {Math.round(summary.average_confidence * 100)}%</span>
                      )}
                      {summary.below_threshold ? (
                        <span style={{ color: 'var(--warning-text)' }}>
                          {summary.below_threshold} low-confidence
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant={f.processing_status === 'awaiting_approval' ? 'primary' : 'outline'}
                      disabled={f.processing_status === 'uploaded' || f.processing_status === 'processing'}
                      onClick={() => setReviewFile(f)}
                    >
                      <Eye size={13} />
                      <span>{f.processing_status === 'imported' ? 'Inspect' : 'Review & Approve'}</span>
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(f)} aria-label={`Delete ${f.file_name}`}>
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="lg:col-span-5 space-y-4">
          <SectionTitle
            title="Async Ingestion Queue"
            detail="Background worker jobs with progress, attempts & retry controls."
            aside={<Layers size={16} style={{ color: 'var(--primary)' }} />}
          />

          <ErrorState error={jobsQuery.error} />
          {jobsQuery.isLoading && <Loading />}

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 text-xs">
            {jobs.length === 0 && !jobsQuery.isLoading && (
              <div
                className="rounded-xl border p-4 text-center"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                No background extraction jobs queued yet.
              </div>
            )}
            {jobs.map((j) => (
              <div
                key={j.id}
                className="rounded-xl border p-3 space-y-1.5"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold" style={{ color: 'var(--heading)' }}>
                    {j.id}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Pill
                      tone={
                        j.status === 'completed'
                          ? 'success'
                          : j.status === 'failed'
                          ? 'critical'
                          : 'info'
                      }
                    >
                      {j.status.toUpperCase()}
                    </Pill>
                    {j.status === 'failed' && !isViewerOnly && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retryMutation.isPending}
                        onClick={() => retryMutation.mutate(j.id)}
                      >
                        <RefreshCw size={11} />
                        <span>Retry</span>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-200">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${j.progress_pct}%`,
                      background: j.status === 'failed' ? 'var(--danger)' : 'var(--primary)',
                    }}
                  />
                </div>
                <div className="flex justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  <span>
                    Stage: {j.stage} · Attempt {j.attempt}/{j.max_attempts}
                  </span>
                  <span>{j.progress_pct}%</span>
                </div>
                {j.error_message && (
                  <div className="text-[11px] flex items-center gap-1" style={{ color: 'var(--danger-text)' }}>
                    <ShieldAlert size={12} />
                    <span>{j.error_message}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 4. Approved Company Multimodal Intelligence Insights */}
      {insights.length > 0 && (
        <Card className="space-y-3">
          <SectionTitle
            title="Verified Multimodal Insights"
            detail="Human-approved unstructured & cross-modal intelligence persisted for this company workspace."
            aside={<CheckCircle2 size={16} style={{ color: 'var(--success)' }} />}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {insights.map((ins) => (
              <div
                key={ins.id}
                className="rounded-xl border p-3.5 space-y-1.5"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <Pill tone="accent">{ins.modality.toUpperCase()}</Pill>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Approved by {ins.approved_by}
                  </span>
                </div>
                <div className="font-semibold" style={{ color: 'var(--heading)' }}>
                  {ins.title}
                </div>
                <p className="text-[11px] line-clamp-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {ins.summary_text}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title="Permanently Delete & Shred File"
        description={
          deleteTarget
            ? `Permanently delete '${deleteTarget.file_name}', all extracted records, sampled video keyframes, and promoted insight rows?`
            : ''
        }
        confirmLabel="Delete & Shred"
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.file_id)
        }}
      />
    </div>
  )
}
