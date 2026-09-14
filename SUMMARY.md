# Mail Manager v2.2 - Complete

## ✅ Đã tích hợp đầy đủ

### Backend (FastAPI + SQLite)
- **Password encryption**: Fernet (AES-128-CBC)
- **Multi-account**: Lưu nhiều tài khoản Exchange
- **Auto-migrate**: Tự động upgrade schema
- **Exchange sync**: Kết nối FPT Exchange qua EWS

### Frontend (React + Tailwind)
- **Account switcher**: Chuyển đổi tài khoản
- **Conversation view**: Nhóm thread
- **Categories**: 6 nhãn màu
- **Search**: Filter nâng cao
- **Keyboard shortcuts**: Ctrl+N, /, A, D

### Database
- **Path**: `~/.mail_manager/mail_manager.db`
- **Encryption key**: `~/.mail_manager/key`
- **Demo**: 1 account + 6 emails

## 📊 API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/health` | GET | Health check |
| `/api/folders` | GET | Thống kê folders |
| `/api/categories` | GET | Danh sách categories |
| `/api/accounts` | GET | Danh sách accounts |
| `/api/accounts` | POST | Thêm account mới |
| `/api/accounts/{id}` | DELETE | Xóa account |
| `/api/accounts/{id}/sync` | POST | Sync thủ công |
| `/api/emails` | GET | Lấy emails (có conversation view) |
| `/api/emails/{id}` | GET | Chi tiết email |
| `/api/emails/{id}/archive` | POST | Lưu trữ |
| `/api/emails/{id}` | DELETE | Xóa |
| `/api/emails/{id}/star` | POST | Toggle starred |
| `/api/emails/{id}/categories` | PUT | Cập nhật categories |
| `/api/stats` | GET | Thống kê tổng quát |
| `/api/compose` | POST | Gửi thư mới |

## 🚀 Cách chạy

```bash
cd ~/tamvk/mail-app
./run.sh
```

Hoặc riêng lẻ:
```bash
# Terminal 1 - Backend
cd backend && .venv/bin/uvicorn app:app --host 127.0.0.1 --port 18685

# Terminal 2 - Frontend
cd frontend && npm run dev
```

## 📱 Access

- **Frontend**: http://localhost:5173
- **Backend API Docs**: http://127.0.0.1:18685/docs

## 🔑 Keyboard Shortcuts

| Phím | Hành động |
|------|-----------|
| `Ctrl+N` | Viết thư mới |
| `/` | Focus tìm kiếm |
| `A` | Archive email đang chọn |
| `D` | Delete email đang chọn |
| `J/K` | Di chuyển lên/xuống |

## 🔜 v2.3 - Kế tiếp

1. **Auto-sync background** - Đồng bộ mỗi 5 phút
2. **Drag & drop** - Kéo email vào folder
3. **Quick Steps** - 1-click actions
4. **Build .deb** - Đóng gói cho Ubuntu
5. **Notifications** - Toast khi có mail mới
