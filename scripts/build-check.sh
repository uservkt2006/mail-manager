#!/bin/bash
# One-shot compile check: frontend build + backend import (isolated temp DB)
set -e
cd "$(dirname "$0")/.."
(cd frontend && npx vite build >/tmp/mm_fe_build.log 2>&1) || { echo "FE FAIL"; tail -20 /tmp/mm_fe_build.log; exit 1; }
# guard: Tailwind utilities must be present (a lost @tailwind directive = unstyled UI)
CSS=$(ls frontend/dist/assets/*.css 2>/dev/null | head -1)
SIZE=$(wc -c < "$CSS" 2>/dev/null || echo 0)
grep -q '\.block{' "$CSS" && grep -q '\.text-xs{' "$CSS" && [ "$SIZE" -gt 15000 ] \
  && echo "FE OK (css $SIZE bytes)" || { echo "FE CSS BROKEN (size=$SIZE, utilities missing?)"; exit 1; }
(cd backend && MM_DB_PATH=/tmp/mmchk.db MM_DEMO=0 .venv/bin/python -c "import app" >/tmp/mm_be_check.log 2>&1) && echo "BE OK" || { echo "BE FAIL"; tail -20 /tmp/mm_be_check.log; exit 1; }
rm -f /tmp/mmchk.db
