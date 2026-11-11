import { CodeBlock } from '../components/CodeBlock'
import { ShieldCheck, CheckSquare, Terminal, GitPullRequest } from 'lucide-react'

export function Section13Testing() {
  const pytestCli = `# Run backend, ETL pipeline, ML verification & RBAC integration suite (18 tests)
python -m pytest tests/test_decisionpilot.py -q

# Run frontend unit & component tests (Vitest)
npm --prefix frontend test

# Run Playwright E2E suites (including connected decision workflow)
npm --prefix frontend run test:e2e`

  const ciYaml = `# .github/workflows/ci.yml summary
name: CI

on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r requirements.txt
      - run: python -m pytest tests/test_decisionpilot.py -q

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm --prefix frontend ci && npm --prefix frontend test && npm --prefix frontend run build

  docs-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm --prefix docs-site ci && npm --prefix docs-site run build`

  return (
    <section id="sec-testing-qa">
      <h2>
        <span className="sec-badge">13</span>
        Testing, Verification &amp; Quality Assurance
      </h2>

      <p className="lead">
        DecisionPilot AI enforces automated test coverage across database referential integrity, ML chronological split checks, API authorization boundaries, React Vitest specs, Playwright E2E flows, and documentation portal builds.
      </p>

      <div className="grid-3" style={{ margin: '24px 0' }}>
        <div className="card">
          <div className="card-title">
            <CheckSquare size={18} className="cyan" />
            1. Backend &amp; Pipeline Tests
          </div>
          <p className="card-desc">
            18 pytest integration tests verifying primary/foreign key constraints, inventory conservation, transactional scenario/recommendation feedback, and forecast gates.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="green" />
            2. Security &amp; RBAC Checks
          </div>
          <p className="card-desc">
            Verifies unauthenticated requests return 401, Viewers receive 403 on writes, read-only SQLite/PostgreSQL transactions block mutations, and CSV uploads enforce limits.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <GitPullRequest size={18} className="violet" />
            3. Frontend, E2E &amp; Docs CI
          </div>
          <p className="card-desc">
            GitHub Actions runs pytest (Python 3.12), Vitest + Vite build (Node 22), and docs-site compilation on every push and pull request; Playwright E2E covers 3 flow specs.
          </p>
        </div>
      </div>

      <h3>Running Local Verification Suites</h3>
      <CodeBlock code={pytestCli} label="bash" />

      <h3>Continuous Integration Workflow</h3>
      <CodeBlock code={ciYaml.trim()} label="yaml" />
    </section>
  )
}

