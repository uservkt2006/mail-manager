#!/bin/bash
# Build all platform packages locally
set -e

cd "$(dirname "$0")/.."

VERSION="${VERSION:-3.6.7}"

echo "=== Building Mail Manager v$VERSION ==="

# Bundle backend
bash scripts/bundle-backend.sh

# Build frontend
cd frontend
npm run build
cd ..

# Linux
cd frontend
npx electron-builder --linux AppImage deb --publish never
cd ..

# Windows (only works on Windows)
# npx electron-builder --win nsis --publish never

echo "=== Done ==="
ls -lh frontend/dist/*.AppImage frontend/dist/*.deb 2>/dev/null || true
