import { useState } from 'react'
import { API_ENDPOINTS, type ApiEndpoint } from '../data/api'
import { CodeBlock } from './CodeBlock'
import { Send, Terminal } from 'lucide-react'

export function InteractiveApiExplorer() {
  const [activeIdx, setActiveIdx] = useState(4) // default to /kpi/summary
  const ep = API_ENDPOINTS[activeIdx]

  const getMethodBadge = (m: string) => {
    switch (m) {
      case 'GET':
        return 'badge-cyan'
      case 'POST':
        return 'badge-indigo'
      case 'PUT':
        return 'badge-amber'
      case 'DELETE':
        return 'badge-red'
      default:
        return 'badge-cyan'
    }
  }

  const curlCommand = `curl -X ${ep.method} "https://api.decisionpilot.ai/api${ep.path}" \\
  -H "Authorization: Bearer dpa_ws_demo_secret_token" \\
  -H "Content-Type: application/json"${
    ep.requestBody
      ? ` \\
  -d '${ep.requestBody.replace(/\n/g, '').replace(/\s+/g, ' ')}'`
      : ''
  }`

  return (
    <div style={{ margin: '24px 0' }}>
      <div className="grid-2" style={{ gridTemplateColumns: '320px 1fr' }}>
        {/* Endpoint Selector List */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '10px',
            padding: '12px',
            maxHeight: '520px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: '0.74rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '4px 8px' }}>
            Available Endpoints ({API_ENDPOINTS.length})
          </span>
          {API_ENDPOINTS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '6px',
                background: activeIdx === idx ? 'var(--panel)' : 'transparent',
                border: `1px solid ${activeIdx === idx ? 'var(--line-bright)' : 'transparent'}`,
                color: activeIdx === idx ? '#FFFFFF' : 'var(--text-muted)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span className={`badge ${getMethodBadge(item.method)}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                {item.method}
              </span>
              <span className="mono" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.path}
              </span>
            </button>
          ))}
        </div>

        {/* Endpoint Detail & Try panel */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: '10px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`badge ${getMethodBadge(ep.method)}`} style={{ fontSize: '0.82rem', padding: '3px 8px' }}>
                {ep.method}
              </span>
              <span className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF' }}>
                {ep.path}
              </span>
            </div>
            <span className="badge badge-amber" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
              Required Role: {ep.role}
            </span>
          </div>

          <p style={{ fontSize: '0.92rem', color: '#CBD5E1', marginBottom: '16px' }}>{ep.description}</p>

          {ep.queryParams && ep.queryParams.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700 }}>
                Query Parameters
              </span>
              <div className="table-wrap" style={{ marginTop: '6px', marginBottom: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Required</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.queryParams.map((param, pIdx) => (
                      <tr key={pIdx}>
                        <td className="mono" style={{ color: 'var(--cyan)' }}>{param.name}</td>
                        <td className="mono dim">{param.type}</td>
                        <td>
                          <span className={`badge ${param.required ? 'badge-amber' : 'badge-green'}`}>
                            {param.required ? 'YES' : 'OPTIONAL'}
                          </span>
                        </td>
                        <td>{param.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ep.requestBody && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--indigo)', fontWeight: 700 }}>
                Request Body (application/json)
              </span>
              <CodeBlock code={ep.requestBody} label="payload.json" />
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700 }}>
              cURL Request Example
            </span>
            <CodeBlock code={curlCommand} label="bash" />
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--green)', fontWeight: 700 }}>
              Sample Response Body (200 OK)
            </span>
            <CodeBlock code={ep.responseSample} label="response.json" />
          </div>
        </div>
      </div>
    </div>
  )
}

