"""Populate a new workspace with the bundled dataset while preserving imported snapshots."""
import sqlalchemy as sa

from backend.app.db import datasets, make_engine, read_connection
from scripts.pipeline import load_snapshot, read_directory

if __name__ == "__main__":
    engine = make_engine()
    with read_connection(engine) as conn:
        existing = conn.scalar(sa.select(datasets.c.id))
    if existing is None:
        data,manifest = read_directory("data/synthetic")
        info = load_snapshot(engine,data,manifest)
        print(f"Loaded and verified {info['counts']['sales_transactions']:,} transactions.")
