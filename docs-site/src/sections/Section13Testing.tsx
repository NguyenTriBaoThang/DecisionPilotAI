import { CodeBlock } from '../components/CodeBlock'
import { ShieldCheck, CheckSquare, Terminal, GitPullRequest } from 'lucide-react'

export function Section13Testing() {
  const pytestCli = `# Run all 14 backend, AI service, and pipeline integration tests
python -m pytest tests/test_decisionpilot.py -v

# Validate synthetic data integrity
python -m scripts.pipeline validate

# Run frontend unit regression tests and production build
npm --prefix frontend test
npm --prefix frontend run build`

  const ciYaml = `# .github/workflows/ci.yml
name: DecisionPilot AI CI Pipeline

on:
  push:
    branches: [ main, master, develop ]
  pull_request:
    branches: [ main, master, develop ]

jobs:
  frontend-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm', cache-dependency-path: 'frontend/package-lock.json' }
      - run: npm ci && npm run build && npm test && npm audit --audit-level=high
        working-directory: frontend

  docs-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm', cache-dependency-path: 'docs-site/package-lock.json' }
      - run: npm ci && npm run build
        working-directory: docs-site

  backend-check: # matrix: sqlite & postgresql 16
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: python -m alembic upgrade head && python -m scripts.bootstrap
      - run: python -m pytest -q && python -m scripts.pipeline validate

  browser-workflow:
    runs-on: ubuntu-latest # Playwright E2E against live FastAPI + Chromium

  docker-build-check:
    runs-on: ubuntu-latest # Validates Docker image build`

  return (
    <section id="sec-testing-qa">
      <h2>
        <span className="sec-badge">13</span>
        Testing, Verification &amp; Quality Assurance
      </h2>

      <p className="lead">
        DecisionPilot AI employs rigorous test coverage across database referential integrity, ML chronological split correctness, API authorization boundaries, and frontend compilation.
      </p>

      <div className="grid-3" style={{ margin: '24px 0' }}>
        <div className="card">
          <div className="card-title">
            <CheckSquare size={18} className="cyan" />
            1. Pipeline Integrity Tests
          </div>
          <p className="card-desc">
            Asserts that primary keys are unique, foreign keys point to valid entities, inventory balances reconcile, and VND currency values are integers.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="green" />
            2. Security &amp; RBAC Tests
          </div>
          <p className="card-desc">
            Verifies that unauthenticated requests receive 401, Viewers cannot post feedback (403), and read-only SQL connections block modification attempts.
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <GitPullRequest size={18} className="violet" />
            3. Automated CI Pipelines
          </div>
          <p className="card-desc">
            GitHub Actions runs pytest (Python 3.12) against SQLite &amp; PostgreSQL 16, validates frontend &amp; docs builds (Node 22), runs Playwright E2E, and verifies Docker builds.
          </p>
        </div>
      </div>

      <h3>Running the Pytest Test Suite</h3>
      <CodeBlock code={pytestCli} label="bash" />

      <h3>Continuous Integration Workflow</h3>
      <CodeBlock code={ciYaml.trim()} label="yaml" />
    </section>
  )
}

