# Báo cáo đặc tả chức năng và thiết kế Outlook 365

**Mục đích:** Làm tài liệu đầu vào để đào tạo một AI phân tích, thiết kế và xây dựng phần mềm quản lý email–lịch–danh bạ–công việc cộng tác tương tự Outlook 365.

**Phiên bản tài liệu:** 1.0 — 14/09/2026  
**Phạm vi:** Outlook cho Microsoft 365 trên desktop/web/mobile và các dịch vụ Microsoft 365 liên quan. Tài liệu mô tả năng lực sản phẩm, không phải cam kết sao chép thương hiệu, mã nguồn hay giao diện độc quyền của Microsoft.

> **Kết luận điều hành:** Một sản phẩm tương tự Outlook không nên được xây như một ứng dụng email đơn lẻ. Mô hình đúng là **workspace giao tiếp và điều phối công việc**, trong đó email là trung tâm, còn lịch, danh bạ, công việc, tệp, cuộc họp, tìm kiếm, tự động hóa và quản trị bảo mật liên kết với nhau.

---

## 1. Phạm vi và nguyên tắc phân loại

Outlook chính thức tổ chức email, lịch, danh bạ, tác vụ và danh sách việc cần làm trong cùng một hệ thống.[1] Calendar tích hợp với email, contacts và các chức năng khác để tạo sự kiện, tổ chức cuộc họp, xem lịch nhóm, xem lịch chồng lớp, chia sẻ lịch và ủy quyền quản lý lịch.[2]

Tên “Outlook 365” thường được dùng để chỉ nhiều bề mặt sản phẩm khác nhau. Khi xây sản phẩm, AI phải luôn gắn tính năng với **nền tảng**, **dịch vụ phụ thuộc** và **gói cấp phép**.

| Bề mặt | Đặc trưng | Ưu tiên triển khai |
|---|---|---|
| Desktop cổ điển | Ribbon đầy đủ, khả năng offline mạnh, nhiều tùy chọn quản trị và thao tác hàng loạt | Tham chiếu cho bản chuyên nghiệp |
| New Outlook/web | Giao diện hiện đại, đồng bộ cloud, tìm kiếm và cộng tác trực tuyến | MVP web nên ưu tiên |
| Mobile iOS/Android | Tác vụ nhanh, thông báo, lịch và email khi di chuyển | Giai đoạn 2 |
| Exchange/Microsoft 365 | Mailbox, lịch, quyền, chính sách, lưu trữ, audit | Backend doanh nghiệp |
| Outlook.com cá nhân | Tài khoản Microsoft cá nhân, tính năng và chính sách khác | Chỉ hỗ trợ nếu phạm vi sản phẩm cần |

**Quy tắc thiết kế:** Nếu một tính năng phụ thuộc Exchange Online, Microsoft Graph, Teams, SharePoint, OneDrive, Copilot hoặc license riêng, AI phải biểu diễn nó như một capability có thể bật/tắt, không coi là chức năng lõi luôn có sẵn.

---

## 2. Bản đồ chức năng cấp cao

| Module | Mục tiêu người dùng | Chức năng cốt lõi |
|---|---|---|
| Mail | Gửi, nhận, đọc và xử lý thư | Soạn, trả lời, chuyển tiếp, đính kèm, thư mục, tìm kiếm, quy tắc, cờ, phân loại |
| Calendar | Quản lý thời gian và cuộc họp | Sự kiện, lời mời, lịch nhóm, lịch dùng chung, tìm giờ rảnh, nhắc việc, phòng họp |
| People | Quản lý danh tính liên hệ | Danh bạ, hồ sơ người dùng, tổ chức, nhóm, lịch sử tương tác |
| Tasks/To Do | Chuyển giao tiếp thành hành động | Task, cờ theo dõi, hạn hoàn thành, nhắc, danh sách, My Day, phân công |
| Files | Làm việc với tệp | Đính kèm, liên kết cloud, xem trước, lưu, chia sẻ, đồng tác giả |
| Collaboration | Điều phối nhóm | Teams, Microsoft 365 Groups, Loop, Planner, SharePoint, Whiteboard |
| Search | Tìm trong toàn bộ workspace | Tìm mail, người, file, sự kiện, gợi ý và bộ lọc |
| Automation | Giảm thao tác lặp | Rules, Quick Steps, Power Automate, mẫu, actionable messages |
| AI | Hỗ trợ hiểu và tạo nội dung | Tóm tắt, soạn nháp, ưu tiên, trích xuất hành động, tìm kiếm ngôn ngữ tự nhiên |
| Admin/security | Vận hành an toàn | SSO, MFA, phân quyền, chống spam/phishing, DLP, retention, audit |
| Integrations | Mở rộng hệ sinh thái | Graph/API, add-ins, webhooks, OAuth, import/export, calendar protocols |

