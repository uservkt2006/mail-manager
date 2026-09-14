# Mail Manager v2.2 - Email Client

Desktop app đọc và quản lý email Exchange/FPT với giao diện hiện đại dark theme.

## Quick Start

```bash
cd ~/tamvk/mail-app
./run.sh
```

**Truy cập:** http://localhost:5173

## Features

### v2.2 - Multi-account & Encryption
- 🔐 Mật khẩu mã hóa Fernet (AES-128-CBC)
- 👥 Hỗ trợ nhiều tài khoản Exchange
- 🔄 Sync tự động từ FPT Exchange

### v2.1 - Core Features
- 📧 Conversation view (nhóm thread)
- 🏷️ 6 Categories màu sắc
- 🔍 Search nâng cao
- ⌨️ Keyboard shortcuts
- 📊 Stats dashboard

## Keyboard Shortcuts

| Phím | Hành động |
|------|-----------|
| `Ctrl+N` | Viết thư mới |
| `/` | Tìm kiếm |
| `A` | Archive |
| `D` | Delete |

## Kết nối Exchange FPT

1. Mở Settings (icon ⚙️)
2. Nhập thông tin:
   - Email: `ten.ban@fpt.com`
   - Password: mật khẩu Exchange
   - URL: `https://mail.fpt.net/EWS/Exchange.asmx`
3. Click "Kết nối"

## Database

- SQLite tại `~/.mail_manager/mail_manager.db`
- Encryption key tại `~/.mail_manager/key`
- Demo: 1 account + 6 emails

## Tech Stack

- **Backend**: FastAPI + SQLite + exchangelib + cryptography
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Desktop**: Electron
- **Theme**: Dark Codex (#0c0e12, accent #4c8dff)
