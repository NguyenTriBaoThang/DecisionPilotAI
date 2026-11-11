#!/bin/sh
# Reset the demo workspace: drops the Postgres volume (clears the audit log) and re-bootstraps the synthetic data.
set -eu
docker compose down -v
docker compose up -d --build
