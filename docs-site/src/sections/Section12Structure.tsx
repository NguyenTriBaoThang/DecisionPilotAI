import { InteractiveProjectTree } from '../components/InteractiveProjectTree'
import { FolderGit2, FileCheck, Layers } from 'lucide-react'

export function Section12Structure() {
  return (
    <section id="sec-project-structure">
      <h2>
        <span className="sec-badge">12</span>
        Project Structure &amp; Codebase Guide
      </h2>

      <p className="lead">
        The repository is structured with a strict separation of concerns across backend services, AI models, frontend client presentation, data engineering scripts, and documentation.
      </p>

      {/* Interactive Project Directory Tree */}
      <InteractiveProjectTree />

      <div className="grid-3" style={{ marginTop: '24px' }}>
        <div className="card">
          <div className="card-title">
            <Layers size={18} className="indigo" />
            Backend Modules (backend/)
          </div>
          <p className="card-desc">
            Organized around FastAPI routes, Pydantic schemas, SQLAlchemy database engines, and secure session management.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <FolderGit2 size={18} className="cyan" />
            Frontend Modules (frontend/)
          </div>
          <p className="card-desc">
            Componentized React 19 architecture featuring interactive SVG/Three.js views, Recharts analytics, and mock data fallbacks for static hosting.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <FileCheck size={18} className="green" />
            AI &amp; Scripts (ai_service/ &amp; scripts/)
          </div>
          <p className="card-desc">
            Pure Python algorithms for LightGBM training, Isolation Forest anomaly scoring, and 7-stage data pipeline validation.
          </p>
        </div>
      </div>
    </section>
  )
}

