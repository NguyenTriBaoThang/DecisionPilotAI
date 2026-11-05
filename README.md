# DecisionPilot AI

**AI-Powered Business Data Analysis, Forecasting and Decision Support System for SMEs**  
Ask. Understand. Predict. Decide.

DecisionPilot AI is a local, single-workspace MVP for AI for Business Innovation 2026. It connects a React workspace to a FastAPI analytics and ML backend. The included data is a reproducible retail and services simulation, with 50,000 transactions, 50 SKUs, 10,000 customers and 730 calendar days.

## Run with Docker Compose

From this directory, with Docker and the Compose plugin installed:

```sh
cp .env.example .env
docker compose up --build
```

Open [DecisionPilot AI](http://localhost:8080) and [API docs](http://localhost:8080/api/docs). PostgreSQL initializes on first run, Alembic creates the tables, and the backend loads the bundled dataset and its version-matched model artifact. The workspace stays on loopback by default.

## Run locally without Docker

Use Python 3.11 or 3.12 and Node.js 22.12 or later. The commands below use a POSIX shell. On Windows, use WSL or Docker Desktop.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm --prefix frontend ci
npm run dev
```

Open [the local workspace](http://127.0.0.1:5173). The dev launcher migrates the database and seeds it if empty. SQLite is the default for this path. To use an existing local PostgreSQL database, export a SQLAlchemy URL such as `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost/DB` before starting. Use credentials from your local database.

## Check and reproduce

```sh
.venv/bin/python -m pytest -q
npm --prefix frontend run build
.venv/bin/python -m scripts.pipeline validate
.venv/bin/python -m scripts.train
.venv/bin/python -m scripts.benchmark
.venv/bin/python -m scripts.report
```

To generate the default data again, run `.venv/bin/python -m scripts.generate`. Its `--months`, `--transactions`, `--sku-count`, `--customer-count`, `--seed`, and `--end` flags configure new experiments. Use a separate `--output` directory and database URL for experiments. After migration, load the new directory with `python -m scripts.pipeline load PATH` before training. Loading into a populated database checks the existing dataset identity. Forecast training requires at least 201 contiguous days and picks an artifact by dataset ID. The canned report and query benchmark target the bundled demo dataset.

## Project map

| Path | Contents |
|---|---|
| `frontend/` | Six React screens, chart components, and Nginx proxy configuration |
| `backend/app/` | FastAPI routes, validation schemas, SQLAlchemy tables and KPI services |
| `backend/alembic/` | Database migration and aggregate views |
| `ai_service/` | Forecasting, anomaly detection, contribution, scenario and intent orchestration |
| `scripts/` | Data generation, validation, seed, training and benchmarking |
| `data/synthetic/` | Six reconciled CSV tables and event metadata |
| `artifacts/` | Trained model, evaluation, query benchmark, features and figures |
| `notebooks/` | EDA, anomaly, forecasting and scenario replay |
| `tests/` | API, formulas, data integrity, audit and curated intent tests |

See the [demo script](docs/DEMO.md), [architecture](docs/ARCHITECTURE.md), [data dictionary](docs/DATA_DICTIONARY.md), [API reference](docs/API.md), [safety and limits](docs/AI_SAFETY.md), and [measured evaluation](artifacts/MODEL_EVALUATION.md). The optional Gemini and OpenAI integrations only classify intent. The local rules support the documented demo with no external API key. To enable a provider in Compose, set `LLM_PROVIDER=gemini` or `LLM_PROVIDER=openai` and the matching key in the local `.env`. For the local launcher, export those variables in the shell before running `npm run dev`.