---

## 3. Đặc tả chức năng chi tiết

### 3.1. Email và hộp thư

#### 3.1.1. Soạn và gửi thư

Hệ thống phải hỗ trợ tạo thư mới, chọn tài khoản gửi, To/Cc/Bcc, người nhận từ danh bạ, tiêu đề, rich text, chữ ký, định dạng, chèn liên kết, hình ảnh, bảng và tệp đính kèm. Người dùng cần có thể lưu bản nháp tự động, tiếp tục soạn trên thiết bị khác và gửi lại khi mạng được khôi phục.

Các khả năng nên có:

- Reply, Reply All, Forward và chuyển thư thành cuộc họp hoặc task.
- Chữ ký theo tài khoản, loại thư và ngữ cảnh.
- Mẫu thư, Quick Parts, đoạn văn thường dùng và trả lời nhanh.
- Hẹn giờ gửi, hủy gửi trong khoảng thời gian cấu hình được.
- Nhắc người dùng nếu quên tệp đính kèm, tiêu đề hoặc người nhận quan trọng.
- Kiểm tra chính tả, ngôn ngữ, định dạng và cảnh báo người nhận bên ngoài tổ chức.
- Mã hóa hoặc quyền hạn chế chuyển tiếp khi tổ chức cho phép.
- Đính kèm bản sao tệp hoặc chia sẻ liên kết cloud có quyền xem/chỉnh sửa.
- Xem trước tệp an toàn và tải xuống có kiểm soát.
- Bàn giao thư cho người khác xử lý thông qua flag, category hoặc task.

#### 3.1.2. Xử lý hộp thư

- Thư mục hệ thống: Inbox, Sent, Drafts, Deleted, Junk/Spam, Archive.
- Thư mục tùy chỉnh, thư mục tìm kiếm và thư mục dùng chung.
- Đánh dấu đã đọc/chưa đọc, ghim, cờ theo dõi, snooze và archive.
- Di chuyển, sao chép, xóa, khôi phục, báo spam, báo phishing.
- Dọn dẹp hội thoại: xóa nội dung trùng trong chuỗi thư.
- Conversation view bật/tắt; nhóm theo ngày, người gửi, chủ đề hoặc category.
- Focused/Other hoặc cơ chế phân loại hộp thư tương đương.
- Rules theo người gửi, từ khóa, người nhận, tệp, độ quan trọng, domain hoặc trạng thái.
- Quick Steps cho chuỗi thao tác nhiều bước, ví dụ “đánh dấu đã đọc + chuyển thư mục + tạo task”.
- Xử lý hàng loạt, chọn tất cả kết quả và thao tác bằng phím tắt.
- Delegate/shared mailbox với quyền đọc, gửi thay mặt hoặc gửi với tư cách mailbox.

#### 3.1.3. Tìm kiếm email

Tìm kiếm phải hoạt động theo tiêu đề, nội dung, người gửi, người nhận, tệp đính kèm, ngày, thư mục, category, cờ và trạng thái. Kết quả phải hiển thị số lượng, bộ lọc đang áp dụng, phạm vi tìm kiếm và lý do không có kết quả.

Nên hỗ trợ:

- Gợi ý khi gõ tên người, chủ đề và toán tử.
- Tìm trong mailbox hiện tại, tất cả mailbox, nhóm, archive và tệp liên quan.
- Bộ lọc ngày, người gửi, có tệp, chưa đọc, được gắn cờ.
- Lưu truy vấn tìm kiếm.
- Truy vấn tự nhiên ở lớp AI nhưng luôn cung cấp kết quả có thể kiểm tra.

---

### 3.2. Lịch và cuộc họp

Calendar là module lập lịch được tích hợp với email và danh bạ. Người dùng có thể tạo appointment/event, gửi lời mời, xem lịch nhóm, xem nhiều lịch cạnh nhau hoặc overlay, chia sẻ lịch và ủy quyền quản lý.[2]

#### 3.2.1. Lịch cá nhân

- Chế độ xem ngày, tuần làm việc, tuần, tháng, agenda và timeline.
- Tạo event bằng cách bấm vào ô thời gian hoặc dùng form chi tiết.
- Sự kiện cả ngày, lặp lại, múi giờ, thời gian đệm trước/sau.
- Nhắc bằng thông báo trong ứng dụng, email hoặc push.
- Màu sắc theo category, lịch hoặc loại hoạt động.
- Kéo thả để đổi giờ; kéo cạnh để đổi thời lượng.
- Tạo nhiều lịch: công việc, cá nhân, dự án, nghỉ phép.
- Lịch Internet/subscription và lịch từ hệ thống khác nếu được phép.

