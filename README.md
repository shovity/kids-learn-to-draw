# Bé Học Vẽ

Bé học vẽ từng nét theo hướng dẫn, tô màu rồi treo tranh lên tường, ngay trên trình duyệt. Chạy được trên điện thoại, máy tính bảng và máy tính.

**Chơi ngay:** https://shovity.github.io/kids-learn-to-draw/

| Chọn tranh | Vẽ theo nét | Tô màu | Treo tranh |
| --- | --- | --- | --- |
| ![Trang chủ](docs/home.png) | ![Vẽ theo nét](docs/trace.png) | ![Tô màu](docs/color.png) | ![Treo tranh](docs/decorate.png) |

## Tính năng

- **64 tranh** thuộc 8 chủ đề: con vật, trái cây, đồ ăn, bông hoa, cây cối, xe cộ, thời trang, đồ vật.
- **Vẽ theo nét:** mỗi tranh tách thành từng nét theo thứ tự. Bàn tay minh hoạ đi trước, bé đi theo nét cam. Chỗ tô trúng chuyển xanh và bắn pháo hoa. Tô trúng khoảng 75% nét là sang bước tiếp; có nút bỏ qua.
- **Tô màu:** bảng màu lấy từ tranh mẫu, cùng hộp màu đầy đủ. Có 6 kiểu cọ (bút mực, sáp màu, bút dạ, bút lông, bút máy, phun sơn), thùng sơn tô đúng vùng, tẩy, màu nền, hoàn tác/làm lại.
- **Kính lúp** phóng to chỗ đang vẽ. Hai ngón tay để phóng to và di chuyển tranh.
- **Hoàn thành:** chấm 1–3 sao theo độ chính xác khi tô nét. Có thể tải ảnh về, chia sẻ, hoặc đóng khung (15 khung/phòng).
- **Vẽ ra giấy:** hiện từng nét để bé chép ra giấy thật, rồi chụp ảnh lưu lại.
- **Bảng vẽ tự do** với cọ, hình khối, thùng sơn và ảnh nền.
- **Tranh của bé:** gồm tranh đang vẽ, tranh đã xong và ảnh chụp, lưu ngay trên máy (IndexedDB), không cần tài khoản.

## Nguồn gốc

Đây là bản web dựng lại từ ứng dụng Android *Learn to draw* (`com.love.drawing.draw` 3.7). Ứng dụng gốc được phân tích bằng [REA](https://github.com/morluto/rea) (JADX headless + apktool):

- `PaintActivity` / `DrawingBoardView`: luồng vẽ theo nét → tô màu, cách chấm điểm theo các điểm mẫu dọc nét, 6 kiểu cọ (`V = 0..5`).
- `PaperActivity` / `PaperDrawView`: chế độ vẽ ra giấy từng bước.
- `WhiteBoardActivity`, `DecorateActivity`: bảng vẽ và treo tranh.
- Tài nguyên: SVG tranh mẫu (nhóm `block` = vùng màu, `line` = nét), ảnh mẫu, khung trang trí, mẫu đầu cọ.

Không đưa vào bản web: quảng cáo, mua trong ứng dụng, vòng quay xu và phần "AI style" (vốn cần máy chủ).

## Chạy ở máy

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest
npm run typecheck
npm run build      # xuất trang tĩnh ra out/
```

`npm run assets` tạo lại `public/` và `lib/*.json` từ APK đã giải nén trong `apk/` (thư mục này không được commit).

## Deploy

Mỗi lần push lên `master`, workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) build bản tĩnh (`output: "export"`) với `NEXT_PUBLIC_BASE_PATH=/kids-learn-to-draw`, rồi deploy lên GitHub Pages. Đường dẫn tới file trong `public/` phải đi qua `asset()` trong `lib/manifest.ts`.
