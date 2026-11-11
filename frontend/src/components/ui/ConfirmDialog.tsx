import { useEffect, type ReactNode } from 'react'
import { AlertTriangle, ShieldCheck, X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  detail?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  isPending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, isPending, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}
      onClick={() => {
        if (!isPending) onCancel()
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border p-5 space-y-4"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg border flex-shrink-0"
              style={{
                background: tone === 'danger' ? 'var(--danger-bg)' : 'var(--primary-soft)',
                borderColor: tone === 'danger' ? 'var(--danger-border)' : 'var(--primary-border)',
                color: tone === 'danger' ? 'var(--danger)' : 'var(--primary)',
              }}
            >
              {tone === 'danger' ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
            </span>
            <div>
              <h3 id="confirm-dialog-title" className="text-base font-semibold" style={{ color: 'var(--heading)' }}>
                {title}
              </h3>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            aria-label="Close dialog"
            className="rounded-lg p-1 hover:bg-[var(--surface-subtle)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>

        {detail && (
          <div
            className="rounded-lg border p-3 text-xs leading-relaxed"
            style={{
              background: 'var(--surface-muted)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          >
            {detail}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-[var(--surface-subtle)]"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors"
            style={{
              background: tone === 'danger' ? 'var(--danger)' : 'var(--primary)',
            }}
          >
            {isPending ? 'Recording…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