#### 3.2.2. Cuộc họp

- Tạo meeting từ Calendar hoặc trực tiếp từ email.
- Mời người nội bộ/bên ngoài, nhóm phân phối và tài nguyên.
- Kiểm tra free/busy và đề xuất giờ sớm nhất mọi người cùng rảnh.
- Đặt phòng, thiết bị, địa điểm và liên kết họp trực tuyến.
- Người mời Accept, Tentative, Decline hoặc Propose New Time.
- Theo dõi RSVP và gửi cập nhật khi đổi giờ, địa điểm, người tham dự.
- Tùy chọn bắt buộc/tùy chọn, người tổ chức, quyền phản hồi và ẩn danh sách.
- Chuỗi cuộc họp lặp lại, ngoại lệ từng phiên và hủy một phiên hoặc cả chuỗi.
- Biên bản, tệp, agenda, task sau cuộc họp.

#### 3.2.3. Lịch chia sẻ và ủy quyền

- Quyền xem bận/rảnh, xem tiêu đề/vị trí, xem đầy đủ, chỉnh sửa hoặc delegate.
- Chia sẻ lịch nội bộ và ngoài tổ chức theo chính sách.
- Mở lịch đồng nghiệp, nhóm, phòng họp, thiết bị hoặc tổ chức.
- Side-by-side và overlay để nhận diện xung đột.
- Quản lý lịch của người khác: tạo, đổi, xóa sự kiện và gửi lời mời theo quyền.

---

### 3.3. People, danh bạ và hồ sơ

- Danh bạ cá nhân với tên, email, điện thoại, chức vụ, công ty, địa chỉ, ghi chú, ảnh.
- Tự động gợi ý người nhận từ lịch sử liên lạc.
- Danh bạ tổ chức từ directory, hồ sơ nhân sự và sơ đồ tổ chức.
- Nhóm liên hệ và danh sách phân phối.
- Hồ sơ người dùng hiển thị vai trò, bộ phận, quản lý, đồng nghiệp và phương thức liên hệ.
- Xem các email, cuộc họp và file gần đây giữa người dùng và một contact.
- Gộp bản ghi trùng, đánh dấu yêu thích và ghim người thường dùng.
- Chọn người trong People để bắt đầu email, chat, cuộc gọi hoặc đặt lịch.
- Kiểm soát quyền hiển thị thông tin cá nhân và thông tin tổ chức.

---

### 3.4. Tasks, To Do, cờ và nhắc việc

Outlook biến email thành hành động thông qua flag, task và reminder. Microsoft To Do có thể đồng bộ task với Outlook, Teams, Planner và cung cấp danh sách cá nhân cùng “My Day”.[1]

- Tạo task độc lập hoặc từ email, cuộc họp, người liên hệ.
- Tiêu đề, mô tả, trạng thái, mức ưu tiên, hạn bắt đầu, hạn hoàn thành.
- Reminder, recurrence, category, file và liên kết nguồn.
- Flag thư với ngày bắt đầu/hạn và trạng thái follow-up.
- Danh sách cá nhân, danh sách nhóm, task được giao và task chờ người khác.
- My Day hoặc daily focus.
- Subtask, checklist, ghi chú và phần trăm hoàn thành.
- Chế độ xem quá hạn, hôm nay, tuần này, theo dự án hoặc theo người phụ trách.
- Đồng bộ hai chiều có xử lý xung đột và nhật ký thay đổi.
- Nhắc từ nội dung email: AI đề xuất “việc cần làm”, người chịu trách nhiệm và deadline nhưng không tự gửi hoặc giao nếu chưa có xác nhận.

---

### 3.5. Tệp, đính kèm và nội dung cộng tác

- Đính kèm file từ máy, cloud drive, SharePoint hoặc thư trước đó.
- Chọn “copy attachment” hoặc “share link” với quyền cụ thể.
- Xem trước PDF, Office, ảnh và loại tệp được hỗ trợ.
- Tải lên theo tiến độ; retry; cảnh báo kích thước và loại tệp nguy hiểm.
- Danh sách file gần đây, file đã gửi, file được chia sẻ và file liên quan.
- Quyền xem, nhận xét, chỉnh sửa, tải xuống và hết hạn liên kết.
- Phiên bản, khóa chỉnh sửa, đồng tác giả và khôi phục.
- Phát hiện file nhạy cảm hoặc dữ liệu cá nhân trước khi gửi.

