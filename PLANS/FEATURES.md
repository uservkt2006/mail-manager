# Kế hoạch tính năng Mail Manager v2

## Nhóm 1 — Đa người dùng

| # | Tính năng | Mô tả | Mức độ |
|---|-----------|-------|--------|
| 1 | Đa tài khoản | Mỗi user login riêng, lưu credentials mã hóa, switch account trong app | Dễ |
| 2 | Profile user | Avatar, display name, signature cá nhân lưu ở backend | Dễ |
| 3 | Cài đặt per-user | Theme preference, font size, notification setting | Dễ |
| 4 | Đồng bộ qua cloud | Backend lưu DB SQLite → chuyển PostgreSQL/MariaDB cho nhiều user | Trung bình |

## Nhóm 2 — Tính năng Outlook-like

| # | Tính năng | Mô tả | Mức độ |
|---|-----------|-------|--------|
| 1 | **Calendar** | Hiển thị lịch Exchange, tạo/sửa event, sync với calendar server | Khó |
| 2 | **Contacts** | Address book từ Exchange GAL, import/export VCF | Trung bình |
| 3 | **Tasks/Todo** | Tạo task từ email, deadline, reminder | Dễ |
| 4 | **Conversation view** | Nhóm email theo thread, xem chuỗi trả lời như Outlook | Khó |
| 5 | **Quick Steps** | 1 click = archive + move to folder + mark read | Dễ |
| 6 | **Categories/Tags** | Gán nhãn màu cho email (Work/Personal/Urgent) | Dễ |
| 7 | **Rules tự động** | Nếu sender=X thì move vào folder=Y, forward đến Z | Khó |
| 8 | **Attachments viewer** | Xem trước PDF/image, tải về từng file hoặc all | Dễ |
| 9 | **Signature editor** | Rich text signature, HTML template | Dễ |
| 10 | **Search nâng cao** | Tìm theo subject/from/date/body, filter composite | Trung bình |
| 11 | **Drag & drop** | Kéo email vào folder, kéo attachment vào desktop | Trung bình |
| 12 | **Keyboard shortcuts** | Ctrl+N viết thư, Ctrl+Enter gửi, / tìm kiếm, j/k duyệt | Dễ |
| 13 | **Notification** | Toast khi có mail mới, sound alert | Dễ |
| 14 | **Offline mode** | Cache last 100 emails, đọc được khi không có mạng | Khó |
| 15 | **Multi-window** | Mở nhiều cửa sổ (inbox + draft + calendar) cùng lúc | Trung bình |

## Ưu tiên thực hiện

**v2.0 — Core Outlook features:**
- #4 Conversation view (khác biệt lớn nhất so với app email đơn giản)
- #6 Categories/Tags
- #9 Signature
- #10 Search nâng cao
- #12 Keyboard shortcuts

**v2.1 — Productivity:**
- #5 Quick Steps
- #3 Tasks/Todo
- #13 Notification
- #11 Drag & drop

**v2.2 — Multi-user & Advanced:**
- #1 Đa tài khoản
- #2 Contacts
- #7 Rules
- #8 Attachments viewer
- #14 Offline mode
- #15 Multi-window

**v3.0 — Full Outlook parity:**
- #1 Calendar
- #10 Database migration

---

Anh muốn em bắt đầu từ feature nào? Em đề xuất **Conversation view + Categories** trước vì đây là 2 tính năng Outlook dùng nhiều nhất mà app hiện tại chưa có.
