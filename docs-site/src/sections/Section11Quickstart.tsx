import { CodeBlock } from '../components/CodeBlock'
import { Terminal, Monitor, Laptop, Box, CheckCircle } from 'lucide-react'

export function Section11Quickstart() {
  const windowsBatch = `# Option A: Double click run.bat or run via Windows Command Prompt / PowerShell
run.bat

# Option B: Run via PowerShell developer launcher
.\\dev.ps1 -Target dev`

  const linuxBash = `# 1. Clone repository
git clone https://github.com/NguyenTriBaoThang/DecisionPilotAI.git
cd DecisionPilotAI

# 2. Setup Python backend environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Setup React frontend environment
cd frontend
npm install
cd ..

# 4. Ingest baseline dataset & train initial models
python -m scripts.pipeline --dataset-dir data/raw --output-dir artifacts
python -m scripts.train --dataset-id f32e87e3a5744333ff98d3bf

# 5. Launch backend (FastAPI) and frontend (Vite)
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
cd frontend && npm run dev`

  const dockerCompose = `# Launch full stack (PostgreSQL + FastAPI + Vite Dashboard) via Docker Compose
docker compose up -d --build

# Verify healthy status
docker compose ps`

  const envFile = `# .env configuration example
DATABASE_URL=postgresql://decisionpilot:secret@localhost:5432/decisionpilot_db
# Or SQLite fallback:
# DATABASE_URL=sqlite:///data/decisionpilot.db

PORT=8000
ROOT_PATH=/api
WORKSPACE_ACCESS_TOKEN=dpa_ws_demo_secret_token
DEMO_ALLOW_IMPORT=false
IMPORT_TOKEN=secure_import_key_123`

  return (
    <section id="sec-quickstart">
      <h2>
        <span className="sec-badge">11</span>
        Installation &amp; Quick Start
      </h2>

      <p className="lead">
        DecisionPilot AI supports multiple deployment topologies: native Windows batch execution, Linux/macOS command lines, and reproducible multi-container Docker Compose.
      </p>

      {/* Prerequisites */}
      <div className="grid-3" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="card-title">Python 3.10+</div>
          <p className="card-desc">Required for FastAPI backend, LightGBM, Scikit-learn, and SQLAlchemy 2.0.</p>
        </div>
        <div className="card">
          <div className="card-title">Node.js 20+</div>
          <p className="card-desc">Required for React 19, Vite 6, Tailwind CSS, and Three.js frontend build.</p>
        </div>
        <div className="card">
          <div className="card-title">PostgreSQL / SQLite</div>
          <p className="card-desc">PostgreSQL 16 recommended for production; zero-config SQLite supported out-of-the-box.</p>
        </div>
      </div>

      <h3>Method 1: Windows One-Click Quick Start</h3>
      <p>
        On Windows systems, execute the bundled batch or PowerShell automation scripts:
      </p>
      <CodeBlock code={windowsBatch} label="powershell" />

      <h3>Method 2: Linux &amp; macOS Step-by-Step Setup</h3>
      <CodeBlock code={linuxBash} label="bash" />

      <h3>Method 3: Docker Compose Containerization</h3>
      <CodeBlock code={dockerCompose} label="docker" />

      <h3>Environment Configuration (.env)</h3>
      <p>
        Copy <code>.env.example</code> to <code>.env</code> and configure your workspace credentials:
      </p>
      <CodeBlock code={envFile} label=".env" />
    </section>
  )
}

