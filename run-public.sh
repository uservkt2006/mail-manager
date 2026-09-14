#!/bin/bash
# Mail Manager - Public access qua Cloudflare quick tunnel
# Usage: ./run-public.sh   (Ctrl+C hết, hoặc để chạy nền: nohup ./run-public.sh &)
cd "$(dirname "$0")"

CLOUDFLARED=/tmp/cloudflared
[ -x "$CLOUDFLARED" ] || { echo "Tải cloudflared..."; curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o "$CLOUDFLARED" && chmod +x "$CLOUDFLARED"; }

echo "[1/4] Backend :18685"
pkill -f "uvicorn app:app" 2>/dev/null; sleep 1
(cd backend && MM_DEMO=0 .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 18685 > /tmp/mail_backend.log 2>&1) &
for i in {1..10}; do curl -sf http://127.0.0.1:18685/api/health >/dev/null && break; sleep 1; done
curl -sf http://127.0.0.1:18685/api/health >/dev/null && echo "  OK" || { echo "  FAIL (xem /tmp/mail_backend.log)"; exit 1; }

echo "[2/4] Build dist"
(cd frontend && npx vite build >/tmp/mail_build.log 2>&1) && echo "  OK" || { echo "  FAIL"; exit 1; }

echo "[3/4] Static server :5173 (serve /api -> backend)"
pkill -f "scripts/serve.py" 2>/dev/null; sleep 1
python3 scripts/serve.py 5173 > /tmp/mail_static.log 2>&1 &

echo "[4/4] Cloudflare quick tunnel"
pkill -f "cloudflared tunnel" 2>/dev/null; sleep 1
"$CLOUDFLARED" tunnel --url http://localhost:5173 --no-autoupdate 2>&1 | tee /tmp/mail_tunnel.log &

sleep 8
URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/mail_tunnel.log | head -1)
echo ""
echo "=============================================="
echo "  🌐 PUBLIC: $URL"
echo "=============================================="
echo ""
echo "Log: /tmp/mail_backend.log /tmp/mail_static.log /tmp/mail_tunnel.log"
echo "Dừng hết: pkill -f 'uvicorn app:app|scripts/serve.py|cloudflared tunnel'"
