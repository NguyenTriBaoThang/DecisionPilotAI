import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Database,
  Globe,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Zap,
} from 'lucide-react'
import {
  type CopilotCitation,
  type CopilotMessage,
  type Dataset,
  type Options,
  dateLabel,
  deleteChatConversation,
  deleteCompanyMemory,
  deleteRagDocument,
  getActiveCompanyId,
  getChatConversationDetail,
  getRagDocumentDetail,
  getRagHealth,
  ingestRagFile,
  label,
  listChatConversations,
  listCompanyMemories,
  listRagDocuments,
  patchChatConversation,
  regenerateChatMessage,
  reindexRagDataset,
  searchRagKnowledge,
  streamCopilotCompletion,
  upsertCompanyMemory,
} from '../../api'
import { useT } from '../../preferences'
import { Button, Chart, ErrorState, PageHeader, StatusBadge, useToast } from '../../ui'
import { ContextPanel, type ContextTab } from './ContextPanel'
import { ConversationSidebar } from './ConversationSidebar'
import { MarkdownRenderer } from './MarkdownRenderer'

function buildSuggestedPrompts(dataset: Dataset | undefined, options: Options | undefined, isVi: boolean, hasDocs: boolean): string[] {
  const caps = dataset?.capabilities || {}
  const firstProduct =
    options?.products?.find((p) => p.product_name === 'SmartDesk Mini')?.product_name ||
    options?.products?.[0]?.product_name
  const topRegions = (options?.regions || []).slice(0, 2)

  if (!dataset) {
    return isVi
      ? [
          'Tóm tắt những điểm chính từ các tài liệu đã tải lên',
          'Có những quy định hoặc chỉ tiêu quan trọng nào trong tài liệu?',
          'Các bước tiếp theo được đề xuất trong báo cáo là gì?',
        ]
      : [
          'Summarize the key findings from our uploaded knowledge documents.',
          'What KPIs, risks, or policies are highlighted in the indexed files?',
          'List action items recommended across our strategy documents.',
        ]
  }

  const list = isVi
    ? [
        'Tình hình doanh thu & lợi nhuận gần đây thế nào?',
        caps.has_marketing !== false ? 'Kênh marketing nào có ROAS thấp nhất?' : 'Phân bổ doanh thu theo kênh bán hàng',
        caps.has_cost_or_profit !== false ? 'Sản phẩm nào mang lại lợi nhuận cao nhất?' : 'Sản phẩm nào có doanh thu cao nhất?',
        firstProduct ? `Dự báo nhu cầu ${firstProduct} trong 30 ngày tới` : 'Dự báo doanh thu trong 30 ngày tới',
        topRegions.length >= 2 ? `So sánh doanh thu giữa ${topRegions[0]} và ${topRegions[1]}` : 'Phân tích nguyên nhân biến động doanh thu gần đây',
      ]
    : [
        'How is our business revenue and gross profit performing?',
        caps.has_marketing !== false ? 'Which marketing channel had the lowest ROAS?' : 'Break down revenue across sales channels.',
        caps.has_cost_or_profit !== false ? 'Which product generated the highest profit?' : 'Which product generated the highest revenue?',
        firstProduct ? `Forecast demand for ${firstProduct} for the next 30 days.` : 'Forecast total revenue for the next 30 days.',
        topRegions.length >= 2 ? `Compare revenue between ${topRegions[0]} and ${topRegions[1]}.` : 'Why did revenue change recently?',
      ]

  if (hasDocs) {
    list.push(
      isVi
        ? 'Đối chiếu các tài liệu đã tải lên với số liệu kinh doanh hiện tại'
        : 'Cross-check our uploaded documents against current sales & marketing KPIs.'
    )
  }
  return list
}

const INTENT_TONE: Record<string, string> = {
  BUSINESS_ANALYTICS: 'accent',
  DOCUMENT_QA: 'info',
  HYBRID_ANALYSIS: 'primary',
  ANOMALY_INVESTIGATION: 'warning',
  FORECASTING: 'success',
  SCENARIO_SIMULATION: 'accent',
  RECOMMENDATION: 'success',
  SECURITY_BLOCKED: 'danger',
  GENERAL_CONVERSATION: 'muted',
}

