import { InteractiveApiExplorer } from '../components/InteractiveApiExplorer'
import { CodeBlock } from '../components/CodeBlock'
import { Terminal, Shield, Lock, FileCode } from 'lucide-react'

export function Section10Api() {
  const authExample = `# In APP_ENV=production, workspace endpoints require a Bearer token (GET /health remains public)
curl -X GET "http://localhost:8000/session" \\
  -H "Authorization: Bearer <workspace-token>" \\
  -H "Accept: application/json"`

  return (
    <section id="sec-api-reference">
      <h2>
        <span className="sec-badge">10</span>
        REST API Specification &amp; Explorer
      </h2>

      <p className="lead">
        The DecisionPilot AI backend exposes high-performance REST endpoints built with FastAPI. All endpoints return standard JSON responses and enforce strict Bearer token authentication and role-based access control.
      </p>

      {/* Interactive API Explorer */}
      <InteractiveApiExplorer />

      <h3>Authentication &amp; Security Headers</h3>
      <p>
        Requests must include the <code>Authorization: Bearer &lt;token&gt;</code> header. Unauthenticated requests are rejected with <code>401 Unauthorized</code> (except for public <code>GET /health</code>).
      </p>

      <CodeBlock code={authExample} label="bash" />

      <h3>Standard HTTP Status Codes</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status Code</th>
              <th>Status Name</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>200 OK</td>
              <td>Success</td>
              <td>Request executed successfully; analytical payload returned.</td>
            </tr>
            <tr>
              <td className="mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>401 Unauthorized</td>
              <td>Missing Auth</td>
              <td>Bearer token missing or invalid workspace secret.</td>
            </tr>
            <tr>
              <td className="mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>403 Forbidden</td>
              <td>Insufficient Role</td>
              <td>Caller role (e.g. Viewer) lacks permission to perform write or import actions.</td>
            </tr>
            <tr>
              <td className="mono" style={{ color: 'var(--red)', fontWeight: 700 }}>404 Not Found</td>
              <td>Resource Missing</td>
              <td>Specified alert ID or recommendation ID does not exist in dataset.</td>
            </tr>
            <tr>
              <td className="mono" style={{ color: 'var(--red)', fontWeight: 700 }}>409 Conflict</td>
              <td>Stale Dataset</td>
              <td>Dataset was reloaded or replaced during simulation; caller must re-run with current hash.</td>
            </tr>
            <tr>
              <td className="mono" style={{ color: 'var(--red)', fontWeight: 700 }}>422 Unprocessable</td>
              <td>Validation Failed</td>
              <td>Request body violated Pydantic domain models or foreign key constraints.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

