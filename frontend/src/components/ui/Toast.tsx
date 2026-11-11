import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

export type ToastTone = 'success' | 'warning' | 'danger' | 'info'

export interface ToastMessage {
  id: string
  tone: ToastTone
  title: string
  description?: string
}

interface ToastContextValue {
  notify: (toast: Omit<ToastMessage, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue>({
  notify: () => {},
})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMessage[]>([])

  const dismiss = useCallback((id: string) => {
    setItems((curr) => curr.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setItems((curr) => [...curr.slice(-3), { ...toast, id }])
    setTimeout(() => {
      setItems((curr) => curr.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      {items.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))]"
        >
          {items.map((toast) => {
            const Icon =
              toast.tone === 'success'
                ? CheckCircle2
                : toast.tone === 'warning'
                ? AlertTriangle
                : toast.tone === 'danger'
                ? XCircle
                : Info
            const toneColors =
              toast.tone === 'success'
                ? { bg: 'var(--surface)', border: 'var(--success-border)', icon: 'var(--success)' }
                : toast.tone === 'warning'
                ? { bg: 'var(--surface)', border: 'var(--warning-border)', icon: 'var(--warning)' }
                : toast.tone === 'danger'
                ? { bg: 'var(--surface)', border: 'var(--danger-border)', icon: 'var(--danger)' }
                : { bg: 'var(--surface)', border: 'var(--info-border)', icon: 'var(--info)' }

            return (
              <div
                key={toast.id}
                style={{
                  background: toneColors.bg,
                  borderColor: toneColors.border,
                  boxShadow: 'var(--shadow-lg)',
                }}
                className="flex items-start gap-3 rounded-xl border px-3.5 py-3 text-xs"
              >
                <Icon size={17} style={{ color: toneColors.icon }} className="mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold" style={{ color: 'var(--heading)' }}>
                    {toast.title}
                  </div>
                  {toast.description && (
                    <p className="mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {toast.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="rounded-md p-1 transition-colors hover:bg-[var(--surface-subtle)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </ToastContext.Provider>
  )
}
