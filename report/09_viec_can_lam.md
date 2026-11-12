# 09 · Việc cần làm

*Cập nhật 12/11/2026 10:20 (`main` = `7888791`). Hạn nộp: **23:59 13/11**.*

## Đã xong (từ bản trước)
- [x] Sửa số liệu/mô tả sai trong tài liệu về đúng `artifacts/` (PR #15)
- [x] Nối luồng demo end-to-end + e2e `demo-flow.spec.ts`
- [x] Chạy app thật, test Playwright 11 màn hình, chụp ảnh demo (`report/screenshots/demo-flow/`)
- [x] Dàn ý slide (`12_dan_y_slide.md`), kịch bản video 2 phút (`13_kich_ban_demo.md`)
- [x] Bật LLM thật (Gemini) cho Ask
- [x] Thiết kế lại UI 4 tab (Hôm nay · Hỏi AI · Thử trước · Quyết định) + gom module cũ vào Nâng cao (PR #17, merge 12/11)
- [x] Sửa `/v1/recommendations`, `/v1/audit/*` trả 500 trên Postgres (Decimal JSON, PR #17)
- [x] Sửa lỗi lineage `created_at` (`2e58835`, teammate)
- [x] Chạy lại `demo-flow.spec.ts` trên Docker sau UI mới: pass

## Trước 23:59 13/11
| Ưu tiên | Việc | Ghi chú |
|---|---|---|
| P0 | Xác nhận đội ≥3 thành viên, đã đăng ký form | Git có 3 tác giả người (NguyenTriBaoThang, toilact, KienTrungZir) |
| P0 | **Sửa 6 e2e fail do PR #17** (file 05): chẩn đoán nút Choose bị khóa trên backend e2e; cập nhật `workspace.spec.ts` cho route mới (`/advanced/copilot`, `/advanced/simulator-3d`, trang XAI/audit); cần dựng `.venv` Python 3.12 để chạy local | toilact (lỗi của PR #17) |
| P0 | **Làm CI `main` xanh lại** phần OCR | Cài `tesseract-ocr` trong CI + `Dockerfile`, hoặc skip test OCR khi không có engine (file 05, 07-F) |
| P0 | **Chụp lại ảnh slide/video bằng UI mới, tiếng Anh** (thay `screenshots/demo-flow/`) theo kịch bản mới ở file 13 | Ảnh UI mới tiếng Việt đã có ở `screenshots/redesign/` |
| P0 | Làm **slide PDF tiếng Anh ≤15 trang** từ `12_dan_y_slide.md` | Chưa có |
| P0 | Đóng gói `AI4Biz_Tendoi_2026`, nộp Google Form | |
| P1 | Gỡ khỏi git: `decisionpilot.db`, `test-results/`, `artifacts/tenant_*.joblib`; thêm vào `.gitignore` | Cần teammate đồng ý |
| P1 | Cập nhật `COMPETITION_SUBMISSION.md`: giao diện 4 tab; chốt có đưa 6 module mới vào không | Khuyến nghị: module mới 1 slide, không đưa vào video |
| P2 | Gọn 3 trang Nâng cao còn lại: Truy nguồn số liệu, Copilot tài liệu, Bản 3D | Cùng kiểu header + "Chi tiết kỹ thuật" |
| P2 | Lỗi nhỏ UI: thanh trượt gọi mô phỏng khi bấm Tab; có thể ghi quyết định 2 lần sau khi kéo lại; "Nhập hàng" lẫn sản phẩm dịch vụ; breadcrumb trang Nâng cao còn tên cũ; "30.6%" thay vì "30,6%"; lời chào chưa có tên | |

## Trước pitch 19/11 (nếu vào top 8, thông báo 16/11)
- Quay video ≤2 phút theo `13_kich_ban_demo.md`
- Pitch 15 phút tiếng Anh, ≥3 người trình bày, mỗi người giải thích được 1 module
- Chuẩn bị Q&A (file 13): dữ liệu tổng hợp vs dữ liệu thật; vì sao LightGBM không thắng ở tổng thể; AI ở đâu trong Ask; khác gì Power BI Copilot; RAG eval nhỏ thế nào; bảo mật đa tenant
