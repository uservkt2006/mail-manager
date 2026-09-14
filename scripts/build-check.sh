#!/bin/bash
# One-shot compile check: frontend build + backend import (isolated temp DB)
set -e
cd "$(dirname "$0")/.."
(cd frontend && npx vite build >/tmp/mm_fe_build.log 2>&1) && echo "FE OK" || { echo "FE FAIL"; tail -20 /tmp/mm_fe_build.log; exit 1; }
(cd backend && MM_DB_PATH=/tmp/mmchk.db MM_DEMO=0 .venv/bin/python -c "import app" >/tmp/mm_be_check.log 2>&1) && echo "BE OK" || { echo "BE FAIL"; tail -20 /tmp/mm_be_check.log; exit 1; }
rm -f /tmp/mmchk.db
