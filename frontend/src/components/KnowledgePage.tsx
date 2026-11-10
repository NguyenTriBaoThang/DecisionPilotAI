import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '../api'
import { KnowledgeGraph } from './KnowledgeGraph'

type Source = { id: string; title: string; chunk: number; excerpt: string; score: number; version: string; dataset_id?: string; table?: string }
type Result = { answer: string; sources: Source[]; mode: string; dataset_id: string; dataset_title?: string }

export function KnowledgePage() {
  const client = useQueryClient()
  const documents = useQuery({ queryKey: ['knowledge'], queryFn: () => request<{rows: {id: string; title: string}[]}>('/knowledge/documents') })
  const [includeDocuments, setIncludeDocuments] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Không thể xử lý yêu cầu') }
    finally { setBusy(false) }
  }
  return <section className="space-y-5">
    <h1 className="text-2xl font-bold">Kho tri thức & Chat RAG</h1>
    <p>RAG dùng bộ dữ liệu đang hoạt động của dự án. Sau khi thay dữ liệu thành công, câu hỏi tiếp theo tự truy xuất bộ mới. Các số liệu được tổng hợp bằng SQL trước khi đưa vào RAG.</p>
    <KnowledgeGraph sources={result?.sources} />
    <details className="card p-5 space-y-3">
      <summary className="font-semibold cursor-pointer">Tài liệu bổ sung (tùy chọn)</summary>
      <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={includeDocuments} onChange={e => { setIncludeDocuments(e.target.checked); setResult(null) }} />Dùng thêm tài liệu cá nhân cùng dữ liệu dự án</label>
      <input type="file" accept=".txt,.md" disabled={busy} aria-label="Tài liệu tri thức" onChange={e => {
        const file = e.target.files?.[0]; if (!file) return
        if (file.size > 400000) { setError('Tệp quá lớn. Tối đa 400 KB.'); return }
        void file.text().then(text => { setTitle(file.name); setContent(text) }).catch(() => setError('Không đọc được tệp'))
      }} />
      <label className="field"><span>Tên tài liệu</span><input value={title} maxLength={150} onChange={e => setTitle(e.target.value)} /></label>
      <label className="field"><span>Nội dung (tối đa 100.000 ký tự)</span><textarea className="button w-full min-h-32" value={content} maxLength={100000} onChange={e => setContent(e.target.value)} /></label>
      <button className="button primary" disabled={busy || !title.trim() || content.trim().length < 10} onClick={() => void run(async () => {
        await request('/knowledge/documents', {title: title.trim(), content: content.trim()}); setTitle(''); setContent(''); await client.invalidateQueries({queryKey: ['knowledge']})
      })}>Lưu tài liệu</button>
      {documents.data?.rows.map(doc => <div key={doc.id} className="flex justify-between items-center gap-4"><span>{doc.title}</span><button className="button" disabled={busy} onClick={() => void run(async () => {
        const response = await fetch('/api/knowledge/documents/' + doc.id, {method: 'DELETE', headers: sessionStorage.getItem('dp-access-token') ? {Authorization: 'Bearer ' + sessionStorage.getItem('dp-access-token')} : {}})
        if (!response.ok) throw new Error('Không xóa được tài liệu'); setResult(null); await client.invalidateQueries({queryKey: ['knowledge']})
      })}>Xóa</button></div>)}
    </details>
    <form className="card p-5 space-y-3" onSubmit={e => { e.preventDefault(); setResult(null); void run(async () => setResult(await request<Result>('/knowledge/query', {question, include_documents: includeDocuments}))) }}>
      <label className="field"><span>Hỏi dữ liệu doanh nghiệp</span><input value={question} maxLength={1000} onChange={e => setQuestion(e.target.value)} placeholder="Doanh thu tháng 2026-09 là bao nhiêu?" /></label>
      <button className="button primary" disabled={busy || question.trim().length < 3}>{busy ? 'Đang xử lý…' : 'Hỏi và xem căn cứ'}</button>
    </form>
    {(error || documents.error) && <p role="alert">{error || String(documents.error)}</p>}
    {result && <div className="card p-5 space-y-5">
      <h2 className="font-semibold">Luồng truy xuất RAG</h2>
      <p>Bộ dữ liệu: {result.dataset_title} · {result.dataset_id}</p>
      <div role="img" aria-label="Câu hỏi đến tài liệu đến đoạn truy xuất đến câu trả lời" className="flex flex-wrap items-center gap-3">
        <span className="button">Câu hỏi</span><span>→</span><span className="button">Dữ liệu đang hoạt động</span><span>→</span><span className="button">{result.sources.length} đoạn phù hợp</span><span>→</span><span className="button">Câu trả lời có nguồn</span>
      </div>
      <p>{result.mode === 'extractive' ? 'Đang hiển thị trích đoạn trực tiếp. Chưa có câu trả lời tổng hợp từ mô hình.' : result.mode === 'no_evidence' ? 'Chưa đủ căn cứ' : 'RAG: truy xuất tài liệu và tổng hợp bằng mô hình'}</p>
      <p className="whitespace-pre-wrap">{result.answer}</p>
      <h3 className="font-semibold">Các đoạn đưa vào câu trả lời</h3>
      {result.sources.map(source => <details key={source.id} className="border-t py-3" open>
        <summary>[{source.id}] {source.title} · đoạn {source.chunk}</summary>
        <blockquote className="whitespace-pre-wrap py-2">{source.excerpt}</blockquote>
        <p className="text-sm">{source.table ? `Bảng nguồn: ${source.table} · Bộ dữ liệu: ${source.dataset_id}` : 'Tài liệu cá nhân bổ sung'}</p>
        <small>Phiên bản {source.version} · điểm khớp từ khóa {source.score} (không phải xác suất đúng)</small>
      </details>)}
    </div>}
  </section>
}
