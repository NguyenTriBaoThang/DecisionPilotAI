import { Globe } from 'lucide-react'
import { usePreferences } from '../preferences'

export function LanguageSwitcher() {
  const { preferences, setLanguage } = usePreferences()
  const isVi = preferences.language === 'vi'

  return (
    <div className="flex items-center rounded-xl border border-indigo-500/25 bg-slate-900/80 p-0.5 shadow-sm">
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
          isVi
            ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Tiếng Việt"
      >
        <span>🇻🇳</span>
        <span>VI</span>
      </button>

      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
          !isVi
            ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="English"
      >
        <span>🇬🇧</span>
        <span>EN</span>
      </button>
    </div>
  )
}

