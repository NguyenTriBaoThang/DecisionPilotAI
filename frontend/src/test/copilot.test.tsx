import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../api'
import { mockDataset, mockOptions } from '../mockData'
import { PreferencesProvider } from '../preferences'
import { ToastProvider } from '../ui'
import { CopilotWorkspace } from '../components/copilot/CopilotWorkspace'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listChatConversations: vi.fn(),
    getChatConversationDetail: vi.fn(),
    patchChatConversation: vi.fn(),
    deleteChatConversation: vi.fn(),
    listRagDocuments: vi.fn(),
    getRagDocumentDetail: vi.fn(),
    deleteRagDocument: vi.fn(),
    listCompanyMemories: vi.fn(),
    upsertCompanyMemory: vi.fn(),
    deleteCompanyMemory: vi.fn(),
    getRagHealth: vi.fn(),
    ingestRagFile: vi.fn(),
    searchRagKnowledge: vi.fn(),
    streamCopilotCompletion: vi.fn(),
    regenerateChatMessage: vi.fn(),
  }
})

function setupDefaultMocks() {
  vi.mocked(api.listChatConversations).mockResolvedValue({
    items: [
      {
        id: 'conv-1',
        company_id: 'comp-default',
        title: 'Q3 Marketing ROAS Audit',
        is_pinned: true,
        language: 'en',
        session_context: { last_channel: 'Facebook Ads' },
        memory_summary: '',
        message_count: 2,
        created_by: 'analyst',
        updated_at: '2026-11-11T10:00:00Z',
      },
    ],
    count: 1,
    company_id: 'comp-default',
  })
  vi.mocked(api.listRagDocuments).mockResolvedValue({
    items: [
      {
        id: 'ragdoc-1',
        company_id: 'comp-default',
        dataset_id: mockDataset.dataset_id,
        source_type: 'rag_upload',
        file_name: 'Q3_Marketing_Policy.pdf',
        document_type: 'pdf',
        domain: 'marketing',
        status: 'indexed',
        chunk_count: 4,
        char_count: 1850,
        metadata: {},
        created_by: 'analyst',
      },
    ],
    count: 1,
    company_id: 'comp-default',
  })
  vi.mocked(api.listCompanyMemories).mockResolvedValue({
    items: [
      {
        id: 'mem-1',
        company_id: 'comp-default',
        memory_key: 'roas_floor',
        memory_type: 'policy',
        content: 'Pause social channels below 1.2x ROAS',
        confidence: 1,
        created_by: 'analyst',
      },
    ],
    count: 1,
    company_id: 'comp-default',
  })
  vi.mocked(api.getRagHealth).mockResolvedValue({
    status: 'ok',
    company_id: 'comp-default',
    embedding_provider: 'local-multilingual-v1',
    embedding_dim: 256,
    vector_store: { backend: 'sql', status: 'ok' },
    documents_indexed: 1,
    chunks_indexed: 4,
    chunk_size_tokens: 450,
    chunk_overlap_tokens: 75,
    hybrid_weights: { dense: 0.6, bm25: 0.4 },
    min_relevance_score: 0.08,
  })
}

