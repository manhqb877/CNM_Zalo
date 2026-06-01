# Zalo Clone – Hệ thống Nhắn tin Thời gian thực

**Phiên bản:** 2.0 (Production-Grade)  
**Ngày khởi tạo:** 10/03/2026  
**Kiến trúc:** Scaled Modular Monolith (hướng tới Microservices)

---

## Mục tiêu & Phạm vi

Hệ thống nhắn tin tức thời quy mô vài nghìn người dùng, hỗ trợ chat 1-1, nhóm, chia sẻ media và quản lý bạn bè. Mục tiêu thay thế ứng dụng chat thương mại với khả năng kiểm soát dữ liệu nội bộ và tối ưu chi phí.

**Phạm vi bao gồm:**
- Web app (Next.js/React) và Mobile (React Native)
- Backend API + Real-time server (Socket.IO)
- Redis (Pub/Sub, Presence, Cache) + Kafka (Message Queue) + MongoDB (Persistence)
- Tích hợp: Email OTP (Resend API/SMTP), FCM/APNs (Push), Cloudflare R2 / AWS S3 (Media)

---

## Cách chạy Local

> **Hybrid setup** – chỉ chạy Docker cho Redis + Redpanda (~155MB RAM tổng).
> MongoDB, Storage, Email, Push dùng cloud free tier.

```bash
# 1. Clone & cài dependencies
git clone <repo-url>
cd zync-platform
npm install

# 2. Copy env và điền credentials cloud (xem bảng biến môi trường)
cp .env.example .env

# 3. Khởi động Redis + Redpanda (Kafka-compatible)
docker compose -f infra/docker-compose.yml up -d

# Kiểm tra services local:
#   Redis          → redis://localhost:6379
#   Kafka          → localhost:9092  (Redpanda, Kafka-compatible)
#   Redpanda UI    → http://localhost:8080

# 4. Chạy Chat Server
npm run dev:server

# 5. Chạy Web Client
npm run dev:web
```

> **Docker Compose** chỉ chạy 2 service: `redis` + `redpanda` + `redpanda-console`.

---

## Cấu hình & Biến môi trường quan trọng

| Biến | Mô tả | Dev / Staging | Production |
|------|-------|---------------|------------|
| `MONGODB_URI` | MongoDB connection URI | Atlas M0 URI | Atlas M10+ URI (format không đổi) |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` (Docker local) | Upstash: `rediss://...upstash.io:6380` |
| `KAFKA_BROKERS` | Kafka broker (host:port) | `localhost:9092` (Redpanda local) | Upstash Kafka endpoint |
| `KAFKA_SASL_USERNAME` | Kafka SASL username | _(không cần – Redpanda local không có SASL)_ | Từ Upstash console |
| `KAFKA_SASL_PASSWORD` | Kafka SASL password | _(không cần)_ | Từ Upstash console |
| `JWT_SECRET` | Signing key access token | bất kỳ chuỗi | chuỗi ngẫu nhiên ≥ 64 ký tự |
| `JWT_REFRESH_SECRET` | Signing key refresh token | bất kỳ chuỗi | chuỗi ngẫu nhiên ≥ 64 ký tự |
| `OTP_HARDCODE` | Bật OTP cứng (không gửi thật) | `true` | `false` |
| `OTP_HARDCODE_VALUE` | Giá trị OTP cố định | `123456` | _(bỏ trống)_ |
| `SMTP_HOST` | SMTP server | `smtp.resend.com` | `smtp.resend.com` |
| `SMTP_PORT` | SMTP port | `587` | `587` |
| `SMTP_USER` | SMTP username | `resend` (literal) | `resend` (literal) |
| `SMTP_PASS` | SMTP password (Resend API key) | Resend API key (free) | Resend API key (pay-as-you-go) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Từ Cloudinary dashboard | Từ Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Từ Cloudinary console | Từ Cloudinary console |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Từ Cloudinary console | Từ Cloudinary console |
| `CLOUDINARY_UPLOAD_PRESET` | Upload preset name | `zync-media` | `zync-media-prod` |
| `FCM_SERVER_KEY` | Firebase Cloud Messaging key | _(không cần trong dev)_ | key từ Firebase Console |

---

## Giả định (Assumptions)

**Dev & Staging (hybrid: Docker local + cloud free tier):**
- **Redis**: chạy local Docker (`redis:7-alpine`, ~5MB RAM). Upstash 10K cmd/ngày không đủ cho real-time app (mỗi socket event tiêu thụ 3–5 Redis command).
- **Kafka**: chạy local Docker via **Redpanda** (~150MB RAM, không cần Zookeeper, Kafka API 100% tương thích). Upstash Kafka 10K msg/ngày không đủ và SASL/SSL bắt buộc gây phức tạp không cần thiết khi dev.
- **MongoDB Atlas M0**: 512MB storage, shared cluster – đủ cho dev, không có SLA. Cần kết nối internet.
- **Cloudinary**: 25 credits/tháng free (storage + transformations + bandwidth). Upload flow: server tạo signature bằng `CLOUDINARY_API_SECRET` → client upload thẳng lên Cloudinary CDN. Có thể giữ Cloudinary hoặc upgrade plan khi lên production mà không đổi code.
- **Resend**: dùng SMTP relay `smtp.resend.com:587`, API key làm SMTP password, 100 email/ngày free. Dev dùng `OTP_HARDCODE=true` nnên hầu như không tốn quota.
- Tổng RAM local: ~155MB (Redis 5MB + Redpanda 150MB).
- Switch giữa môi trường **chỉ qua file `.env`**, không thay đổi code.

**Production (chỉ đổi `.env`, không đổi code):**
- Upgrade Atlas M0 → M10+ trên Atlas Dashboard, URI format không đổi.
- Đổi `REDIS_URL` sang Upstash `rediss://...` (TLS). Infrastructure code phải hỗ trợ TLS dựa vào URL prefix.
- Đổi `KAFKA_BROKERS` sang Upstash endpoint + thêm `KAFKA_SASL_USERNAME`/`KAFKA_SASL_PASSWORD`. Infrastructure code xử lý SASL khi các biến này tồn tại.
- Cloudinary có thể giữ nguyên hoặc upgrade plan nếu cần dung lượng lớn hơn.
- MongoDB chạy ở chế độ replica set 3 node, Kafka ít nhất 3 partition.
- Các client đã hỗ trợ WebSocket (Socket.IO).

---

## Quyết định kiến trúc (Decisions)

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | Dùng Kafka làm message buffer | Đảm bảo durability, tránh mất tin nhắn khi DB chậm |
| D2 | Redis Pub/Sub cho cross-server | Đồng bộ real-time giữa nhiều Chat Server instance |
| D3 | MongoDB làm primary DB | Phù hợp với schema linh hoạt và dữ liệu document |
| D4 | Cursor-based pagination | Tránh offset pagination bị lệch khi có dữ liệu mới |
| D5 | Cloudinary signed upload cho media | Server tạo signature, client upload thẳng lên Cloudinary CDN – không qua server, tích hợp CDN + image transformation miễn phí |
| D6 | Idempotency key cho tin nhắn | Chống gửi trùng do retry từ client |
| D7 | Modular Monolith trước Microservices | Giảm complexity triển khai ở giai đoạn đầu |
| D8 | Hybrid dev: Redis+Kafka local Docker, MongoDB+Cloudinary+Resend cloud | Redis 10K cmd/ngày không đủ cho real-time; Redpanda nhẹ hơn Kafka+ZK 4x; Cloudinary có CDN+transformation miễn phí và giữ nguyên lên production |
| D9 | Realtime Calling rollout theo 2 bước: 1-1 P2P trước, group SFU sau | Giảm effort ban đầu, ship nhanh value cao cho user, hạn chế context cost khi mobile core chưa ổn định |
| D10 | Signaling call đi qua Socket.IO, media đi trực tiếp qua WebRTC | Tận dụng hạ tầng realtime sẵn có, tách control-plane và media-plane để giảm tải app server |
| D11 | Bắt buộc TURN (coturn) cho production + fallback audio-only khi mạng yếu | Tăng tỷ lệ kết nối thành công qua NAT/firewall và giữ trải nghiệm ổn định trên mạng di động |
| D12 | Defer SFU group call tới sau khi hoàn tất mobile core M4/M5 | Tránh vừa build core mobile vừa debug media-plane phức tạp, giảm rủi ro tiến độ |

---

## Yêu cầu phi chức năng chính

- **Latency:** Tin nhắn < 200ms (p95 < 500ms)
- **Scalability:** 500+ CCU/instance, scale ngang không downtime
- **Availability:** 99.9% uptime
- **Security:** JWT HS256/RS256, HTTPS/WSS bắt buộc, rate limiting
- **Test coverage:** > 80% unit test

---

## Roadmap

