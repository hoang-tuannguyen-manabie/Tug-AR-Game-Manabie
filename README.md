# AI Tug of War — Bồi dưỡng Giáo viên 12 Tiết AI Cốt lõi (Manabie)

Dự án trò chơi tương tác **AR Kéo co giữa Con người và AI** (`game-ar-keo-co-demo-manabie`), được phát triển dựa trên nền tảng công nghệ của `game-ar-gap-nhiem-vu-demo-manabie` và thiết kế giao diện 4 bước chuẩn 16:9 cho máy chiếu lớp học.

## Tính năng nổi bật

1. **4 Trang trình chiếu liền mạch (Tối giản, chuẩn Projector 16:9)**:
   - **01 - Giới thiệu (`gioi-thieu`)**: Chào mừng Quý Thầy Cô tham gia chương trình bồi dưỡng 12 tiết AI cốt lõi, kèm hoạt ảnh Mascot Mana chào đón và mô phỏng sân khấu Kéo co.
   - **02 - Hướng dẫn (`huong-dan`)**: Giải thích quy tắc 3 bước trực quan kèm hoạt ảnh Mascot cho từng giai đoạn.
   - **03 - Trò chơi Kéo co (`tro-choi-keo-co`)**: Đấu trường Kéo co trực tiếp với bộ 8 câu hỏi tình huống phân biệt **Tự động hóa / Chương trình truyền thống** và **Trí tuệ nhân tạo (AI)**.
   - **04 - Tổng kết (`tong-ket`)**: Thống kê điểm số, lực kéo, độ chính xác, tốc độ phản xạ và Góc suy ngẫm sư phạm.

2. **3 Phương thức điều khiển linh hoạt trong Trò chơi**:
   - **Click chuột trực tiếp**: Chọn nhanh giữa hai thẻ đáp án trên màn hình.
   - **Vẫy tay AR (Hand Landmarker)**: Giơ/vẫy tay sang vùng **Bên Trái** để chọn **KHÔNG CÓ AI**, hoặc sang vùng **Bên Phải** để chọn **CÓ SỬ DỤNG AI**.
   - **Khuôn mặt AR (Face Landmarker)**: Nghiêng đầu hoặc hướng khuôn mặt sang **Trái (KHÔNG CÓ AI)** hoặc **Phải (CÓ SỬ DỤNG AI)** trong ~1 giây để khóa đáp án.

## Chạy dự án

```bash
npm run dev
```
Mặc định chạy tại `http://localhost:3200`.