export function CopilotWorkspace({
  dataset,
  options,
  canEdit = true,
}: {
  dataset?: Dataset
  options?: Options
  canEdit?: boolean
}) {
  const { t, language } = useT()
  const isVi = language === 'vi'
  const { notify } = useToast()
  const qc = useQueryClient()
  const companyId = dataset?.company_id || getActiveCompanyId()

  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [searchConv, setSearchConv] = useState('')
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [sessionContext, setSessionContext] = useState<Record<string, unknown>>({})
  const [memorySummary, setMemorySummary] = useState('')

  const [copilotLang, setCopilotLang] = useState<'auto' | 'en' | 'vi'>('auto')
  const [domainFilter, setDomainFilter] = useState<string>('')
  const [composer, setComposer] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamStatus, setStreamStatus] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<Error | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [contextOpen, setContextOpen] = useState(true)
  const [contextTab, setContextTab] = useState<ContextTab>('citations')
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)
  const [highlightedCitationId, setHighlightedCitationId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const prevCompanyRef = useRef(companyId)

  // Queries
  const convsQuery = useQuery({
    queryKey: ['copilot-conversations', companyId, searchConv],
    queryFn: () => listChatConversations({ search: searchConv || undefined }),
  })

  const docsQuery = useQuery({
    queryKey: ['rag-documents', companyId],
    queryFn: () => listRagDocuments(),
  })

  const memoriesQuery = useQuery({
    queryKey: ['copilot-memories', companyId],
    queryFn: () => listCompanyMemories(),
  })

  const healthQuery = useQuery({
    queryKey: ['rag-health', companyId],
    queryFn: () => getRagHealth(),
  })

  // Reset active thread cleanly when company changes
  useEffect(() => {
    if (prevCompanyRef.current !== companyId) {
      prevCompanyRef.current = companyId
      abortRef.current?.abort()
      setActiveConvId(null)
      setMessages([])
      setSessionContext({})
      setMemorySummary('')
      setSelectedMsgId(null)
      setStreamError(null)
    }
  }, [companyId])

  const loadConversation = useCallback(async (convId: string) => {
    setActiveConvId(convId)
    setStreamError(null)
    const detail = await getChatConversationDetail(convId)
    setMessages(detail.messages || [])
    setSessionContext(detail.session_context || {})
    setMemorySummary(detail.memory_summary || '')
    const lastAsst = [...(detail.messages || [])].reverse().find((m) => m.role === 'assistant')
    setSelectedMsgId(lastAsst?.id || null)
  }, [])

  const invalidateRagAndChat = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['copilot-conversations', companyId] })
    void qc.invalidateQueries({ queryKey: ['rag-documents', companyId] })
    void qc.invalidateQueries({ queryKey: ['copilot-memories', companyId] })
    void qc.invalidateQueries({ queryKey: ['rag-health', companyId] })
  }, [companyId, qc])

  const handleCreateNewChat = async () => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setActiveConvId(null)
    setMessages([])
    setSessionContext({})
    setMemorySummary('')
    setSelectedMsgId(null)
    setStreamError(null)
  }

  const handleSend = useCallback(
    async (rawQuestion: string) => {
      const q = rawQuestion.trim()
      if (!q || isStreaming) return
      setComposer('')
      setStreamError(null)
      setIsStreaming(true)
      setStreamStatus(isVi ? 'Đang phân tích ý định & truy vấn ngữ cảnh…' : 'Analyzing intent & retrieving hybrid context…')

      const tempUserId = `tmp-u-${Date.now()}`
      const tempAsstId = `tmp-a-${Date.now()}`
      const convIdAtStart = activeConvId

      const optimisticUser: CopilotMessage = {
        id: tempUserId,
        conversation_id: convIdAtStart || 'pending',
        company_id: companyId,
        role: 'user',
        content: q,
        citations: [],
        followups: [],
      }
      const optimisticAsst: CopilotMessage = {
        id: tempAsstId,
        conversation_id: convIdAtStart || 'pending',
        company_id: companyId,
        role: 'assistant',
        content: '',
        citations: [],
        followups: [],
      }

      setMessages((prev) => [...prev, optimisticUser, optimisticAsst])
      setSelectedMsgId(tempAsstId)

      const ac = new AbortController()
      abortRef.current = ac

      try {
        const result = await streamCopilotCompletion(
          {
            message: q,
            conversation_id: convIdAtStart,
            dataset_id: dataset?.dataset_id || null,
            language: copilotLang,
            domain: domainFilter || null,
            top_k: 5,
          },
          {
            onStatus: (s) => {
              if (s.message) setStreamStatus(s.message)
            },
            onMeta: (m) => {
              if (m.conversation?.id) setActiveConvId(m.conversation.id)
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === tempAsstId
                    ? { ...item, intent: m.intent, tool_trace: m.tool_trace }
                    : item
                )
              )
            },
            onCitations: (cits) => {
              setMessages((prev) =>
                prev.map((item) => (item.id === tempAsstId ? { ...item, citations: cits } : item))
              )
            },
            onSqlTrace: (sqlTrace) => {
              setMessages((prev) =>
                prev.map((item) => (item.id === tempAsstId ? { ...item, sql_trace: sqlTrace } : item))
              )
            },
            onChart: (chart) => {
              setMessages((prev) =>
                prev.map((item) => (item.id === tempAsstId ? { ...item, chart } : item))
              )
            },
            onDelta: (chunk) => {
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === tempAsstId ? { ...item, content: (item.content || '') + chunk } : item
                )
              )
            },
            onDone: (payload) => {
              if (payload.conversation?.id) {
                setActiveConvId(payload.conversation.id)
                setSessionContext(payload.conversation.session_context || {})
                setMemorySummary(payload.conversation.memory_summary || '')
              }
              setMessages((prev) => {
                const withoutTmp = prev.filter((m) => m.id !== tempUserId && m.id !== tempAsstId)
                return [...withoutTmp, payload.user_message, payload.assistant_message]
              })
              setSelectedMsgId(payload.assistant_message.id)
            },
          },
          ac.signal
        )
        if (!result && ac.signal.aborted) {
          notify({ tone: 'info', title: isVi ? 'Đã dừng tạo phản hồi.' : 'Generation stopped.' })
        }
        invalidateRagAndChat()
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          notify({ tone: 'info', title: isVi ? 'Đã dừng tạo phản hồi.' : 'Generation stopped.' })
        } else {
          setStreamError(err instanceof Error ? err : new Error(String(err)))
          setMessages((prev) => prev.filter((m) => m.id !== tempAsstId || (m.content || '').trim().length > 0))
        }
      } finally {
        setIsStreaming(false)
        setStreamStatus(null)
        abortRef.current = null
      }
    },
    [activeConvId, companyId, copilotLang, dataset?.dataset_id, domainFilter, invalidateRagAndChat, isStreaming, isVi, notify]
  )

  const handleRegenerate = async (assistantMessageId: string) => {
    if (isStreaming) return
    setIsStreaming(true)
    setStreamStatus(isVi ? 'Đang tạo lại câu trả lời…' : 'Regenerating grounded response…')
    setStreamError(null)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      await regenerateChatMessage(
        assistantMessageId,
        {
          onStatus: (s) => s.message && setStreamStatus(s.message),
          onDone: (payload) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessageId ? payload.assistant_message : m))
            )
            setSelectedMsgId(payload.assistant_message.id)
            if (payload.conversation) {
              setSessionContext(payload.conversation.session_context || {})
              setMemorySummary(payload.conversation.memory_summary || '')
            }
          },
        },
        ac.signal
      )
      invalidateRagAndChat()
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setStreamError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      setIsStreaming(false)
      setStreamStatus(null)
      abortRef.current = null
    }
  }

  // Handle ?q=... deep links seamlessly (e.g. from Dashboard warning button -> /ask?q=...)
  const [searchParams, setSearchParams] = useSearchParams()
  const autoSentRef = useRef(false)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !autoSentRef.current) {
      autoSentRef.current = true
      setSearchParams({}, { replace: true })
      void handleSend(q)
    }
  }, [handleSend, searchParams, setSearchParams])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages.length, isStreaming])

  const handleUploadKnowledgeFile = async (file: File) => {
    setUploadingDoc(true)
    try {
      const res = await ingestRagFile(file, { datasetId: dataset?.dataset_id })
      notify({
        tone: 'success',
        title: isVi
          ? `Đã nạp "${res.file_name}" (${res.chunk_count} đoạn) vào kho RAG.`
          : `Indexed "${res.file_name}" (${res.chunk_count} chunks) into RAG knowledge base.`,
      })
      setContextTab('knowledge')
      setContextOpen(true)
      invalidateRagAndChat()
    } catch (err) {
      notify({ tone: 'danger', title: err instanceof Error ? err.message : 'RAG ingest failed' })
    } finally {
      setUploadingDoc(false)
    }
  }

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setCopiedId(id)
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800)
  }

  const documents = docsQuery.data?.items || []
  const memories = memoriesQuery.data?.items || []
  const conversations = convsQuery.data?.items || []
  const suggestedPrompts = useMemo(
    () => buildSuggestedPrompts(dataset, options, isVi, documents.length > 0),
    [dataset, options, isVi, documents.length]
  )

  const selectedAsstMessage = useMemo(() => {
    const byId = messages.find((m) => m.id === selectedMsgId && m.role === 'assistant')
    if (byId) return byId
    return [...messages].reverse().find((m) => m.role === 'assistant') || null
  }, [messages, selectedMsgId])

  const openCitationDrawer = (citationId: string, msgId: string) => {
    setSelectedMsgId(msgId)
    setHighlightedCitationId(citationId)
    setContextTab('citations')
    setContextOpen(true)
  }

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        e.preventDefault()
        if (canEdit) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (!canEdit) return
        const f = e.dataTransfer.files?.[0]
        if (f) void handleUploadKnowledgeFile(f)
      }}
    >
      <PageHeader
        eyebrow={isVi ? 'TRỢ LÝ RAG & SQL DOANH NGHIỆP' : 'ENTERPRISE RAG & TEXT-TO-SQL COPILOT'}
        title={isVi ? 'DecisionPilot AI Copilot' : 'Ask Business Data'}
        subtitle={
          isVi
            ? 'Kết hợp tìm kiếm Hybrid RAG (Dense + BM25), truy vấn SQL chỉ đọc an toàn, dữ liệu đa phương thức và trí nhớ 3 tầng có trích dẫn nguồn.'
            : 'Grounded answers combining Hybrid RAG retrieval, tenant-scoped read-only Text-to-SQL, multimodal extractions, and 3-layer memory.'
        }
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="accent">
              <ShieldCheck size={12} />
              <span>{isVi ? 'SQL Chỉ đọc & Trích dẫn' : 'Safe SQL + Verified Citations'}</span>
            </StatusBadge>
            <StatusBadge tone="muted">
              <BookOpen size={12} />
              <span>
                {documents.length} {isVi ? 'tài liệu' : 'docs'}
              </span>
            </StatusBadge>
            <Button size="sm" onClick={() => setContextOpen((v) => !v)}>
              {contextOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              <span>{isVi ? 'Ngữ cảnh RAG' : 'Context'}</span>
            </Button>
          </div>
        }
      />

      {dragOver && (
        <div
          className="rounded-xl border-2 border-dashed p-4 text-center text-xs font-semibold"
          style={{ borderColor: 'var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary-text)' }}
        >
          {isVi
            ? 'Thả tệp PDF, DOCX, PPTX, TXT, CSV, XLSX, JSON hoặc ảnh hóa đơn để nạp ngay vào Kho tri thức RAG'
            : 'Drop PDF, DOCX, PPTX, TXT, CSV, XLSX, JSON, or invoice image to index directly into Knowledge Base'}
        </div>
      )}

      {/* 3-Column Enterprise Copilot Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Conversations Sidebar */}
        <div className="lg:col-span-3">
          <ConversationSidebar
            conversations={conversations}
            activeId={activeConvId}
            search={searchConv}
            onSearchChange={setSearchConv}
            onSelect={(id) => void loadConversation(id)}
            onCreateNew={() => void handleCreateNewChat()}
            onRename={(id, title) => {
              void patchChatConversation(id, { title }).then(() => invalidateRagAndChat())
            }}
            onTogglePin={(id, is_pinned) => {
              void patchChatConversation(id, { is_pinned }).then(() => invalidateRagAndChat())
            }}
            onDelete={(id) => {
              void deleteChatConversation(id).then(() => {
                if (activeConvId === id) void handleCreateNewChat()
                invalidateRagAndChat()
              })
            }}
            isVi={isVi}
            canDelete={canEdit}
          />
        </div>

        {/* Center: Main Streaming Chat Workspace */}
        <div className={contextOpen ? 'lg:col-span-6' : 'lg:col-span-9'}>
          <section
            className="dp-surface flex flex-col lg:min-h-[680px] overflow-hidden"
            aria-label={isVi ? 'Khung trò chuyện Copilot' : 'Copilot Chat Stream'}
          >
            {/* Workspace Control Ribbon */}
            <div
              className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--heading)' }}>
                  <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                  <span>{dataset ? dataset.title : isVi ? 'Kho tài liệu Độc lập' : 'Document Knowledge Mode'}</span>
                </span>
                {dataset && (
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    · {dateLabel(dataset.start)} → {dateLabel(dataset.end)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  <Globe size={12} />
                  <select
                    aria-label="Response language"
                    value={copilotLang}
                    onChange={(e) => setCopilotLang(e.target.value as 'auto' | 'en' | 'vi')}
                    className="dp-select h-7 text-[11px] px-2"
                  >
                    <option value="auto">Auto (EN/VI)</option>
                    <option value="en">English</option>
                    <option value="vi">Tiếng Việt</option>
                  </select>
                </label>

                <select
                  aria-label="Domain filter"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                  className="dp-select h-7 text-[11px] px-2"
                >
                  <option value="">{isVi ? 'Mọi lĩnh vực' : 'All domains'}</option>
                  <option value="sales">Sales</option>
                  <option value="finance">Finance</option>
                  <option value="marketing">Marketing</option>
                  <option value="inventory">Inventory</option>
                  <option value="operations">Operations</option>
                </select>
              </div>
            </div>

            {/* Scrollable Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 max-h-[520px]">
              {streamError && <ErrorState error={streamError} retry={() => setStreamError(null)} />}

              {messages.length === 0 ? (
                <div className="py-6 px-2 space-y-5">
                  <div className="text-center max-w-lg mx-auto space-y-2">
                    <div
                      className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border"
                      style={{
                        background: 'var(--primary-soft)',
                        borderColor: 'var(--primary-border)',
                        color: 'var(--primary)',
                      }}
                    >
                      <MessageSquareText size={21} />
                    </div>
                    <h3 className="text-base font-bold" style={{ color: 'var(--heading)' }}>
                      {isVi ? 'Bạn muốn phân tích hay tra cứu điều gì?' : 'What business data or document shall we analyze?'}
                    </h3>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {isVi
                        ? 'Copilot tự động kết hợp truy vấn SQL an toàn trên dữ liệu bán hàng/marketing và tìm kiếm Hybrid RAG trong PDF, DOCX, PPTX, hóa đơn OCR.'
                        : 'Copilot combines safe read-only SQL over your workspace tables with Hybrid RAG retrieval over PDFs, DOCX, PPTX decks, and OCR records.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {suggestedPrompts.map((promptText) => (
                      <button
                        key={promptText}
                        type="button"
                        onClick={() => void handleSend(promptText)}
                        className="text-left rounded-xl border p-3 text-xs font-medium flex items-start justify-between gap-2 transition-colors hover:bg-[var(--surface-muted)]"
                        style={{
                          background: 'var(--surface)',
                          borderColor: 'var(--border)',
                          color: 'var(--heading)',
                        }}
                      >
                        <span className="leading-snug">{promptText}</span>
                        <Zap size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div
                          className="max-w-[85%] rounded-2xl rounded-tr-sm border px-4 py-2.5 text-sm font-medium shadow-xs"
                          style={{
                            background: 'var(--primary-soft)',
                            borderColor: 'var(--primary-border)',
                            color: 'var(--heading)',
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    )
                  }

                  const validCids = new Set((msg.citations || []).map((c) => c.citation_id))
                  const isCurrentlySelected = selectedAsstMessage?.id === msg.id

                  return (
                    <div
                      key={msg.id}
                      onClick={() => setSelectedMsgId(msg.id)}
                      className="rounded-2xl border p-4 space-y-3.5 transition-colors"
                      style={{
                        background: 'var(--surface)',
                        borderColor: isCurrentlySelected ? 'var(--primary-border)' : 'var(--border)',
                      }}
                    >
                      {/* Assistant Turn Metadata Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone={INTENT_TONE[msg.intent || ''] || 'accent'}>
                            {msg.intent === 'SECURITY_BLOCKED' ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />}
                            <span>{msg.intent || 'COPILOT'}</span>
                          </StatusBadge>
                          {msg.citations?.length > 0 && (
                            <StatusBadge tone="info">
                              {msg.citations.length} {isVi ? 'trích dẫn' : 'citations'}
                            </StatusBadge>
                          )}
                          {msg.sql_trace?.executed && (
                            <StatusBadge tone="success">
                              <Database size={11} />
                              <span>SQL {msg.sql_trace.row_count ?? 0} rows</span>
                            </StatusBadge>
                          )}
                        </div>
                        {typeof msg.latency_ms === 'number' && (
                          <span className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                            {Math.round(msg.latency_ms)} ms
                          </span>
                        )}
                      </div>

                      {/* Markdown + Inline Interactive Citations */}
                      {msg.content ? (
                        <MarkdownRenderer
                          content={msg.content}
                          validCitationIds={validCids}
                          onCitationClick={(cid) => openCitationDrawer(cid, msg.id)}
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--primary-text)' }}>
                          <Activity size={14} className="animate-spin" />
                          <span>{streamStatus || (isVi ? 'Đang tổng hợp bằng chứng…' : 'Synthesizing grounded response…')}</span>
                        </div>
                      )}

                      {/* Embedded Dynamic Visualization */}
                      {msg.chart && msg.chart.rows?.length > 0 && (
                        <div
                          className="rounded-xl border p-3.5"
                          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                            {isVi ? 'Biểu đồ phân tích trực quan' : 'Analytical Visualization'}
                          </div>
                          <Chart
                            data={msg.chart.rows}
                            x={msg.chart.x}
                            date={msg.chart.x === 'date'}
                            height={220}
                            series={[
                              {
                                key: msg.chart.y,
                                name: label(msg.chart.y),
                                kind: msg.chart.type === 'bar' ? 'bar' : 'line',
                                color: '#2563EB',
                              },
                            ]}
                          />
                        </div>
                      )}

                      {/* Citation Chips */}
                      {msg.citations?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            {isVi ? 'Nguồn:' : 'Sources:'}
                          </span>
                          {msg.citations.map((cit) => (
                            <button
                              key={`${cit.citation_id}-${cit.chunk_id}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openCitationDrawer(cit.citation_id, msg.id)
                              }}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-[var(--primary-soft)] transition-colors"
                              style={{
                                borderColor: 'var(--primary-border)',
                                color: 'var(--primary-text)',
                                background: 'var(--surface-muted)',
                              }}
                            >
                              <span className="font-bold">[{cit.citation_id}]</span>
                              <span className="truncate max-w-[140px]">{cit.source_file}</span>
                              {cit.page_number != null && <span className="opacity-75">p.{cit.page_number}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Collapsible Executed SQL Trace */}
                      {msg.sql_trace?.sql && (
                        <details
                          className="rounded-lg border p-2.5 text-xs"
                          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
                        >
                          <summary className="cursor-pointer font-semibold select-none text-[11px]" style={{ color: 'var(--primary-text)' }}>
                            {isVi ? 'Xem câu lệnh SQL Read-Only đã thực thi' : 'Inspect Verified Read-Only SQL & Scoped Tables'}
                          </summary>
                          <pre
                            className="mt-2 p-2 rounded border text-[11px] font-mono overflow-x-auto"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--heading)' }}
                          >
                            {msg.sql_trace.sql}
                          </pre>
                          <div className="mt-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            tables: {(msg.sql_trace.scoped_tables || []).join(', ')} · rows: {msg.sql_trace.row_count ?? 0} · {msg.sql_trace.execution_ms ?? 0} ms
                          </div>
                        </details>
                      )}

                      {/* Action Footer: Copy, Regenerate, Navigation & Follow-up Prompts */}
                      {msg.content && !msg.id.startsWith('tmp-') && (
                        <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopy(msg.id, msg.content)
                                }}
                              >
                                {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                                <span>{copiedId === msg.id ? (isVi ? 'Đã chép' : 'Copied') : isVi ? 'Sao chép' : 'Copy'}</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isStreaming}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleRegenerate(msg.id)
                                }}
                              >
                                <RefreshCw size={12} />
                                <span>{isVi ? 'Tạo lại' : 'Regenerate'}</span>
                              </Button>
                            </div>

                            {dataset && (
                              <div className="flex items-center gap-2">
                                <Link
                                  to="/scenarios"
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-[var(--surface-muted)]"
                                  style={{ borderColor: 'var(--border-strong)', color: 'var(--heading)' }}
                                >
                                  <SlidersHorizontal size={11} />
                                  <span>{t('Simulate Scenarios')}</span>
                                </Link>
                                <Link
                                  to="/recommendations"
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-[var(--surface-muted)]"
                                  style={{ borderColor: 'var(--border-strong)', color: 'var(--primary-text)' }}
                                >
                                  <span>{t('Recommendations')}</span>
                                  <ArrowRight size={11} />
                                </Link>
                              </div>
                            )}
                          </div>

                          {msg.followups?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {msg.followups.map((fup) => (
                                <button
                                  key={fup}
                                  type="button"
                                  disabled={isStreaming}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void handleSend(fup)
                                  }}
                                  className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--primary-soft)]"
                                  style={{
                                    borderColor: 'var(--border-strong)',
                                    background: 'var(--surface-muted)',
                                    color: 'var(--heading)',
                                  }}
                                >
                                  {fup}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Bottom Composer Bar */}
            <form
              className="p-3.5 border-t space-y-2"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
              onSubmit={(e) => {
                e.preventDefault()
                void handleSend(composer)
              }}
            >
              <div className="flex items-end gap-2">
                {canEdit && (
                  <label
                    className="inline-flex items-center justify-center rounded-lg border h-10 px-2.5 cursor-pointer hover:bg-[var(--surface)] transition-colors flex-shrink-0"
                    style={{ borderColor: 'var(--border-strong)', background: 'var(--surface)', color: 'var(--heading)' }}
                    title={isVi ? 'Đính kèm tài liệu RAG (PDF, DOCX, PPTX, CSV, OCR…)' : 'Attach RAG knowledge file'}
                  >
                    <Paperclip size={15} />
                    <input
                      type="file"
                      aria-label="Upload knowledge document"
                      className="hidden"
                      disabled={uploadingDoc}
                      accept=".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.xls,.json,.xml,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.mp4,.mov,.avi"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleUploadKnowledgeFile(f)
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>
                )}

                <textarea
                  rows={1}
                  aria-label={isVi ? 'Câu hỏi kinh doanh' : 'Business question'}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend(composer)
                    }
                  }}
                  placeholder={
                    isVi
                      ? 'Hỏi về doanh thu, ROAS tiếp thị, dự báo, kịch bản What-If hoặc nội dung tài liệu PDF/DOCX đã tải lên…'
                      : 'Ask about revenue, ROAS, anomalies, forecasts, What-If scenarios, or uploaded PDF/DOCX reports…'
                  }
                  className="dp-input flex-1 min-h-[40px] max-h-32 py-2 px-3 text-sm resize-y"
                />

                {isStreaming ? (
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="h-10 px-4 flex-shrink-0"
                  >
                    <Square size={13} />
                    <span>{isVi ? 'Dừng' : 'Stop'}</span>
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!composer.trim() || uploadingDoc}
                    className="h-10 px-4 flex-shrink-0"
                  >
                    <Send size={14} />
                    <span>{isVi ? 'Gửi' : 'Send'}</span>
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                <span>
                  {uploadingDoc
                    ? isVi
                      ? 'Đang trích xuất & lập chỉ mục tài liệu vào Vector Store…'
                      : 'Extracting text, chunking & indexing document into Vector Store…'
                    : isVi
                    ? 'Enter để gửi · Shift+Enter xuống dòng · Kéo thả file vào khung để nạp RAG'
                    : 'Enter to send · Shift+Enter for newline · Drop any document here to ingest into RAG'}
                </span>
                {healthQuery.data && (
                  <span className="font-mono">
                    {healthQuery.data.vector_store?.backend === 'qdrant' ? 'Qdrant' : 'Hybrid SQL-Vector'} · {healthQuery.data.embedding_provider}
                  </span>
                )}
              </div>
            </form>
          </section>
        </div>

        {/* Right: Context, Sources, Knowledge Docs & 3-Layer Memory */}
        {contextOpen && (
          <div className="lg:col-span-3">
            <ContextPanel
              tab={contextTab}
              onTabChange={setContextTab}
              citations={selectedAsstMessage?.citations || []}
              highlightedCitationId={highlightedCitationId}
              sqlTrace={selectedAsstMessage?.sql_trace}
              toolTrace={selectedAsstMessage?.tool_trace}
              documents={documents}
              memories={memories}
              sessionContext={sessionContext}
              memorySummary={memorySummary}
              ragHealth={healthQuery.data}
              onUploadFile={(f) => void handleUploadKnowledgeFile(f)}
              onDeleteDocument={(id) => {
                void deleteRagDocument(id).then(() => {
                  notify({ tone: 'info', title: isVi ? 'Đã xóa tài liệu RAG.' : 'RAG document deleted.' })
                  invalidateRagAndChat()
                })
              }}
              onInspectDocument={getRagDocumentDetail}
              onReindexDataset={() => {
                void reindexRagDataset(dataset?.dataset_id).then(() => {
                  notify({ tone: 'success', title: isVi ? 'Đã đồng bộ dữ liệu sang RAG.' : 'Dataset summary synced to RAG.' })
                  invalidateRagAndChat()
                })
              }}
              onSearchRag={async (query) => {
                const res = await searchRagKnowledge({ query, dataset_id: dataset?.dataset_id, top_k: 5 })
                return res.hits
              }}
              onUpsertMemory={(memory_key, content, memory_type) => {
                void upsertCompanyMemory({ memory_key, content, memory_type, source_conversation_id: activeConvId || undefined }).then(() => {
                  notify({ tone: 'success', title: isVi ? 'Đã lưu ghi nhớ doanh nghiệp.' : 'Company memory saved.' })
                  invalidateRagAndChat()
                })
              }}
              onDeleteMemory={(id) => {
                void deleteCompanyMemory(id).then(() => invalidateRagAndChat())
              }}
              uploadingDoc={uploadingDoc}
              canEdit={canEdit}
              isVi={isVi}
            />
          </div>
        )}
      </div>
    </div>
  )
}
