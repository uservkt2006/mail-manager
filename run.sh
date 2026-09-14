#!/bin/bash
cd "$(dirname "$0")"

echo "=== Mail Manager v2.1 ==="
echo ""

# Check Python venv
if [ ! -d "backend/.venv" ]; then
    echo "Installing Python dependencies..."
    cd backend
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
    cd ..
fi

# Check npm dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing npm dependencies..."
    cd frontend
    npm install
    cd ..
fi

# Seed demo data if empty
python3 -c "
import sqlite3
import os
DB_PATH = os.path.expanduser('~/.mail_manager/mail_manager.db')
if os.path.exists(DB_PATH):
    conn = sqlite3.connect(DB_PATH)
    count = conn.execute('SELECT COUNT(*) FROM emails').fetchone()[0]
    if count == 0:
        print('Database empty - seeds will be added on first API call')
    else:
        print(f'Database has {count} emails')
    conn.close()
"

# Start backend
echo "Starting backend on http://127.0.0.1:18685..."
cd backend
MM_DEMO=0 .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 18685 &
BACKEND_PID=$!
cd ..

# Wait for backend
echo "Waiting for backend..."
for i in {1..10}; do
    if curl -s http://127.0.0.1:18685/api/health > /dev/null 2>&1; then
        echo "Backend ready!"
        break
    fi
    sleep 1
done

# Start frontend dev server
echo "Starting frontend on http://localhost:5173..."
cd frontend
npm run dev:frontend &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== App is running ==="
echo "Backend: http://127.0.0.1:18685"
echo "Frontend: http://localhost:5173"
echo ""
echo "Keyboard shortcuts:"
echo "  Ctrl+N - Write new email"
echo "  / - Search"
echo "  A - Archive selected"
echo "  D - Delete selected"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Wait for signals
wait
