import { CodeBlock } from '../components/CodeBlock'
import { Terminal, Monitor, Laptop, Box, CheckCircle } from 'lucide-react'

export function Section11Quickstart() {
  const windowsBatch = `# Option A: Double click run.bat or execute from PowerShell
run.bat

# Option B: Start full local dev stack via npm / PowerShell
npm run dev`

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

# 4. Run migrations, bootstrap dataset & train models
python -m alembic upgrade head
python -m scripts.bootstrap
python -m scripts.pipeline validate data/synthetic
python -m scripts.train --out artifacts

# 5. Launch backend (FastAPI) and frontend (Vite)
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
cd frontend && npm run dev`

  const dockerCompose = `# Launch full stack (PostgreSQL + FastAPI + Nginx/Vite) via Docker Compose
docker compose up -d --build

# Verify healthy status
docker compose ps`

  const envFile = `# .env.example configuration
POSTGRES_USER=decisionpilot
POSTGRES_PASSWORD=decisionpilot_local
POSTGRES_DB=decisionpilot
LLM_PROVIDER=none
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
DEMO_ALLOW_IMPORT=false
IMPORT_TOKEN=
WEB_PORT=8080
# Set production for shared deployments; startup then requires named access tokens.
APP_ENV=local
WORKSPACE_ACCESS_TOKENS={}`

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
          <div className="card-title">Node.js 22+</div>
          <p className="card-desc">Used by CI workflows for React 19, Vite, Tailwind CSS, and Three.js builds (Node 20+ supported locally).</p>
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

