# Contributing to DecisionPilot AI

Thank you for your interest in contributing to **DecisionPilot AI**! We welcome contributions to enhance business intelligence, forecasting accuracy, scenario simulation, and user experience for SMEs.

---

## 🛠️ Contribution Workflow

1. **Fork the Repository**: Create your personal fork on GitHub.
2. **Create a Feature Branch**:
   - Features: `feature/feature-name`
   - Bug fixes: `fix/bug-name`
   - Documentation: `docs/doc-name`
   - Performance/Refactoring: `refactor/scope`
3. **Commit Conventions**:
   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(forecast)`: add multi-horizon LightGBM tuning
   - `fix(analytics)`: fix date bounds off-by-one in KPI summary
   - `docs(readme)`: update architecture diagrams
   - `ui(dashboard)`: polish Recharts responsive container
4. **Local Verification**:
   - Backend tests:
     ```sh
     python -m pytest -q
     python -m scripts.pipeline validate
     ```
   - Frontend unit tests, typecheck and build:
     ```sh
     npm --prefix frontend test
     npm --prefix frontend run build
     ```
   - Documentation portal build (`docs-site/`):
     ```sh
     npm --prefix docs-site run build
     ```
5. **Open a Pull Request**: Submit your PR targeting `main` and fill in the PR checklist.

---

## 📜 Development Standards

- **Python**: Follow PEP 8 guidelines. Write type hints for FastAPI endpoints and Pydantic schemas.
- **Frontend**: React 19 + TypeScript. Use functional components and strict typing.
- **Database**: All schema changes must be accompanied by an Alembic migration script (`alembic revision --autogenerate`).
- **Explainability & Safety**: All ML algorithms and scenario simulators must maintain explainable outputs and avoid non-reproducible black-box assertions.

