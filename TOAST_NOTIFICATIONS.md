# 🎨 PixPot - Hệ thống thông báo Toast

## 📋 Tổng hợp các trường hợp thông báo

### ✅ Thành công (Màu xanh lá)
| Trường hợp | Thông báo |
|------------|-----------|
| Mở pixel thành công | `✨ Mở pixel thành công!` |

### ❌ Lỗi (Màu đỏ)
| Trường hợp | Thông báo |
|------------|-----------|
| Pixel đã được mở bởi người khác | `Pixel vừa được người khác mở trước!` |
| Xác minh giao dịch timeout | `Xác minh quá lâu, vui lòng thử lại` |
| Giao dịch thất bại trên blockchain | `Giao dịch thất bại trên blockchain` |
| Giao dịch không gửi đến contract đúng | `Giao dịch không hợp lệ` |
| Ví không khớp với người gửi giao dịch | `Ví không khớp với giao dịch` |
| Game không còn hoạt động | `Game này không còn hoạt động` |
| Tất cả pixel đã được mở | `Tất cả pixel đã được mở` |
| Không đủ ETH | `Không đủ ETH để mở pixel` |
| Lỗi kết nối mạng | `Lỗi kết nối mạng, vui lòng thử lại` |
| Lỗi chung khi mở pixel | `Không thể mở pixel, vui lòng thử lại` |
| Smart contract chưa cấu hình | `Smart contract chưa được cấu hình` |

### ℹ️ Thông tin (Màu xám)
| Trường hợp | Thông báo |
|------------|-----------|
| Pixel đã được mở hoặc đang xử lý | `Pixel này đã được mở hoặc đang xử lý` |
| User hủy giao dịch | `Bạn đã hủy giao dịch` |
| Chưa kết nối ví | `Vui lòng kết nối ví để mở pixel` |
| Game chưa tải xong | `Đang tải game, vui lòng đợi` |

### ⏳ Đang xử lý (Màu xanh dương + spinner)
| Giai đoạn | Thông báo |
|-----------|-----------|
| 1. Gửi giao dịch lên blockchain | `Đang gửi giao dịch lên blockchain...` |
| 2. Chờ blockchain xác nhận | `Đang chờ blockchain xác nhận...` |
| 3. Backend xác minh giao dịch | `Đang xác minh giao dịch...` |

## 🔧 Implementation Details

### Toast Component
- **File**: `src/components/Toast.tsx`
- **Types**: `success`, `error`, `info`, `loading`
- **Duration**: 3 giây (tự động ẩn, trừ type `loading`)
- **Position**: Fixed top center
- **Animation**: Slide down from top

### Integration
```typescript
// State
const [toast, setToast] = useState<ToastState>(null);

// Show toast
setToast({ message: "Your message", type: "success" });

// Toast auto-closes after 3s (except loading type)
// Loading type requires manual close when process completes
```

### Error Handling Flow
```
User clicks pixel
  ↓
Check wallet connected → NO → Toast info
  ↓
Check contract configured → NO → Toast error
  ↓
Check game loaded → NO → Toast info
  ↓
Check pixel available → NO → Toast info
  ↓
Toast loading: "Đang gửi giao dịch..."
  ↓
Call revealPixels onchain
  ↓
Toast loading: "Đang chờ blockchain xác nhận..."
  ↓
Wait for tx confirmation
  ↓
Toast loading: "Đang xác minh giao dịch..."
  ↓
Backend verifies tx onchain
  ↓
Check response:
  - Success → Toast success (green)
  - Already revealed → Toast error (red)
  - Timeout → Toast error (red)
  - Failed → Toast error (red)
  - Network error → Toast error (red)
  - User rejected → Toast info (gray)
```

## 🎨 Color Scheme
- **Success**: Green gradient (`from-green-500 to-emerald-600`)
- **Error**: Red gradient (`from-red-500 to-rose-600`)
- **Info**: Gray gradient (`from-zinc-700 to-zinc-800`)
- **Loading**: Blue gradient (`from-blue-500 to-cyan-600`)

## 📦 Files Modified
1. `src/components/Toast.tsx` (NEW)
2. `src/components/PixelCanvas.tsx` (UPDATED)
3. `src/app/globals.css` (UPDATED - added slide-down animation)

## ✨ Features
- ✅ Màu sắc rõ ràng (xanh = thành công, đỏ = lỗi)
- ✅ Thông báo ngắn gọn, dễ hiểu (tiếng Việt)
- ✅ Hiển thị tiến trình khi đang xác minh (loading spinner)
- ✅ Tự động ẩn sau 3 giây
- ✅ Animation mượt mà
- ✅ Responsive (mobile + desktop)