Microsoft 365 mở rộng Outlook qua Teams, OneDrive, Microsoft Graph, Planner, Lists, Loop, Power Apps, Power Automate, Search, Stream, To Do và Whiteboard.[1] Sản phẩm tương tự nên cung cấp integration layer thay vì nhúng cứng mọi dịch vụ.

---

### 3.6. Cộng tác nhóm

- Microsoft 365 Group hoặc workspace nhóm có mailbox, lịch, file và thành viên.
- Shared mailbox cho bộ phận chăm sóc khách hàng, helpdesk hoặc dự án.
- Team/channel liên kết với email, cuộc họp, file và task.
- Gửi thư đến nhóm, tạo lịch nhóm, phân công task và chia sẻ tài liệu.
- Conversation có mention, reaction, comment và lịch sử.
- Loop-like components: đoạn nội dung có thể chỉnh sửa đồng bộ trong thư và cuộc họp.
- Planner-like board: task theo cột, người phụ trách, hạn và trạng thái.
- SharePoint-like site/calendar/list nếu phạm vi sản phẩm cần quản lý nội dung doanh nghiệp.

---

### 3.7. Tự động hóa

- Rules sự kiện: thư đến, gửi đi, đổi trạng thái, người gửi, từ khóa, tệp.
- Quick Steps cho tác vụ lặp ở cấp cá nhân.
- Mẫu email và mẫu meeting.
- Power Automate-like workflow: khi nhận thư thì tạo task, ghi dữ liệu, thông báo Teams, lưu file hoặc gọi API.
- Webhook và event subscription cho mail, event, contact thay đổi.
- Actionable messages cho phép người dùng phê duyệt, cập nhật CRM hoặc trả lời form ngay trong email. Microsoft mô tả đây là cơ chế nhúng hành động vào email/thông báo để giảm chuyển màn hình.[3]
- Hàng đợi retry, idempotency, audit và quyền chạy workflow thay mặt người dùng.

---

### 3.8. AI/Copilot-like capabilities

AI phải được thiết kế theo nguyên tắc **gợi ý có kiểm soát**, không tự động thực hiện hành vi quan trọng mà người dùng không biết.

- Tóm tắt chuỗi email, chỉ rõ thư đã dùng làm nguồn.
- Soạn nháp theo mục đích, giọng điệu, độ dài và ngôn ngữ.
- Viết lại rõ hơn, ngắn hơn, chuyên nghiệp hơn hoặc thân thiện hơn.
- Trích xuất quyết định, việc cần làm, deadline, người phụ trách.
- Đề xuất câu trả lời nhanh.
- Tìm thông tin xuyên email, lịch, file và danh bạ bằng ngôn ngữ tự nhiên.
- Chuẩn bị agenda từ các thư liên quan.
- Đề xuất thời gian họp, người tham dự và tài liệu liên quan.
- Phân loại ưu tiên và cảnh báo email có dấu hiệu khẩn cấp.
- Chuyển cuộc họp thành biên bản và task nếu có transcript hợp lệ.
- Kiểm tra rò rỉ dữ liệu, người nhận nhầm, lời hứa về thời hạn và tệp bị thiếu.

**Rào chắn AI:** hiển thị nguồn, mức tin cậy, trạng thái “AI-generated”, nút hoàn tác, không gửi email/đổi lịch/giao task nếu chưa xác nhận rõ, không dùng dữ liệu tenant khác, ghi audit prompt/output theo chính sách.

---

## 4. Phong cách layout và giao diện

Ảnh tham chiếu cho thấy cấu trúc Outlook desktop điển hình gồm thanh tiêu đề và tìm kiếm ở trên, Ribbon theo tab, thanh điều hướng dọc, cây thư mục bên trái, danh sách thư ở giữa và Reading Pane bên phải. Microsoft cũng mô tả Navigation Bar là nơi chuyển giữa Mail, Calendar, People và Tasks; một số mục có thể nằm dưới nút More tùy kích thước màn hình.[4]

### 4.1. Kiến trúc màn hình desktop

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ App launcher | Search | Help | Account | Window controls                 │
├──────────────────────────────────────────────────────────────────────────┤
│ File | Home | Send/Receive | Folder | View | Help        [context tools] │
│ Ribbon: New | Delete | Reply | Quick Steps | Move | Tags | Find | Apps    │
├───────┬──────────────────────┬───────────────────────────────────────────┤
│ App   │ Folder tree          │ Message list / Calendar grid              │
│ rail  │ Favorites            │                                           │
│       │ Mailboxes            │                                           │
│       │ Shared folders       │                                           │
│       │ Groups               │                                           │
│       │                    ┌─┴─────────────────────────────────────────┐  │
│       │                    │ Reading pane / Detail / Compose surface   │  │
│       │                    └───────────────────────────────────────────┘  │
└───────┴──────────────────────┴───────────────────────────────────────────┘
│ Status: item count | sync | connection | view controls | zoom           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2. Quy tắc bố cục

