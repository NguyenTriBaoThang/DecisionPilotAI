FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY backend backend
COPY ai_service ai_service
COPY scripts scripts
COPY data/synthetic data/synthetic
COPY artifacts/*.joblib artifacts/
COPY alembic.ini .
RUN useradd --create-home decisionpilot && chown -R decisionpilot /app
USER decisionpilot
CMD ["sh", "scripts/start_backend.sh"]
