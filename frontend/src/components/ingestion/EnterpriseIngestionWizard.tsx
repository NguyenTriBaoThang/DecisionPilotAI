import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import {
  downloadErrorReport,
  getDatasetQuality,
  getEnterpriseDataset,
  importEnterpriseDataset,
  integer,
  listMappingTemplates,
  previewEnterpriseDataset,
  saveDatasetMapping,
  uploadEnterpriseDataset,
  validateEnterpriseDataset,
  type ImportResult,
  type MappingSuggestionBundle,
  type QualityReport,
  type Row,
  type Session,
} from '../../api'
import { useT } from '../../preferences'
import { Button, Card, ErrorState, Pill, SectionTitle, Table, useToast } from '../../ui'

type WizardStep = 1 | 2 | 3 | 4

const CANONICAL_OPTIONS: { value: string; label: string }[] = [
  { value: '__ignore__', label: '— Ignore column —' },
  { value: 'date', label: 'Date / Transaction Date (Required)' },
  { value: 'revenue', label: 'Revenue / Sales Amount (Required)' },
  { value: 'product', label: 'Product / SKU' },
  { value: 'category', label: 'Category' },
  { value: 'quantity', label: 'Quantity Sold' },
  { value: 'cost', label: 'Cost / COGS' },
  { value: 'profit', label: 'Gross Profit' },
  { value: 'customer', label: 'Customer / Account' },
  { value: 'region', label: 'Region / Market' },
  { value: 'channel', label: 'Sales Channel' },
  { value: 'marketing_spend', label: 'Marketing Spend' },
  { value: 'inventory', label: 'Inventory On Hand' },
]

function computeCapabilitiesLocal(mappings: Record<string, string>) {
  const vals = new Set(Object.values(mappings))
  const hasDate = vals.has('date')
  const hasRevenue = vals.has('revenue')
  return {
    dashboard: hasDate && hasRevenue,
    ask: hasDate && hasRevenue,
    anomalies: hasDate && hasRevenue,
    forecast: hasDate && (hasRevenue || vals.has('quantity')),
    priceSim: hasDate && hasRevenue && vals.has('product'),
    marketingSim: hasDate && vals.has('marketing_spend'),
    inventorySim: hasDate && vals.has('inventory') && vals.has('product'),
  }
}

function safeCustomSlug(col: string): string {
  return (
    col
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'custom_attr'
  )
}