### Phase 1 – Foundation & Infrastructure
- [x] Khởi tạo monorepo (server + web + mobile) <!-- done: 10/03/2026 -->
- [x] Triển khai base project structure – server/web/mobile skeleton <!-- done: 10/03/2026 -->
- [x] Thiết lập CI/CD pipeline (GitHub Actions – typecheck + test) <!-- done: 10/03/2026 -->
- [x] Fix skeleton chạy được local (tsconfig, duplicate import) <!-- done: 10/03/2026 -->
- [x] Fix TypeScript compilation errors (moduleResolution, AxiosError types) <!-- done: 10/03/2026 -->
- [x] Migrate dev setup sang Hybrid: Redis+Redpanda Docker, Atlas M0+Cloudinary+Resend cloud <!-- done: 11/03/2026 -->
- [x] Cập nhật .env.example theo hybrid setup mới <!-- done: 11/03/2026 -->
- [x] Thay aws-sdk sang cloudinary, nâng nodemailer lên v8 (fix high CVE) <!-- done: 11/03/2026 -->
- [x] Fix dotenv path – load .env từ root monorepo <!-- done: 12/03/2026 -->
- [x] Viết README.md chuẩn documentation <!-- done: 12/03/2026 -->
- [x] Verify toàn bộ connections: MongoDB Atlas + Redis + Kafka (Redpanda) <!-- done: 12/03/2026 -->
- [x] Bổ sung README chi tiết cho apps/server và apps/web (công nghệ, kiến trúc, cấu trúc, kỹ thuật quan trọng) <!-- done: 02/04/2026 -->
- [x] Dựng UI theme login web theo mẫu green-glass (responsive desktop/mobile) <!-- done: 15/03/2026 -->
- [x] Refactor Login UI theo Atomic Design từ ảnh mẫu (atoms/molecules/organisms + mock data) <!-- done: 19/03/2026 -->
- [x] Dựng trang chủ Web (Phase 1) theo layout `trangchu.png` và điều hướng sang Auth flow <!-- done: 19/03/2026 -->
- [x] Code lại landing route `/` theo mẫu UI mới (glassmorphism + hero + metrics + CTA + footer) <!-- done: 19/03/2026 -->
- [x] Chuẩn hóa typography toàn hệ thống Web sang font Be Vietnam Pro <!-- done: 19/03/2026 -->
- [x] Thêm hiệu ứng loading mở trang cho landing `/` và auth `/auth` (bao gồm luồng đăng nhập/đăng ký) <!-- done: 05/04/2026 -->
- [x] Chuẩn hóa hiệu ứng loading chuyển trang bằng `PageLoading` dùng chung (Web) <!-- done: 07/05/2026 -->
- [x] Sửa lỗi nháy trắng (white flash) khi tải trang ở Dark mode (Web) bằng inline script apply theme sớm <!-- done: 11/05/2026 -->
- [x] Fix lỗi loading first-load Web đồng bộ theme sáng, tránh treo khi vào lần đầu <!-- done: 26/05/2026 -->

### Phase 2 – Authentication & User Management (Module F1–F4)
- [x] POST /api/auth/register – gửi OTP qua Twilio/Email <!-- done: 15/03/2026 -->
- [x] POST /api/auth/verify-otp – xác thực OTP, trả JWT <!-- done: 15/03/2026 -->
- [x] POST /api/auth/refresh – refresh access token <!-- done: 15/03/2026 -->
- [x] POST /api/auth/logout – thu hồi token, xóa device token <!-- done: 15/03/2026 -->
- [x] Quản lý device tokens (FCM/APNs/Web Push) <!-- done: 15/03/2026 -->
- [x] Rate limit OTP: 3 lần/giờ/IP hoặc SĐT <!-- done: 15/03/2026 -->
- [x] Harden Auth middleware: kiểm tra blacklist token trên mọi route bảo vệ <!-- done: 19/03/2026 -->
- [x] Bổ sung integration test cho users routes (me/profile/device token/revoked token) <!-- done: 19/03/2026 -->
- [x] Cập nhật Web Auth UI tiếng Việt (Đăng nhập/Đăng ký) theo Atomic Design <!-- done: 19/03/2026 -->
- [x] Kết nối Web Auth flow Phase 2: request OTP, verify OTP, lưu access token memory, logout <!-- done: 19/03/2026 -->
- [x] Chuẩn hóa route web auth: `/auth` và chuyển hướng sang Phase 3 sau đăng nhập thành công <!-- done: 19/03/2026 -->
- [x] Bổ sung đăng nhập Email + Password + OTP (request OTP + verify OTP) cho Phase 2 <!-- done: 19/03/2026 -->
- [x] Bổ sung đăng nhập Google bằng Google ID Token (Backend + Web action) <!-- done: 19/03/2026 -->
- [x] Bắt buộc đăng nhập bằng Email + Password + OTP (loại bỏ luồng login OTP-only cho tài khoản đã tồn tại) <!-- done: 19/03/2026 -->
- [x] Bổ sung luồng Quên mật khẩu: request OTP + reset mật khẩu mới <!-- done: 19/03/2026 -->
- [x] Chuẩn hóa OTP gửi thực ngoài môi trường test (OTP hardcode chỉ cho NODE_ENV=test) <!-- done: 19/03/2026 -->
- [x] Fix OTP rate limit nhận diện đúng identifier cho các API dùng trường `email`/`phoneNumber` <!-- done: 19/03/2026 -->
- [x] Xử lý lỗi Resend sandbox rõ ràng (không trả 500 mơ hồ, trả hướng dẫn verify domain/SMTP_FROM) <!-- done: 19/03/2026 -->
- [x] Tạm thời bật lại OTP_HARDCODE cho môi trường dev/non-production, giữ SMTP/SMS cho production deploy <!-- done: 19/03/2026 -->
- [x] Hotfix OTP rate limit về đúng 3 lần/giờ theo IP/identifier (sửa lệch cấu hình dev) <!-- done: 05/04/2026 -->
- [x] Setup Resend API cho OTP email (register/login), fallback SMTP khi chưa cấu hình API key <!-- done: 05/04/2026 -->
- [x] Mở rộng OTP rate limit cho môi trường dev qua biến cấu hình (tránh nghẽn khi test liên tục) <!-- done: 05/04/2026 -->
- [x] Bổ sung cấu hình Gmail SMTP để test OTP email nhanh không cần verify domain Resend <!-- done: 05/04/2026 -->
- [x] Mở rộng luồng quên mật khẩu hỗ trợ identifier (email hoặc phone) cho tài khoản xác thực OTP <!-- done: 05/04/2026 -->
- [x] Chuẩn hóa toggle OTP_HARDCODE: true dùng OTP cố định 123456 và không gọi mail thật, false dùng OTP thực qua provider email/SMS <!-- done: 05/04/2026 -->
- [x] Harden cập nhật profile: validate strict payload, trim dữ liệu và chặn request rỗng cho PATCH /api/users/me <!-- done: 05/04/2026 -->
- [x] Chuẩn hóa Auth email-only: bỏ phone ở luồng đăng ký/khôi phục, thêm `@username` duy nhất cho đăng ký + cập nhật profile, đồng bộ tìm kiếm theo `@username`/email cho Web + Mobile <!-- done: 17/04/2026 by binhdev -->
- [ ] Bổ sung integration test cho các case trùng `@username` và luồng tìm kiếm `@username`/email trên Web + Mobile
- [ ] Bổ sung integration test cho fallback Resend API -> SMTP khi provider lỗi
- [x] Chuẩn hóa chiều rộng UI Web theo container dùng chung cho `/`, `/auth`, `/friends` <!-- done: 19/03/2026 -->
- [x] Nâng cấp landing page `/` với fixed header, scroll section và bố cục chuẩn landing <!-- done: 19/03/2026 -->
- [x] Cân đối lại bố cục trang auth theo hướng center đồng bộ design login <!-- done: 19/03/2026 -->
- [x] Sau đăng nhập thành công chuyển về trang chủ `/` theo thiết kế trang chủ <!-- done: 19/03/2026 -->
- [x] Tách vai trò route: `/` là landing giới thiệu, `/home` là trang chính sau đăng nhập thành công <!-- done: 19/03/2026 -->
- [x] Dựng giao diện `/home` theo mẫu dashboard `docs/designs/login.png` với mock data khi chưa có API <!-- done: 19/03/2026 -->
- [x] Hoàn thiện luồng Secure Logout (xóa session, dọn dẹp state và chuyển hướng về đăng nhập) <!-- done: 12/04/2026 -->
- [x] Cấu hình chính xác định tuyến từ Home Dashboard cho recent activities và dọn dẹp UI thừa <!-- done: 12/04/2026 -->
- [x] Tối ưu header Dashboard Web: nhấn tab, bỏ Khám phá, đưa Cài đặt/Đăng xuất vào profile, bật thông báo, thêm Hồ sơ, chỉ giữ avatar <!-- done: 07/05/2026 -->
- [x] Tạo route /profile trên Dashboard Web và điều hướng từ menu Hồ sơ <!-- done: 07/05/2026 -->
- [x] Bổ sung routing thông báo và trang /settings cho Dashboard Web <!-- done: 07/05/2026 -->

