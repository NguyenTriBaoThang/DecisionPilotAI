# 09 · Việc cần làm

*Cập nhật 12/11/2026. Hạn nộp: **23:59 13/11**.*

## Đã xong (từ bản trước)
- [x] Sửa số liệu/mô tả sai trong tài liệu về đúng `artifacts/` (PR #15)
- [x] Nối luồng demo end-to-end + e2e `demo-flow.spec.ts`
- [x] Chạy app thật, test Playwright 11 màn hình, chụp ảnh demo (`report/screenshots/demo-flow/`)
- [x] Dàn ý slide (`12_dan_y_slide.md`), kịch bản video 2 phút (`13_kich_ban_demo.md`)
- [x] Bật LLM thật (Gemini) cho Ask

## Trước 23:59 13/11
| Ưu tiên | Việc | Ghi chú |
|---|---|---|
| P0 | Xác nhận đội ≥3 thành viên, đã đăng ký form | Git có 4 tác giả người |
| P0 | **Làm CI `main` xanh lại** | Cách nhanh: cài `tesseract-ocr` trong CI + `Dockerfile`, hoặc đánh dấu skip test OCR khi không có engine (file 05, 07-F) |
| P0 | Làm **slide PDF tiếng Anh ≤15 trang** từ `12_dan_y_slide.md` | Chưa có |
| P0 | Đóng gói `AI4Biz_Tendoi_2026`, nộp Google Form | |
| P1 | Gỡ khỏi git: `decisionpilot.db`, `test-results/`, `artifacts/tenant_*.joblib`; thêm vào `.gitignore` | Cần teammate đồng ý |
| P1 | Chốt có đưa 6 module mới vào slide/submission không; nếu có, thêm 1 đoạn vào `COMPETITION_SUBMISSION.md` | Khuyến nghị: 1 slide, không đưa vào video |
| P1 | Chạy lại smoke + `demo-flow.spec.ts` trên `main` mới (sau `scripts/demo_reset.sh`) để chắc luồng demo không bị commit mới làm vỡ | Chưa chạy trên `27a4b90` |
| P2 | Sửa `lineage/router.py:105` (`created_at` không tồn tại trên `ingestion_jobs`) | |

## Trước pitch 19/11 (nếu vào top 8, thông báo 16/11)
- Quay video ≤2 phút theo `13_kich_ban_demo.md`
- Pitch 15 phút tiếng Anh, ≥3 người trình bày, mỗi người giải thích được 1 module
- Chuẩn bị Q&A: dữ liệu tổng hợp vs dữ liệu thật; vì sao LightGBM không thắng ở tổng thể; AI ở đâu trong Ask; khác gì Power BI Copilot; RAG eval nhỏ thế nào; bảo mật đa tenant
