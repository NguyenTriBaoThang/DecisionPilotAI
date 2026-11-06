import { CodeBlock } from '../components/CodeBlock'
import { ShieldCheck, CheckSquare, Terminal, GitPullRequest } from 'lucide-react'

export function Section13Testing() {
  const pytestCli = `# Run all backend, pipeline, and AI service unit tests
pytest -v --cov=backend --cov=ai_service --cov=scripts

# Run specific data validation and foreign key integrity test suite
pytest tests/test_pipeline.py -v

# Run API endpoint access control and schema regression tests
pytest tests/test_api.py -v`

  const ciYaml = `# .github/workflows/ci.yml snippet
name: CI / Test Automation

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r requirements.txt
      - run: pytest -v tests/

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci && npm run build`

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
            GitHub Actions runs pytest across Python 3.10-3.12 and typechecks TypeScript frontend code on every push and pull request.
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