### Phase 3 – Friends & Contacts (Module F5–F9)
- [x] Gửi / chấp nhận / từ chối lời mời kết bạn <!-- done: 19/03/2026 -->
- [x] Hủy kết bạn, chặn/bỏ chặn người dùng <!-- done: 19/03/2026 -->
- [x] API danh sách bạn bè với cursor pagination <!-- done: 19/03/2026 -->
- [x] Cache friends list trong Redis (TTL 10 phút) <!-- done: 19/03/2026 -->- [ ] (Optional) Đồng bộ danh bạ điện thoại
- [x] Bổ sung API `GET /api/friends/requests` và `GET /api/users/search` phục vụ UI luồng kết bạn <!-- done: 19/03/2026 -->
- [x] Dựng Friends Dashboard Web (search/send request/incoming-outgoing/list/unfriend/block) tại route `/friends` <!-- done: 19/03/2026 -->

### Phase 4 – Group Management (Module F10–F16)
- [x] Tạo nhóm (tối đa 100 thành viên) <!-- done: 04/04/2026 -->
- [x] Cập nhật thông tin nhóm (admin only) <!-- done: 04/04/2026 -->
- [x] Thêm / xóa thành viên, rời nhóm <!-- done: 04/04/2026 -->
- [x] Phân quyền admin/member <!-- done: 04/04/2026 -->
- [x] Xóa nhóm (admin only) <!-- done: 04/04/2026 -->
- [x] Socket event `group_updated` khi có thay đổi <!-- done: 04/04/2026 -->
- [x] Chức năng tạo nhóm trực tiếp từ giao diện Chat Info Panel <!-- done: 12/04/2026 -->

### Phase 5 – Real-time Messaging (Module F17–F21)
- [x] WebSocket server với Socket.IO + Redis adapter <!-- done: 04/04/2026 -->
- [x] Gửi/nhận tin nhắn văn bản + emoji (1-1 và nhóm) <!-- done: 04/04/2026 -->
- [x] Upload media qua pre-signed URL flow <!-- done: 04/04/2026 -->
- [x] Fix lỗi compile upload routes (thiếu đóng route `/sign`) để server chạy dev ổn định <!-- done: 02/04/2026 -->
- [x] Message status: sent → delivered → read (2 tick xanh) <!-- done: 04/04/2026 -->
- [x] Typing indicator (TTL 3 giây trong Redis) <!-- done: 04/04/2026 -->
- [ ] Đồng bộ đa thiết bị (multi-device sync)
- [x] Kafka consumer: batch insert vào MongoDB <!-- done: 04/04/2026 -->
- [x] Idempotency key chống gửi trùng <!-- done: 04/04/2026 -->
- [x] Bổ sung seed data QA cho tài khoản có friends + lịch sử chat 1-1/nhóm + message status để test nhanh luồng đã làm <!-- done: 05/04/2026 -->
- [x] Chuẩn hóa contract message type giữa schema/model/socket/web (text/image/video/audio/file/sticker) <!-- done: 05/04/2026 -->
- [x] Siết quyền membership ở Socket event send_message/message_read/message_delivered để tránh thao tác trái phép ngoài conversation <!-- done: 05/04/2026 -->
- [x] Hoàn thiện upload chat media hỗ trợ file document + render tin nhắn file trên Web dashboard <!-- done: 05/04/2026 -->
- [x] Harden typing realtime: kiểm tra membership và validate payload cho typing_start/typing_stop <!-- done: 05/04/2026 -->
- [x] Ổn định preview hội thoại cho media-only message (ảnh/video/file/audio/sticker) ở cả backend và web realtime <!-- done: 05/04/2026 -->
- [x] Fix lỗi upload chat Cloudinary 401 bằng signature chuẩn từ Cloudinary utils cho endpoint generate-signature <!-- done: 05/04/2026 -->
- [x] Hotfix bổ sung upload 401: đồng bộ tập params ký/upload (không ép public_id) để tránh lệch signature khi gửi ảnh/file <!-- done: 05/04/2026 -->
- [x] Bổ sung gửi tin nhắn icon nhanh (emoji/sticker quick picker) trên Web chat input <!-- done: 05/04/2026 -->
- [x] Cải tiến Web chat UI: cố định khung nhập tin nhắn ở đáy, thêm logo Zync ở dashboard và lời chào động theo user thật <!-- done: 05/04/2026 -->
- [x] Sửa race condition load lịch sử chat sau login để không cần F5 mới thấy tin nhắn cũ <!-- done: 05/04/2026 -->
- [x] Tối ưu UX gửi ảnh/tệp chat: hiện preview ngay, upload chạy nền và không khóa ô nhập <!-- done: 05/04/2026 -->
- [x] Fix layout dashboard: cố định navbar theo viewport, bind avatar thật sau khi cập nhật profile và giữ khung soạn tin nhắn neo đáy khi chat <!-- done: 05/04/2026 -->
- [x] Bổ sung animation reveal trái/phải/dưới lên khi refresh cho landing và auth để tăng cảm giác tải giao diện <!-- done: 05/04/2026 -->
- [x] Bổ sung thanh tiến trình upload theo phần trăm cho avatar profile và media chat để phản hồi trạng thái rõ ràng hơn <!-- done: 05/04/2026 -->
- [x] Tinh chỉnh mobile dashboard: chuyển sidebar sticky thành drawer để tránh chiếm chiều cao nội dung <!-- done: 05/04/2026 -->
- [x] Hotfix UI chat: khôi phục danh sách hội thoại và header khung chat sau khi chỉnh layout chiều ngang <!-- done: 05/04/2026 -->
- [x] Thay thế mock data trong Chat Info Panel bằng dữ liệu thông tin thực (Pin, Mute) <!-- done: 12/04/2026 -->
- [x] Hotfix căn lề bubble chat: tin nhắn gửi bên phải, nhận bên trái trên Web dashboard <!-- done: 16/04/2026 -->
- [x] Hotfix bubble chat: bỏ nền trắng, đồng bộ style gửi/nhận trên Web dashboard <!-- done: 05/05/2026 -->
- [x] Hotfix chat list: bỏ nền khung wrapper tin nhắn để không che action hover <!-- done: 05/05/2026 -->

- [ ] Bổ sung dữ liệu seed media message (image/video/file) để test upload + render đa loại message

### Phase 6 – Presence & Online Status (Module F22–F25)
>- [x] Tìm kiếm bạn bè theo tên/@username/email trên thanh search Dashboard <!-- done: 06/04/2026 -->
>- [x] Xem nhanh profile người dùng từ kết quả tìm kiếm (UserProfileModal) <!-- done: 06/04/2026 -->
>- [x] API `GET /api/friends/count` – đếm tổng bạn bè <!-- done: 06/04/2026 -->
>- [x] API `GET /api/users/:userId` trả thêm username + email masked + friendCount + mutualFriends <!-- done: 06/04/2026 -->
>- [x] Profile panel bỏ mock data, dùng dữ liệu thật (friends count, joined date) <!-- done: 06/04/2026 -->
>- [x] Chuẩn hóa UI tab Dashboard Web (Tổng quan/Trò chuyện/Bạn bè/Cộng đồng/Khám phá) full-width và đồng bộ tiếng Việt có dấu <!-- done: 29/04/2026 -->
>- [ ] Broadcast online/offline status chỉ cho friends (filter qua friends list Redis cache)
>- [ ] API `GET /api/users/:id/presence` – trả `{online, lastSeen}`
>- [ ] Lưu `lastSeen` vào Redis khi disconnect, hiển thị "Hoạt động lần cuối" trên UI

### Phase 7 – Notifications (Module F26)
- [x] Implement `notification.worker.ts` – Kafka consumer topic `notifications` <!-- done: 12/04/2026 -->
- [x] Tích hợp FCM (Firebase Admin SDK – `firebase-admin` đã có trong dependencies) <!-- done: 12/04/2026 -->
- [x] Tích hợp Web Push API cho browser notifications <!-- done: 12/04/2026 -->
- [x] Push notification khi: tin nhắn mới + user offline, friend request, group invite <!-- done: 12/04/2026 -->
- [x] Notification preferences: user chọn mute conversation/group <!-- done: 12/04/2026 -->
- [x] Đảm bảo thông báo hiển thị toàn cục (global) trên tất cả các tab của Web Dashboard <!-- done: 12/04/2026 -->
- [ ] APNs placeholder cho iOS (implement khi có mobile app)

