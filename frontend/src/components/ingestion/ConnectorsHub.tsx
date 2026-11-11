import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Plug, Server, ShieldAlert } from 'lucide-react'
import {
  createDataSource,
  listConnectors,
  listDataSources,
  testDataSource,
  type ConnectorSpec,
  type Session,
} from '../../api'
import { Button, Card, ErrorState, Loading, Pill, SectionTitle, useToast } from '../../ui'

export function ConnectorsHub({ companyId, session }: { companyId: string; session: Session }) {
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [configValues, setConfigValues] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<{ ok: boolean; status: string; errors?: string[]; message?: string } | null>(null)

  const connectorsQuery = useQuery({
    queryKey: ['connectors'],
    queryFn: listConnectors,
    staleTime: 5 * 60_000,
  })

  const sourcesQuery = useQuery({
    queryKey: ['data-sources', companyId],
    queryFn: listDataSources,
  })

  const testMutation = useMutation({
    mutationFn: () => testDataSource(selectedType || 'postgresql', configValues),
    onSuccess: (res) => setTestResult(res),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      createDataSource({
        name: sourceName.trim() || `${selectedSpec?.display_name || 'Connector'} Source`,
        source_type: selectedType || 'postgresql',
        config: configValues,
      }),
    onSuccess: async (created) => {
      notify({
        tone: 'success',
        title: 'Data source connector saved',
        description: `${created.name} (${created.source_type}) registered with credentials redacted.`,
      })
      setSelectedType(null)
      setSourceName('')
      setConfigValues({})
      setTestResult(null)
      await queryClient.invalidateQueries({ queryKey: ['data-sources', companyId] })
    },
  })

  const connectors = connectorsQuery.data?.items || []
  const selectedSpec: ConnectorSpec | undefined = connectors.find((c) => c.connector_type === selectedType)
  const canConfigure = session.role !== 'viewer'

  return (
    <Card className="space-y-4">
      <SectionTitle
        title="Connectors & External Integrations"
        detail="Active file pipeline plus extensible adapters for PostgreSQL, SQL Server, MySQL, REST APIs, and ERP / CRM / POS systems."
        aside={<Plug size={17} style={{ color: 'var(--primary)' }} />}
      />

      <ErrorState error={connectorsQuery.error || sourcesQuery.error || testMutation.error || saveMutation.error} />
      {connectorsQuery.isLoading && <Loading />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {connectors.map((c) => {
          const isSelected = selectedType === c.connector_type
          return (
            <div
              key={c.connector_type}
              className="rounded-xl border p-3.5 flex flex-col justify-between gap-3 text-xs transition-colors"
              style={{
                background: isSelected ? 'var(--primary-soft)' : 'var(--surface-muted)',
                borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
              }}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-semibold" style={{ color: 'var(--heading)' }}>
                    {c.display_name}
                  </strong>
                  <Pill tone={c.status === 'active' ? 'success' : 'accent'}>
                    {c.status === 'active' ? 'ACTIVE' : 'EXTENSIBLE'}
                  </Pill>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {c.description}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[10px] font-mono uppercase" style={{ color: 'var(--text-muted)' }}>
                  {c.supported_formats.join(' · ')}
                </span>
                {c.status === 'extensible' && canConfigure && (
                  <Button
                    size="sm"
                    variant={isSelected ? 'primary' : 'outline'}
                    onClick={() => {
                      setSelectedType(isSelected ? null : c.connector_type)
                      setConfigValues({})
                      setSourceName('')
                      setTestResult(null)
                    }}
                  >
                    {isSelected ? 'Close' : 'Configure'}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected Connector Configuration Drawer */}
      {selectedSpec && (
        <div
          className="rounded-xl border p-4 space-y-4 text-xs"
          style={{ background: 'var(--surface)', borderColor: 'var(--primary-border)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm" style={{ color: 'var(--heading)' }}>
              Configure {selectedSpec.display_name} Connector
            </strong>
            <Pill tone="info">Secrets redacted at rest</Pill>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="dp-field">
              <span className="dp-field-label">Connection Label</span>
              <input
                type="text"
                placeholder={`e.g. Production ${selectedSpec.display_name}`}
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="dp-input"
              />
            </label>

            {selectedSpec.config_fields.map((field) => (
              <label key={field.name} className="dp-field">
                <span className="dp-field-label">
                  {field.label} {field.required ? '*' : ''}
                </span>
                {field.field_type === 'select' ? (
                  <select
                    value={configValues[field.name] || ''}
                    onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    className="dp-select"
                  >
                    <option value="">Select {field.label}…</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.secret || field.field_type === 'password' ? 'password' : field.field_type === 'number' ? 'number' : 'text'}
                    placeholder={field.placeholder}
                    value={configValues[field.name] || ''}
                    onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    className="dp-input"
                  />
                )}
              </label>
            ))}
          </div>

          {testResult && (
            <div
              className="rounded-lg border px-3.5 py-2.5 flex items-start gap-2"
              style={{
                background: testResult.status === 'invalid_config' ? 'var(--danger-bg)' : 'var(--info-bg)',
                borderColor: testResult.status === 'invalid_config' ? 'var(--danger-border)' : 'var(--info-border)',
                color: testResult.status === 'invalid_config' ? 'var(--danger-text)' : 'var(--info-text)',
              }}
            >
              {testResult.status === 'invalid_config' ? (
                <ShieldAlert size={15} className="mt-0.5 flex-shrink-0" />
              ) : (
                <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />
              )}
              <div>
                <div className="font-semibold">Status: {testResult.status}</div>
                {testResult.message && <div>{testResult.message}</div>}
                {testResult.errors && testResult.errors.length > 0 && (
                  <ul className="list-disc list-inside mt-1">
                    {testResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" disabled={testMutation.isPending} onClick={() => testMutation.mutate()}>
              {testMutation.isPending ? 'Testing Config…' : 'Test Configuration'}
            </Button>
            <Button variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? 'Saving…' : 'Save Company Connector'}
            </Button>
          </div>
        </div>
      )}

      {/* Registered Tenant Connectors */}
      {sourcesQuery.data && sourcesQuery.data.items.length > 0 && (
        <div className="space-y-2 pt-2 border-t text-xs" style={{ borderColor: 'var(--border)' }}>
          <div className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--heading)' }}>
            <Server size={13} style={{ color: 'var(--primary)' }} />
            <span>Registered Company Data Sources ({sourcesQuery.data.items.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {sourcesQuery.data.items.map((src) => (
              <div
                key={src.id}
                className="rounded-lg border px-3 py-2 flex items-center justify-between gap-2"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate" style={{ color: 'var(--heading)' }}>
                    {src.name}
                  </div>
                  <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                    {src.source_type} · {src.id}
                  </div>
                </div>
                <Pill tone={src.status === 'active' ? 'success' : 'accent'}>{src.status.toUpperCase()}</Pill>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

