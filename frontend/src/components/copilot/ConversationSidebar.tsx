import { useState } from 'react'
import { Check, MessageSquare, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react'
import type { CopilotConversation } from '../../api'
import { Button } from '../../ui'

type Props = {
  conversations: CopilotConversation[]
  activeId: string | null
  search: string
  onSearchChange: (val: string) => void
  onSelect: (id: string) => void
  onCreateNew: () => void
  onRename: (id: string, title: string) => void
  onTogglePin: (id: string, nextPinned: boolean) => void
  onDelete: (id: string) => void
  isVi: boolean
  canDelete?: boolean
}

export function ConversationSidebar({
  conversations,
  activeId,
  search,
  onSearchChange,
  onSelect,
  onCreateNew,
  onRename,
  onTogglePin,
  onDelete,
  isVi,
  canDelete = true,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const pinned = conversations.filter((c) => c.is_pinned)
  const recent = conversations.filter((c) => !c.is_pinned)

  const commitEdit = (id: string) => {
    const clean = draftTitle.trim()
    if (clean) onRename(id, clean)
    setEditingId(null)
  }

  const renderRow = (c: CopilotConversation) => {
    const active = c.id === activeId
    const isEditing = editingId === c.id

    return (
      <div
        key={c.id}
        className="group rounded-xl border px-2.5 py-2 transition-colors"
        style={{
          background: active ? 'var(--primary-soft)' : 'var(--surface)',
          borderColor: active ? 'var(--primary-border)' : 'var(--border)',
        }}
      >
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              aria-label={isVi ? 'Tên cuộc trò chuyện' : 'Conversation title'}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit(c.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="dp-input h-7 text-xs flex-1 px-2"
              autoFocus
            />
            <button
              type="button"
              onClick={() => commitEdit(c.id)}
              className="p-1 rounded hover:bg-[var(--surface-muted)]"
              style={{ color: 'var(--success-text)' }}
              aria-label="Save title"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="p-1 rounded hover:bg-[var(--surface-muted)]"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Cancel rename"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="flex-1 min-w-0 text-left space-y-0.5"
            >
              <div
                className="text-xs font-semibold truncate"
                style={{ color: active ? 'var(--primary-text)' : 'var(--heading)' }}
                title={c.title}
              >
                {c.title}
              </div>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                <span>
                  {c.message_count} {isVi ? 'tin nhắn' : 'msgs'}
                </span>
                {c.updated_at && <span>· {c.updated_at.slice(5, 16).replace('T', ' ')}</span>}
              </div>
            </button>
            <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onTogglePin(c.id, !c.is_pinned)}
                className="p-1 rounded hover:bg-[var(--surface-muted)]"
                style={{ color: c.is_pinned ? 'var(--primary)' : 'var(--text-muted)' }}
                aria-label={c.is_pinned ? (isVi ? 'Bỏ ghim' : 'Unpin conversation') : isVi ? 'Ghim' : 'Pin conversation'}
                title={c.is_pinned ? 'Unpin' : 'Pin'}
              >
                <Pin size={12} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(c.id)
                  setDraftTitle(c.title)
                }}
                className="p-1 rounded hover:bg-[var(--surface-muted)]"
                style={{ color: 'var(--text-muted)' }}
                aria-label={isVi ? 'Đổi tên' : 'Rename conversation'}
                title="Rename"
              >
                <Pencil size={12} />
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="p-1 rounded hover:bg-[var(--danger-bg)]"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={isVi ? 'Xóa cuộc trò chuyện' : 'Delete conversation'}
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className="dp-surface p-3.5 flex flex-col gap-3 h-full lg:min-h-[680px]"
      aria-label={isVi ? 'Lịch sử hội thoại Copilot' : 'Copilot Conversations'}
    >
      <Button variant="primary" size="sm" onClick={onCreateNew} className="w-full justify-center">
        <Plus size={14} />
        <span>{isVi ? 'Cuộc trò chuyện mới' : 'New Conversation'}</span>
      </Button>

      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={isVi ? 'Tìm hội thoại…' : 'Search chats…'}
          aria-label={isVi ? 'Tìm kiếm hội thoại' : 'Search conversations'}
          className="dp-input w-full h-8 pl-8 pr-2.5 text-xs"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 max-h-[560px]">
        {pinned.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>
              {isVi ? 'Đã ghim' : 'Pinned'}
            </div>
            {pinned.map(renderRow)}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>
            {isVi ? 'Gần đây' : 'Recent Sessions'}
          </div>
          {recent.length > 0 ? (
            recent.map(renderRow)
          ) : pinned.length === 0 ? (
            <div className="text-center py-6 px-2 space-y-1.5">
              <MessageSquare size={18} className="mx-auto" style={{ color: 'var(--text-muted)' }} />
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {isVi
                  ? 'Chưa có phiên hội thoại nào. Hãy gửi câu hỏi để bắt đầu.'
                  : 'No saved threads yet. Ask a question to start a persistent memory thread.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