export function EnterpriseIngestionWizard({
  companyId,
  session,
  resumeDatasetId,
  onClearResume,
  onImported,
}: {
  companyId: string
  session: Session
  resumeDatasetId?: string | null
  onClearResume?: () => void
  onImported?: (result: ImportResult) => void
}) {
  const { t } = useT()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<WizardStep>(1)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [datasetName, setDatasetName] = useState('')
  const [datasetId, setDatasetId] = useState<string | null>(null)
  const [fileFormat, setFileFormat] = useState<string>('csv')
  const [columns, setColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<Row[]>([])
  const [totalRows, setTotalRows] = useState<number>(0)
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [suggestionsBundle, setSuggestionsBundle] = useState<MappingSuggestionBundle | null>(null)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [currency, setCurrency] = useState<string>('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [invalidPolicy, setInvalidPolicy] = useState<'skip_invalid' | 'fail_on_error'>('skip_invalid')
  const [duplicatePolicy, setDuplicatePolicy] = useState<'keep_all' | 'deduplicate'>('keep_all')
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null)
  const [confirmImport, setConfirmImport] = useState(false)
  const [importSuccess, setImportSuccess] = useState<ImportResult | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)
  const [downloadingFmt, setDownloadingFmt] = useState<'csv' | 'json' | null>(null)

  const templatesQuery = useQuery({
    queryKey: ['mapping-templates', companyId],
    queryFn: listMappingTemplates,
    enabled: step >= 3,
  })

  // Reset wizard cleanly when switching tenant company
  useEffect(() => {
    setStep(1)
    setSelectedFile(null)
    setDatasetName('')
    setDatasetId(null)
    setColumns([])
    setPreviewRows([])
    setTotalRows(0)
    setSheets([])
    setSelectedSheet(null)
    setParseWarnings([])
    setSuggestionsBundle(null)
    setMappings({})
    setCurrency('')
    setSaveAsTemplate(false)
    setTemplateName('')
    setQualityReport(null)
    setConfirmImport(false)
    setImportSuccess(null)
    setActionError(null)
  }, [companyId])

  // Resume an uploaded/mapped/validated dataset selected from catalog
  useEffect(() => {
    if (!resumeDatasetId) return
    let active = true
    setActionError(null)
    ;(async () => {
      try {
        const [detail, prev] = await Promise.all([
          getEnterpriseDataset(resumeDatasetId),
          previewEnterpriseDataset(resumeDatasetId, { limit: 25 }),
        ])
        if (!active) return
        setDatasetId(resumeDatasetId)
        setDatasetName(detail.name)
        setFileFormat(prev.file_format)
        setColumns(prev.columns)
        setPreviewRows(prev.rows)
        setTotalRows(prev.total_rows)
        setSheets(prev.sheets || [])
        setSelectedSheet(prev.selected_sheet)
        setParseWarnings(prev.parse_warnings || [])
        setSuggestionsBundle(prev.mapping_suggestions)
        setMappings(prev.current_mapping || prev.mapping_suggestions.suggested_mapping)
        setCurrency(detail.currency || 'USD')
        if (detail.cleaning_policy) {
          setInvalidPolicy(detail.cleaning_policy.invalid_row_policy)
          setDuplicatePolicy(detail.cleaning_policy.duplicate_policy)
        }
        setConfirmImport(false)
        setImportSuccess(null)
        if (detail.status === 'validated' || detail.status === 'imported') {
          try {
            const qr = await getDatasetQuality(resumeDatasetId)
            if (!active) return
            setQualityReport(qr)
            setStep(4)
          } catch {
            setStep(detail.mapping_confirmed ? 4 : 3)
          }
        } else if (detail.mapping_confirmed) {
          setStep(3)
        } else {
          setStep(2)
        }
      } catch (err) {
        if (active) setActionError(err as Error)
      }
    })()
    return () => {
      active = false
    }
  }, [resumeDatasetId])

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('Choose a CSV, XLSX, XLS, or JSON file first.')
      return uploadEnterpriseDataset(selectedFile, {
        datasetName: datasetName.trim() || undefined,
      })
    },
    onSuccess: (res) => {
      setActionError(null)
      setImportSuccess(null)
      setConfirmImport(false)
      setQualityReport(null)
      setDatasetId(res.dataset.dataset_id)
      setFileFormat(res.dataset.file_format || 'csv')
      setColumns(res.preview.columns)
      setPreviewRows(res.preview.rows)
      setTotalRows(res.preview.total_rows)
      setSheets(res.preview.sheets || [])
      setSelectedSheet(res.preview.selected_sheet)
      setParseWarnings(res.preview.parse_warnings || [])
      setSuggestionsBundle(res.mapping_suggestions)
      setMappings(res.mapping_suggestions.suggested_mapping)
      setStep(2)
      void queryClient.invalidateQueries({ queryKey: ['enterprise-datasets', companyId] })
      notify({
        tone: 'success',
        title: 'File uploaded & profiled',
        description: `${res.preview.total_rows} row(s) detected across ${res.preview.columns.length} columns.`,
      })
    },
    onError: (err) => setActionError(err as Error),
  })

  const switchSheetMutation = useMutation({
    mutationFn: async (nextSheet: string) => {
      if (!datasetId) throw new Error('Upload a workbook first.')
      return previewEnterpriseDataset(datasetId, { sheet_name: nextSheet, limit: 25 })
    },
    onSuccess: (prev) => {
      setActionError(null)
      setColumns(prev.columns)
      setPreviewRows(prev.rows)
      setTotalRows(prev.total_rows)
      setSelectedSheet(prev.selected_sheet)
      setParseWarnings(prev.parse_warnings || [])
      setSuggestionsBundle(prev.mapping_suggestions)
      setMappings(prev.mapping_suggestions.suggested_mapping)
    },
    onError: (err) => setActionError(err as Error),
  })

  const validateMutation = useMutation({
    mutationFn: async (opts?: { saveMap?: boolean }) => {
      if (!datasetId) throw new Error('No dataset selected.')
      const customFields = Object.values(mappings)
        .filter((v) => v.startsWith('custom:'))
        .map((v) => v.slice('custom:'.length))

      if (opts?.saveMap !== false) {
        await saveDatasetMapping(datasetId, {
          mappings,
          custom_fields: customFields,
          sheet_name: selectedSheet || undefined,
          currency: currency || undefined,
          confirmed: true,
          save_template: saveAsTemplate,
          template_name: saveAsTemplate ? templateName.trim() || `${datasetName || fileFormat.toUpperCase()} Template` : undefined,
        })
      }

      return validateEnterpriseDataset(datasetId, {
        sheet_name: selectedSheet || undefined,
        mappings,
        custom_fields: customFields,
        invalid_row_policy: invalidPolicy,
        duplicate_policy: duplicatePolicy,
        currency: currency || undefined,
      })
    },
    onSuccess: (res) => {
      setActionError(null)
      setQualityReport(res.quality_report)
      setCurrency(res.quality_report.detected_currency || currency || 'USD')
      setConfirmImport(false)
      setStep(4)
      void queryClient.invalidateQueries({ queryKey: ['enterprise-datasets', companyId] })
      void queryClient.invalidateQueries({ queryKey: ['mapping-templates', companyId] })
    },
    onError: (err) => setActionError(err as Error),
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!datasetId) throw new Error('No dataset selected.')
      if (!confirmImport) throw new Error('Explicit user confirmation is required before importing.')
      return importEnterpriseDataset(datasetId, {
        confirmed: true,
        sheet_name: selectedSheet || undefined,
        invalid_row_policy: invalidPolicy,
        duplicate_policy: duplicatePolicy,
        currency: currency || undefined,
        activate: true,
      })
    },
    onSuccess: async (res) => {
      setActionError(null)
      setImportSuccess(res)
      onClearResume?.()
      notify({
        tone: 'success',
        title: 'Enterprise dataset imported & activated',
        description: `${res.imported_counts.sales_transactions ?? 0} validated records active in ${res.dataset.currency || currency}.`,
      })
      await queryClient.invalidateQueries({ queryKey: ['enterprise-datasets', companyId] })
      await queryClient.invalidateQueries({ queryKey: ['companies'] })
      await queryClient.invalidateQueries({ queryKey: ['dataset'] })
      await queryClient.invalidateQueries({ queryKey: ['options'] })
      await queryClient.invalidateQueries({ queryKey: ['health'] })
      onImported?.(res)
    },
    onError: (err) => setActionError(err as Error),
  })

  const caps = useMemo(() => computeCapabilitiesLocal(mappings), [mappings])
  const hasRequiredMappings = useMemo(() => {
    const vals = new Set(Object.values(mappings))
    return vals.has('date') && vals.has('revenue')
  }, [mappings])

  const isViewerOnly = session.role === 'viewer'
  const suggestionMap = useMemo(() => {
    const map = new Map<string, { confidence: number; reason: string; inferred_type: string; sample_values: unknown[] }>()
    for (const s of suggestionsBundle?.suggestions || []) {
      map.set(s.source_column, s)
    }
    return map
  }, [suggestionsBundle])

  const previewTableCols = useMemo(
    () =>
      columns.slice(0, 12).map((col) => ({
        key: col,
        title: col,
      })),
    [columns]
  )

  const handleDownloadErrors = async (fmt: 'csv' | 'json') => {
    if (!datasetId) return
    setActionError(null)
    setDownloadingFmt(fmt)
    try {
      await downloadErrorReport(datasetId, fmt)
    } catch (err) {
      setActionError(err as Error)
    } finally {
      setDownloadingFmt(null)
    }
  }

  const applySavedTemplate = (tplId: string) => {
    const tpl =
      templatesQuery.data?.items.find((x) => x.id === tplId) ||
      suggestionsBundle?.matched_templates.find((x) => x.id === tplId)
    if (!tpl) return
    const next: Record<string, string> = {}
    for (const col of columns) {
      next[col] = tpl.mappings[col] || mappings[col] || '__ignore__'
    }
    setMappings(next)
    notify({ tone: 'info', title: 'Mapping template applied', description: tpl.name })
  }

  const steps: { id: WizardStep; title: string }[] = [
    { id: 1, title: t('Upload File') },
    { id: 2, title: t('Preview Data') },
    { id: 3, title: t('Column Mapping') },
    { id: 4, title: t('Quality & Import') },
  ]

  return (
    <Card className="space-y-5">
      <SectionTitle
        title="Enterprise Data Ingestion Pipeline"
        detail="Upload business files (CSV, XLSX, XLS, JSON), preview rows, verify AI column mappings, inspect 5-axis data quality, and import after explicit confirmation."
        aside={
          <div className="flex items-center gap-2">
            <Pill tone="accent">CSV · XLSX · XLS · JSON</Pill>
            {datasetId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setStep(1)
                  setSelectedFile(null)
                  setDatasetId(null)
                  setQualityReport(null)
                  setImportSuccess(null)
                  setConfirmImport(false)
                  onClearResume?.()
                }}
              >
                New Upload
              </Button>
            )}
          </div>
        }
      />

      {/* 4-Step Pipeline Indicator */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" aria-label="Ingestion workflow steps">
        {steps.map((s) => {
          const isCurrent = step === s.id
          const isReachable =
            s.id === 1 ||
            (s.id === 2 && !!datasetId) ||
            (s.id === 3 && !!datasetId) ||
            (s.id === 4 && !!qualityReport)
          return (
            <button
              key={s.id}
              type="button"
              disabled={!isReachable}
              onClick={() => isReachable && setStep(s.id)}
              style={{
                background: isCurrent ? 'var(--primary-soft)' : 'var(--surface-muted)',
                borderColor: isCurrent ? 'var(--primary)' : 'var(--border)',
                color: isCurrent ? 'var(--primary-text)' : 'var(--heading)',
              }}
              className="rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {s.title}
            </button>
          )
        })}
      </div>

      {isViewerOnly && (
        <div
          className="rounded-lg border px-3.5 py-2.5 text-xs"
          style={{
            background: 'var(--warning-bg)',
            borderColor: 'var(--warning-border)',
            color: 'var(--warning-text)',
          }}
        >
          Your current role is <strong>viewer</strong>. Sign in as an <strong>analyst</strong> or <strong>admin</strong> to upload, map, or confirm dataset imports.
        </div>
      )}

      <ErrorState error={actionError} />

      {/* STEP 1: FILE UPLOAD */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="dp-field">
              <span className="dp-field-label">Dataset Name (Optional)</span>
              <input
                type="text"
                placeholder="e.g. Q2 Retail Transactions"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                disabled={isViewerOnly || uploadMutation.isPending}
                className="dp-input"
              />
            </label>
            <div className="dp-field">
              <span className="dp-field-label">Supported Business Formats</span>
              <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                UTF-8/Latin CSV, Multi-sheet Excel (.xlsx/.xls), Array or NDJSON (.json) · Max 40 MiB
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            aria-label="Enterprise dataset file"
            accept=".csv,.xlsx,.xls,.json"
            disabled={isViewerOnly || uploadMutation.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0] || null
              setSelectedFile(f)
              setActionError(null)
              if (f && !datasetName.trim()) setDatasetName(f.name.replace(/\.[^.]+$/, ''))
            }}
            className="block w-full text-xs"
            style={{ color: 'var(--text-secondary)' }}
          />

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (isViewerOnly || uploadMutation.isPending) return
              const f = e.dataTransfer.files[0] || null
              setSelectedFile(f)
              setActionError(null)
              if (f && !datasetName.trim()) setDatasetName(f.name.replace(/\.[^.]+$/, ''))
            }}
            onClick={() => !isViewerOnly && fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-[var(--primary)]"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border-strong)' }}
          >
            <UploadCloud className="mx-auto mb-2" size={28} style={{ color: 'var(--primary)' }} />
            <div className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
              {t('Drag and drop CSV, XLSX, XLS, or JSON here')}
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              {selectedFile
                ? `Selected: ${selectedFile.name} · ${integer(selectedFile.size)} bytes`
                : 'Files are virus/magic-byte validated and stored isolated per company tenant.'}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={!selectedFile || isViewerOnly || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
            >
              <FileSpreadsheet size={15} />
              <span>{uploadMutation.isPending ? 'Uploading & Profiling…' : 'Upload & Preview File'}</span>
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: DATA PREVIEW */}
      {step === 2 && datasetId && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill tone="accent">{fileFormat.toUpperCase()}</Pill>
              <Pill tone="muted">{integer(totalRows)} rows</Pill>
              <Pill tone="muted">{columns.length} columns</Pill>
              {sheets.length > 0 && (
                <label className="inline-flex items-center gap-1.5 ml-2">
                  <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Sheet:
                  </span>
                  <select
                    aria-label="Worksheet selector"
                    value={selectedSheet || sheets[0]}
                    disabled={switchSheetMutation.isPending}
                    onChange={(e) => switchSheetMutation.mutate(e.target.value)}
                    className="dp-select py-1 text-xs"
                  >
                    {sheets.map((sh) => (
                      <option key={sh} value={sh}>
                        {sh}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft size={14} />
                <span>Back</span>
              </Button>
              <Button variant="primary" onClick={() => setStep(3)}>
                <span>Continue to AI Column Mapping</span>
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>

          {parseWarnings.length > 0 && (
            <div
              className="rounded-lg border p-3 text-xs space-y-1"
              style={{
                background: 'var(--warning-bg)',
                borderColor: 'var(--warning-border)',
                color: 'var(--warning-text)',
              }}
            >
              {parseWarnings.map((w, idx) => (
                <div key={idx}>{w}</div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table pageSize={10} rows={previewRows.slice(0, 25)} columns={previewTableCols} />
          </div>
        </div>
      )}

      {/* STEP 3: AI-ASSISTED COLUMN MAPPING */}
      {step === 3 && datasetId && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="dp-field">
              <span className="dp-field-label">Dataset Currency</span>
              <select
                aria-label="Dataset Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="dp-select"
              >
                <option value="">Auto-detect from file values</option>
                <option value="USD">USD ($)</option>
                <option value="VND">VND (₫)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </label>

            <label className="dp-field">
              <span className="dp-field-label">Reuse Company Mapping Template</span>
              <select
                aria-label="Reuse Mapping Template"
                defaultValue=""
                onChange={(e) => e.target.value && applySavedTemplate(e.target.value)}
                className="dp-select"
              >
                <option value="">Select saved template…</option>
                {(templatesQuery.data?.items || []).map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="dp-field">
              <span className="dp-field-label">Unlocked BI Capabilities Preview</span>
              <div className="flex flex-wrap gap-1 pt-1">
                <Pill tone={caps.dashboard ? 'success' : 'muted'}>Dashboard</Pill>
                <Pill tone={caps.forecast ? 'success' : 'muted'}>Forecast</Pill>
                <Pill tone={caps.priceSim ? 'success' : 'muted'}>Price Sim</Pill>
                <Pill tone={caps.marketingSim ? 'success' : 'muted'}>Marketing</Pill>
                <Pill tone={caps.inventorySim ? 'success' : 'muted'}>Inventory</Pill>
              </div>
            </div>
          </div>

          {/* Column Mapping Grid */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div
              className="grid grid-cols-12 gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide border-b"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <div className="col-span-4">Source Column &amp; Samples</div>
              <div className="col-span-3">AI Suggestion Confidence</div>
              <div className="col-span-5">Target Business Field</div>
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {columns.map((col) => {
                const currentTarget = mappings[col] || '__ignore__'
                const isCustom = currentTarget.startsWith('custom:')
                const sug = suggestionMap.get(col)
                const confPct = Math.round((sug?.confidence || 0) * 100)
                const selectVal = isCustom ? '__custom__' : currentTarget

                return (
                  <div key={col} className="grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 items-center text-xs">
                    <div className="md:col-span-4 min-w-0 space-y-0.5">
                      <div className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
                        {col}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                        Type: {sug?.inferred_type || 'string'} · Samples:{' '}
                        {(sug?.sample_values || []).slice(0, 2).join(', ') || '—'}
                      </div>
                    </div>

                    <div className="md:col-span-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={12} style={{ color: confPct >= 75 ? 'var(--primary)' : 'var(--text-muted)' }} />
                        <Pill tone={confPct >= 85 ? 'success' : confPct >= 55 ? 'accent' : 'muted'}>
                          {confPct > 0 ? `${confPct}% Match` : 'Manual'}
                        </Pill>
                      </div>
                      {sug?.reason && (
                        <div className="text-[11px] truncate" title={sug.reason} style={{ color: 'var(--text-secondary)' }}>
                          {sug.reason}
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-5 flex flex-col sm:flex-row gap-2">
                      <select
                        aria-label={`Map column ${col}`}
                        value={selectVal}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === '__custom__') {
                            setMappings((prev) => ({ ...prev, [col]: `custom:${safeCustomSlug(col)}` }))
                          } else {
                            setMappings((prev) => ({ ...prev, [col]: v }))
                          }
                        }}
                        className="dp-select flex-1"
                      >
                        {CANONICAL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                        <option value="__custom__">+ Custom field…</option>
                      </select>

                      {isCustom && (
                        <input
                          type="text"
                          aria-label={`Custom field name for ${col}`}
                          value={currentTarget.slice('custom:'.length)}
                          onChange={(e) =>
                            setMappings((prev) => ({
                              ...prev,
                              [col]: `custom:${e.target.value.replace(/\s+/g, '_')}`,
                            }))
                          }
                          placeholder="custom_field_key"
                          className="dp-input w-full sm:w-40 text-xs"
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {!hasRequiredMappings && (
            <div
              className="rounded-lg border px-3.5 py-2.5 text-xs flex items-center gap-2"
              style={{
                background: 'var(--danger-bg)',
                borderColor: 'var(--danger-border)',
                color: 'var(--danger-text)',
              }}
            >
              <AlertTriangle size={15} />
              <span>
                Please map both <strong>Date / Transaction Date</strong> and <strong>Revenue / Sales Amount</strong> before running quality checks.
              </span>
            </div>
          )}

          {/* Save Template Switch (role="switch" avoids colliding with legacy import.test checkbox count) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={saveAsTemplate}
                onClick={() => setSaveAsTemplate((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{
                  background: saveAsTemplate ? 'var(--primary-soft)' : 'var(--surface)',
                  borderColor: saveAsTemplate ? 'var(--primary)' : 'var(--border)',
                  color: saveAsTemplate ? 'var(--primary-text)' : 'var(--text)',
                }}
              >
                <Layers size={13} />
                <span>{t('Save Mapping Template')}: {saveAsTemplate ? 'ON' : 'OFF'}</span>
              </button>

              {saveAsTemplate && (
                <input
                  type="text"
                  aria-label="Template Name"
                  placeholder="Template Name (e.g. POS Export v2)"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="dp-input text-xs w-56"
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                <ArrowLeft size={14} />
                <span>Back to Preview</span>
              </Button>
              <Button
                variant="primary"
                disabled={!hasRequiredMappings || isViewerOnly || validateMutation.isPending}
                onClick={() => validateMutation.mutate({ saveMap: true })}
              >
                <ShieldCheck size={14} />
                <span>{validateMutation.isPending ? 'Validating Data Quality…' : 'Save Mapping & Run Quality Engine'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: 5-AXIS QUALITY REPORT, CLEANING RULES & CONFIRMED IMPORT */}
      {step === 4 && datasetId && qualityReport && (
        <div className="space-y-5">
          {/* Quality Scorecard */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {[
              { label: 'Overall Quality', val: qualityReport.overall_score, primary: true },
              { label: t('Completeness'), val: qualityReport.dimensions.completeness },
              { label: t('Validity'), val: qualityReport.dimensions.validity },
              { label: t('Consistency'), val: qualityReport.dimensions.consistency },
              { label: t('Uniqueness'), val: qualityReport.dimensions.uniqueness },
              { label: t('Accuracy'), val: qualityReport.dimensions.accuracy },
            ].map((axis) => (
              <div
                key={axis.label}
                className="rounded-xl border p-3 space-y-1.5"
                style={{
                  background: axis.primary ? 'var(--primary-soft)' : 'var(--surface-muted)',
                  borderColor: axis.primary ? 'var(--primary-border)' : 'var(--border)',
                }}
              >
                <div className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {axis.label}
                </div>
                <div
                  className="text-lg font-bold tabular-nums"
                  style={{
                    color:
                      axis.val >= 90
                        ? 'var(--success-text)'
                        : axis.val >= 75
                        ? 'var(--warning-text)'
                        : 'var(--danger-text)',
                  }}
                >
                  {axis.val.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>

          {/* Row Breakdown Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Total Rows</span>
              <strong className="block text-base font-bold tabular-nums">{integer(qualityReport.total_rows)}</strong>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Valid Rows</span>
              <strong className="block text-base font-bold tabular-nums" style={{ color: 'var(--success-text)' }}>
                {integer(qualityReport.valid_rows)}
              </strong>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Invalid Rows</span>
              <strong
                className="block text-base font-bold tabular-nums"
                style={{ color: qualityReport.invalid_rows > 0 ? 'var(--danger-text)' : 'var(--heading)' }}
              >
                {integer(qualityReport.invalid_rows)}
              </strong>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Duplicate Records</span>
              <strong className="block text-base font-bold tabular-nums">{integer(qualityReport.duplicate_records)}</strong>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Detected Currency</span>
              <strong className="block text-base font-bold">{qualityReport.detected_currency || currency || 'USD'}</strong>
            </div>
          </div>

          {/* Import Warnings + Error Report Download */}
          {qualityReport.warnings.length > 0 && (
            <div
              className="rounded-xl border p-4 space-y-2 text-xs"
              style={{
                background: 'var(--warning-bg)',
                borderColor: 'var(--warning-border)',
                color: 'var(--warning-text)',
              }}
            >
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>Data Quality Inspection Warnings</span>
              </div>
              <ul className="list-disc list-inside space-y-1">
                {qualityReport.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              No malformed records are silently deleted. Download the itemized error report or review sample diagnostics below.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={downloadingFmt !== null}
                onClick={() => void handleDownloadErrors('csv')}
              >
                <Download size={13} />
                <span>{downloadingFmt === 'csv' ? 'Downloading…' : t('Download Error Report (CSV)')}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={downloadingFmt !== null}
                onClick={() => void handleDownloadErrors('json')}
              >
                <Download size={13} />
                <span>{downloadingFmt === 'json' ? 'Downloading…' : t('Download Error Report (JSON)')}</span>
              </Button>
            </div>
          </div>

          {qualityReport.sample_errors.length > 0 && (
            <details className="rounded-xl border p-3.5 text-xs" style={{ borderColor: 'var(--border)' }} open>
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--heading)' }}>
                Flagged Row Diagnostics ({qualityReport.sample_errors.length} sample issues shown)
              </summary>
              <div className="pt-3">
                <Table
                  pageSize={6}
                  rows={qualityReport.sample_errors.slice(0, 18)}
                  columns={[
                    { key: 'row_number', title: 'Row #', format: integer, align: 'right' },
                    { key: 'column', title: 'Column' },
                    { key: 'issue_code', title: 'Issue Type' },
                    { key: 'raw_value', title: 'Raw Value' },
                    { key: 'message', title: 'Details' },
                  ]}
                />
              </div>
            </details>
          )}

          <details className="rounded-xl border p-3.5 text-xs" style={{ borderColor: 'var(--border)' }}>
            <summary className="cursor-pointer font-semibold" style={{ color: 'var(--heading)' }}>
              Column-Level Quality Breakdown ({qualityReport.column_quality.length} columns)
            </summary>
            <div className="pt-3">
              <Table
                pageSize={10}
                rows={qualityReport.column_quality.map((c) => ({
                  column: c.column,
                  mapped_to: c.mapped_to,
                  completeness_pct: c.completeness_pct,
                  validity_pct: c.validity_pct,
                  missing_values: c.missing_values,
                  invalid_values: c.invalid_values,
                }))}
                columns={[
                  { key: 'column', title: 'Column' },
                  { key: 'mapped_to', title: 'Target Field' },
                  { key: 'completeness_pct', title: 'Completeness %', align: 'right' },
                  { key: 'validity_pct', title: 'Validity %', align: 'right' },
                  { key: 'missing_values', title: 'Missing', format: integer, align: 'right' },
                  { key: 'invalid_values', title: 'Invalid', format: integer, align: 'right' },
                ]}
              />
            </div>
          </details>

          {/* Explicit Cleaning Policy Controls */}
          <div
            className="rounded-xl border p-4 space-y-3"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--heading)' }}>
                Explicit Data Cleaning &amp; Import Policy
              </span>
              {qualityReport.cleaning_summary && (
                <Pill tone="accent">
                  Ready to import: {integer(qualityReport.cleaning_summary.ready_to_import_rows)} row(s)
                </Pill>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <label className="dp-field">
                <span className="dp-field-label">Invalid Row Policy</span>
                <select
                  aria-label="Invalid Row Policy"
                  value={invalidPolicy}
                  onChange={(e) => setInvalidPolicy(e.target.value as 'skip_invalid' | 'fail_on_error')}
                  className="dp-select"
                >
                  <option value="skip_invalid">Skip invalid rows (retain audit &amp; error report)</option>
                  <option value="fail_on_error">Reject import if any invalid row exists</option>
                </select>
              </label>

              <label className="dp-field">
                <span className="dp-field-label">Duplicate Handling</span>
                <select
                  aria-label="Duplicate Handling"
                  value={duplicatePolicy}
                  onChange={(e) => setDuplicatePolicy(e.target.value as 'keep_all' | 'deduplicate')}
                  className="dp-select"
                >
                  <option value="keep_all">Keep all duplicate rows</option>
                  <option value="deduplicate">Deduplicate exact duplicate records</option>
                </select>
              </label>

              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={validateMutation.isPending}
                  onClick={() => validateMutation.mutate({ saveMap: false })}
                >
                  <RefreshCw size={13} />
                  <span>{validateMutation.isPending ? 'Re-validating…' : 'Re-validate Policies'}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Mandatory Explicit Confirmation & Final Import CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={confirmImport}
              onClick={() => setConfirmImport((prev) => !prev)}
              className="inline-flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-xs font-medium text-left"
              style={{
                background: confirmImport ? 'var(--success-bg)' : 'var(--surface)',
                borderColor: confirmImport ? 'var(--success)' : 'var(--border-strong)',
                color: confirmImport ? 'var(--success-text)' : 'var(--heading)',
              }}
            >
              <CheckCircle2 size={15} />
              <span>
                I confirm these quality checks and cleaning policies to import into the company analytics store:{' '}
                <strong>{confirmImport ? 'CONFIRMED' : 'PENDING'}</strong>
              </span>
            </button>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setStep(3)}>
                <ArrowLeft size={14} />
                <span>Adjust Mapping</span>
              </Button>
              <Button
                variant="primary"
                disabled={!confirmImport || isViewerOnly || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                <ShieldCheck size={14} />
                <span>{importMutation.isPending ? 'Importing & Training Model…' : t('Confirm & Import Dataset')}</span>
              </Button>
            </div>
          </div>

          {importSuccess && (
            <div
              role="status"
              className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              style={{
                background: 'var(--success-bg)',
                borderColor: 'var(--success-border)',
                color: 'var(--success-text)',
              }}
            >
              <div className="space-y-0.5">
                <div className="font-bold">
                  Import Complete — Active Dataset: {importSuccess.dataset.name}
                </div>
                <div>
                  Transactions: {integer(importSuccess.imported_counts.sales_transactions)} · Products:{' '}
                  {integer(importSuccess.imported_counts.products)} · Currency: {importSuccess.dataset.currency} · Forecast Model:{' '}
                  {importSuccess.model_ready ? 'Ready' : 'Descriptive BI Only'}
                </div>
              </div>
              <Pill tone="success">ACTIVE IN WORKSPACE</Pill>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
