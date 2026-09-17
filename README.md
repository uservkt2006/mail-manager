# Mail Manager - Desktop Email Client

A modern desktop email client with Exchange/FastMail support, real-time sync, and an Outlook-inspired dark interface.

## Features

### Core
- **Multi-account** — Connect multiple Exchange/Office365/FastMail accounts
- **Real-time sync** — Delta-sync via EWS, updates appear within seconds
- **Conversation view** — Threaded email grouping like Outlook
- **Archive dialog** — Batch archive by folder and date
- **Advanced search** — Full-text search with `from:`, `to:`, `subject:` filters
- **Rules engine** — Automatic sorting rules for incoming mail
- **Auto-reply** — Set vacation responders per account
- **Push notifications** — Desktop toasts for new emails (via Electron/notify)

### Technical
- **Fernet-encrypted passwords** — AES-128-CBC with Fernet tokens stored locally
- **SQLite backend** — Local cache with WAL mode for performance
- **SSE + Polling fallback** — Reliable realtime without WebSocket complexity
- **Auto-updater** — Check GitHub Releases on boot, prompt to install updates

## Installation

### Ubuntu (`.deb`)
```bash
wget https://github.com/uservkt2006/mail-manager/releases/latest/download/mail-manager_<VERSION>_amd64.deb
sudo dpkg -i mail-manager_<VERSION>_amd64.deb
```

### Linux (AppImage)
```bash
wget https://github.com/uservkt2006/mail-manager/releases/latest/download/Mail.Manager-<VERSION>.AppImage
chmod +x Mail.Manager-<VERSION>.AppImage
./Mail.Manager-<VERSION>.AppImage
```

### Windows (`.exe`) — Coming soon
Use the AppImage alternative or build from source (see Development).

## Usage

1. Launch the app
2. Click **Settings** (⚙️ icon in sidebar)
3. Enter your Exchange credentials:
   - **Email**: `your.name@company.com`
   - **Password**: Your Exchange password
   - **Server URL**: e.g., `https://mail.company.com/EWS/Exchange.asmx`
4. Click **Connect**

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+N` | New mail |
| `/` | Search |
| `A` | Archive selected |
| `D` | Delete selected |
| `?` | Show shortcuts help |

## Auto-Update

Mail Manager checks for updates on every login. If a newer version is available on GitHub Releases, a badge appears in the status bar prompting you to download.

To manually check:
```bash
curl http://127.0.0.1:18685/api/update/check
```

## Database

- SQLite database: `~/.mail_manager/mail_manager.db`
- Encryption key: `~/.mail_manager/key`
- EWS tokens cached in: `~/.mail_manager/tokens.json`

## Development

### Prerequisites
- Python 3.11+
- Node.js 20+
- npm or yarn

### Setup
```bash
cd ~/tamvk/mail-app

# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend && npm install && npm run build
```

### Run
```bash
# Start backend
cd ~/tamvk/mail-app/backend
MM_DEMO=1 .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 18685

# Start frontend (separate terminal)
cd ~/tamvk/mail-app/frontend
npm run dev
```

Open `http://localhost:5173` in browser or use Electron:
```bash
cd frontend && npx electron .
```

### Build packages
```bash
cd frontend
npm run build
npx electron-builder --linux AppImage deb   # Linux
# npx electron-builder --win nsis            # Windows (requires Windows runner)
```

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron (desktop wrapper)                 │
├─────────────────────────────────────────────┤
│  React 18 + Vite + Tailwind CSS             │
│  - Components: MailView, CalendarView       │
│    RulesView, SettingsModal                 │
│  - Realtime: SSE / polling fallback         │
├─────────────────────────────────────────────┤
│  FastAPI Backend (port 18685)               │
│  - EWS connection pool                      │
│  - SQLite cache (WAL mode)                  │
│  - Fernet password encryption               │
│  - Delta-sync worker                        │
└─────────────────────────────────────────────┘
```

## Security

- Passwords are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before storing in SQLite
- EWS tokens are stored in `~/.mail_manager/tokens.json` (file permissions `600`)
- No credentials transmitted to third parties — all EWS calls go directly from backend to your Exchange server

## License

MIT — TM TOOL (© 2026 Võ Khắc Tâm)
