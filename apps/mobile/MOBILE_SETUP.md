# 📱 Hướng Dẫn Setup & Run Zync Mobile (Quy Chuẩn Mới)

> **LƯU Ý QUAN TRỌNG:** Dự án Zync Mobile hiện tại đã tích hợp các module Native (ví dụ `react-native-webrtc` để gọi video). Do đó, ứng dụng **Expo Go mặc định trên App Store / Play Store SẼ KHÔNG HOẠT ĐỘNG**. Bạn BẮT BUỘC phải tạo ra một "Development Client" riêng của dự án.

Dưới đây là tài liệu chuẩn hóa để bất kỳ thành viên nào khi `git pull` code mới về đều có thể tự cài đặt và chạy app thành công.

---

## Phần 1: Cài đặt Môi trường Bắt buộc (Làm 1 lần duy nhất)

Nếu đây là lần đầu tiên bạn setup máy tính để code project này, hãy đảm bảo:

1. **Cài đặt Node.js:** (Khuyến nghị bản LTS mới nhất).
2. **Cài đặt EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```
3. **Đăng nhập Expo:**
   ```bash
   eas login
   ```
   *(Hỏi team leader để lấy tài khoản Expo dùng chung hoặc sử dụng tài khoản cá nhân nếu đã được invite vào project).*
4. **Môi trường thiết bị thật / máy ảo:**
   - Để test trên thiết bị thật (Android/iOS), bạn chỉ cần điện thoại.
   - Nếu test trên máy ảo Android, hãy cài Android Studio.
   - Nếu test trên máy ảo iOS (chỉ hỗ trợ máy Mac), cài Xcode.

---

## Phần 2: Build App Native "Zync Dev" (Làm 1 lần)

Mục đích của bước này là tạo ra một ứng dụng cài đặt được lên điện thoại/máy ảo có chứa đầy đủ code Native cần thiết. Tưởng tượng nó là một cái Expo Go phiên bản "độ chế" riêng cho team Zync.

Bạn có 2 lựa chọn: Build trên điện toán đám mây của Expo (chậm nhưng không cần cấu hình máy mạnh) hoặc Build cục bộ trên máy tính (nhanh nhưng đòi hỏi máy tính cấu hình tốt).

Mở terminal, trỏ vào thư mục `apps/mobile`:
```bash
cd apps/mobile
npm install
```

### Cách 1: Build trên Expo Cloud (Khuyên dùng)
Gõ lệnh:
```bash
eas build --profile development --platform android
```
Hệ thống sẽ chạy và bạn cần đợi khoảng 10-15 phút. Khi chạy xong, Terminal sẽ hiện ra 1 mã QR to tướng.
👉 **Dùng điện thoại thật của bạn quét mã QR đó để tải file `.apk` và cài đặt vào điện thoại.**

### Cách 2: Build Local (Trên máy tính của bạn)
*(Yêu cầu: Máy tính đã cài đặt biến môi trường ANDROID_HOME và Java JDK 17+)*
```bash
eas build --profile development --platform android --local
```
Lệnh này sẽ sinh ra 1 file `.apk` ngay trên thư mục máy tính. Bạn chép file này sang điện thoại để cài đặt hoặc kéo thả nó vào máy ảo Android Emulator.

---

## Phần 3: Chạy Code & Làm Việc Hàng Ngày (Workflow Chuẩn)

Khi bạn đã có cái ứng dụng "Zync" (kèm logo Dev) cài trên máy, đây sẽ là những bước bạn phải làm mỗi ngày khi bắt đầu code:

**Bước 1: Bật Backend Server**
Hãy đảm bảo bạn đã bật Backend server của hệ thống (chạy ở cổng 3000).

**Bước 2: Bật Mobile Server**
Mở 1 tab terminal mới, gõ:
```bash
cd apps/mobile
npm run start
```
> **🌟 Tự Động Hóa Mới:** Lệnh `npm run start` đã được thiết lập một script chạy ngầm (`scripts/set-env-ip.js`). Nó sẽ tự động quét địa chỉ IP WiFi/LAN của máy tính bạn và chèn vào file `apps/mobile/.env` (biến `EXPO_PUBLIC_API_URL` và `EXPO_PUBLIC_SOCKET_URL`). 
> Bạn **KHÔNG CẦN** phải điền IP thủ công như ngày xưa nữa dù IP của bạn có thay đổi!

**Bước 3: Kết nối điện thoại**
Lúc này Terminal sẽ hiện ra 1 mã QR mới (mã QR của server Metro).
- Cầm điện thoại lên, đảm bảo điện thoại đang kết nối **CÙNG 1 MẠNG WIFI** với máy tính.
- Mở cái app Zync Dev bạn đã cài ở Phần 2.
- Ấn nút **Scan QR Code** và quét cái mã trong terminal máy tính.

🎉 Boom! Code giao diện sẽ được load lên điện thoại. Bạn sửa code trên VSCode và ấn Save, điện thoại sẽ tự động thay đổi (Hot Reload).

---

## ❓ FAQ (Giải đáp sự cố)

### Q1: Khi nào tôi phải làm lại Phần 2 (Build lại App)?
Bạn chỉ phải Build lại ra file APK mới nếu:
1. Team có thêm thư viện chứa code Native (vd: cài `react-native-webrtc`, thay đổi Icon app, đổi tên gói App).
2. Sửa file `app.json` xin quyền hệ điều hành (Camera, Location, Audio...).

### Q2: Tại sao kết nối mãi mà nó báo lỗi Network?
Kiểm tra lại xem:
1. Điện thoại có đang bật VPN hay 4G không? Nó bắt buộc phải dùng chung mạng WiFi với máy tính.
2. Windows Firewall có đang block cổng 8081 và 3000 không?
3. Thử restart lại server `npm run start`. Lệnh script sẽ lại tự động chèn đúng IP hiện tại vào file `.env`.