### Phase 7.5 – Realtime Calling 1-1 & Group (Module F27–F33)

> **Định hướng rollout:** Ưu tiên 1-1 video call WebRTC P2P + TURN trước (value cao, effort thấp), group call dùng SFU (LiveKit/mediasoup) triển khai ở đợt sau khi M4/M5 mobile ổn định.

- [x] BA: Chốt chiến lược triển khai gọi video theo 2 bước (P2P 1-1 trước, SFU group sau) + TURN mandatory <!-- done: 18/04/2026 by binhdev -->
- [x] BA: Chốt acceptance criteria rollout <!-- done: 18/04/2026 by binhdev -->
  - Milestone A (1-1 P2P):
    - Given 2 user đã là bạn bè accepted, When caller gửi `call_invite`, Then callee nhận `call_incoming` và toàn bộ luồng setup đạt p95 < 3 giây (từ invite đến `call_status=connected`) trong môi trường mạng ổn định.
    - Given 100 phiên gọi thử nghiệm trên Wi-Fi/4G ổn định, When thực hiện invite->accept->offer/answer, Then tỷ lệ join thành công >= 95%.
    - Given callee không bắt máy trong timeout, When hết thời gian `CALL_RING_TIMEOUT_MS`, Then session tự chuyển `missed` với reason `timeout` và phát `call_status` cho cả 2 phía.
    - Given client gửi signaling event thiếu `callToken`, When server nhận payload, Then request bị từ chối và không relay offer/answer/ice.
  - Milestone B (group SFU, defer):
    - Given phòng gọi nhóm 3-10 người, When thành viên join/leave liên tục, Then phiên gọi vẫn ổn định, không crash room và chất lượng media giữ mức chấp nhận được.
    - Given host kết thúc cuộc gọi nhóm, When phát lệnh end-call, Then toàn bộ participant nhận trạng thái kết thúc đồng bộ.

- [x] BA: Chốt state machine cuộc gọi Milestone A (ringing, connecting, connected, ended, missed, rejected, busy) <!-- done: 18/04/2026 by binhdev -->
- [x] BA: Chốt policy nghiệp vụ Milestone A
  - 1-1: chỉ gọi khi friendship `accepted`
  - timeout: auto-miss sau 30 giây nếu không bắt máy <!-- done: 18/04/2026 by binhdev -->
- [x] BA: Chốt policy nghiệp vụ group call (member conversation mới được vào call) <!-- done: 18/04/2026 by binhdev -->
  - Chỉ user đang là member hợp lệ của conversation mới được cấp token/join call room.
  - User bị remove khỏi conversation trong lúc call phải bị revoke quyền signaling/media ở lần heartbeat/token check kế tiếp.
  - Milestone B giới hạn mặc định 10 participant/room; vượt ngưỡng trả lỗi business để tránh degrade chất lượng.
  - Quyền host/admin nhóm có thể kết thúc phiên gọi cho toàn bộ participant; member thường chỉ được rời cuộc gọi của mình.
- [x] DEV-BE (Milestone A): Tạo `modules/calls/` cho 1-1 P2P (create session, invite, accept/reject, end, missed) <!-- done: 18/04/2026 by binhdev -->
- [x] DEV-BE (Milestone A): Thêm collections `call_sessions`, `call_participants`, `call_events` + index truy vết call quality <!-- done: 18/04/2026 by binhdev -->
- [x] DEV-RT (Milestone A): Hoàn thiện signaling P2P cho 1-1 (offer/answer/ice + invite/accepted/rejected/timeout/ended) <!-- done: 18/04/2026 by binhdev -->
  - [x] Hotfix end-call reliability: cho phep `call_end` dung token het han (van verify signature/session/user) de 1 ben ket thuc la dong bo ket thuc cho ca 2 ben <!-- done: 18/04/2026 by binhdev -->
  - [x] Hotfix call history: ghi message text "Cuoc goi da ket thuc" (kem thoi luong neu co) vao conversation khi ket thuc cuoc goi <!-- done: 18/04/2026 by binhdev -->
  - [x] Hotfix call history day du: ghi message tom tat cho ca `missed`/`rejected` va dedupe theo `sessionId+status` de tranh trung lich su <!-- done: 18/04/2026 by binhdev -->
  - [x] Hotfix stale call session: tu dong xu ly session active bi ket (`ringing` qua han -> `missed`, `connected` qua nguong stale -> `ended`) truoc khi tao invite moi, tranh loi `A call between these users is already active` sau restart <!-- done: 18/04/2026 by binhdev -->
  - [x] Baseline group signaling tren socket: them `call_group_invite`, participant join payload co `joinedParticipantIds`, va test integration cho luong group invite/accept/webrtc offer-answer <!-- done: 18/04/2026 by binhdev -->
  - [x] Hardening group call room lifecycle: participant reject/leave chi cap nhat participant state (khong ket thuc toan room), host hoac last active participant moi dong session <!-- done: 18/04/2026 by binhdev -->
- [x] DEV-INFRA (Milestone A): Dựng coturn local (Docker Compose) + chuẩn hóa biến cấu hình TURN creds/URLs <!-- done: 18/04/2026 by binhdev -->
- [ ] DEV-INFRA (Milestone A): Dựng coturn staging, kiểm thử NAT traversal và fallback audio-only
- [x] DEV-INFRA (Milestone A): Thêm metrics call quality cho 1-1 (join success rate, setup time, reconnect, drop rate) <!-- done: 18/04/2026 by binhdev -->
- [x] DEV-WEB: UI gọi video 1-1 (incoming/outgoing ring, preview camera, mute/unmute, on/off camera, share screen, end call) <!-- done: 18/04/2026 by binhdev -->
  - [x] Baseline Web call UI: incoming/outgoing ring, panel điều khiển cuộc gọi, preview local camera, mute/unmute, on/off camera, share screen, end call + nối signaling event từ socket <!-- done: 18/04/2026 by binhdev -->
  - [x] Hoàn thiện render media peer thật bằng WebRTC peer connection + offer/answer/ICE trên Web chat panel <!-- done: 18/04/2026 by binhdev -->
  - [x] Chuẩn hóa biến môi trường WebRTC cho browser (`NEXT_PUBLIC_TURN_*`) để test call Web ổn định với TURN local <!-- done: 18/04/2026 by binhdev -->
  - [x] Hotfix Web call UX: chuyển panel call thành modal overlay nổi trên chat + fallback nhận cuộc gọi audio-only khi camera bị chặn <!-- done: 18/04/2026 by binhdev -->
  - [x] Nâng cấp UI call: Việt hóa có dấu + thêm icon điều khiển (nhận/từ chối, mic, camera, chia sẻ, kết thúc) + hỗ trợ group modal với lưới video participant <!-- done: 18/04/2026 by binhdev -->
  - [x] Group call UX hardening: active-speaker highlight theo audio RMS tren grid participant + hien thi "Dang noi" realtime <!-- done: 18/04/2026 by binhdev -->
  - [x] Hotfix Web call modal: tu dong dong banner trang thai ket thuc de tra ve doan chat (khong can F5) + thu gon modal vao khung chat, tranh che toan bo khung hoi thoai <!-- done: 18/04/2026 by binhdev -->
  - [x] Tinh chinh UI call Web: lam ro che do goi thoai/video, nhan biet dang co cuoc goi, an thong bao call trong doan chat <!-- done: 20/05/2026 -->
  - [x] Bo thong bao call khoi message list, chi giu toast/popup nhan-tu-choi <!-- done: 20/05/2026 -->
  - [x] Refactor layout call Web: gom 1 container, main stage + participant strip, video object-contain <!-- done: 21/05/2026 -->
- [x] DEV-MOBILE (Milestone A): UI/UX parity cho 1-1 call với Web (audio route, camera switch, background/foreground handling) <!-- done: 26/04/2026 by binhdev -->
- [x] DEV-SECURITY: Bảo vệ call bằng access token ngắn hạn (ephemeral call token), chống join trái phép qua roomId đoán được <!-- done: 18/04/2026 by binhdev -->
- [x] QC (Milestone A): E2E test 1-1 call (happy path, reject, missed, reconnect) <!-- done: 18/04/2026 by binhdev -->
- [ ] QC (Milestone A): Test TURN bắt buộc trên mạng NAT/4G, xác nhận fallback audio-only khi mạng yếu
- [ ] DEV (Milestone B - Defer): Tích hợp SFU group call (ưu tiên LiveKit) sau khi hoàn tất Mobile M4/M5
- [ ] DEV-WEB (Milestone B - Defer): UI gọi nhóm (grid layout động, active speaker, raise hand/mute all cho admin nhóm)
- [ ] DEV-MOBILE (Milestone B - Defer): Parity UI/UX group call trên mobile
- [ ] QC (Milestone B - Defer): E2E group call (3-10 users, join/leave liên tục, host end-call)

