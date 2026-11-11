# 13 · Kịch bản demo 2 phút (video) + chuẩn bị Q&A

Thuật ngữ đời thường: xem [CONTEXT.md](../CONTEXT.md). Mọi số bên dưới đã kiểm chứng trên app ngày 11/11/2026 với **practice data (dữ liệu tổng hợp)**. "Lan" là nhân vật minh họa.

## Chuẩn bị trước khi quay (checklist)
1. `sh scripts/demo_reset.sh` (xóa audit cũ), chờ `curl localhost:8090/api/health` báo ok.
2. `.env`: `LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.1-flash-lite` (nhanh, ~1–2 s). Khóa `gemini-2.5-flash` bản free **hết hạn mức ngày** sau ~20 request; đừng test dồn trước khi quay. Nếu Gemini lỗi, app tự dùng luật cục bộ và câu tiếng Việt vẫn trả lời đúng.
3. Trình duyệt Chrome 1440×900, zoom 100%, UI **English**, tắt thông báo. Mở sẵn http://localhost:8090.
4. Tập 2 lần, bấm theo đúng đường dẫn bên dưới.

## Kịch bản (EN lời thoại; ghi chú tiếng Việt)

| Giây | Màn hình / thao tác | Lời thoại (English) |
|---|---|---|
| 0:00–0:15 | **Dashboard** `/`. Chỉ vào thẻ Total Revenue (₫3.38B, −30.6%). | "Meet Lan, who runs an online office-supplies shop. This is an illustrative example on practice data. In September her sales fell 31%, and she doesn't know why." |
| 0:15–0:40 | Ở thẻ *Active Anomaly Radar* bấm **"Investigate causes with AI Copilot"** → Ask tự gửi câu hỏi. Sau đó **gõ** tiếng Việt: `Kênh quảng cáo nào đang kém hiệu quả nhất?` | "She clicks the warning, then asks in plain Vietnamese. The answer comes from her own data: Facebook ads returned only 76 cents for every dollar, while email returned almost thirteen." *(Ghi chú: biểu đồ cột cho thấy Facebook gần như bằng 0 so với Email.)* |
| 0:40–1:20 | Menu **Actionable Recommendations** → thẻ *Review Facebook Ads allocation* → **"Try first in simulator"**. 3D chỉ hiện ≤10 giây rồi trang tự cuộn xuống kết quả. | "Instead of guessing, she tries it first. Cutting the Facebook budget by 15% saves about 33 million dong in ads and loses only 11 million in sales, so the loss shrinks by 29 million. This is an estimate, so the system suggests a small test with a comparison group, not a blind cut." |
| 1:20–1:45 | Tab **AI Recommendations** → **Accept scenario**; quay lại `/recommendations`: thẻ **STATUS: ACCEPTED**, cuộn xuống *Decision Audit Trail*. | "She accepts. One click updates the recommendation and writes the decision log: who, when, on what evidence. Nothing runs automatically." |
| 1:45–2:00 | Slide tên sản phẩm. | "DecisionPilot AI: Ask. Understand. Predict. Decide. Built for small businesses without a data team." |

Số dùng trong lời thoại: doanh thu T9 3,38 tỷ ₫ (−30,6%); Facebook ROAS 0,76×, Email 12,9×; tiết kiệm chi phí 33,4 triệu ₫ (222,5 → 189,1 triệu), doanh thu −11,2 triệu (111,9 → 100,7 triệu), lỗ ước tính 177,1 → 148,3 triệu (+28,8 triệu). Nguồn: `/api/kpi/summary`, `/api/query`, `/api/simulate` (Facebook, mặc định).

## Ảnh chụp theo đúng kịch bản (`screenshots/demo-flow/`)
| Cảnh | File |
|---|---|
| 1 Dashboard | `scene1_dashboard.png` |
| 2 Alert → Ask (câu EN tự gửi + câu VI gõ tay) | `scene2_ask.png` (cả hai) · `scene2_ask_vi_clean.png` (chỉ câu VI, dùng cho slide) |
| 3 Khuyến nghị → Simulator | `scene3a_recommendation.png` · `scene3b_simulator_result.png` · `scene3c_simulator_3d_cameo.png` |
| 4 Duyệt + nhật ký | `scene4a_accept_scenario.png` · `scene4b_card_accepted.png` · `scene4c_decision_log.png` |

Chụp ngày 11/11/2026 từ dữ liệu sạch (`demo_reset.sh`), UI English, cửa sổ 1440×900, Gemini bật (`gemini-3.1-flash-lite`). Khi Gemini bật, câu tiếng Việt trả lời "Facebook Ads is lowest at 0.76×"; với luật cục bộ câu trả lời là "Facebook Ads had the largest decline in roas: 6.53× to 0.76×". Cả hai đều đúng, chọn một khi quay.

## Slide "How AI Helps" phủ đủ 4 năng lực của đề (video không nhắc Forecast)
| Năng lực | Ảnh | Câu của Lan |
|---|---|---|
| Hỏi dữ liệu | `screenshots/demo-flow/scene2_ask_vi_clean.png` | "Which channel is lowest?" |
| Phân tích biến động | `screenshots/demo-flow/capability_anomaly.png` | "Facebook spend is 84% above normal." |
| Dự báo | `screenshots/demo-flow/capability_forecast.png` (SKU P001, LightGBM) | "What will next month look like, and how sure are we?" |
| So sánh kịch bản | `screenshots/demo-flow/scene3b_simulator_result.png` | "What if I cut the budget 15%?" |

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
10. **Đội đóng góp gì (không chỉ AI sinh)?** Chuẩn bị để mỗi thành viên giải thích được 1 module: dữ liệu & pipeline, mô hình, backend/audit, giao diện/3D.

## Không nói
"Zero hallucination" tuyệt đối, "industry-first", WAPE 11%, precision 92%, "98/100", log-log ε=−1,42, Hill curve, "AST SQL parser", mọi % tác động kinh doanh (95% thời gian, −35% stockout…): không có bằng chứng.
