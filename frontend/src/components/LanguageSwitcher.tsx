import { Globe } from 'lucide-react'
import { usePreferences } from '../preferences'

export function LanguageSwitcher() {
  const { preferences, setLanguage } = usePreferences()
  const isVi = preferences.language === 'vi'

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border p-0.5"
      style={{
        background: 'var(--surface-muted)',
        borderColor: 'var(--border)',
      }}
      role="group"
      aria-label="Interface language"
    >
      <span className="px-1.5 flex items-center" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
        <Globe size={13} />
      </span>
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        aria-pressed={isVi}
        title="Tiếng Việt"
        style={
          isVi
            ? { background: 'var(--surface)', color: 'var(--heading)', boxShadow: 'var(--shadow-xs)' }
            : { color: 'var(--text-secondary)' }
        }
        className="px-2 py-1 rounded-md text-[11px] font-semibold transition-all"
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={!isVi}
        title="English"
        style={
          !isVi
            ? { background: 'var(--surface)', color: 'var(--heading)', boxShadow: 'var(--shadow-xs)' }
            : { color: 'var(--text-secondary)' }
        }
        className="px-2 py-1 rounded-md text-[11px] font-semibold transition-all"
      >
        EN
      </button>
    </div>
  )
}
