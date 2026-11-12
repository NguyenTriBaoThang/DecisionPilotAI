# 07 · Sai lệch tài liệu ↔ thực tế & rủi ro

> **Cập nhật 12/11:** mục A và B đã được sửa trong PR #15 (README, COMPETITION_SUBMISSION, research-proposal, docs-site, TechnicalDocumentationPage). Kiểm tra lại trên `main` = `27a4b90`: không còn 11,2% / 92,4% / 96,5% / ε −1.42 / Hill ngoài thư mục `report/`. Rủi ro mới nằm ở mục F. Bảng A–D giữ lại làm lịch sử.

## A. Số liệu trong tài liệu nộp bài không khớp artifact
| Chỉ số | Tài liệu nói (file) | Artifact/code thật |
|---|---|---|
| WAPE dự báo doanh thu | **11,2% / 11,24%** (COMPETITION_SUBMISSION, research-proposal, audit/04, README) | **24,14%**, mô hình chọn là moving average chứ không phải LightGBM |
| "Cải thiện 18,4% so với baseline" | COMPETITION_SUBMISSION, research-proposal | Không có trong artifacts |
| Coverage 90% toàn doanh thu | 94,2% (audit/04) | 83,81% |
| Precision / Recall anomaly | **92,4% / 88,6%**, FPR <3,2%, "120 sự kiện cài" (research-proposal) | Doanh thu: 86,7% / **38,2%**; không có số 92,4/88,6 |
| Recall từng nhóm anomaly | 100%, 86,67%, 87,5% (audit/04) | 82,1%, 38,2%, 75% (stockout chỉ 25%) |
| NL-to-SQL | "96,5% valid execution" (COMPETITION_SUBMISSION) | 100% trên 46 câu tự soạn (README) — hai file nói hai số |
| Sai số mô phỏng | "MAPE <6,8%" | Replay WAPE ~24% (giá), 33% (ads) |
| README: "11,24% WAPE tổng" đặt cạnh bảng 24,14% | — | Hai số đối lập trong cùng một README |
| Giảm 35% stockout, ROAS +28%, giảm 95% thời gian | Không có cơ sở đo | Chỉ là giả định |