### Phase M1 – Mobile Foundation & Infrastructure (Lõi)

> **Nguyên tắc:** UI đồng bộ Web • Logic không đổi • Dùng chung backend API/Socket • Code có tính khả thi deploy lên App Store / Google Play.

- [x] Expo Router setup: Tab navigator (Home/Chat/Friends/Profile) + Stack navigator
- [x] Shared services layer: `api.ts` (axios + interceptor), `socket.ts` (Socket.IO client), `auth.ts` (SecureStore + auto-refresh)
- [x] Zustand store cho auth state (token, user info)
- [x] SecureStore cho token persistence (expo-secure-store)
- [x] Theming system đồng bộ Web (verdant/dark/light – CSS vars → RN StyleSheet)
- [x] Typography: Be Vietnam Pro via expo-font
- [x] Shared types: import từ `@zync/shared-types`


### Phase M2 – Mobile Authentication (Lõi)
- [x] Login screen (email + password)
- [x] Register screen (email + OTP verification)
- [x] Forgot password flow
- [x] Google Sign-In bỏ khỏi scope (không triển khai trên Mobile) <!-- removed: 27/04/2026 -->
- [x] Splash screen + onboarding slides
- [x] Auto-login flow (detect saved token → verify → redirect)

### Phase M3 – Mobile Home & Chat (Lõi)
- [x] Home tab: stats cards + recent activity list <!-- done: 12/04/2026 -->
- [x] Chat tab: conversation list (FlatList virtualized) <!-- done: 12/04/2026 -->
- [x] Chat room: bubble UI, message status (sent/delivered/read ticks) <!-- done: 12/04/2026 -->
- [x] Real-time messaging via Socket.IO <!-- done: 12/04/2026 -->
- [x] Typing indicator <!-- done: 12/04/2026 -->
- [x] Media picker (expo-image-picker) + Cloudinary signed upload <!-- done: 12/04/2026 -->
- [x] Đồng bộ chat Web ↔ Mobile: chuẩn hóa contract message/socket, hiển thị media file/image/video, sửa căn lề tin nhắn sender/receiver và fix keyboard che input trên mobile <!-- done: 12/04/2026 -->
- [x] Hotfix Mobile media composer: chọn ảnh/video có thể nhập text kèm trước khi bấm Send, upload chạy nền và finalize bằng idempotencyKey <!-- done: 17/04/2026 by binhdev -->
- [x] Mobile auth verify OTP: lấy Expo push token và gửi deviceToken lên backend để đăng ký thiết bị nhận thông báo <!-- done: 17/04/2026  -->
- [ ] Push notification setup (expo-notifications + FCM/APNs)

### Phase M4 – Mobile Friends & Groups (Lõi)
- [x] Friends tab: search bar, friend requests (incoming/outgoing), friend list <!-- done: 12/04/2026 -->
- [x] Quick profile view (RN bottom sheet – ProfileBottomSheet) <!-- done: 26/04/2026 by binhdev -->
- [x] Send/accept/reject friend request <!-- done: 17/04/2026  -->
- [x] Group management: create, add/remove members, disband <!-- done: 26/04/2026 by binhdev -->
- [x] Group info screen <!-- done: 26/04/2026 by binhdev -->

### Phase M5 – Mobile Stories & Profile (Nặng – không ảnh hưởng lõi)
- [x] Profile screen: edit profile, avatar upload via camera/gallery <!-- done: 12/04/2026 -->
- [x] Real stats (bạn bè count, kỹ năng count, joined year) <!-- done: 12/04/2026 -->
- [ ] Friend list in profile, mutual friends, view profile modal

### Phase M6 – Mobile Polish & Deploy
- [ ] Deep linking (expo-linking + universal links)
- [ ] App icon + adaptive icon + splash screen assets
- [ ] EAS Build configuration (development / preview / production)
- [ ] TestFlight submission (iOS)
- [ ] Google Play Internal Testing submission (Android)
- [ ] Performance optimization: lazy loading, FlatList `getItemLayout`, image caching (expo-image)
- [ ] Offline mode: cache conversations + queue messages
- [ ] App Store / Google Play public release

### Phase AI-0 – AI Foundation & Infrastructure (Neon + pgvector + Gemini)

> **Stack AI (toàn bộ free tier, $0 chi phí dev):**
> - **Vector DB:** Neon PostgreSQL + pgvector (free: 0.5GB storage, 190h compute/tháng)
> - **LLM:** Google Gemini Pro/Flash (free: 15 RPM, 1M tokens/ngày)
> - **Embedding:** text-embedding-004 (768 dimensions)
>
> **Kiến trúc:** MongoDB (primary DB) ↔ Kafka (async sync) ↔ Neon PostgreSQL (vector-only DB)

- [x] Cài đặt dependencies: `@google/generative-ai`, `@neondatabase/serverless`, `pgvector` <!-- done: 17/04/2026  -->
- [x] Tạo `infrastructure/gemini.ts` – Gemini client singleton, config model IDs <!-- done: 17/04/2026 by binhdev -->
- [x] Tạo `infrastructure/neon.ts` – Neon PostgreSQL connection + pgvector extension setup <!-- done: 17/04/2026 by binhdev -->
- [x] SQL migration: tạo bảng `message_embeddings` với cột `embedding vector(768)` + HNSW index <!-- done: 17/04/2026 by binhdev -->
- [x] Tạo `modules/ai/fallback/model-fallback.ts` – Gemini Pro → Flash → cached response chain <!-- done: 17/04/2026 by binhdev -->
- [x] Tạo `modules/ai/guards/prompt-guard.ts` – Input sanitization + injection detection (3 layers: regex + system prompt + output validation) <!-- done: 17/04/2026 by binhdev -->
- [x] Tạo `modules/ai/guards/rate-limiter.ts` – AI-specific rate limit (10 req/min/user, Redis sliding window) <!-- done: 17/04/2026 by binhdev -->
- [x] Tạo `modules/ai/embeddings/embedding.service.ts` – text-embedding-004 wrapper <!-- done: 17/04/2026 by binhdev -->
- [x] Tạo `modules/ai/embeddings/neon-vector.service.ts` – pgvector CRUD (insert, cosine search, delete) <!-- done: 17/04/2026 by binhdev -->
- [x] Thêm env vars: `GEMINI_API_KEY`, `NEON_DATABASE_URL`, `AI_MODEL_PRIMARY`, `AI_MODEL_FALLBACK`, `AI_RATE_LIMIT_PER_MINUTE` <!-- done: 17/04/2026 by binhdev -->
- [x] Unit test cho prompt guard (10+ adversarial cases) + model fallback (timeout, quota exceeded) <!-- done: 17/04/2026 by binhdev -->

### Phase AI-1 – Kiểm Duyệt Nội Dung Tự Động (Content Moderation)

> **Luồng hiện tại:** Keyword filter realtime tại Socket Gateway là lớp kiểm duyệt chính.
> - `blocked` keyword: chặn gửi ngay + cộng 5% vi phạm + thông báo nhắc nhở
> - `warning` keyword: cho phép gửi, cộng 2% vi phạm, gắn icon cảnh báo cạnh tin nhắn
> - `penaltyScore >= 100%`: khóa chat 5 phút; reset sau 12 giờ kể từ lần vi phạm đầu tiên
>
> **Gemini chỉ dùng khi report:** người nhận báo cáo tin nhắn → Gemini review → nếu `block` thì thu hồi + cộng phạt theo chuẩn blocked.

- [x] Tạo `modules/ai/moderation/keyword-filter.ts` – Bộ lọc keyword VN/EN dùng cho kiểm duyệt realtime <!-- done: 16/04/2026 -->
- [x] Tạo `modules/ai/moderation/moderation.model.ts` – MongoDB collection `moderation_logs` <!-- done: 16/04/2026 -->
- [x] Tạo `modules/ai/moderation/moderation.service.ts` – Luồng report review bằng Gemini (report-only) <!-- done: 16/04/2026 -->
- [x] Tạo `modules/ai/moderation/moderation.worker.ts` – Logging/monitoring moderation async <!-- done: 16/04/2026 -->
- [x] Socket events moderation: `content_blocked`, `content_warning`, `user_penalty_updated` <!-- done: 16/04/2026 -->
- [x] Realtime rule: blocked cộng 5%, warning cộng 1%, warning hiển thị icon cảnh báo cạnh tin nhắn <!-- done: 16/04/2026 -->
- [x] Cơ chế khóa chat: đạt 100% vi phạm → mute 5 phút; reset theo cửa sổ 12 giờ kể từ lần vi phạm đầu <!-- done: 16/04/2026 -->
- [x] Report flow ổn định cho message mới gửi: ưu tiên `idempotencyKey`, retry lookup, fallback Redis cache <!-- done: 16/04/2026 -->
- [x] Hotfix UI moderation: khôi phục action menu xóa/thu hồi/report và dời thanh vi phạm xuống gần ô nhập <!-- done: 16/04/2026 -->
- [x] Hotfix AI-1 consistency: neo dấu ba chấm sát bubble, bỏ ngưỡng confidence để warning/block đều cộng đúng mức vi phạm cấu hình <!-- done: 16/04/2026 -->
- [x] Chuẩn hóa AI-1 policy: warning +2%, blocked +5%, block thu hồi ngay, đạt 100% khóa chat 5 phút, reset theo cửa sổ 12 giờ và gửi thông báo moderation qua pipeline notification hiện có <!-- done: 16/04/2026 -->

