#!/usr/bin/env python3
"""Bundle standalone Python for Linux (includes libpython.so + all deps)."""
import os
import sys
import shutil
import subprocess
import urllib.request
import tarfile

BUILD_DIR = os.path.join(os.path.dirname(__file__), '..', 'build')
TARGET = os.path.join(BUILD_DIR, 'python-linux-x64')

PYTHON_VERSION = '3.11.10'
STANDALONE_VERSION = '20240909'
STANDALONE_URL = f"https://github.com/indygreg/python-build-standalone/releases/download/{STANDALONE_VERSION}/cpython-{PYTHON_VERSION}+{STANDALONE_VERSION}-x86_64-unknown-linux-gnu-install_only.tar.gz"

def download_standalone():
    print("Downloading Python standalone...")
    target = "/tmp/python-standalone.tar.gz"
    if not os.path.exists(target) or os.path.getsize(target) < 1000000:
        urllib.request.urlretrieve(STANDALONE_URL, target)
    extract = "/tmp/python-standalone"
    shutil.rmtree(extract, ignore_errors=True)
    os.makedirs(extract, exist_ok=True)
    with tarfile.open(target, 'r:gz') as tar:
        tar.extractall(extract)
    for entry in os.listdir(extract):
        if entry.startswith('python'):
            return os.path.join(extract, entry)
    raise RuntimeError("Python dir not found in archive")

def install_requirements(python_dir):
    print("Installing backend requirements...")
    req_file = os.path.join(os.path.dirname(__file__), '..', 'backend', 'requirements.txt')
    with open(req_file) as f:
        reqs = f.read()
    # Pin Windows-incompatible packages out (uvloop doesn't affect Linux; we keep it)
    subprocess.run([
        os.path.join(python_dir, 'bin', 'python3'), '-m', 'pip', 'install', '--quiet',
        '--target', os.path.join(python_dir, 'lib', 'python3.11', 'site-packages'),
        '-r', req_file
    ], check=True)

def main():
    if os.path.exists(TARGET):
        shutil.rmtree(TARGET)
    standalone_dir = download_standalone()
    shutil.copytree(standalone_dir, TARGET)
    print(f"✓ Python standalone → {TARGET}")
    install_requirements(TARGET)
    # Verify
    py = os.path.join(TARGET, 'bin', 'python3')
    subprocess.run([py, '-c', 'import fastapi, uvicorn, exchangelib; print("OK")'], check=True)
    size = sum(os.path.getsize(os.path.join(r, f))
               for r, _, fs in os.walk(TARGET) for f in fs)
    print(f"✓ Total size: {size//1024//1024}MB")

if __name__ == '__main__':
    main()
