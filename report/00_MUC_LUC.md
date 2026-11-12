# Báo cáo rà soát dự án DecisionPilot AI

Ngày lập: 11/11/2026 · Cập nhật: 12/11/2026 (`main` = `7888791`, sau PR #17 thiết kế lại UI) · Hạn nộp bài: **23:59 ngày 13/11/2026** (còn ~2 ngày)

Phương pháp: đọc README, COMPETITION_SUBMISSION, 10 báo cáo audit, artifacts đánh giá, code `ai_service/`, `backend/`, git log; đối chiếu với thể lệ cuộc thi trên Notion. **Chưa chạy** pytest/app (xem file 07).

| File | Nội dung |
|---|---|
| [01_cuoc_thi.md](01_cuoc_thi.md) | Thể lệ, mốc thời gian, tiêu chí chấm, yêu cầu nộp bài |
| [02_du_an_la_gi.md](02_du_an_la_gi.md) | DecisionPilot AI là gì, gồm những phần nào |
| [03_ly_do_va_painpoint.md](03_ly_do_va_painpoint.md) | Vì sao làm, giải quyết painpoint nào, cho ai |
| [04_giai_phap_ky_thuat.md](04_giai_phap_ky_thuat.md) | Kiến trúc và cách AI hoạt động (theo code thật) |
| [05_tien_trinh_hien_tai.md](05_tien_trinh_hien_tai.md) | Đã làm gì, timeline git, trạng thái hiện tại |
| [06_so_lieu_that.md](06_so_lieu_that.md) | Số liệu đánh giá đã kiểm chứng từ artifacts |
| [07_sai_lech_va_rui_ro.md](07_sai_lech_va_rui_ro.md) | **Quan trọng:** chỗ tài liệu nói quá/sai so với thực tế |
| [08_doi_chieu_tieu_chi.md](08_doi_chieu_tieu_chi.md) | Dự án so với từng tiêu chí chấm điểm |
| [09_viec_can_lam.md](09_viec_can_lam.md) | Việc cần làm trước 13/11 và trước pitch 19/11 |
| [10_luong_test.md](10_luong_test.md) + [smoke_test.sh](smoke_test.sh) | Luồng test toàn bộ ứng dụng (tự động, thủ công, bảo mật, demo) |
| [11_ket_qua_test_playwright.md](11_ket_qua_test_playwright.md) | Kết quả test giao diện bằng Playwright + lỗi tìm thấy (giao diện cũ; ảnh test ở `screenshots/test-run/`, ảnh demo cũ ở `screenshots/demo-flow/`). Ảnh giao diện mới: `screenshots/redesign/` |
| [12_dan_y_slide.md](12_dan_y_slide.md) | Dàn ý slide 11 trang (EN) theo cấu trúc BTC, có nguồn số liệu |
| [13_kich_ban_demo.md](13_kich_ban_demo.md) | Kịch bản demo 2 phút, checklist quay, câu hỏi Q&A và cách trả lời trung thực |
| [../CONTEXT.md](../CONTEXT.md) | Bảng thuật ngữ đời thường dùng trong demo/slide |

## Tóm tắt 6 dòng

1. **Là gì:** nền tảng "Decision Intelligence" cho SME bán lẻ: hỏi đáp dữ liệu → phát hiện bất thường → dự báo → mô phỏng kịch bản → khuyến nghị có người duyệt + audit.
2. **Track:** Data & Decision Intelligence (nhóm ý tưởng số 5), khớp đủ 4 gạch đầu dòng của đề.
3. **Mức hoàn thiện:** MVP chạy được (FastAPI + React + LightGBM + Three.js, Docker, CI, docs site); UI mới 4 tab cho chủ shop (Hôm nay · Hỏi AI · Thử trước · Quyết định), module chuyên sâu trong Nâng cao. Điểm mạnh thật. **CI đang đỏ** (OCR + 6 e2e sau PR #17, file 05).
4. **Điểm yếu thật:** dữ liệu 100% tổng hợp; dự báo doanh thu tổng thể chỉ ngang moving average (WAPE 24%); mô phỏng marketing kém baseline.
5. **Rủi ro lớn nhất:** COMPETITION_SUBMISSION.md, research-proposal.md và audit/04 ghi số đẹp hơn artifact thật (WAPE 11.2% vs 24.14%, precision 92.4%…) và mô tả kỹ thuật không có trong code (Hill curve, ε=-1.42, sqlglot AST). Giám khảo hỏi là lộ.
6. **Việc gấp:** sửa số liệu, làm slide PDF tiếng Anh ≤15 trang, nộp đúng folder `AI4Biz_Tendoi_2026` qua Google Form.