## B. Mô tả kỹ thuật không có trong code
| Tài liệu nói | Code |
|---|---|
| Hill saturation curve | `ratio ** exponent` (lũy thừa), không có Hill |
| Log-log elasticity, **ε = −1.42** cho P001 | Cầu **tuyến tính**; P001 ε = **−1.1** (products.csv); "−1.42" không xuất hiện ở đâu trong code/dữ liệu |
| "Volume Trap: +39% volume, −22M ₫, 64,5% stockout" | Không tìm thấy nguồn tính ra các số này |
| AST SQL parser (sqlglot), LLM sinh SQL, kiểm tra bảng whitelist, LIMIT 500 | Không có sqlglot; ý định bằng regex rồi gọi hàm phân tích có sẵn |
| 21-day IQR (audit/04, 08) | cửa sổ 56 ngày |
| Anomaly nằm ở `forecasting.py`, `simulation.py`, `routers/ask.py`, `features/simulator/` | Thực tế `anomaly.py`, `scenario.py`, `main.py`, `features/scenario-simulator/` |
| Kênh quảng cáo Meta/Google/TikTok/**Zalo** Ads | Cần kiểm tra lại với dữ liệu (README ghi Facebook/Google/TikTok) |
| "Zero mocked numbers, zero fake UI" | Bản GitHub Pages `/app/` chạy bằng **mock data** (audit/07 tự thừa nhận) |
| "Industry-first 3D", "AI audit chấm 98/100" | Tự chấm bởi chính tài liệu của dự án (có vẻ do AI sinh), không phải đánh giá độc lập |

## C. Lỗi nhỏ khác
- COMPETITION_SUBMISSION.md: link repo trỏ `file:///g:/GITHUB/...` và `github.com/DecisionPilotAI/DecisionPilotAI` (sai; repo thật là `NguyenTriBaoThang/DecisionPilotAI`); link docs `docs/api.md` (file thật `API.md`).
- Audit ghi Vitest 5.1, đường dẫn `G:/GITHUB/...` — kết quả không tái lập được trên máy này nếu chưa chạy lại.
- Điểm audit 98/100 dùng trọng số 25/30/25/20, khác bảng điểm tổng trên Notion (25/30/20/25).

## D. Rủi ro khác với luật cuộc thi
1. **Số thành viên:** git chỉ có 2 người (cần 3–5). Kiểm tra đủ người và đã đăng ký.
2. **"Đóng góp thực chất của đội":** khối lượng tài liệu/audit nhiều, giọng văn đồng nhất như do AI sinh. Cần để mỗi thành viên giải thích được code, mô hình, số liệu.
3. **Dữ liệu tổng hợp:** hợp lệ về mặt luật (không có dữ liệu nhạy cảm) nhưng điểm Feasibility sẽ bị hỏi "chạy với dữ liệu thật thế nào".
4. **Ngôn ngữ:** slide và pitch phải tiếng Anh; UI mặc định đang là tiếng Việt (PR #14) — chuẩn bị bản EN cho demo.
5. **Độ dài/độ phức tạp:** nhiều tuyên bố "cực đoan" (industry-first, zero hallucination) dễ bị phản bác trong 5 phút Q&A.

## E. Đề xuất xử lý (chi tiết ở file 09)
Chọn **một nguồn sự thật = artifacts/**; sửa mọi tài liệu về đúng số đó; bỏ/đổi các mô tả không có trong code (hoặc sửa code cho khớp nếu kịp). Trình bày hạn chế như một điểm mạnh về minh bạch.

## F. Rủi ro mới sau commit 11–12/11
| # | Rủi ro | Bằng chứng | Mức |
|---|---|---|---|
| 1 | **CI `main` đỏ** — giám khảo mở repo thấy dấu ❌ | Backend test + e2e fail ở luồng OCR hóa đơn (file 05) | Cao |
| 2 | OCR chỉ chạy trên Windows/tesseract; Docker không cài → tính năng "đọc hóa đơn ảnh" hỏng khi demo bằng Docker | `ocr_and_extractors.py:53-123`, `Dockerfile` | Cao nếu đưa vào demo |
| 3 | Commit file không nên có: `decisionpilot.db`, `test-results/.last-run.json`, 5 file `artifacts/tenant_*.joblib` (dữ liệu/mô hình tenant thử nghiệm) | `git ls-files` | Trung bình |
| 4 | Phạm vi phình to sát hạn: 6 module "enterprise" (~200 file) trong 1 đêm, chưa có trong `COMPETITION_SUBMISSION.md`, khó để cả đội giải thích trong Q&A | git log 11/11 | Trung bình |
| 5 | Số RAG eval toàn 1.0 trên bộ test tự soạn rất nhỏ — dễ bị hỏi vặn | `artifacts/rag_evaluation_report.json` | Thấp nếu trình bày đúng |
| 7 | `GET /v1/recommendations` (XAI governance) trả 500 trên Postgres — Docker demo dùng Postgres nên trang khuyến nghị XAI cũ hỏng khi demo | `TypeError: Object of type Decimal is not JSON serializable`, `governance/service.py:2072` | Trung bình (UI mới không dùng API này) |
| 6 | Lineage SSE lỗi `created_at` (bảng `ingestion_jobs` không có cột này) | `lineage/router.py:105`, log CI | Thấp |

**Khuyến nghị:** giữ câu chuyện demo cốt lõi (Cảnh báo → Ask → Thử trước → Quyết định, file 13); 6 module mới chỉ nhắc 1 slide "Roadmap đã có bản chạy" thay vì đưa vào video.
