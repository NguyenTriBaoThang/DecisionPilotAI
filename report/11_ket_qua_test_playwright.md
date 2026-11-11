# 11 · Kết quả test giao diện bằng Playwright (11/11/2026)

Môi trường: Docker Compose, http://localhost:8090, `LLM_PROVIDER=gemini` (gemini-2.5-flash), dữ liệu tổng hợp. Ảnh chụp ở [screenshots/test-run/](screenshots/test-run/) (ảnh của lần test này, không phải bộ ảnh chuẩn cho slide; bộ chuẩn nằm ở [screenshots/demo-flow/](screenshots/demo-flow/)).

## Kết quả theo màn hình
| # | Màn hình | Kết quả | Ảnh |
|---|---|---|---|
| 1 | Dashboard `/` | PASS. KPI khớp API (3,38 tỷ ₫, −30,6% so kỳ trước, biên 39,6%, ROAS 2,76); 0 lỗi console | 01 |
| 2 | Ask AI, tiếng Việt tự do (Gemini) | PASS. Gemini hiểu "Vì sao doanh thu tháng này giảm…", chọn tool `explain`, số −1,66 tỷ khớp, có waterfall + bảng đóng góp | 02 |
| 3 | Ask AI, prompt injection | PASS. `TOOL: UNSUPPORTED`, bị từ chối, không đụng DB | 03 |
| 4 | Ask AI, "Forecast demand for SmartDesk Mini…" | **FAIL → đã sửa** (xem lỗi #1) | 03, 04 |
| 5 | Anomaly Center | PASS. 30 cảnh báo (2 critical, 13 high, 15 medium); bảng "Model evidence & limitations" hiển thị trung thực recall 38% / tín hiệu "unverified" | 05 |
| 6 | Forecast Center | PASS có lưu ý: chạy doanh thu 30 ngày ra tổng 3,36 tỷ, WAPE 24,1%, độ phủ 83,8% kèm cảnh báo; đường dự báo **phẳng** | 06 |
| 7 | 3D Simulator | PASS. Giá P001, Marketing Facebook, Tồn kho chạy được; 0 lỗi, chỉ cảnh báo `THREE.Clock deprecated` | 07 |
| 8 | Accept scenario | PASS. "Decision recorded", ghi vào audit | 08 |
| 9 | Recommendations & Audit | PASS. 3 khuyến nghị; audit có dòng `local-workspace / scenario_feedback / accepted` lúc 08:34:20 | 09 |
| 10 | Data Sources + tiếng Việt | PASS | 10 |
| 11 | Mobile 390 px | PASS. Không tràn ngang, menu hamburger, tiếng Việt đúng | 11 |

## Lỗi tìm thấy

### #1 (đã sửa) Gemini trả tên sản phẩm thay vì mã → HTTP 422
- Hiện tượng: với `LLM_PROVIDER=gemini`, câu "Forecast demand for SmartDesk Mini for the next 30 days." báo *"Unknown product. Choose a value from the dataset filter options."*; với luật cục bộ thì chạy được.
- Nguyên nhân: Gemini điền `filters.product = "SmartDesk Mini"` (tên) trong khi backend cần mã `P001`. `route()` chỉ fallback khi lỗi parse/HTTP, không kiểm tra giá trị bộ lọc có hợp lệ.
- Sửa: thêm `valid_intent()` trong [ai_service/llm_orchestrator.py](../ai_service/llm_orchestrator.py): đổi tên sản phẩm → mã, bộ lọc category/region/channel/segment sai → bỏ kết quả LLM và dùng luật cục bộ.
- Test: thêm `test_llm_intent_filters_are_mapped_or_rejected` vào [tests/test_decisionpilot.py](../tests/test_decisionpilot.py); pass trong container (cùng `test_features_use_only_previous_days`). Kiểm tra lại qua UI: câu dự báo trả "30-day demand forecast totals 206".
- Hệ quả: benchmark 46 câu "100%" trong artifacts chỉ đo **luật cục bộ**; đường Gemini chưa từng được benchmark → cần chạy `scripts/benchmark.py` với Gemini nếu muốn nói LLM đạt 100%.

### #2 (đã sửa trước đó) Build frontend lỗi TS1117
Khóa dịch trùng trong `preferences.tsx` (xem lần chạy đầu tiên).

## Phát hiện cần lưu ý khi demo / pitch
1. **Dự báo doanh thu toàn bộ phẳng** vì mô hình là moving average; bảng so sánh trên chính trang này cho thấy LightGBM WAPE 23,0% vs moving average 24,1% (hơn ~1 điểm, không vượt cổng 2% của validation). Nên demo bằng SKU P001 hoặc đơn hàng.
2. **Simulator xác nhận sự lệch tài liệu**: UI ghi "Elasticity −1.1; catalog assumption", "Demand response is linear", mô hình ngân sách là "Exponent α = 0.65" — không phải log-log ε=−1.42 hay Hill curve như README/COMPETITION_SUBMISSION.
3. Simulator có cảnh báo trung thực: "Holdout WAPE exceeds 30%; needs additional review", "Scenario estimates are conditional, not verified causal effects". Đây là điểm cộng về minh bạch.
4. Trang Ask footer ghi "AST Validated Tools"; thực tế là định tuyến ý định + công cụ có sẵn (xem file 07).
5. Dashboard có "Can Tho" trong danh sách khu vực (README chỉ nói Hanoi/HCMC/Da Nang).
6. Trên Dashboard, nhãn "Across 730 Days" ở thẻ Orders của simulator trong khi số đơn (1.537) chỉ của tháng 9 — nhãn gây hiểu nhầm.
7. Biểu đồ waterfall ở Ask bị cắt phần trên trục (thanh lớn nhất chạm mép) — lỗi hiển thị nhỏ.
8. Mặc định UI: commit `88885bb` đã vô tình đổi sang EN làm 2 test `preferences` và CI của `main` đỏ; PR #15 khôi phục mặc định **VI** (đúng ý PR #14). Khi quay demo, bấm nút EN ở thanh trên một lần (được ghi nhớ trong trình duyệt).

## Dữ liệu sinh ra khi test (cần biết)
- 1 dòng audit `scenario_feedback = accepted` (append-only, không xóa thông thường). Nếu muốn demo sạch: `docker compose down -v && docker compose up -d` (xóa volume Postgres, dữ liệu tự bootstrap lại).
- Đã bật Gemini trong `.env` (`LLM_PROVIDER=gemini`); file `.env` được gitignore, khóa API không bị ghi vào báo cáo hay git.

## Chưa test
Playwright e2e có sẵn của repo (`npm --prefix frontend run test:e2e`), pytest đầy đủ (cần `libomp` nếu chạy ngoài Docker), Vitest, kịch bản production (`APP_ENV=production` + token), import dữ liệu, 3 chế độ 3D (Overview/Focus/Compare) và Fullscreen 3D.
