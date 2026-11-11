import { CodeBlock } from '../components/CodeBlock'
import { Terminal, Monitor, Laptop, Box, CheckCircle } from 'lucide-react'

export function Section11Quickstart() {
  const windowsBatch = `# Option A: One-command local dev stack (API on :8000 + Vite on :5173)
.\\scripts\\dev.ps1

# Option B: Bootstrap local SQLite DB + train artifact bundle manually
python -m scripts.bootstrap`

  const linuxBash = `# 1. Clone repository
git clone https://github.com/NguyenTriBaoThang/DecisionPilotAI.git
cd DecisionPilotAI

# 2. Setup Python backend environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Setup React frontend environment
npm --prefix frontend install

# 4. Validate, load synthetic dataset & train artifact bundle
python -m scripts.pipeline validate data/synthetic --report artifacts/data_quality.json
python -m scripts.pipeline load data/synthetic
python -m scripts.train --out artifacts

# 5. Launch backend (:8000) and frontend (:5173), or use bash scripts/dev.sh
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
npm --prefix frontend run dev`

  const dockerCompose = `# Launch full stack (PostgreSQL + FastAPI + Nginx Dashboard on :8080)
docker compose up -d --build

# Verify healthy status & API health
docker compose ps
curl http://localhost:8080/api/health`

  const envFile = `# .env configuration example
DATABASE_URL=postgresql+psycopg://decisionpilot:secret@localhost:5432/decisionpilot
# Or omit DATABASE_URL for zero-config SQLite (data/local.sqlite)

PORT=8000
ROOT_PATH=/api
WORKSPACE_VIEWER_TOKEN=replace-viewer-token
WORKSPACE_ANALYST_TOKEN=replace-analyst-token
DEMO_ALLOW_IMPORT=false
IMPORT_TOKEN=replace-import-token`

  return (
    <section id="sec-quickstart">
      <h2>
        <span className="sec-badge">11</span>
        Installation &amp; Quick Start
      </h2>

      <p className="lead">
        DecisionPilot AI supports Windows PowerShell launchers, Linux/macOS command lines, and reproducible multi-container Docker Compose setups.
      </p>

      {/* Prerequisites */}
      <div className="grid-3" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="card-title">Python 3.11+</div>
          <p className="card-desc">Required for FastAPI, LightGBM 4.6, Scikit-learn 1.7, and SQLAlchemy 2.0 (CI tests 3.12).</p>
        </div>
        <div className="card">
          <div className="card-title">Node.js 22+</div>
          <p className="card-desc">Required for React 19, Vite 7, Three.js, and Playwright verification suites.</p>
        </div>
        <div className="card">
          <div className="card-title">PostgreSQL / SQLite</div>
          <p className="card-desc">PostgreSQL supported via psycopg/Docker; zero-config SQLite (<code>data/local.sqlite</code>) works out-of-the-box.</p>
        </div>
      </div>

      <h3>Method 1: Windows PowerShell Quick Start</h3>
      <p>
        On Windows systems, run the bundled PowerShell dev stack launcher:
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

