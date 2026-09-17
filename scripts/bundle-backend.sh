#!/bin/bash
# Bundle backend Python files into frontend/ for electron-builder packaging
set -e

DEST_DIR="$(dirname "$0")/../frontend/_backend"
mkdir -p "$DEST_DIR"

cp -f "$(dirname "$0")/../backend/app.py" "$DEST_DIR/"
cp -f "$(dirname "$0")/../backend/realtime.py" "$DEST_DIR/"
cp -f "$(dirname "$0")/../backend/requirements.txt" "$DEST_DIR/"

echo "✓ Backend scripts bundled to $DEST_DIR/"
