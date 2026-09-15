#!/usr/bin/env bash
# Mail Manager — 1-chạm launcher (chạy backend + web + cửa sổ desktop)
cd ~/tamvk/mail-app || exit 1

# backend (FastAPI :18685) — skip if already up
if ! curl -s -m 2 http://127.0.0.1:18685/api/health >/dev/null 2>&1; then
  (cd backend && MM_DEMO=0 nohup .venv/bin/python -m uvicorn app:app \
     --host 127.0.0.1 --port 18685 --log-level warning \
     > /tmp/mailmanager-backend.log 2>&1 &)
  for i in $(seq 1 20); do curl -s -m 2 http://127.0.0.1:18685/api/health >/dev/null 2>&1 && break; sleep 0.5; done
fi

# web static + /api proxy (:5173)
if ! curl -s -m 2 -o /dev/null http://127.0.0.1:5173/ 2>/dev/null; then
  nohup python3 scripts/serve.py 5173 > /tmp/mailmanager-web.log 2>&1 &
fi

export DISPLAY=:0
export XAUTHORITY=/run/user/1000/gdm/Xauthority
cd frontend && exec ./node_modules/electron/dist/electron --no-sandbox .
