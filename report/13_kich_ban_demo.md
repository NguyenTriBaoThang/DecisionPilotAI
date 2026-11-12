# 13 · Kịch bản demo 2 phút (video) + chuẩn bị Q&A

Thuật ngữ đời thường: xem [CONTEXT.md](../CONTEXT.md). Mọi số bên dưới đã kiểm chứng trên app ngày 11/11/2026 và kiểm lại trên **giao diện mới (PR #17)** ngày 12/11/2026 với **practice data (dữ liệu tổng hợp)**. "Lan" là nhân vật minh họa.

## Chuẩn bị trước khi quay (checklist)
1. `sh scripts/demo_reset.sh` (xóa audit cũ), chờ `curl localhost:8090/api/health` báo ok.
2. `.env`: `LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.1-flash-lite` (nhanh, ~1–2 s). Khóa `gemini-2.5-flash` bản free **hết hạn mức ngày** sau ~20 request; đừng test dồn trước khi quay. Nếu Gemini lỗi, app tự dùng luật cục bộ và câu tiếng Việt vẫn trả lời đúng.
3. Trình duyệt Chrome 1440×900, zoom 100%, UI **English**, tắt thông báo. Mở sẵn http://localhost:8090.
4. Tập 2 lần, bấm theo đúng đường dẫn bên dưới.

## Kịch bản (EN lời thoại; ghi chú tiếng Việt)

| Giây | Màn hình / thao tác | Lời thoại (English) |
|---|---|---|
| 0:00–0:15 | **Today** `/`. Chỉ vào câu tóm tắt trên header và thẻ **Revenue** (₫3.38B, ▼30.6%). | "Meet Lan, who runs an online office-supplies shop. This is an illustrative example on practice data. Every morning she opens one page. In September her sales fell 31%, and she doesn't know why." |
| 0:15–0:40 | Ghi chú vàng *Facebook spend is unusually high* → **See why** → trang **Ask AI** tự gửi câu hỏi. Mở **See the numbers** nếu muốn cho thấy bảng. (Tuỳ chọn) gõ tiếng Việt: `Kênh quảng cáo nào đang kém hiệu quả nhất?` | "She clicks the warning, and the AI answers from her own data: Facebook ads returned only 76 cents for every dollar, while email returned almost thirteen." |
| 0:40–1:20 | Menu **Decisions** → thẻ *Review Facebook Ads allocation* (High priority, expected impact) → **Try first**. Trang Try first tự chạy −15%; chỉ vào 3 thẻ kết quả và bảng **Before / after**. | "Instead of guessing, she tries it first. Cutting the Facebook budget by 15% saves about 33 million dong in ads and loses only 11 million in sales, so profit after ads improves by 29 million. This is an estimate, so the system suggests a small test with a comparison group, not a blind cut." |
| 1:20–1:45 | Bấm **Choose** → "Recorded: Choose" → **See decisions**: thẻ gợi ý biến mất khỏi *Waiting for you*, dòng mới trong *Decision log*. | "She chooses. One click records the decision: who, when, on what evidence. Nothing runs automatically." |
| 1:45–2:00 | Slide tên sản phẩm. | "DecisionPilot AI: Ask. Understand. Predict. Decide. Built for small businesses without a data team." |

Số dùng trong lời thoại: doanh thu T9 3,38 tỷ ₫ (−30,6%); Facebook ROAS 0,76×, Email 12,9×; tiết kiệm chi phí 33,4 triệu ₫ (222,5 → 189,1 triệu), doanh thu −11,2 triệu (111,9 → 100,7 triệu), lãi sau quảng cáo ước tính −177,1 → −148,3 triệu (+28,8 triệu). Nguồn: `/api/kpi/summary`, `/api/query`, `/api/simulate` (Facebook, mặc định).

## Ảnh chụp
**`screenshots/demo-flow/` là giao diện CŨ (trước PR #17) — không dùng cho slide/video nữa.** Cần chụp lại bằng UI mới, tiếng Anh, 1440×900, sau `demo_reset.sh`, theo 4 cảnh ở trên (việc P0 trong file 09).

Tạm thời có ảnh UI mới (chủ yếu tiếng Việt) ở `screenshots/redesign/`:
| Cảnh | File |
|---|---|
| 1 Today | `01-today-en.png` (EN) · `01-hom-nay-vi.png` |
| 2 Ask AI | `02-hoi-ai-vi.png` · `10-ask-data-table.png` |
| 3 Decisions → Try first | `11-decisions-impact.png` · `09-try-first-before-after.png` · `03-thu-truoc-vi.png` |
| 4 Nhật ký | `04-quyet-dinh-vi.png` |
| Phụ: Nâng cao, Dự báo, Kiểm toán, mobile | `05`, `07`, `08`, `06` |

Khi Gemini bật, câu hỏi ROAS trả lời "Facebook Ads is lowest at 0.76×"; với luật cục bộ là "Facebook Ads had the largest decline in roas: 6.53× to 0.76×". Cả hai đều đúng.

## Slide "How AI Helps" phủ đủ 4 năng lực của đề (video không nhắc Forecast)
| Năng lực | Ảnh | Câu của Lan |
|---|---|---|
| Hỏi dữ liệu | Ask AI (chụp lại EN) | "Which channel is lowest?" |
| Phân tích biến động | ghi chú cảnh báo trên Today / trang Nâng cao → Cảnh báo (chụp lại EN) | "Facebook spend is 84% above normal." |
| Dự báo | ghi chú *Next 30 days* trên Today; chi tiết ở Nâng cao → Dự báo (`07-du-bao-chi-tiet-vi.png`) | "What will next month look like, and how sure are we?" |
| So sánh kịch bản | Try first, bảng Before / after (`09-try-first-before-after.png`, chụp lại EN) | "What if I cut the budget 15%?" |

## Q&A: các câu dễ bị hỏi và câu trả lời trung thực
1. **Dữ liệu thật hay giả?** Giả (practice data), có chủ ý cài sự kiện để kiểm thử. Chưa pilot với shop thật; bước tiếp theo là chạy trên dữ liệu ẩn danh của một shop.
2. **AI ở đâu?** (a) Dự báo LightGBM + baseline với cổng 2%; (b) Isolation Forest + z-score phát hiện bất thường; (c) mô hình đáp ứng giá/quảng cáo để thử trước; (d) LLM tùy chọn chỉ hiểu câu hỏi, không tính số.
3. **Tại sao dự báo tổng thể dùng moving average?** Vì LightGBM không vượt baseline quá 2% trên validation; hệ thống chọn đơn giản khi đơn giản đủ tốt, và nói rõ. Ở SKU P001 LightGBM thắng.
4. **Độ chính xác?** Doanh thu tổng WAPE 24%, dải 90% thực tế phủ 84%; recall phát hiện giảm doanh thu 38%; Facebook spend precision 100%/recall 82%. Mô phỏng marketing còn yếu hơn baseline (33% vs 25%) nên app khuyên **thử nhỏ có đối chứng**.
5. **LLM có bịa số không?** LLM chỉ chọn công cụ; số và câu trả lời tạo bằng code từ DB; câu hỏi chứa SQL hoặc ngoài phạm vi bị từ chối. Câu hỏi được lưu để audit.
6. **Khác Power BI/Looker?** Trả lời bằng tiếng Việt thường, nối từ cảnh báo → nguyên nhân → thử trước → quyết định có người duyệt và nhật ký, cho người không có analyst.
7. **Bảo mật dữ liệu?** Chạy local/Docker; chỉ gửi *văn bản câu hỏi + danh sách bộ lọc hợp lệ* cho Gemini nếu bật; phân quyền viewer/analyst/admin; nhật ký quyết định chặn sửa/xóa thông thường.
8. **Mô hình kinh doanh?** (chưa có) Gợi ý: gói thuê bao theo cửa hàng; cần xác nhận với đội trước khi nói.
9. **Khả năng triển khai?** CPU, Docker một lệnh; roadmap kết nối KiotViet/Sapo/Haravan (chưa làm).
10. **Sao giao diện ít chữ vậy, tính năng enterprise đâu?** Màn chính dành cho chủ shop (4 tab); module chuyên sâu (copilot tài liệu, 3D, truy nguồn, giải thích AI, kiểm toán) nằm trong *Advanced*.
11. **Đội đóng góp gì (không chỉ AI sinh)?** Chuẩn bị để mỗi thành viên giải thích được 1 module: dữ liệu & pipeline, mô hình, backend/audit, giao diện/3D.

## Không nói
"Zero hallucination" tuyệt đối, "industry-first", WAPE 11%, precision 92%, "98/100", log-log ε=−1,42, Hill curve, "AST SQL parser", mọi % tác động kinh doanh (95% thời gian, −35% stockout…): không có bằng chứng.