- **Ba vùng chính:** điều hướng, danh sách, nội dung chi tiết.
- **Progressive disclosure:** hiển thị hành động thường dùng trước; hành động hiếm dùng nằm trong More hoặc menu ngữ cảnh.
- **Contextual toolbar:** thanh công cụ thay đổi theo Mail, Calendar, People, Task và trạng thái chọn.
- **Master–detail:** danh sách ở trái, nội dung ở phải; cho phép chuyển sang chế độ không Reading Pane.
- **Tìm kiếm là điểm vào cấp một:** luôn dễ thấy, có shortcut và phạm vi rõ.
- **Độ đậm thị giác thấp:** nền trung tính, màu thương hiệu dùng cho trạng thái và hành động chính.
- **Mật độ thích ứng:** compact cho người dùng nhiều thư; comfortable cho người dùng mới.
- **Không mất ngữ cảnh:** mở soạn thư, xem lịch hoặc hồ sơ người dùng dưới dạng pane/modal có thể đóng và quay lại danh sách.

### 4.3. Design system đề xuất

| Thành phần | Quy tắc |
|---|---|
| Màu | Nền trung tính; một màu brand; semantic colors cho success, warning, danger, info; không chỉ dùng màu để truyền trạng thái |
| Typography | Font sans-serif dễ đọc; phân cấp rõ cho subject, sender, metadata, body; hỗ trợ tiếng Việt |
| Spacing | Hệ 4/8 px; vùng bấm desktop tối thiểu 32 px, mobile tối thiểu 44 px |
| Icon | Icon đơn sắc nhất quán, có tooltip và nhãn accessible khi cần |
| Button | Primary cho một hành động chính; secondary cho hành động phụ; destructive luôn có cảnh báo |
| List row | Sender, subject, preview, timestamp, unread state, attachment, flag, category; không chen quá nhiều icon |
| State | Loading skeleton, empty state có hướng dẫn, offline, sync pending, permission denied, conflict, error có retry |
| Notification | Toast cho kết quả tức thời; banner cho sự cố kéo dài; push cho nhắc lịch hoặc thư quan trọng |
| Responsive | Desktop ba cột; tablet hai cột; mobile một cột với back navigation và bottom/tab navigation |
| Accessibility | Keyboard navigation, focus ring, screen reader labels, contrast, zoom, reduced motion, high contrast |

### 4.4. Hành vi tương tác

- Single click chọn; double click mở; Enter mở; Esc đóng pane/modal.
- Swipe trên mobile cho archive, delete, mark read, snooze.
- Drag-and-drop thư vào folder, người vào meeting, file vào compose.
- Context menu theo đối tượng và quyền.
- Undo sau delete/archive/move/send nếu thao tác còn khả năng hoàn tác.
- Keyboard shortcuts có bảng trợ giúp; shortcut phải không xung đột với trình duyệt.
- Autosave có chỉ báo “Saving/Saved/Offline”; không làm mất bản nháp khi đóng.
- Optimistic update cho thao tác nhanh nhưng phải có rollback khi server từ chối.
- Tìm kiếm giữ lại bộ lọc khi người dùng quay lại.

---

## 5. Luồng người dùng trọng yếu

### Luồng A: xử lý email thành công việc

1. Người dùng mở Inbox và chọn thư.
2. Hệ thống hiển thị người gửi, subject, nội dung, file và lịch sử chuỗi.
3. Người dùng chọn Flag hoặc “Create task from message”.
4. Form task tự điền tiêu đề, nguồn, liên kết thư và deadline gợi ý.
5. Người dùng xác nhận, giao người phụ trách nếu có.
6. Task xuất hiện trong To Do và giữ liên kết ngược về email.
7. Khi hoàn thành, email hiển thị trạng thái đã xử lý.

### Luồng B: đặt cuộc họp

1. Người dùng chọn New Meeting.
2. Nhập chủ đề, người dự, thời lượng, địa điểm hoặc link online.
3. Hệ thống tải free/busy theo quyền.
4. Đề xuất các khung giờ phù hợp và cảnh báo xung đột.
5. Người dùng chọn giờ, thêm agenda/file.
6. Hệ thống gửi invitation và tạo event.
7. RSVP cập nhật event; organizer xem trạng thái từng người.