function mountCopilot(initialUrl = '/ask') {
  localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'vnd' }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialUrl]}>
            <CopilotWorkspace dataset={mockDataset} options={mockOptions} canEdit />
          </MemoryRouter>
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('Enterprise RAG & SQL AI Copilot UI', () => {
  it('renders conversations, documents, suggested prompts and handles streaming replies with clickable citations & SQL trace', async () => {
    setupDefaultMocks()
    vi.mocked(api.streamCopilotCompletion).mockImplementation(async (payload, handlers) => {
      const donePayload: api.CopilotTurnResponse = {
        conversation: {
          id: 'conv-new',
          company_id: 'comp-default',
          dataset_id: mockDataset.dataset_id,
          title: payload.message,
          is_pinned: false,
          language: 'en',
          session_context: { last_channel: 'Facebook Ads' },
          memory_summary: '',
          message_count: 2,
          created_by: 'analyst',
        },
        user_message: {
          id: 'msg-u-1',
          conversation_id: 'conv-new',
          company_id: 'comp-default',
          role: 'user',
          content: payload.message,
          citations: [],
          followups: [],
        },
        assistant_message: {
          id: 'msg-a-1',
          conversation_id: 'conv-new',
          company_id: 'comp-default',
          role: 'assistant',
          content: 'Facebook Ads is lowest at **0.76x ROAS**. Reallocate spend [C1].',
          intent: 'HYBRID_ANALYSIS',
          citations: [
            {
              citation_id: 'C1',
              chunk_id: 'chk-1',
              document_id: 'ragdoc-1',
              source_file: 'Q3_Marketing_Policy.pdf',
              document_type: 'pdf',
              domain: 'marketing',
              page_number: 2,
              section: 'Paid Media Rules',
              content: 'Shift 15% of saturated Facebook Ads budget into Google Ads.',
              scores: { dense: 0.81, bm25: 0.72, rrf: 0.91, rerank: 0.88 },
            },
          ],
          sql_trace: {
            sql: 'SELECT channel, ROUND(SUM(attributed_revenue)/SUM(spend),3) AS roas FROM marketing_campaigns GROUP BY channel ORDER BY roas ASC',
            scoped_tables: ['marketing_campaigns'],
            read_only_verified: true,
            row_count: 4,
            execution_ms: 4.2,
          },
          followups: ['Compare revenue & profit across regions'],
          latency_ms: 24.5,
        },
      }
      handlers.onMeta?.({ conversation: donePayload.conversation, user_message: donePayload.user_message, intent: 'HYBRID_ANALYSIS' })
      handlers.onDelta?.(donePayload.assistant_message.content)
      handlers.onDone?.(donePayload)
      return donePayload
    })

    mountCopilot()

    expect(await screen.findByText('Q3 Marketing ROAS Audit', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByText('Which marketing channel had the lowest ROAS?')).toBeTruthy()

    const textarea = screen.getByLabelText('Business question')
    fireEvent.change(textarea, { target: { value: 'Which marketing channel had the lowest ROAS?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText(/0\.76x ROAS/, {}, { timeout: 5000 })
    expect(screen.getByText('HYBRID_ANALYSIS')).toBeTruthy()
    expect(screen.getAllByText('Q3_Marketing_Policy.pdf').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Inspect Verified Read-Only SQL/i)).toBeTruthy()

    // Click citation pill to verify Context panel updates & opens Citation snippet
    fireEvent.click(screen.getByRole('button', { name: /Inspect citation C1/i }))
    expect(await screen.findByText(/Shift 15% of saturated Facebook Ads budget/i, {}, { timeout: 5000 })).toBeTruthy()
  }, 15_000)

  it('auto-dispatches ?q= query parameter cleanly on navigation from alerts/dashboard', async () => {
    setupDefaultMocks()
    vi.mocked(api.streamCopilotCompletion).mockResolvedValue({
      conversation: {
        id: 'conv-auto',
        company_id: 'comp-default',
        title: 'Auto query',
        is_pinned: false,
        language: 'en',
        session_context: {},
        memory_summary: '',
        message_count: 2,
        created_by: 'analyst',
      },
      user_message: {
        id: 'u1',
        conversation_id: 'conv-auto',
        company_id: 'comp-default',
        role: 'user',
        content: 'Which marketing channel had the lowest ROAS?',
        citations: [],
        followups: [],
      },
      assistant_message: {
        id: 'a1',
        conversation_id: 'conv-auto',
        company_id: 'comp-default',
        role: 'assistant',
        content: 'Facebook Ads is lowest at 0.76x ROAS.',
        intent: 'BUSINESS_ANALYTICS',
        citations: [],
        followups: [],
      },
    })

    mountCopilot('/ask?q=Which%20marketing%20channel%20had%20the%20lowest%20ROAS%3F')
    await waitFor(() =>
      expect(api.streamCopilotCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Which marketing channel had the lowest ROAS?' }),
        expect.any(Object),
        expect.any(AbortSignal)
      )
    )
  })

  it('uploads RAG knowledge file and saves persistent company memory', async () => {
    setupDefaultMocks()
    vi.mocked(api.ingestRagFile).mockResolvedValue({
      document_id: 'ragdoc-99',
      file_name: 'SLA_Brief.txt',
      document_type: 'txt',
      domain: 'operations',
      chunk_count: 2,
      char_count: 340,
      status: 'indexed',
    })
    vi.mocked(api.upsertCompanyMemory).mockResolvedValue({
      id: 'mem-2',
      company_id: 'comp-default',
      memory_key: 'fiscal_year',
      memory_type: 'business_context',
      content: 'Starts January 1',
      confidence: 1,
      created_by: 'analyst',
    })

    mountCopilot()
    const fileInput = screen.getByLabelText('Upload knowledge document')
    const txtFile = new File(['Enterprise SLA response time is 4 hours.'], 'SLA_Brief.txt', { type: 'text/plain' })
    fireEvent.change(fileInput, { target: { files: [txtFile] } })

    await waitFor(() =>
      expect(api.ingestRagFile).toHaveBeenCalledWith(txtFile, expect.objectContaining({ datasetId: mockDataset.dataset_id }))
    )

    fireEvent.click(screen.getByRole('tab', { name: /Memory & SQL/i }))
    expect(await screen.findByText(/roas_floor/, {}, { timeout: 5000 })).toBeTruthy()
  })
})

