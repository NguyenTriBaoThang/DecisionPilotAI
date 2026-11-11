# 07 · Sai lệch tài liệu ↔ thực tế & rủi ro

Đây là phần quan trọng nhất. Luật cuộc thi cho phép BTC "yêu cầu cung cấp thông tin để xác minh" và có thể hủy tư cách; giám khảo kỹ thuật dễ mở artifacts/code ra kiểm tra.

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