### Phase AI-2 – Tìm Kiếm Thông Minh (Semantic Search)

> **Kiến trúc:** Hybrid Search = MongoDB `$text` (exact) + Neon pgvector cosine (semantic) + Gemini Flash re-rank
> **Scoring:** 0.4 × text_score + 0.6 × vector_similarity

- [ ] Tạo `workers/embedding.worker.ts` – Kafka consumer embed messages async → insert Neon pgvector
- [ ] Backfill script: embed tất cả messages hiện có vào Neon pgvector
- [ ] Tạo `modules/ai/search/semantic-search.service.ts` – hybrid search logic (text + vector + re-rank)
- [ ] Tạo `modules/ai/search/search.controller.ts` – `GET /api/search?q=...&type=messages|users|all`
- [ ] Tạo `modules/ai/search/search.routes.ts` – route definitions
- [ ] Gemini Flash re-rank top-20 kết quả → trả top-5 relevant nhất
- [ ] Redis cache cho embedding queries (TTL 30 phút)
- [ ] Thêm Kafka topic `message-embeddings`
- [ ] Web UI: nâng cấp search bar với semantic results + grouped results page
- [ ] Prompt injection guard cho search queries
- [ ] Performance benchmark: search latency < 500ms p95

### Phase AI-3 – Zync AI Assistant (Chatbot Trợ Lý Thông Minh)

> **Mô tả:** Bot AI trong conversation, hỗ trợ qua chat hoặc `@ZyncAI` mention trong group.
> **Function Calling:** 5 functions (search_friends, create_group, summarize_chat, translate_message, search_messages)
> **Context:** 50 recent messages (MongoDB) + top-5 vector similarity (Neon pgvector)
> **Fallback:** Gemini Pro → Flash → "Hiện tại mình không thể trả lời, thử lại sau nhé"

- [ ] Tạo `modules/ai/ai.service.ts` – Core orchestrator: context building + Gemini chat + function calling loop
- [ ] Tạo `modules/ai/ai.controller.ts` – REST API: `POST /api/ai/chat`, `GET /api/ai/suggestions`
- [x] Tạo `modules/ai/ai.routes.ts` + `ai.schema.ts` (Zod validation) <!-- done: 17/04/2026 -->
- [ ] Implement 5 function handlers trong `modules/ai/functions/`:
  - [ ] `search_friends.fn.ts` – tìm bạn bè theo tên/mô tả
  - [ ] `create_group.fn.ts` – tạo nhóm chat mới
  - [ ] `summarize_chat.fn.ts` – tóm tắt hội thoại theo khoảng thời gian
  - [ ] `translate_message.fn.ts` – dịch tin nhắn sang ngôn ngữ khác
  - [ ] `search_messages.fn.ts` – tìm kiếm tin nhắn trong conversation (dùng semantic search)
- [ ] Socket events: `ai_chat` (client → server) → `ai_response` (server → client, streaming nếu có)
- [ ] Context builder: 50 recent messages + pgvector semantic context (top-5 similarity)
- [ ] Model fallback chain: Pro → Flash → cached response
- [ ] Rate limit: 10 AI requests/phút/user (Redis sliding window)
- [ ] `@ZyncAI` mention trigger trong group chat
- [ ] AI suggestion: gợi ý reply nhanh dựa trên context (quick reply buttons)
- [ ] Web UI: AI chat button + AI chat interface trong conversation panel
- [ ] Web UI: AI suggestions panel (quick reply buttons bên dưới chat input)
- [ ] Comprehensive adversarial prompt injection tests (≥ 15 attack vectors)

### System Optimization
- [ ] O1: MongoDB bulk `$inc` cho unread count (thay vì loop per member)
- [ ] O2: Redis pipeline cho presence operations (gom HSET/HDEL)
- [ ] O3: Verify compound index `{conversationId: 1, createdAt: -1, _id: -1}` cho messages
- [ ] O4: Lazy join conversation rooms khi load list (thay vì khi send)
- [ ] S1: Helmet CSP strict mode
- [ ] S2: XSS sanitization cho message content (dùng `xss` package)
- [ ] S3: Rate limit per-conversation (chống spam vào 1 group)
- [ ] D1: Swagger/OpenAPI auto-gen từ Zod schemas (`zod-to-openapi` → Swagger UI)
- [ ] D2: Health check endpoint `GET /health` (MongoDB, Redis, Kafka, Neon, Gemini status)
- [ ] D3: Error code standardization (AUTH_001, MSG_002, AI_001...)

### Phase 8 – Quality & Hardening
- [ ] Unit test coverage > 60% (target 80% iterative) – Jest + React Testing Library
- [ ] Integration test: API + Socket.IO + Kafka mock + AI module (Gemini mock)
- [ ] Load test: Artillery/K6 – 500 CCU, 200 msg/s
- [ ] Resilience test: kill Redis/Kafka/MongoDB primary → verify fallback chains
- [ ] Security test: OWASP Top 10, penetration testing cơ bản
- [ ] AI-specific tests: prompt injection (15+ vectors), model fallback, rate limiting, pgvector search accuracy
- [ ] Swagger/OpenAPI documentation đầy đủ (auto-gen + manual review)

### Phase 9 – Observability & Production (Web/Server)
- [ ] Prometheus metrics (prom-client đã có, Kafka exporter, MongoDB exporter)
- [ ] Grafana dashboard: CCU, throughput, consumer lag, AI latency, AI quota usage, event loop
- [ ] Log aggregation: structured JSON logs (Winston đã có) → Fluentd → Elasticsearch → Kibana
- [ ] Alert: Slack/PagerDuty khi CPU >80%, error rate >1%, AI quota >80%
- [ ] Health check expanded: MongoDB, Redis, Kafka, Neon, Gemini API status
- [ ] Backup strategy: MongoDB daily + Neon point-in-time recovery + restore test
- [ ] Cấu hình Kubernetes + Helm chart (staging/production)
- [ ] Blue-green deployment lên production