### Luồng C: tìm và hành động với tài liệu

1. Người dùng search theo từ khóa hoặc tệp.
2. Kết quả trộn email, attachment, file cloud và người liên quan.
3. Người dùng preview file.
4. Người dùng chọn share link, attach copy hoặc mở dịch vụ gốc.
5. Hệ thống kiểm tra quyền, nhạy cảm, kích thước và audit.

### Luồng D: trợ lý AI

1. Người dùng yêu cầu tóm tắt hoặc soạn nháp.
2. Hệ thống hiển thị nguồn, kết quả và cảnh báo dữ liệu.
3. Người dùng sửa nội dung.
4. Hệ thống kiểm tra người nhận, tệp, quyền và policy.
5. Chỉ sau thao tác Send/Confirm rõ ràng hệ thống mới thực hiện hành động.

---

## 6. Mô hình dữ liệu tối thiểu

| Entity | Trường chính |
|---|---|
| User | id, tenantId, displayName, email, locale, timezone, roles, status |
| MailAccount | id, userId, address, provider, syncState, sendPolicy |
| Message | id, mailboxId, threadId, from, to, cc, bcc, subject, body, receivedAt, sentAt, labels, flags, sensitivity |
| Attachment | id, messageId, name, mimeType, size, storageRef, scanState, sharePolicy |
| Folder | id, mailboxId, parentId, name, type, order |
| Thread | id, normalizedSubject, participants, lastMessageAt, unreadCount |
| Contact | id, ownerId/directoryId, name, addresses, phones, organization, notes |
| Calendar | id, ownerId, name, timezone, sharingPolicy, color |
| Event | id, calendarId, subject, start, end, recurrence, location, organizer, onlineMeeting, sensitivity |
| Attendee | eventId, address, role, response, responseAt |
| Task | id, ownerId, sourceRef, title, description, status, priority, dueAt, reminderAt, assigneeId, recurrence |
| Category | id, ownerId, name, color |
| Rule | id, ownerId, trigger, conditions, actions, enabled, lastRunAt |
| Permission | resourceType, resourceId, principalId, role, expiresAt |
| AuditEvent | actorId, action, resource, timestamp, ip/device, result |
| AiInteraction | userId, request, sources, output, accepted, model, policyResult, timestamp |

**Liên kết quan trọng:** Message có thể tạo Task hoặc Event; Event liên kết Message, Contact, Room và File; Contact liên kết Thread; Attachment liên kết Storage object và permission; mọi hành động nhạy cảm liên kết AuditEvent.

---

## 7. Kiến trúc kỹ thuật và API

### 7.1. Các lớp hệ thống

1. **Client layer:** desktop/web/mobile, design system, offline cache, keyboard/touch interaction.
2. **API gateway:** REST/GraphQL, OAuth2/OIDC, rate limit, tenant routing.
3. **Domain services:** Mail, Calendar, People, Tasks, Search, Files, Rules, Notifications.
4. **Sync and event layer:** delta sync, event subscriptions, retry queue, conflict resolution.
5. **Storage:** relational metadata, object storage, search index, cache, audit store.
6. **AI gateway:** retrieval, policy filtering, prompt orchestration, model routing, citations.
7. **Admin layer:** tenant settings, roles, policies, retention, audit, feature flags.

### 7.2. API capability nên có

Microsoft cho biết Outlook có thể tích hợp qua REST APIs/Microsoft Graph để tìm email, tạo event và đồng bộ contacts; add-ins có thể chạy trên desktop, web và mobile; actionable messages cho phép thực hiện hành động ngay trong email.[3]

API tương tự nên bao gồm:

- `GET/POST/PATCH/DELETE /messages`
- `GET /threads/{id}`
- `POST /messages/{id}/reply`, `/forward`, `/move`, `/archive`
- `GET/POST/PATCH /events`, `/events/{id}/attendees`
- `GET/POST /calendars`, `/calendars/{id}/permissions`
- `GET/POST/PATCH /contacts`
- `GET/POST/PATCH /tasks`
- `GET /search?q=&scope=&filters=`
- `GET /files`, `POST /attachments`
- `POST /rules`, `POST /workflows`
- `POST /ai/summarize`, `/ai/draft`, `/ai/extract-actions`
- `GET /delta/messages`, `/delta/events` để đồng bộ gia tăng
- `POST /subscriptions` cho webhook/event notification

---

## 8. Bảo mật, riêng tư và quản trị

### 8.1. Danh tính và quyền

