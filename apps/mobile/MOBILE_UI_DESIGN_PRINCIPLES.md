# NGUYÊN TẮC THIẾT KẾ VÀ ĐỒNG BỘ UI MOBILE (Zync Platform)

Tài liệu này quy định các nguyên tắc thiết kế bắt buộc cho ứng dụng Mobile của Zync Platform, nhằm giải quyết triệt để 4 vấn đề:
1. Giao diện (UI) chưa đồng bộ giữa các màn hình.
2. Các trang chưa có Header chuẩn mực.
3. Còn tồn đọng nhiều Mock Data (dữ liệu giả).
4. Thiếu tính thống nhất về Style (màu sắc, spacing, typography).

MỌI LẬP TRÌNH VIÊN HOẶC AI ĐỀU PHẢI TUÂN THỦ NGHIÊM NGẶT TÀI LIỆU NÀY KHI CODE UI.

---

## 1. ĐỒNG BỘ UI VÀ COMPONENT (UI SYNCHRONIZATION)

Tuyệt đối KHÔNG code lại các component cơ bản nếu đã có sẵn. Thay vào đó, phải tái sử dụng từ thư mục `src/ui/`.

*   **Button:** Chỉ dùng `import { Button } from '@/ui/Button'`. Không tự viết `TouchableOpacity` chứa Text với style hardcode.
*   **Input Form:** Chỉ dùng `import { Input } from '@/ui/Input'`.
*   **Card / Panel:** Chỉ dùng `import { GlassPanel } from '@/ui/GlassPanel'` cho các khối nội dung nổi bật. Nếu là các item list thông thường, sử dụng `View` kết hợp `colors.surface` hoặc `colors.glassPanel`.
*   **Icon:** Đồng nhất sử dụng thư viện `lucide-react-native`. Kích thước chuẩn: `18`, `20` hoặc `24`.

---

## 2. QUY TẮC THIẾT KẾ HEADER CHO CÁC TRANG (PAGE HEADERS)

Mỗi màn hình (Screen) khi được điều hướng tới (trừ các màn hình Tab chính đã có Header riêng) BẮT BUỘC phải có một Header tiêu chuẩn ở trên cùng.

### Cấu trúc Header Chuẩn:
```tsx
<View style={styles.headerContainer}>
  {/* Nút Back (bên trái) */}
  <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
    <ArrowLeft size={24} color={colors.text} />
  </TouchableOpacity>

  {/* Tiêu đề trang (ở giữa) */}
  <Text style={styles.headerTitle} numberOfLines={1}>
    Tên Trang
  </Text>

  {/* Nút Action hoặc View trống (bên phải để cân bằng) */}
  <View style={styles.rightAction}>
     {/* Component action nếu có, vd: Nút Save, Nút Menu */}
  </View>
</View>
```

### Style Chuẩn Cho Header:
```tsx
headerContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 56, // Chiều cao chuẩn
  paddingHorizontal: 16,
  backgroundColor: colors.backgroundDeep, // Hoặc dùng BlurView nếu muốn glass effect
  borderBottomWidth: 1,
  borderBottomColor: colors.border, // Đường viền mỏng ngăn cách nội dung
},
headerTitle: {
  ...typography.h2,
  fontSize: 18,
  flex: 1,
  textAlign: 'center',
},
iconButton: {
  width: 40,
  height: 40,
  justifyContent: 'center',
  alignItems: 'center',
},
rightAction: {
  width: 40, // Bằng width của iconButton để title luôn ở chính giữa
  alignItems: 'flex-end',
}
```

---

## 3. CHIẾN LƯỢC XÓA BỎ MOCK DATA

Mọi component và màn hình phải được thiết kế để nhận dữ liệu thật (Real Data). Nếu API chưa sẵn sàng, tuân thủ các bước sau:

1.  **Dùng State rỗng chuẩn:** Mọi state danh sách phải khởi tạo là mảng rỗng `[]`, object là `null`. KHÔNG dùng data giả hardcode gán ngay từ đầu.
2.  **Xử lý Trạng thái Loading (Skeleton / Spinner):** 
    *   Khi đang fetch dữ liệu, phải hiển thị `ActivityIndicator` với màu `colors.primary`.
    *   *Khuyến khích:* Tạo `Skeleton` component thay cho spinner cho các danh sách (như list bài viết, list bạn bè).
3.  **Xử lý Empty State:** Khi danh sách rỗng, BẮT BUỘC có component `EmptyState` hiển thị icon, tiêu đề và dòng mô tả ngắn (Ví dụ: "Chưa có bạn bè nào", "Không có tin nhắn").
4.  **Kết nối API:** Sử dụng `src/services/api.ts` kết hợp React Query hoặc Zustand để fetch data, loại bỏ ngay các mảng JSON hardcode trong file.

---

## 4. ĐỒNG NHẤT STYLE TOÀN APP (GLOBAL STYLING)

Đảm bảo ứng dụng luôn đi theo triết lý thiết kế **Dark Glassmorphism** (Neon Teal & Dark Blue).

### Màu Sắc (Colors)
Chỉ import từ `src/theme/colors.ts`. KHÔNG viết mã HEX/RGB trực tiếp vào component.
*   **Nền chính trang:** `colors.background` hoặc dải gradient `colors.backgroundDeep` -> `colors.backgroundMid` -> `colors.backgroundSoft`.
*   **Chữ:** `colors.text` (trắng/chính), `colors.textSubtle` (phụ/mờ), `colors.textMuted` (chú thích).
*   **Đường viền/Ngăn cách:** `colors.border` hoặc `colors.glassBorder`.

### Spacing & Layout
*   **Safe Area:** Mọi màn hình phải được bọc trong `SafeAreaView` để không bị đè lên tai thỏ (Notch) / thanh trạng thái (Status Bar).
*   **Padding Trang:** Padding chuẩn cho rìa trái/phải của các trang là `16px`.
*   **Khoảng cách giữa các thành phần:** Sử dụng bộ thang đo cố định: `4, 8, 12, 16, 20, 24, 32`. KHÔNG dùng các con số lẻ như 5, 7, 10, 15.

### Typography (Fonts)
Chỉ sử dụng các token từ `src/theme/fonts.ts`.
*   **Font mặc định:** `BeVietnamPro`.
*   **Tiêu đề:** Dùng `typography.h1`, `typography.h2`.
*   **Nội dung thường:** Dùng `typography.body`.
*   **Chú thích nhỏ:** Dùng `typography.caption`.

---

## BẢNG KIỂM TRA (CHECKLIST) DÀNH CHO LẬP TRÌNH VIÊN MOBILE
Trước khi commit code UI một màn hình, hãy tự hỏi:
- [ ] Trang này đã có Header rõ ràng, có nút Back và Title chuẩn chưa?
- [ ] Trang này đã bọc `SafeAreaView` chưa?
- [ ] Mình có đang hardcode mã HEX màu sắc hay font chữ nào không? (Nếu có -> Đổi ngay sang `colors` và `typography`).
- [ ] Các Button và Input có tái sử dụng từ `src/ui/` không?
- [ ] Dữ liệu hiển thị là từ API hay mình đang dùng Mock Data? (Nếu Mock, hãy tạo EmptyState và LoadingState).