### Phase 10 – Optimization Sprint (Server/Web/Mobile)
- [x] Chốt danh sách tối ưu ưu tiên từ đối chiếu codebase thực tế và roadmap <!-- done: 17/04/2026  -->
- [ ] OX1: Tối ưu unread count bằng atomic update (`$inc`, `$unset`) cho conversation map, loại bỏ read-modify-write loop trong service
- [ ] OX2: Tối ưu Redis presence bằng pipeline + heartbeat key schema (`presence:lastSeen:{userId}`), tránh phụ thuộc `io.emit` toàn cục
- [ ] OX3: Bổ sung index compound cho messages `{ conversationId: 1, createdAt: -1, _id: -1 }` để tối ưu cursor pagination ổn định
- [ ] OX4: Siết security lớp message content: sanitize XSS ở input path (REST + Socket) trước persist/broadcast
- [ ] OX5: Nâng health check từ mức cơ bản lên deep health (`MongoDB/Redis/Kafka/Neon/Gemini`) + readiness/liveness contract
- [ ] OX6: Chuẩn hóa realtime contract reactions giữa Web/Mobile (`reaction_updated` và `message_reacted`) thành một schema thống nhất
- [ ] OX7: Hoàn thiện presence API `GET /api/users/:id/presence` + hiển thị lastSeen ở Web/Mobile
- [ ] OX8: Bổ sung kế hoạch benchmark sau tối ưu (p95 send_message, p95 history query, presence propagation)
- [x] OX9: Tối ưu UX gửi media realtime (Web + Mobile) bằng optimistic message: hiển thị ngay khi bấm gửi, upload/verify xử lý nền, finalize với cùng idempotencyKey <!-- done: 17/04/2026 by binhdev -->
- [x] OX9.1: Hotfix follow-up media UX: chỉ upload sau khi bấm Send, loading hiển thị 1 lần trên bubble pending, sửa render `blob:` để không vỡ ảnh tạm trên Web <!-- done: 17/04/2026 by binhdev -->
- [x] OX9.2: Hotfix Web pending media: bỏ loading trùng ở composer sau khi gửi, dedupe receive_message theo idempotency và reconcile message_sent để tránh bubble loading treo <!-- done: 17/04/2026 by binhdev -->
- [x] OX9.3: Hotfix sync Web->Mobile media+text: đồng bộ merge realtime vào messageHistory để tắt spinner pending đúng lúc trên Web và hiển thị caption text cho media message trên Mobile <!-- done: 17/04/2026 by binhdev -->
- [x] OX9.4: Nâng cấp premium glassmorphism cho Web + Mobile (ultra transparency, blur mạnh, panel frosted nhiều lớp) và chuẩn hóa bộ quy tắc parity UI liên nền tảng <!-- done: 17/04/2026 by binhdev -->
- [x] OX9.5: Đồng bộ màu giữa các tab Dashboard Web (Chat/Profile/Settings) bằng shared glass tokens để thống nhất palette liên tab <!-- done: 17/04/2026 by binhdev -->
- [x] OX9.6: Giảm độ sáng trắng và tăng sắc xanh lá trong bộ token UI (Web + Mobile) để đồng bộ tone glass dịu mắt hơn <!-- done: 17/04/2026 by binhdev -->
- [x] OX9.7: Đồng bộ lại web auth shell và khung chat dashboard theo shared tokens, tăng contrast light mode và cố định layout chat ở trung tâm <!-- done: 24/04/2026 -->
- [x] OX9.8: Đồng bộ màu info/settings/profile (Web + Mobile), bỏ hardcode và chuyển icon sang Lucide <!-- done: 29/04/2026 -->
- [x] OX9.9: Hoàn thiện Settings/Profile parity Web + Mobile: bật tắt giao diện sáng/tối tức thì, sửa contrast chữ nền ở dark/light, đồng bộ trust score + vi phạm và mở rộng mục Bảo mật <!-- done: 30/04/2026 -->
- [x] OX9.10: Tăng tương phản dark mode cho Web/Mobile (tab select/unselect, input, button), loại bỏ nền xám hardcode gây chìm chữ và đồng bộ tab icons Mobile sang Lucide <!-- done: 30/04/2026 -->
- [x] OX9.11: Chuẩn hóa màu các cụm Friends/Theme/Notifications/Trusted Circle (Web + Mobile), thay icon text/emoji sang Lucide và loại bỏ các trạng thái xám khó đọc ở dark mode <!-- done: 30/04/2026 -->
- [x] OX9.12: Hotfix Friends dark contrast: bỏ nền trắng/xám hardcode ở card danh sách bạn bè/lời mời/kết quả tìm kiếm và giữ kích thước nút toggle Sáng/Tối cố định khi đổi trạng thái <!-- done: 30/04/2026 -->

### Phase R4 – Pivot Branding (Developer Community) ✅
- [x] Bổ sung `discoverUsers()` service backend tìm developers nổi bật
- [x] Sửa toàn bộ trang Onboarding (`/onboarding`) sang tiếng Việt có dấu, cải thiện form nhập liệu
- [x] Cập nhật Onboarding redirect tại `/home` nếu user chưa hoàn thành `onboardingCompleted`
- [x] Sửa hardcoded English text trên landing page (`/`) sang tiếng Việt
- [x] Thay thế các emoji text bằng icon từ `lucide-react` toàn hệ thống (sidebar, community, explore, onboarding)
- [x] Bổ sung Navigation cho "Cộng đồng" và "Khám phá" vào Dashboard sidebar

### Plan D2 – Liên kết Luồng Nghiệp vụ Chính ✅ <!-- done: 11/05/2026 -->

| Mục tiêu | Mô tả | Trạng thái |
|---|---|---|
| D2.1 | Navigation Helper Hook (Web `use-navigation-flow.ts` + Mobile `useNavigationFlow.ts` + Backend GET `/api/conversations/direct`) | ✅ Hoàn thành |
| D2.2 | Friends → Chat Quick Action (Web `friends-screen.tsx` + Mobile `friends.tsx` nút Nhắn tin) | ✅ Hoàn thành |
| D2.3 | Community → Profile → Chat (Web `UserProfileModal` + Mobile `ProfileBottomSheet`) | ✅ Hoàn thành |
| D2.4 | Explore → Friends/Chat Quick Actions (Web `explore-content.tsx` Developer Card CTA + Mobile DeveloperCard) | ✅ Hoàn thành (Cải thiện UI/UX thẻ tác giả, tích hợp UserProfileModal) |
| D2.5 | Onboarding → Personalized Explore (Web redirect `/onboarding` → `/explore?skills=...`) | ✅ Hoàn thành |
| D2.6 | Chat ↔ Community Cross-reference (Web Chat Info Panel hiện bài viết từ người đang chat + Home Dashboard activity clickable) | ✅ Hoàn thành |

### Phase N1 – Community Posts ✅ (Web only – Mobile ở Plan A)
- [x] Xây dựng `PostModel` và `CommentModel` hỗ trợ reply threads, tags, likes, bookmarks
- [x] Phát triển `PostsService` hỗ trợ CRUD, feed pagination và trending posts
- [x] Dựng UI `CommunityContent` component với các tabs phân loại feed (Mới nhất, Trending, Câu hỏi, TIL)
- [x] Chức năng tạo bài viết mới (CreatePostForm) hỗ trợ phân loại (thảo luận, hỏi đáp, tutorial...)
- [x] Chức năng Like, Bookmark, Comment (full panel với reply thread) và Favorites toggle
- [x] Thông báo đến bạn bè khi có bài viết mới (`community_post` notification type)
- [x] Notification types mới: `post_like`, `post_comment`, `post_bookmark`, `community_post`
- [x] Real-time notification toast hỗ trợ community events (navigate to community page)

### Phase N3 – Explore & Discovery ✅ (Web only – Mobile ở Plan A)
- [x] Sử dụng `getPublicChannels` và `discoverChannels` từ GroupsService cho API
- [x] Dựng `ExploreContent` component với thanh tìm kiếm đa luồng (Channels, Users, Posts)
- [x] User discovery cards với hiển thị kỹ năng (skills), bio, links (Github) và tích hợp `UserProfileModal` với nút Nhắn tin luôn sẵn sàng
- [x] Cơ chế Join channel public trực tiếp từ màn hình Khám phá

### Plan A – Hoàn thiện Chức năng Web + Mobile (~42-52h) ✅ <!-- done: 05/05/2026 -->

> **File chi tiết:** `zync_plan/plan_A_feature_completion.md`
> **Nguyên tắc UI:** Tạo bảng design tokens dùng chung (bảng màu, typography, spacing, border-radius) cho Web + Mobile. Không yêu cầu 100% đồng nhất UI, nhưng chức năng phải đồng nhất. Không dùng icon text, tất cả text trên UI phải là tiếng Việt có dấu.

- [x] A1: Mobile Community + Explore – Port tính năng Cộng đồng và Khám phá từ Web sang Mobile (~14-18h)
  - [x] A1.1: Community Posts trên Mobile (tab Cộng đồng, PostCard, CreatePostSheet, CommentSheet, post-detail)
  - [x] A1.2: Explore & Discovery trên Mobile (tìm kiếm kênh, developer, bài viết trending)
  - [x] A1.3: Refactor tab navigator Mobile (thêm tab Cộng động)
- [x] A2: Presence & Status System – Online/Offline/LastSeen trên cả Web + Mobile (~8-10h)
  - [x] A2.1: Backend presence (Redis heartbeat, broadcast cho friends, API `/api/users/:id/presence`)
  - [x] A2.2: Web presence UI (green dot, "Hoạt động X phút trước")
  - [x] A2.3: Mobile presence UI (green dot, lastSeen)
- [x] A3: Chat Feature Gaps (~5-6h)
  - [x] A3.1: Push notification client Mobile (expo-notifications + FCM/APNs)
  - [x] A3.2: Mutual friends hiển thị + Friend list trong profile Mobile
  - [x] A3.3: Chuẩn hoá reaction contract (`reaction_updated` thống nhất giữa Web/Mobile)
- [x] A4: Cross-Platform UI Sync (~8-10h)
  - [x] A4.1: Tạo `packages/shared-design/tokens.json` – source of truth design tokens
  - [x] A4.2: Đồng bộ `globals.css` (Web) ↔ `colors.ts` (Mobile) từ tokens.json
  - [x] A4.3: Đảm bảo navigation parity (tất cả mục trên Web có trên Mobile)
  - [x] A4.4: Responsive + Accessibility (dark mode, font scaling, safe area)

### Plan B – Chức năng AI (~45-55h, tóm tắt)

> **File chi tiết:** `zync_plan/plan_B_ai_features.md`

- [ ] B1: Semantic Search (AI-2) – Embedding worker + Hybrid search (MongoDB text + pgvector cosine) + Gemini re-rank (~12-15h)
- [ ] B2: AI Personal Assistant (gộp R5 + AI-3) – Context builder cá nhân + 8 function calling + UI chat Web/Mobile (~18-22h)
- [ ] B3: Developer DNA (N2) – Batch analysis + Radar chart + AI badges + Personality + Share card (~15-18h)