- OIDC/OAuth2, SSO doanh nghiệp, MFA và session management.
- RBAC cho user, manager, delegate, mailbox owner, admin, compliance officer.
- ABAC theo tenant, phòng ban, nhãn dữ liệu, thiết bị, IP và thời gian.
- Quyền riêng cho đọc, tạo, sửa, xóa, gửi thay mặt, gửi với tư cách, chia sẻ và delegate.
- Thu hồi token, đăng xuất toàn bộ thiết bị, device/session inventory.

### 8.2. Bảo vệ dữ liệu

- Mã hóa khi truyền và khi lưu.
- Phân vùng tenant chặt chẽ.
- Scan malware/phishing cho URL và attachment.
- Spam filtering, spoofing protection, SPF/DKIM/DMARC ở tầng mail nếu sản phẩm quản lý gửi nhận thực.
- DLP cho dữ liệu cá nhân, tài chính, mật khẩu và bí mật doanh nghiệp.
- Sensitivity label, encryption, hạn chế forward/copy/download.
- Retention, legal hold, archive, eDiscovery và xóa theo chính sách.
- Audit đầy đủ cho login, read, send, delete, share, permission, admin và AI.
- Backup, restore, disaster recovery, RPO/RTO được công bố.

### 8.3. AI governance

- Không huấn luyện model dùng chung từ dữ liệu tenant nếu chưa được phép.
- Xác định nguồn truy xuất và phân quyền trước khi đưa dữ liệu vào context.
- Redaction PII trong telemetry.
- Cho phép admin tắt AI theo tenant, nhóm hoặc loại dữ liệu.
- Ghi lại prompt, nguồn, output, thao tác người dùng và quyết định policy theo retention.
- Kiểm thử prompt injection qua email, file và lịch.

---

## 9. Yêu cầu phi chức năng

| Nhóm | Mục tiêu khuyến nghị |
|---|---|
| Hiệu năng | Inbox shell hiển thị trong 2 giây ở mạng tốt; thao tác đọc/move/flag phản hồi cảm nhận dưới 300 ms khi cache hợp lệ |
| Tìm kiếm | Kết quả đầu tiên dưới 2 giây cho index thông thường; hiển thị tiến độ với truy vấn lớn |
| Đồng bộ | Có delta sync, offline queue, retry lũy thừa và conflict resolution |
| Khả dụng | Thiết kế multi-zone; có kế hoạch khôi phục và trang trạng thái |
| Mở rộng | Tenant, mailbox, thread, event được phân vùng; search index mở rộng độc lập |
| Tương thích | Chrome, Edge, Safari, Firefox hiện hành; iOS/Android nếu có mobile |
| Accessibility | WCAG 2.2 AA mục tiêu; dùng được hoàn toàn bằng bàn phím |
| Quốc tế hóa | Tiếng Việt, timezone, locale, định dạng ngày/giờ, DST, RTL nếu cần |
| Quan sát | Metrics, traces, structured logs, audit, correlation ID |
| Khôi phục | Undo thao tác người dùng; soft delete trước hard delete |

---

## 10. Phân rã MVP và lộ trình

### MVP 1: nền tảng email cá nhân

Mail account, Inbox/Sent/Drafts/Trash, compose, reply/forward, attachment, folders, read/unread, search cơ bản, contacts cơ bản, responsive web, auth, autosave và audit tối thiểu.

### MVP 2: lịch và công việc

Calendar day/week/month, event, recurring event, invitation, RSVP, reminder, free/busy đơn giản, task, flag, due date, liên kết email–task–event.

### MVP 3: doanh nghiệp và cộng tác

Shared mailbox, delegate, shared calendar, groups, file cloud, permissions, rules, Quick Steps, notification center, admin console, retention cơ bản.

### Giai đoạn nâng cao

Mobile, offline đầy đủ, Teams-like meeting integration, room/resource booking, workflow engine, add-in SDK, Graph-compatible API, actionable messages, advanced search, DLP, eDiscovery, AI assistant, analytics và multi-tenant enterprise controls.

**Nguyên tắc:** Không xây AI trước khi có identity, permission, search, audit và dữ liệu nguồn đáng tin. Nếu không, AI sẽ tạo ra giao diện ấn tượng nhưng không an toàn và khó vận hành.

---

## 11. Acceptance criteria chính

### Email

- Người dùng có thể soạn, lưu nháp, gửi, nhận, trả lời, chuyển tiếp và đính kèm file.
- Thao tác move/archive/delete có undo và không mất dữ liệu khi mạng chập chờn.
- Tìm kiếm theo người gửi, subject, ngày, folder, attachment và unread trả về kết quả đúng.
- Quyền không cho phép người dùng nhìn thấy mailbox hoặc attachment ngoài phạm vi.

