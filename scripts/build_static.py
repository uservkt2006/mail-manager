"""Build production static bundle for serving over LAN/tunnel."""
import subprocess
import os
import json

FRONTEND = os.path.expanduser('~/tamvk/mail-app/frontend')
os.chdir(FRONTEND)

# Build static dist
r = subprocess.run(['npx', 'vite', 'build'], capture_output=True, text=True, timeout=120)
assert r.returncode == 0, r.stderr[-300:]

# Patch package.json to ESM so vite.config.js works with static server too
print("Build OK:", r.stdout[-200:])
