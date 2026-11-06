import { useState } from 'react'
import { Check, Moon, Sliders, Sun, UserCheck } from 'lucide-react'
import { Button, Card, Heading, Pill, SectionTitle } from '../ui'
import { type Session } from '../api'
import { usePreferences, translate, type Preferences } from '../preferences'

interface SettingsPageProps {
  dark: boolean
  setDark: (val: boolean) => void
  session: Session
}

export function SettingsPage({ dark, setDark, session }: SettingsPageProps) {
  const { preferences, save } = usePreferences()
  const [currencyFormat, setCurrencyFormat] = useState<Preferences['currency']>(preferences.currency)
  const [language, setLanguage] = useState<Preferences['language']>(preferences.language)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const handleSave = () => {
    try { save({ currency: currencyFormat, language }); setSaveError('') }
    catch { setSaveError('Preferences could not be saved. Check browser storage permissions.'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <Heading
        eyebrow="CONFIGURATION"
        title="Settings & Workspace Preferences"
        subtitle="Manage appearance, interface defaults, business currency display, and workspace diagnostics."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Appearance & Themes */}
        <Card>
          <SectionTitle
            title="Appearance & Theme"
            detail="Switch between Dark First Enterprise Theme and Crisp Light Mode."
          />
          <div className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setDark(true)}
                className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${
                  dark
                    ? 'border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-500/10'
                    : 'border-slate-800 bg-slate-900/40 opacity-70'
                }`}
              >
                <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-300">
                  <Moon size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">Deep Space Dark</div>
                  <div className="text-xs text-slate-400">Default for executive BI</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDark(false)}
                className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${
                  !dark
                    ? 'border-indigo-500 bg-slate-100 shadow-lg text-slate-900'
                    : 'border-slate-800 bg-slate-900/40 opacity-70'
                }`}
              >
                <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                  <Sun size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm">Crisp Light</div>
                  <div className="text-xs text-slate-500">High-contrast daytime view</div>
                </div>
              </button>
            </div>
          </div>
        </Card>

        {/* Regional & Financial Preferences */}
        <Card>
          <SectionTitle
            title="Financial Display & Localization"
            detail="Configure currency unit, timezone, and number formatting."
          />
          <div className="space-y-4 pt-2">
            <label className="field">
              <span>Currency Display Mode</span>
              <select value={currencyFormat} onChange={(e) => { setCurrencyFormat(e.target.value as Preferences['currency']); setSaved(false) }}>
                <option value="vnd">Vietnamese Dong (₫ VND Integer)</option>
                <option value="compact">Compact Formatted (₫2.4M / ₫1.8B)</option>
              </select>
            </label>

            <label className="field">
              <span>Language for navigation, page titles and number formatting</span>
              <select value={language} onChange={(e) => { setLanguage(e.target.value as Preferences['language']); setSaved(false) }}>
                <option value="en">English (Official Competition Language)</option>
                <option value="vi">Tiếng Việt (Vietnamese SME Context)</option>
              </select>
            </label>

            <div className="text-xs text-slate-400">
              Timezone: <strong className="text-slate-200">Asia/Ho_Chi_Minh (UTC+7)</strong>
            </div>
          </div>
        </Card>

        {/* Operator Profile */}
        <Card>
          <SectionTitle
            title="Operator Role & Access"
            detail="Current workspace user permissions for single-workspace MVP."
            aside={<UserCheck size={18} className="text-emerald-400" />}
          />
          <div className="space-y-3 pt-1 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Active Profile:</span>
              <span className="font-semibold text-white">{session.actor} / {session.role}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Workspace Mode:</span>
              <Pill tone="success">{session.authentication === 'token' ? 'AUTHENTICATED WORKSPACE' : 'LOCAL DEMO · NO SIGN IN'}</Pill>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400">Audit Trail Logging:</span>
              <span className="font-semibold text-cyan-300">Enabled (Append-Only)</span>
            </div>
          </div>
        </Card>

        {/* System Diagnostics */}
        <Card>
          <SectionTitle
            title="System Diagnostics & Telemetry"
            detail="Backend health and ML inference pipelines."
            aside={<Sliders size={18} className="text-violet-400" />}
          />
          <div className="space-y-3 pt-1 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">API Endpoint:</span>
              <span className="font-mono text-white">/api (Proxied via Vite / Nginx)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">OpenAPI Spec:</span>
              <a href="/api/docs" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                Swagger Docs (OpenAPI v3.1)
              </a>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400">Model Artifact Version:</span>
              <span className="text-slate-300">See active version in Data Sources</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        {session.authentication === 'token' && <Button onClick={() => { sessionStorage.removeItem('dp-access-token'); window.location.reload() }}>Sign out</Button>}
        {saveError && <p role="alert">{saveError}</p>}
        <Button className="primary flex items-center gap-2" onClick={handleSave}>
          {saved ? <Check size={16} /> : null}
          <span>{translate(saved ? 'Preferences Saved' : 'Save Preferences', preferences.language)}</span>
        </Button>
      </div>
    </>
  )
}

