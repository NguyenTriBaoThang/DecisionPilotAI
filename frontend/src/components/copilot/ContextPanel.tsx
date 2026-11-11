import { useState } from 'react'
import {
  BookOpen,
  Brain,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import type {
  CompanyMemoryItem,
  CopilotCitation,
  CopilotSQLTrace,
  CopilotToolTrace,
  RagChunkDetail,
  RagDocument,
  RagHealth,
} from '../../api'
import { Button, StatusBadge } from '../../ui'

export type ContextTab = 'citations' | 'knowledge' | 'memory'

type Props = {
  tab: ContextTab
  onTabChange: (t: ContextTab) => void
  citations: CopilotCitation[]
  highlightedCitationId: string | null
  sqlTrace?: CopilotSQLTrace | null
  toolTrace?: CopilotToolTrace | null
  documents: RagDocument[]
  memories: CompanyMemoryItem[]
  sessionContext: Record<string, unknown>
  memorySummary: string
  ragHealth?: RagHealth
  onUploadFile: (file: File) => void
  onDeleteDocument: (docId: string) => void
  onInspectDocument: (docId: string) => Promise<{ document: RagDocument; chunks: RagChunkDetail[] }>
  onReindexDataset: () => void
  onSearchRag: (q: string) => Promise<CopilotCitation[]>
  onUpsertMemory: (key: string, content: string, type: 'business_context' | 'preference' | 'kpi_definition' | 'policy') => void
  onDeleteMemory: (id: string) => void
  uploadingDoc?: boolean
  canEdit?: boolean
  isVi: boolean
}

export function ContextPanel({
  tab,
  onTabChange,
  citations,
  highlightedCitationId,
  sqlTrace,
  toolTrace,
  documents,
  memories,
  sessionContext,
  memorySummary,
  ragHealth,
  onUploadFile,
  onDeleteDocument,
  onInspectDocument,
  onReindexDataset,
  onSearchRag,
  onUpsertMemory,
  onDeleteMemory,
  uploadingDoc,
  canEdit = true,
  isVi,
}: Props) {
  const [inspectBundle, setInspectBundle] = useState<{ document: RagDocument; chunks: RagChunkDetail[] } | null>(null)
  const [probeQuery, setProbeQuery] = useState('')
  const [probeHits, setProbeHits] = useState<CopilotCitation[] | null>(null)
  const [probeLoading, setProbeLoading] = useState(false)

  const [memKey, setMemKey] = useState('')
  const [memContent, setMemContent] = useState('')
  const [memType, setMemType] = useState<'business_context' | 'preference' | 'kpi_definition' | 'policy'>('business_context')

  const handleInspect = async (docId: string) => {
    const bundle = await onInspectDocument(docId)
    setInspectBundle(bundle)
  }

  const handleProbe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!probeQuery.trim()) return
    setProbeLoading(true)
    try {
      const hits = await onSearchRag(probeQuery.trim())
      setProbeHits(hits)
    } finally {
      setProbeLoading(false)
    }
  }

  const tabs: Array<{ id: ContextTab; label: string; icon: typeof BookOpen; badge?: number }> = [
    { id: 'citations', label: isVi ? 'Trích dẫn' : 'Citations', icon: BookOpen, badge: citations.length },
    { id: 'knowledge', label: isVi ? 'Kho tri thức' : 'Knowledge', icon: Layers, badge: documents.length },
    { id: 'memory', label: isVi ? 'Bộ nhớ & SQL' : 'Memory & SQL', icon: Brain, badge: memories.length },
  ]

  return (
    <aside
      className="dp-surface p-3.5 flex flex-col gap-3 h-full lg:min-h-[680px]"
      aria-label={isVi ? 'Bảng ngữ cảnh và kho tri thức RAG' : 'RAG Context & Memory Panel'}
    >
      {/* Tabs */}
      <div
        className="grid grid-cols-3 gap-1 p-1 rounded-xl border"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        role="tablist"
      >
        {tabs.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(item.id)}
              className="flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors"
              style={{
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--primary-text)' : 'var(--text-secondary)',
                boxShadow: active ? 'var(--shadow-xs)' : 'none',
              }}
            >
              <Icon size={12} />
              <span className="truncate">{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  className="rounded-full px-1.5 text-[10px]"
                  style={{
                    background: active ? 'var(--primary-soft)' : 'var(--border)',
                    color: active ? 'var(--primary-text)' : 'var(--heading)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab 1: Citations & Quick Hybrid Search */}
      {tab === 'citations' && (
        <div className="flex-1 overflow-y-auto space-y-3 max-h-[590px] pr-0.5">
          <form onSubmit={handleProbe} className="flex gap-1.5">
            <div className="relative flex-1">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                value={probeQuery}
                onChange={(e) => setProbeQuery(e.target.value)}
                placeholder={isVi ? 'Tìm trực tiếp trong RAG…' : 'Search RAG index directly…'}
                className="dp-input w-full h-8 pl-7 pr-2 text-xs"
              />
            </div>
            <Button type="submit" size="sm" disabled={probeLoading || !probeQuery.trim()}>
              {probeLoading ? '…' : isVi ? 'Tìm' : 'Search'}
            </Button>
          </form>

          {probeHits && (
            <div className="space-y-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--primary-text)' }}>
                <span>{isVi ? `Kết quả tìm kiếm (${probeHits.length})` : `Direct Search (${probeHits.length})`}</span>
                <button type="button" onClick={() => setProbeHits(null)} className="underline">
                  {isVi ? 'Đóng' : 'Clear'}
                </button>
              </div>
              {probeHits.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {isVi ? 'Không tìm thấy đoạn văn bản vượt ngưỡng liên quan.' : 'No passages exceeded relevance threshold.'}
                </p>
              ) : (
                probeHits.map((h) => (
                  <div
                    key={h.chunk_id}
                    className="rounded-lg border p-2.5 text-xs space-y-1"
                    style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold" style={{ color: 'var(--heading)' }}>
                      <span className="truncate">{h.source_file}</span>
                      <StatusBadge tone="accent">rerank {(h.scores?.rerank ?? 0).toFixed(2)}</StatusBadge>
                    </div>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {h.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {citations.length === 0 ? (
            <div className="text-center py-8 px-3 space-y-2">
              <FileText size={20} className="mx-auto" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {isVi
                  ? 'Các trích dẫn nguồn [C1], [C2]… và điểm xếp hạng Dense/BM25/Rerank cho câu trả lời đang chọn sẽ hiển thị tại đây.'
                  : 'Verified source passages [C1], [C2]… and Dense / BM25 / Rerank scores for the active reply appear here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {citations.map((c) => {
                const highlighted = highlightedCitationId === c.citation_id
                return (
                  <div
                    key={`${c.citation_id}-${c.chunk_id}`}
                    className="rounded-xl border p-3 space-y-1.5 transition-colors"
                    style={{
                      background: highlighted ? 'var(--primary-soft)' : 'var(--surface)',
                      borderColor: highlighted ? 'var(--primary)' : 'var(--border)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <StatusBadge tone="accent">{c.citation_id}</StatusBadge>
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--heading)' }} title={c.source_file}>
                          {c.source_file}
                        </span>
                      </div>
                      <StatusBadge tone="muted">{c.document_type}</StatusBadge>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      {c.page_number != null && <span>p.{c.page_number}</span>}
                      {c.section && <span className="truncate max-w-[160px]">· {c.section}</span>}
                      <span>· domain: {c.domain}</span>
                    </div>

                    <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                      {c.content}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                      <span>
                        dense={(c.scores?.dense ?? 0).toFixed(2)} · bm25={(c.scores?.bm25 ?? 0).toFixed(2)} · rerank={(c.scores?.rerank ?? 0).toFixed(2)}
                      </span>
                      {c.source_url && (
                        <a
                          href={c.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-sans font-semibold underline"
                          style={{ color: 'var(--primary-text)' }}
                        >
                          <span>{isVi ? 'Xem file' : 'Source'}</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Knowledge Base Docs & Upload */}
      {tab === 'knowledge' && (
        <div className="flex-1 overflow-y-auto space-y-3 max-h-[590px] pr-0.5">
          {canEdit && (
            <div className="flex items-center gap-2">
              <label
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold cursor-pointer hover:bg-[var(--surface-muted)] transition-colors"
                style={{ borderColor: 'var(--primary-border)', background: 'var(--primary-soft)', color: 'var(--primary-text)' }}
              >
                <Upload size={13} />
                <span>{uploadingDoc ? (isVi ? 'Đang nạp RAG…' : 'Indexing…') : isVi ? 'Nạp tài liệu RAG' : 'Ingest RAG Doc'}</span>
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadingDoc}
                  accept=".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.xls,.json,.xml,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.mp4,.mov,.avi"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onUploadFile(f)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <Button size="sm" onClick={onReindexDataset} title="Sync active dataset summary into RAG">
                <RefreshCw size={12} />
                <span>{isVi ? 'Đồng bộ' : 'Sync'}</span>
              </Button>
            </div>
          )}

          {ragHealth && (
            <div
              className="rounded-lg border px-2.5 py-2 text-[11px] flex flex-wrap items-center justify-between gap-1.5"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <span>
                {ragHealth.documents_indexed} {isVi ? 'tài liệu' : 'docs'} · {ragHealth.chunks_indexed} chunks
              </span>
              <span className="font-mono text-[10px]">
                {ragHealth.embedding_provider} ({ragHealth.embedding_dim}d)
              </span>
            </div>
          )}

          {inspectBundle && (
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--primary-border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--heading)' }}>
                  {inspectBundle.document.file_name} ({inspectBundle.chunks.length} chunks)
                </div>
                <button type="button" onClick={() => setInspectBundle(null)} className="text-xs underline">
                  {isVi ? 'Đóng' : 'Close'}
                </button>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {inspectBundle.chunks.map((ch) => (
                  <div
                    key={ch.id}
                    className="rounded border p-2 text-[11px] space-y-0.5"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                  >
                    <div className="font-mono text-[10px]" style={{ color: 'var(--primary-text)' }}>
                      #{ch.chunk_index} · {ch.chunking_strategy} · {ch.token_count} tok
                      {ch.page_number ? ` · p.${ch.page_number}` : ''}
                    </div>
                    <p style={{ color: 'var(--text)' }}>{ch.content.slice(0, 260)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                {isVi
                  ? 'Chưa có tài liệu nào được lập chỉ mục trong không gian này.'
                  : 'No RAG documents indexed in this company workspace yet.'}
              </p>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-xl border p-2.5 space-y-1.5"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: 'var(--heading)' }} title={doc.file_name}>
                        {doc.file_name}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {doc.document_type} · {doc.domain} · {doc.chunk_count} chunks
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleInspect(doc.id)}
                        className="p-1 rounded hover:bg-[var(--surface-muted)]"
                        style={{ color: 'var(--primary-text)' }}
                        aria-label={`Inspect ${doc.file_name}`}
                      >
                        <Eye size={13} />
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => onDeleteDocument(doc.id)}
                          className="p-1 rounded hover:bg-[var(--danger-bg)]"
                          style={{ color: 'var(--danger-text)' }}
                          aria-label={`Delete ${doc.file_name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: 3-Layer Memory & Executed SQL Diagnostics */}
      {tab === 'memory' && (
        <div className="flex-1 overflow-y-auto space-y-3.5 max-h-[590px] pr-0.5 text-xs">
          {/* Active Turn SQL Trace */}
          {sqlTrace && (
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--heading)' }}>
                  <Database size={13} style={{ color: 'var(--primary)' }} />
                  <span>{isVi ? 'Truy vấn SQL đã chạy' : 'Executed SQL Trace'}</span>
                </span>
                {sqlTrace.blocked ? (
                  <StatusBadge tone="danger">BLOCKED</StatusBadge>
                ) : sqlTrace.read_only_verified ? (
                  <StatusBadge tone="success">
                    <ShieldCheck size={11} />
                    <span>READ-ONLY</span>
                  </StatusBadge>
                ) : null}
              </div>
              {sqlTrace.sql && (
                <pre
                  className="p-2 rounded border text-[10px] font-mono overflow-x-auto leading-relaxed"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--heading)' }}
                >
                  {sqlTrace.sql}
                </pre>
              )}
              <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                tables: {(sqlTrace.scoped_tables || []).join(', ') || '—'} · rows={sqlTrace.row_count ?? 0} · {sqlTrace.execution_ms ?? 0}ms
              </div>
            </div>
          )}

          {/* Tool Latency & Retrieval Telemetry */}
          {toolTrace && (
            <div
              className="rounded-xl border p-3 space-y-1.5"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="font-semibold" style={{ color: 'var(--heading)' }}>
                {isVi ? 'Telemetry suy luận' : 'Execution Telemetry'} ({toolTrace.intent})
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Total: {toolTrace.total_ms ?? 0}ms · Synth: {toolTrace.synthesis_ms ?? 0}ms
              </div>
              {(toolTrace.tools_executed || []).map((t, idx) => (
                <div key={idx} className="text-[11px] flex items-center justify-between gap-2">
                  <span className="font-mono" style={{ color: 'var(--primary-text)' }}>
                    {t.tool}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{t.latency_ms}ms</span>
                </div>
              ))}
            </div>
          )}

          {/* Layer 2 Session Context & Rolling Summary */}
          <div className="rounded-xl border p-3 space-y-1.5" style={{ borderColor: 'var(--border)' }}>
            <div className="font-semibold" style={{ color: 'var(--heading)' }}>
              {isVi ? 'Ngữ cảnh phiên (Layer 1 & 2)' : 'Session Entity Context (Layer 1 & 2)'}
            </div>
            <pre
              className="text-[10px] font-mono rounded p-2 overflow-x-auto border"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {JSON.stringify(sessionContext || {}, null, 2)}
            </pre>
            {memorySummary && (
              <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--heading)' }}>{isVi ? 'Tóm tắt lượt cũ:' : 'Rolling Summary:'}</strong> {memorySummary}
              </div>
            )}
          </div>

          {/* Layer 3 Persistent Company Memories */}
          <div className="rounded-xl border p-3 space-y-2.5" style={{ borderColor: 'var(--border)' }}>
            <div className="font-semibold" style={{ color: 'var(--heading)' }}>
              {isVi ? 'Tri thức ghi nhớ Doanh nghiệp (Layer 3)' : 'Long-Term Company Memory (Layer 3)'}
            </div>
            {canEdit && (
              <form
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!memKey.trim() || !memContent.trim()) return
                  onUpsertMemory(memKey.trim(), memContent.trim(), memType)
                  setMemKey('')
                  setMemContent('')
                }}
              >
                <div className="flex gap-1.5">
                  <input
                    value={memKey}
                    onChange={(e) => setMemKey(e.target.value)}
                    placeholder={isVi ? 'Khóa (vd: fiscal_quarter)' : 'Key (e.g. target_margin)'}
                    className="dp-input h-7 text-xs flex-1 px-2"
                  />
                  <select
                    value={memType}
                    onChange={(e) => setMemType(e.target.value as typeof memType)}
                    className="dp-select h-7 text-[11px] px-1.5"
                  >
                    <option value="business_context">Context</option>
                    <option value="kpi_definition">KPI Def</option>
                    <option value="policy">Policy</option>
                    <option value="preference">Preference</option>
                  </select>
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={memContent}
                    onChange={(e) => setMemContent(e.target.value)}
                    placeholder={isVi ? 'Quy tắc / định nghĩa lưu cho toàn công ty…' : 'Company rule / KPI definition…'}
                    className="dp-input h-7 text-xs flex-1 px-2"
                  />
                  <Button type="submit" size="sm" disabled={!memKey.trim() || !memContent.trim()}>
                    <Plus size={12} />
                  </Button>
                </div>
              </form>
            )}

            <div className="space-y-1.5">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border p-2 flex items-start justify-between gap-2"
                  style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold" style={{ color: 'var(--heading)' }}>
                      {m.memory_key} <span className="font-normal opacity-75">({m.memory_type})</span>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {m.content}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onDeleteMemory(m.id)}
                      className="p-1 rounded hover:bg-[var(--danger-bg)]"
                      style={{ color: 'var(--danger-text)' }}
                      aria-label={`Delete memory ${m.memory_key}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              {memories.length === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {isVi ? 'Chưa có ghi nhớ dài hạn cho doanh nghiệp này.' : 'No persistent company memory notes yet.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

