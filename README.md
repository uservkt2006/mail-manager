# TM Mail Manager

A modern desktop email client for **Exchange / Office 365 / FastMail**, built with Electron + React + FastAPI. Real-time sync, conversation view, and an Outlook-inspired dark interface.

> Latest release: **[v3.7.1](https://github.com/uservkt2006/mail-manager/releases/latest)**

---

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Install (Ubuntu / Debian)](#install-ubuntu--debian)
- [Install (Windows)](#install-windows)
- [First-time setup](#first-time-setup)
- [Updating to a new version](#updating-to-a-new-version)
- [Uninstall](#uninstall)
- [Troubleshooting](#troubleshooting)
- [Building from source](#building-from-source)
- [License](#license)

---

## Features

### Email
- Multi-account support — connect multiple Exchange / Office 365 / FastMail mailboxes at once
- Real-time delta sync — new emails appear within seconds (EWS subscription)
- Conversation / threaded view — group messages by subject like Outlook
- Inline image previews, attachments, and EML viewer for archived mail
- Local archive — store mail as `.eml` files on disk with full-text search index
- Batch archive by folder + date range

### Productivity
- Smart rules engine — auto-move / label / forward based on `from`/`to`/`subject`/`size`
- Vacation auto-reply — set Outlook-style OOF on the server
- Calendar + contacts sync (14 days ahead)
- Tasks / flags
- Full-text search across server + local archive (`from:`, `subject:`, `has:attachment`)

### Desktop integration
- Native Electron app — bundles Python backend + frontend (no system Python required)
- Auto-update from GitHub Releases — click *Install* and enter your sudo password
- Desktop notifications on new mail
- All-in-one `.deb` (Ubuntu) and `.exe` (Windows) — single file install
- Embedded Python runtime — works on any Linux without Python preinstalled

### Security
- Fernet-encrypted credentials stored locally (`~/.mail_manager/`)
- Token-based session auth (X-Auth-Token header)
- HTTP-only API endpoints, no third-party services

---

## Requirements

| Platform | Minimum |
|----------|---------|
| Ubuntu / Debian | 20.04+ (glibc 2.31+, libfuse2 for AppImage) |
| Windows | Windows 10 (1809) or later |
| RAM | 512 MB |
| Disk | 600 MB (Python runtime + Chromium + cache) |

For **Ubuntu .deb**: nothing else needed.
For **AppImage**: `sudo apt install libfuse2` first.

---

## Install (Ubuntu / Debian)

### Option A — .deb package (recommended)

```bash
# 1. Download the latest .deb from the Releases page
wget https://github.com/uservkt2006/mail-manager/releases/download/v3.7.1/mail-manager_3.7.1_amd64.deb

# 2. Install
sudo dpkg -i mail-manager_3.7.1_amd64.deb
sudo apt -f install   # only if dpkg reports missing dependencies

# 3. Launch
mail-manager
```

The package installs:
- `/opt/mail-manager/` — application files (binary, Python runtime, frontend)
- `/usr/bin/mail-manager` — CLI symlink
- `/usr/share/applications/tm-mail-manager.desktop` — application menu entry
- A `/usr/local/bin/mail-manager` wrapper is **not** needed (the package already sets up everything in `/opt/mail-manager`).

### Option B — AppImage (no install, runs from anywhere)

```bash
sudo apt install libfuse2   # one-time setup
wget https://github.com/uservkt2006/mail-manager/releases/download/v3.7.1/mail-manager-3.7.1.AppImage
chmod +x mail-manager-3.7.1.AppImage
./mail-manager-3.7.1.AppImage
```

### Option C — AppImage for older distros (Ubuntu 18.04 etc.)

Same as Option B, but use the `-legacy` AppImage asset if available on the Releases page.

---

## Install (Windows)

1. Download `Mail.Manager.Setup.3.7.1.exe` from the [latest release](https://github.com/uservkt2006/mail-manager/releases/latest).
2. Run the installer (NSIS — no admin required if you install to your user folder).
3. Launch from the Start Menu → **TM Mail Manager**.

The Windows build bundles a Python embeddable distribution + 27 backend packages. No system Python needed.

---

## First-time setup

The first time you launch the app, you'll see a **3-step setup wizard** (no email/password login screen):

### Step 1 — Profile
- **Display name** — how you're addressed in the UI
- **Local password** — protects your saved mail accounts (Fernet key derivation)

### Step 2 — Mailbox (Exchange / EWS)
- **Email** — your work address (e.g. `your.name@company.com`)
- **Password** — your mailbox password (or app-specific password if your org requires it)
- **EWS URL** — usually auto-detected:
  - `https://outlook.office365.com/EWS/Exchange.asmx` (Office 365)
  - `https://mail.your-domain.com/EWS/Exchange.asmx` (on-prem Exchange)
  - For FastMail: `https://mail.fastmail.com/`

Click **Test connection**. If green ✓, the credentials work.

### Step 3 — Sync
- Choose **Sync now** to fetch the last 30 days immediately, or **Sync later**.
- Click **Finish** — you're in the inbox.

Your account settings (display name, encryption key) live in `~/.mail_manager/`. To start completely fresh on the same machine, delete this folder (see [Uninstall](#uninstall)).

---

## Updating to a new version

### From inside the app (recommended — one click)

1. App opens → Settings gear icon (top-right) → nothing needed, just open the app.
2. When a new version is detected, an **Update available** dialog appears.
3. Click **Download & install** — the app fetches the new `.deb` to `/tmp/mail-manager-update/` and prompts for your sudo password (graphical popup via `pkexec`).
4. The app closes itself, the new version is installed, then relaunch it manually to use the new build.

> ℹ️ If the dialog appears again after a restart, the previous update did not finish. Force-kill any leftover processes and re-trigger:
> ```bash
> pkill -9 -f mail-manager
> pkill -9 -f "backend/app.py"
> ```
> then open the app again — it will re-prompt for the update.

### Manual update (fallback)

```bash
# 1. Download new .deb
wget https://github.com/uservkt2006/mail-manager/releases/download/vX.Y.Z/mail-manager_X.Y.Z_amd64.deb

# 2. Install over the old one (dpkg replaces files in /opt/mail-manager/)
sudo dpkg -i mail-manager_X.Y.Z_amd64.deb

# 3. Relaunch
hash -r
mail-manager
```

Your data (`~/.mail_manager/`, `~/.config/mail-manager/`) is preserved across upgrades.

---

## Uninstall

### Ubuntu / Debian

```bash
sudo apt remove mail-manager

# Optional: also wipe app data so the next install is truly clean
rm -rf ~/.config/mail-manager
rm -rf ~/.local/share/mail-manager
rm -rf ~/.cache/mail-manager
rm -rf ~/.mail_manager
```

### Windows

Use **Settings → Apps → Installed apps → TM Mail Manager → Uninstall**.

---

## Troubleshooting

### App starts but backend shows "Backend not responding on port 18685"

Another process is holding port 18685 (often a leftover backend from a previous crash). Fix:

```bash
pkill -9 -f "backend/app.py"
pkill -9 -f mail-manager
mail-manager
```

### App opens to a black window

The app launched but the frontend bundle is missing or the proxy failed. Try:

```bash
pkill -9 -f mail-manager
pkill -9 -f "backend/app.py"
hash -r
mail-manager
```

If the issue persists, open DevTools with `Ctrl+Shift+I` and check the Console tab for errors.

### Settings dialog opens but some tabs show a blank screen

This happens when the cached frontend bundle is older than the installed binary. Fully reset:

```bash
pkill -9 -f mail-manager
pkill -9 -f "backend/app.py"
rm -rf ~/.config/mail-manager
mail-manager
```

### Auto-update downloads but does not install

The app's `pkill` couldn't free `/opt/mail-manager/` because a process was still holding a file open. Force the install manually:

```bash
sudo dpkg -i mail-manager_X.Y.Z_amd64.deb
```

### SQLite error: `unable to open database file`

The `~/.mail_manager/` directory was deleted but the app is trying to write to it. Recreate it:

```bash
mkdir -p ~/.mail_manager
mail-manager
```

(Starting from v3.7.1 the app creates this folder automatically — older builds don't.)

### `mail-manager: command not found`

The `dpkg` install did not register the symlink, or `hash` is caching an old result. Run:

```bash
hash -r
which mail-manager
# Should print: /usr/bin/mail-manager
```

If it prints nothing, reinstall:

```bash
sudo apt remove mail-manager
sudo dpkg -i mail-manager_3.7.1_amd64.deb
hash -r
```

### Windows SmartScreen blocks the installer

The `.exe` is not code-signed. Click **More info → Run anyway**. (A code-signing certificate is on the roadmap.)

---

## Building from source

Prerequisites: **Node.js 20+**, **Python 3.11**, **Git**.

```bash
git clone https://github.com/uservkt2006/mail-manager.git
cd mail-manager

# Backend deps (for local development)
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt

# Frontend deps
cd frontend
npm install
npm run build   # produces frontend/dist/

# Run in dev mode (two terminals)
# Terminal 1:
cd backend && python app.py
# Terminal 2:
cd frontend && npm run dev
# Open http://localhost:5173
```

### Building all platforms

```bash
# Ubuntu: AppImage + .deb
cd frontend
npm run build
npx electron-builder --linux AppImage deb --publish never

# Windows: NSIS installer (requires Windows or wine)
npx electron-builder --win nsis --publish never
```

Build outputs land in `frontend/dist/`.

---

## Project structure

```
mail-manager/
├── backend/              # FastAPI + SQLite + EWS (exchangelib)
│   ├── app.py            # main API server (3437 lines)
│   ├── realtime.py       # SSE push worker
│   └── requirements.txt
├── frontend/
│   ├── electron/
│   │   ├── main.cjs      # Electron main process, auto-update IPC
│   │   └── preload.cjs   # contextBridge for renderer
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js        # backend HTTP client
│   │   └── components/   # React UI (MailView, SetupWizard, SettingsModal, …)
│   └── package.json
├── build/
│   ├── python-linux-x64/ # bundled cpython (Standalone build)
│   ├── python-embed-amd64/  # Windows embeddable Python
│   └── icons/
└── .github/workflows/build.yml   # CI: tag v* → builds Linux + Windows
```

---

## License

MIT — see [LICENSE](LICENSE).

---

## Support the project

If TM Mail Manager saves you time, consider supporting development:

- **MB Bank**: `666 799 979` — Võ Khắc Tâm
- Or open a Pull Request / Issue on GitHub.

Every bit helps keep this maintained. 💛
