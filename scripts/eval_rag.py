"""Run the empirical DecisionPilot AI RAG, Hybrid Search, Grounding & Safe Text-to-SQL benchmark."""
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.rag.evaluation import evaluate_rag_pipeline


def main() -> int:
    report = evaluate_rag_pipeline()
    out_dir = ROOT / "artifacts"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "rag_evaluation_report.json"
    out_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

