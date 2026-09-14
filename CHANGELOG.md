# Mail Manager v2.2 - Complete

## Tính năng đã tích hợp

### 🔐 Multi-account & Encryption (v2.2)
- **Password encryption**: Fernet (AES-128-CBC) từ cryptography library
- **Key management**: Key lưu tại `~/.mail_manager/key`
- **Multi-account**: Lưu nhiều tài khoản Exchange
- **API endpoints**:
  - `GET /api/accounts` - danh sách accounts
  - `POST /api/accounts` - thêm account mới
  - `DELETE /api/accounts/{id}` - xóa account
  - `POST /api/accounts/{id}/sync` - sync thủ công

### ✅ Core Features (v2.1)
- SQLite database tại `~/.mail_manager/mail_manager.db`
- Conversation view (nhóm theo thread)
- 6 Categories với màu sắc
- Search nâng cao + filter
- Keyboard shortcuts: Ctrl+N, /, A, D
- Stats dashboard

## Database Schema

```sql
accounts (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_encrypted TEXT NOT NULL,  -- Fernet encrypted
    exchange_url TEXT,
    display_name TEXT,
    created_at TIMESTAMP
)

emails (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    subject TEXT,
    sender TEXT,
    date TEXT,
    preview TEXT,
    body TEXT,
    is_read INTEGER,
    folder TEXT,
    starred INTEGER,
    categories TEXT,  -- JSON array
    thread_id TEXT
)

replies (...)
```

## Demo Data
- 1 demo account: `demo@fpt.com`
- 6 demo emails với 4 threads
- Categories: Work, Personal, Finance, Urgent

## Chạy app

```bash
cd ~/tamvk/mail-app
./run.sh
```

**Truy cập:**
- Frontend: http://localhost:5173
- Backend API: http://127.0.0.1:18685/docs

## Kết nối Exchange FPT

1. Mở Settings (icon ⚙️)
2. Nhập:
   - Email: `ten.ban@fpt.com`
   - Password: mật khẩu Exchange
   - URL: `https://mail.fpt.net/EWS/Exchange.asmx`
3. Click "Kết nối"
4. Email sẽ tự động sync

## File structure

```
tamvk/mail-app/
├── backend/app.py           # FastAPI + SQLite + Encryption
├── frontend/src/            # React + Tailwind
├── run.sh                   # Launch script
└── README.md                # Documentation
```
