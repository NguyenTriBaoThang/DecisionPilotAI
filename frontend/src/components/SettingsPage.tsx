import { useState } from 'react'
import { Check, Moon, Sliders, Sun, UserCheck } from 'lucide-react'
import { Button, Card, Heading, Pill, SectionTitle, useToast } from '../ui'
import { type Session } from '../api'
import { usePreferences, translate, type Preferences } from '../preferences'

interface SettingsPageProps {
  dark: boolean
  setDark: (val: boolean) => void
  session: Session
}

export function SettingsPage({ dark, setDark, session }: SettingsPageProps) {
  const { preferences, save } = usePreferences()
  const { notify } = useToast()
  const [currencyFormat, setCurrencyFormat] = useState<Preferences['currency']>(preferences.currency)
  const [language, setLanguage] = useState<Preferences['language']>(preferences.language)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const handleSave = () => {
    try {
      save({ currency: currencyFormat, language })
      setSaveError('')
    } catch {
      setSaveError('Preferences could not be saved. Check browser storage permissions.')
      return
    }
    setSaved(true)
    notify({
      tone: 'success',
      title: translate('Preferences Saved', language),
      description: `Language: ${language.toUpperCase()} · Currency: ${currencyFormat}`,
    })
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <Heading
        eyebrow="CONFIGURATION"
        title={translate('Settings & Workspace Preferences', preferences.language)}
        subtitle="Manage appearance, interface defaults, business currency display, and workspace diagnostics."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Appearance & Themes */}
        <Card>
          <SectionTitle
            title="Appearance & Theme"
            detail="Clean Light UI is the default enterprise theme. Switch to Dark mode at any time."
          />
          <div className="pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => setDark(false)}
                style={{
                  background: !dark ? 'var(--primary-soft)' : 'var(--surface-muted)',
                  borderColor: !dark ? 'var(--primary)' : 'var(--border)',
                }}
                className="p-4 rounded-xl border text-left flex items-center gap-3 transition-colors hover:border-[var(--border-strong)]"
              >
                <div
                  className="p-2.5 rounded-lg border"
                  style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--primary)',
                  }}
                >
                  <Sun size={18} />
                </div>
                <div>
                  <div className="font-semibold text-xs" style={{ color: 'var(--heading)' }}>
                    Crisp Light (Default)
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    High-contrast enterprise UI
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDark(true)}
                style={{
                  background: dark ? 'var(--primary-soft)' : 'var(--surface-muted)',
                  borderColor: dark ? 'var(--primary)' : 'var(--border)',
                }}
                className="p-4 rounded-xl border text-left flex items-center gap-3 transition-colors hover:border-[var(--border-strong)]"
              >
                <div
                  className="p-2.5 rounded-lg border"
                  style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Moon size={18} />
                </div>
                <div>
                  <div className="font-semibold text-xs" style={{ color: 'var(--heading)' }}>
                    Slate Dark
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Low-light executive view
                  </div>
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
          <div className="space-y-4 pt-1">
            <label className="dp-field">
              <span className="dp-field-label">Currency Display Mode</span>
              <select
                value={currencyFormat}
                onChange={(e) => {
                  setCurrencyFormat(e.target.value as Preferences['currency'])
                  setSaved(false)
                }}
                className="dp-select"
              >
                <option value="vnd">Vietnamese Dong (₫ VND Integer)</option>
                <option value="compact">Compact Formatted (₫2.4M / ₫1.8B)</option>
              </select>
            </label>

            <label className="dp-field">
              <span className="dp-field-label">Language for navigation, page titles and number formatting</span>
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value as Preferences['language'])
                  setSaved(false)
                }}
                className="dp-select"
              >
                <option value="en">English (Official Competition Language)</option>
                <option value="vi">Tiếng Việt (Vietnamese SME Context)</option>
              </select>
            </label>

            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Timezone: <strong style={{ color: 'var(--heading)' }}>Asia/Ho_Chi_Minh (UTC+7)</strong>
            </div>
          </div>
        </Card>

        {/* Operator Profile */}
        <Card>
          <SectionTitle
            title="Operator Role & Access"
            detail="Current workspace user permissions for single-workspace MVP."
            aside={<UserCheck size={16} style={{ color: 'var(--success)' }} />}
          />
          <div className="space-y-3 pt-1 text-xs">
            <div className="flex justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Active Profile:</span>
              <span className="font-semibold" style={{ color: 'var(--heading)' }}>
                {session.actor} / {session.role}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Workspace Mode:</span>
              <Pill tone="success">
                {session.authentication === 'token' ? 'AUTHENTICATED WORKSPACE' : 'LOCAL DEMO · NO SIGN IN'}
              </Pill>
            </div>
            <div className="flex justify-between py-2">
              <span style={{ color: 'var(--text-secondary)' }}>Audit Trail Logging:</span>
              <span className="font-semibold" style={{ color: 'var(--primary-text)' }}>
                Enabled (Append-Only)
              </span>
            </div>
          </div>
        </Card>

        {/* System Diagnostics */}
        <Card>
          <SectionTitle
            title="System Diagnostics & Telemetry"
            detail="Backend health and ML inference pipelines."
            aside={<Sliders size={16} style={{ color: 'var(--primary)' }} />}
          />
          <div className="space-y-3 pt-1 text-xs">
            <div className="flex justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>API Endpoint:</span>
              <span className="font-mono font-medium" style={{ color: 'var(--heading)' }}>
                /api (Proxied via Vite / Nginx)
              </span>
            </div>
            <div className="flex justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>OpenAPI Spec:</span>
              <a
                href="/api/docs"
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:underline"
                style={{ color: 'var(--primary-text)' }}
              >
                Swagger Docs (OpenAPI v3.1)
              </a>
            </div>
            <div className="flex justify-between py-2">
              <span style={{ color: 'var(--text-secondary)' }}>Model Artifact Version:</span>
              <span style={{ color: 'var(--text)' }}>See active version in Data Sources</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {session.authentication === 'token' && (
          <Button
            variant="outline"
            onClick={() => {
              sessionStorage.removeItem('dp-access-token')
              window.location.reload()
            }}
          >
            Sign out
          </Button>
        )}
        {saveError && (
          <p role="alert" className="text-xs font-medium" style={{ color: 'var(--danger-text)' }}>
            {saveError}
          </p>
        )}
        <Button variant="primary" onClick={handleSave}>
          {saved ? <Check size={15} /> : null}
          <span>{translate(saved ? 'Preferences Saved' : 'Save Preferences', preferences.language)}</span>
        </Button>
      </div>
    </div>
  )
}