### Plan C – Tối ưu & Nâng cấp Hệ thống trước Deploy (~35-45h)

> **File chi tiết:** `zync_plan/plan_C_system_optimization.md`

- [ ] C1: Performance Optimization (~10-12h)
  - [ ] MongoDB atomic unread count (`$inc` thay read-modify-write loop)
  - [ ] Redis pipeline cho presence operations
  - [ ] Compound index `{conversationId:1, createdAt:-1, _id:-1}` cho messages
  - [ ] Lazy join conversation rooms
  - [ ] Image lazy loading + WebP format
- [ ] C2: Security Hardening (~8-10h)
  - [ ] XSS sanitization cho message + post content (package `xss`)
  - [ ] Helmet CSP strict mode
  - [ ] CORS strict cho production domains
  - [ ] Rate limit per-conversation (chống spam)
  - [ ] AI prompt injection hardening (15+ adversarial vectors)
- [ ] C3: Code Quality & Testing (~10-12h)
  - [ ] Error code standardization (AUTH_001, MSG_002, POST_001, AI_001)
  - [ ] Chuẩn hóa reaction contract (thống nhất `reaction_updated` giữa Web/Mobile)
  - [ ] Unit test coverage ≥ 60%
  - [ ] Integration test: API + Socket + Kafka mock
  - [ ] Load test: 500 CCU, 200 msg/s (Artillery/K6)
- [ ] C4: Documentation & Observability (~7-10h)
  - [ ] Swagger/OpenAPI auto-gen từ Zod schemas
  - [ ] Deep health check `/health/ready` (MongoDB/Redis/Kafka/Neon/Gemini)
  - [ ] Brand cleanup: đổi "Zalo Clone" → "ZYNC Dev Community" toàn hệ thống
  - [ ] Prometheus metrics + Grafana dashboard

### Phase X – Chuẩn hóa Kiến trúc & Hạ tầng (Backend Refactoring) ✅

> **Tài liệu chi tiết:** `zync_plan/output/unified_execution_plan.md`
> **Ngày bắt đầu:** 02/05/2026
> **Ngày hoàn thành:** 04/05/2026
> **Mục tiêu:** Loại bỏ nợ kỹ thuật, thiết lập nền tảng vững chắc trước khi mở rộng Plan A/B.

#### X.1. Backend Refactoring (Critical) ✅
- [x] **IoC Container (Awilix):** Cài `awilix`, tạo `src/container.ts`, đăng ký `MessageRepository`, `PostRepository`, `CommentRepository` dưới dạng Singleton. <!-- done: 02/05/2026 -->
- [x] **Repository Pattern:** Tạo `BaseRepository` generic + `MessageRepository` (cursor pagination, idempotency check, soft delete, recall) + `PostRepository` (feed, trending, toggleLike, toggleBookmark) + `CommentRepository`. <!-- done: 02/05/2026 -->
- [x] **Global Error Handler:** `error-handler.middleware.ts` chuẩn hóa 5 loại lỗi (AppError, ZodError, MongoDB 11000, JWT, Unknown) với format `ErrorResponse` thống nhất. <!-- done: 02/05/2026 -->
- [x] **Schema-driven Validation:** Zod đã có sẵn + `validate.middleware.ts` hoạt động. <!-- done: 02/05/2026 -->
- [x] **Migrate MessagesService:** Inject `MessageRepository`, thay `MessageModel.findOne/find` trực tiếp bằng repo methods (backward-compatible API). <!-- done: 02/05/2026 -->
- [x] **Migrate PostsService:** Inject `PostRepository + CommentRepository`, thay PostModel/CommentModel bằng repo methods (backward-compatible API). <!-- done: 04/05/2026 -->

#### X.2. Infrastructure Optimization ✅
- [x] **Kafka DLQ & Retry:** Thêm topics `raw-messages.retry` + `raw-messages.dlq` + `notifications.retry` + `notifications.dlq`. Worker subscribe cả main topic và retry topic. Max 3 retries với exponential backoff → auto route sang DLQ. <!-- done: 02/05/2026 -->
- [x] **Socket Modularization – Call:** Tách toàn bộ Call + WebRTC events (8 handlers) ra `socket/call.controller.ts`. <!-- done: 02/05/2026 -->
- [x] **Socket Modularization – Chat:** Tách `send_message`, `message_read`, `message_delivered`, `delete_message_for_me`, `recall_message`, `forward_message` ra `socket/chat.controller.ts`. `gateway.ts` giảm từ 2184 → **2061 dòng**. <!-- done: 02/05/2026 -->
- [x] **Socket Modularization – Reaction:** Tách `reaction_upsert`, `reaction_remove_all_mine` ra `socket/reaction.controller.ts`. <!-- done: 04/05/2026 -->

---

### Master Plan: Tổng tiến độ (Cập nhật 05/05/2026)
- [x] Phase R1: UX Redesign (Web & Mobile) ✅
- [x] Phase R2: Mobile App Parity ✅
- [x] Phase R3: Mobile Video Call (Expo Dev Client + WebRTC) ✅ <!-- done: 26/04/2026 -->
- [x] Phase R4: Pivot Branding (Zalo Clone → Zync Community) ✅
- [x] Phase N1: Community Posts (Web) ✅
- [x] Phase N3: Explore & Discovery (Web) ✅
- [x] Phase X: Chuẩn hóa Kiến trúc & Hạ tầng (Backend Refactoring) ✅ <!-- done: 04/05/2026 -->
- [x] **Plan A: Hoàn thiện chức năng Web + Mobile** ✅ <!-- done: 05/05/2026 -->
- [ ] **Plan B: Chức năng AI (Search + Assistant + DNA)** ⏳ <!-- chi tiết: zync_plan/plan_B_ai_features.md -->
- [ ] **Plan C: Tối ưu & hardening trước deploy** ⏳ <!-- chi tiết: zync_plan/plan_C_system_optimization.md -->
- [ ] Phase R7: Triển khai Production

---

## Chi phí Dev Stack (toàn bộ $0)

| Service | Plan | Chi phí |
|---------|------|---------|
| MongoDB Atlas | M0 (free) | $0 |
| Redis | Docker local (~5MB) | $0 |
| Kafka/Redpanda | Docker local (~150MB) | $0 |
| Cloudinary | Free (25 credits/tháng) | $0 |
| Resend/Gmail SMTP | Free tier | $0 |
| **Neon PostgreSQL** | **Free (0.5GB, 190h compute/tháng)** | **$0** |
| **Google Gemini API** | **Free (15 RPM, 1M tokens/ngày)** | **$0** |

---

## AI Architecture Notes

- **Vector DB:** Neon PostgreSQL + pgvector (HNSW index, cosine similarity `<=>` operator)
- **Embedding:** `text-embedding-004` (768 dimensions), batch via Kafka async worker
- **LLM:** Gemini 2.5 Pro (primary) → Gemini 2.5 Flash (fallback) → cached response (emergency)
- **Function Calling:** Gemini Tool Use API, 5 function declarations với JSON Schema
- **Prompt Injection:** 3 layers – (1) input regex filter, (2) system prompt hardening, (3) output validation
- **Rate Limit:** 10 AI requests/phút/user (Redis sliding window, shared key `ai_rate:{userId}`)
- **MongoDB↔Neon sync:** Kafka topic `message-embeddings`, async embed worker, eventually consistent

---

## Testing Notes

- Dùng MongoDB Memory Server cho integration test (không cần instance thật).
- Kafka mock dùng `kafkajs` với in-memory mode.
- Socket.IO test dùng `socket.io-client` kết nối test server.
- Load test script lưu tại `tests/load/`.
- AI test: mock Gemini responses, test pgvector search trên Neon test branch.
- Prompt injection test: ≥ 15 adversarial attack vectors (role confusion, instruction override, etc.)

---

## Feature Notes

- **Token Storage:** Access token được lưu trong `httpOnly` cookie (`accessToken`) do server set, không thể đọc bằng JavaScript (XSS-resistant). Refresh token trong `httpOnly` cookie (`refreshToken`). Client đọc access token qua `GET /api/auth/current-token` endpoint. <!-- done: 04/05/2026 -->
- **Idempotency:** Client phải tự sinh UUID cho mỗi `send_message`. Server check Redis 5 phút trước khi ghi MongoDB.
- **Cursor pagination:** Dùng `createdAt` + `_id` làm cursor, tránh `skip()`.
- **Presence refresh:** Client WebSocket heartbeat 30 giây để giữ online status trong Redis.
- **AI context window:** 50 recent messages + top-5 pgvector similarity results.
- **Moderation fail-open:** Khi AI unavailable → keyword filter → pass with logging (không block user khi AI lỗi).
