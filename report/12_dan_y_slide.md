# 12 · Dàn ý slide (EN, PDF, ≤15 trang; đề xuất 11)

Theo cấu trúc BTC (10 mục). Mỗi con số có nguồn; mọi ví dụ gắn nhãn "illustrative example on practice data". Thuật ngữ: [CONTEXT.md](../CONTEXT.md). Lời thoại chi tiết: [13_kich_ban_demo.md](13_kich_ban_demo.md).

| # | Slide (mục BTC) | Nội dung chính (EN) | Hình / nguồn |
|---|---|---|---|
| 1 | **Title** | *DecisionPilot AI* · "Ask. Understand. Predict. Decide." · tên đội + thành viên (cần xác nhận ≥3 người) | logo `assets/images/logo.png` |
| 2 | **Business Problem** | "September sales fell 31%. Lan, an online shop owner (illustrative), doesn't know why." Dữ liệu nằm ở POS, quảng cáo, kho, Excel | `screenshots/demo-flow/scene1_dashboard.png` (số: 3,38 tỷ ₫, −30,6%) |
| 3 | **Target Business & Users** | SME bán lẻ/dịch vụ 10–100 nhân viên, không có data analyst: chủ shop, quản lý bán hàng, marketing, kho | sơ đồ 4 vai trò |
| 4 | **Business Insight** | Dashboard chỉ nói "chuyện gì đã xảy ra"; cần "vì sao / nếu làm X thì sao"; quyết định cảm tính tốn tiền: Facebook chi 215 triệu ₫ trả lại 0,76 ₫/1 ₫ (Email 12,9 ₫) | biểu đồ `screenshots/demo-flow/scene2_ask_vi_clean.png` |
| 5 | **Proposed Solution** | Vòng Ask → Understand → Predict → Decide, một nơi duy nhất, người quyết định cuối cùng | sơ đồ 4 bước (stepper) |
| 6 | **How AI Helps** | 4 năng lực của đề, mỗi cái 1 ảnh + 1 câu của Lan (bảng trong file 13) | `capability_anomaly`, `capability_forecast`, `scene2_ask_vi_clean`, `scene3b_simulator_result` (trong `screenshots/demo-flow/`) |
| 7 | **How It Works** | Câu hỏi → công cụ cố định đọc DB (LLM tùy chọn chỉ hiểu câu hỏi) → bằng chứng + nguồn; dự báo LightGBM với cổng 2%; bất thường Isolation Forest+z-score; thử trước bằng mô hình đáp ứng giá/quảng cáo. **"AI knows what it doesn't know"**: bảng giới hạn | số thật: WAPE 24,1%; coverage 83,8%; Facebook spend precision 100%/recall 82%; revenue recall 38%; replay giá ≈ baseline, marketing kém baseline (`artifacts/`) |
| 8 | **Mockup / Demo** | 4 cảnh: cảnh báo → hỏi → thử trước (−15% Facebook: tiết kiệm 33 triệu chi phí, mất 11 triệu doanh thu) → duyệt + nhật ký | `scene2…`, `scene3b`, `scene4b`, `scene4c` (trong `screenshots/demo-flow/`) + video 2 phút |
| 9 | **Feasibility & Business Value** | Chạy CPU/Docker một lệnh, Postgres/SQLite, phân quyền, nhật ký quyết định; **chưa pilot**: giá trị kỳ vọng (tiết kiệm giờ làm báo cáo, tránh chi quảng cáo kém hiệu quả) là giả định, cách kiểm chứng: thử nhỏ có đối chứng với 1 shop | bảng "kỳ vọng ↔ cách kiểm chứng" (COMPETITION_SUBMISSION §6) |
| 10 | **Competitive Advantage** | (1) thử trước khi làm, (2) quyết định có tên + nhật ký, (3) nói thẳng độ tin cậy, (4) hiểu tiếng Việt thường ngày, không cần analyst | bảng so sánh với BI truyền thống và chatbot chung |
| 11 | **Roadmap & Next steps** | Kết nối KiotViet/Sapo/Haravan (chưa làm), pilot với 1 shop, cảnh báo Telegram/Zalo (chưa làm) | `README.md` roadmap |

## Quy tắc khi làm slide
- Mỗi trang ≤ 1 ý chính, ≤ 25 chữ + 1 hình. Không viết ROAS/WAPE trần; dùng "ad payback", "average miss" kèm ví dụ.
- Con số chỉ lấy từ `artifacts/*` và app; ghi nguồn nhỏ ở chân trang.
- Dòng bắt buộc: "Practice data (synthetic). Illustrative example."
- Xuất PDF, đặt trong folder `AI4Biz_Tendoi_2026`, nộp qua Google Form trước 23:59 13/11/2026.