### Calendar

- Có thể tạo event và meeting, mời người, nhận RSVP, cập nhật và hủy.
- Hệ thống cảnh báo xung đột dựa trên dữ liệu free/busy người dùng được phép xem.
- Múi giờ và recurring event không làm sai thời gian khi đổi DST.
- Quyền delegate được kiểm tra ở cả UI và API.

### Tasks

- Email có thể chuyển thành task, giữ liên kết nguồn và hiển thị trong task list.
- Task có deadline, reminder, trạng thái, người phụ trách và đồng bộ.
- Hoàn thành task không tự xóa email gốc trừ khi người dùng chọn policy.

### UX/UI

- Người mới hiểu được app rail, folder tree, list và detail pane.
- Người dùng bàn phím có thể mở module, đọc thư, trả lời và gửi.
- Mobile không phụ thuộc hover hoặc Ribbon desktop.
- Empty, error, offline, permission denied và sync pending đều có trạng thái rõ.

### AI

- Mọi tóm tắt có nguồn.
- AI không gửi thư, đổi lịch, chia sẻ file hoặc giao task khi chưa có xác nhận.
- Kết quả bị giới hạn bởi quyền người dùng.
- Có nút sửa, hoàn tác, báo lỗi và lịch sử AI theo chính sách.

---

## 12. Prompt nền để đào tạo AI xây sản phẩm

```text
Bạn là kiến trúc sư sản phẩm và UX designer cho một workspace giao tiếp doanh nghiệp.
Hãy thiết kế tính năng theo mô hình Mail–Calendar–People–Tasks–Files–Search–Automation.
Mỗi tính năng phải nêu: mục tiêu người dùng, actor, tiền điều kiện, happy path,
edge cases, permission, dữ liệu vào/ra, API, trạng thái UI, accessibility và acceptance criteria.

Không giả định mọi người dùng có cùng license. Hãy đánh dấu capability phụ thuộc vào
Exchange/Graph, dịch vụ lịch, file storage, workflow, AI hoặc gói doanh nghiệp.

Thiết kế desktop theo master–detail: app navigation, folder/resource tree, list/grid,
reading/detail pane, contextual toolbar và status bar. Thiết kế mobile theo một cột,
điều hướng quay lại, bottom navigation và thao tác swipe.

Không thực hiện hành động có hậu quả như gửi email, đổi lịch, chia sẻ dữ liệu,
giao task hoặc xóa vĩnh viễn nếu chưa có xác nhận của người dùng. Luôn tôn trọng
tenant isolation, RBAC, DLP, audit, encryption, retention và quyền truy cập nguồn.
```

---

## 13. Giới hạn và lưu ý bản quyền

Outlook desktop, new Outlook, web, mobile, Outlook.com và Exchange Online không có bộ tính năng hoàn toàn giống nhau. Một tính năng có thể khác theo hệ điều hành, phiên bản cập nhật, loại tài khoản, khu vực hoặc license. Vì vậy, khi phát triển sản phẩm tương tự nên dùng tên module và hành vi phổ quát, không sao chép logo, biểu tượng độc quyền, câu chữ thương hiệu, mã màu chính xác hoặc bố cục đến mức gây nhầm lẫn. Cần kiểm tra quyền sử dụng tên, biểu tượng và dữ liệu khi tích hợp API Microsoft.

---

## References

[1]: https://learn.microsoft.com/en-us/office365/servicedescriptions/office-365-platform-service-description/office-365-suite-features "Microsoft 365 suite features"

[2]: https://support.microsoft.com/en-us/outlook/calendar/introduction-to-the-outlook-calendar "Introduction to the Outlook Calendar"

[3]: https://learn.microsoft.com/en-us/outlook/ "Outlook Developer documentation"

[4]: https://support.microsoft.com/en-us/outlook/switch-between-your-email-calendar-contacts-and-tasks "Switch between your email, calendar, contacts, and tasks"

[5]: https://support.microsoft.com/en-us/outlook/basic-tasks-in-outlook "Basic tasks in Outlook"

[6]: https://learn.microsoft.com/en-us/microsoft-365/ "Microsoft 365 documentation"

---

**Tóm tắt cuối:** Nếu mục tiêu là đào tạo AI tạo phần mềm tương tự Outlook 365, bộ dữ liệu huấn luyện nên chứa cả **capability map**, **screen specification**, **interaction state**, **domain model**, **permission matrix**, **API contract**, **security policy** và **acceptance test**. Chỉ liệt kê nút bấm sẽ không đủ để AI tạo ra sản phẩm hoạt động đúng trong môi trường doanh nghiệp.
