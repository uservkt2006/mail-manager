#!/usr/bin/env python3
"""Bundle embed Python for both Windows AND Linux."""
import os
import sys
import shutil
import subprocess
import urllib.request
import zipfile

BUILD_DIR = os.path.join(os.path.dirname(__file__), '..', 'build')
PYTHON_WIN_DIR = os.path.join(BUILD_DIR, 'python-embed-amd64')

# Linux Python: use the same venv we use for dev
LINUX_VENV = os.path.join(os.path.dirname(__file__), '..', 'backend', '.venv')

def setup_linux_python():
    """Copy backend/.venv → build/python-linux-x64/"""
    target = os.path.join(BUILD_DIR, 'python-linux-x64')
    if os.path.exists(target):
        shutil.rmtree(target)
    shutil.copytree(LINUX_VENV, target, symlinks=False)
    # Remove pyc cache
    subprocess.run(['find', target, '-name', '__pycache__', '-type', 'd', '-exec', 'rm', '-rf', '{}', '+'],
                   capture_output=True)
    size = sum(os.path.getsize(os.path.join(r, f))
               for r, _, fs in os.walk(target) for f in fs)
    print(f"✓ Linux Python: {target} ({size//1024//1024}MB)")

def main():
    if not os.path.exists(PYTHON_WIN_DIR):
        print(f"Error: {PYTHON_WIN_DIR} not found")
        sys.exit(1)
    setup_linux_python()

if __name__ == '__main__':
    main()
