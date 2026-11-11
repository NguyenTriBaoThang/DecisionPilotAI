# GIẢI TRÌNH KIẾN TRÚC AI, ĐÁNH GIÁ MÔ HÌNH & HỎI ĐÁP BAN GIÁM KHẢO (AI EXPLAINABILITY & JUDGES Q&A)

> **Lưu ý minh bạch:** Mọi số liệu đánh giá trong tài liệu này được đối chiếu trực tiếp với mã nguồn và `artifacts/` (`dataset_id: f32e87e3a5744333ff98d3bf`, bundle `dp-1.1`), gồm [`artifacts/MODEL_EVALUATION.md`](../artifacts/MODEL_EVALUATION.md), [`artifacts/evaluation.json`](../artifacts/evaluation.json), [`artifacts/query_benchmark.json`](../artifacts/query_benchmark.json) và [`artifacts/scenario_backtest.json`](../artifacts/scenario_backtest.json). Toàn bộ kết quả đo trên tập dữ liệu tổng hợp (synthetic) và tự kiểm định nội bộ, không phải kiểm toán độc lập hay kết quả triển khai trên doanh nghiệp thật.

**Dự án:** DecisionPilot AI  
**Cuộc thi:** AI for Business Innovation 2026 — LIKELION  
**Hạng mục:** 5. Data & Decision Intelligence  
**Phiên bản:** `v1.0.0` / Bundle `dp-1.1`

---

## 1. AI thực sự được sử dụng ở đâu trong DecisionPilot AI?

DecisionPilot AI kiên định với nguyên tắc **"Right Tool for the Right Job"** — không lạm dụng LLM cho các phép toán tài chính hay viết SQL tự do, mà phân định rõ 4 tầng trí tuệ nhân tạo:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        TỔNG THỂ HỆ THỐNG TRÍ TUỆ NHÂN TẠO              │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. Natural Language Analytics  │ Intent Router (Local Rules mặc định;  │
│    & Fixed Analytics Tools     │ tùy chọn Gemini 2.5 Flash / GPT-4.1m) │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. Predictive Forecasting      │ LightGBM 4.6.0 (17 đặc trưng nhân quả)│
│    (Doanh thu, Đơn, Nhu cầu)   │ + Cổng kiểm định >2% so với Baseline  │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. Anomaly Radar & Signals     │ Unsupervised ML (Isolation Forest)    │
│    (Doanh thu, Ads, Tồn kho)   │ + Rolling 56d Z-Score / IQR & Stockout│
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. Scenario Simulator &        │ Mô phỏng Co giãn giá & Power-law Ads  │
│    Decision Intelligence       │ + Bóc tách đóng góp (Waterfall Drivers)│
└────────────────────────────────┴───────────────────────────────────────┘
```

1. **Hiểu ý định ngôn ngữ tự nhiên (Intent Parsing):** Trích xuất cấu trúc `Intent` được kiểm định chặt (`action`, `metric`, `dimension`, `period`, `filters`, `horizon`, `forecast_target`), từ chối các câu hỏi chứa SQL (`BLOCKED`) hoặc ngoài phạm vi, và gọi bộ công cụ phân tích cố định viết sẵn trong Python/SQLAlchemy. Hệ thống chạy mặc định bằng **Local Rules** (`100%` offline, không tốn phí API) và hỗ trợ tùy chọn `gemini-2.5-flash` hoặc `gpt-4.1-mini`.
2. **Dự báo chuỗi thời gian (Demand & Sales Forecasting):** Mô hình **LightGBM** (`LGBMRegressor`) học trên **17 đặc trưng nhân quả tại thời điểm $t$** (`lag_1/7/14/28`, rolling `mean/std` `7/14/28`, `growth_7`, lịch, `scale`) qua cổng kiểm định nghiêm ngặt: chỉ chọn LightGBM khi MAE trên tập Validation vượt baseline tốt hơn (`moving_average` / `seasonal_naive`) trên **2%**.
3. **Phát hiện bất thường đa biến (Anomaly Detection):** Kết hợp cửa sổ trượt quá khứ **56 ngày lùi 7 ngày** (`shift(7).rolling(56, min_periods=28)`), **Isolation Forest** (`n_estimators=120`, `contamination=0.065`), IQR / Robust Z-score, kiểm tra sụt giảm doanh thu bền vững 7 ngày và luật tồn kho theo `lead_time_days`.
4. **Bóc tách căn nguyên (Root-Cause Contribution):** Phân rã cộng tính (additive decomposition) theo sản phẩm, danh mục, khu vực, kênh bán, phân khúc — cộng tổng đúng 100% phần chênh lệch quan sát được giữa hai kỳ, đồng thời hiển thị rõ cảnh báo thống kê: *"Observed contributions do not establish causality."*
5. **Mô phỏng kịch bản (What-If Simulation):** Mô phỏng co giãn giá tuyến tính theo phần trăm thay đổi ($Q_{\text{sim}} = Q_0 \times \max(0, 1 + \varepsilon \cdot \Delta P / P_0)$), giới hạn tồn kho vật lý và hàm suy giảm lợi suất quảng cáo dạng lũy thừa ($\text{ratio}^\alpha$, mặc định $\alpha = 0.65$).

---

## 2. Vì sao chọn từng mô hình cụ thể?

| Thành phần | Mô hình lựa chọn | Lý do kỹ thuật & Thực tế SME | Các lựa chọn đã loại bỏ |
|---|---|---|---|
| **Dự báo nhu cầu** | **LightGBM + Baseline Gate (`>2%`)** | Xử lý tốt dữ liệu bảng SME trên CPU; dễ giải trình Gain theo từng đặc trưng; không để mô hình phức tạp thay thế baseline nếu không cải thiện thực sự trên Validation. | **Text-heavy Deep Learning / LSTM:** Dữ liệu 730 ngày cho SME dễ overfit, tốn tài nguyên GPU không cần thiết. |
| **Phát hiện bất thường** | **Hybrid: Isolation Forest + Rolling Z-Score / IQR** | Phát hiện được cả sốc đơn biến lẫn bất thường đa chiều (VD: chi phí Facebook tăng `1.85x` nhưng tỷ lệ phân bổ đơn giảm), hoàn toàn không cần gán nhãn khi chạy thật. | **Autoencoder:** Nặng, khó giải trình cho chủ cửa hàng lý do vì sao ngày đó bị gắn cờ cảnh báo. |
| **Hỏi đáp dữ liệu** | **Constrained Intent Extraction + Fixed Tools** | LLM (nếu bật) chỉ trả về `Intent` JSON, mọi phép tính nằm trong SQLAlchemy Core trên kết nối `READ ONLY` (`statement_timeout = 8s` / `PRAGMA query_only`). Tuyệt đối không chạy SQL do LLM sinh ra. | **Free-form Text-to-SQL:** Rủi ro SQL injection, ảo giác bảng/cột và sai số phép tính tổng hợp. |
| **Giả lập kịch bản** | **Linear-% Elasticity + Power-Law Ads** | Công thức minh bạch, tham số có thể tinh chỉnh trực tiếp ($\varepsilon \pm 0.3$, $\alpha \pm 0.15$) và gắn nhãn rõ là *ước lượng có điều kiện* thay vì nhân quả tuyệt đối. | **Hộp đen Black-box RL:** Không thể giải thích giả định lợi nhuận trước chủ doanh nghiệp. |

---

## 3. Mô hình được huấn luyện từ dữ liệu nào?

- **Bộ dữ liệu gốc (`f32e87e3a5744333ff98d3bf`):** Bộ dữ liệu tổng hợp mô phỏng hoạt động bán lẻ & dịch vụ SME tại Việt Nam (`scripts/generate.py`, `seed=42`):
  - Thời gian: **730 ngày liên tục** (`2024-10-01` đến `2026-09-30`).
  - Quy mô: **50.000 giao dịch** (`Online`, `Retail`, `B2B`), **50 SKU** (`34` vật lý + `16` dịch vụ thuộc `6` danh mục), **10.000 khách hàng** tại **4 vùng** (`HCMC`, `Hanoi`, `Da Nang`, `Can Tho`), **2.920 bản ghi chiến dịch** (`Facebook Ads`, `Google Ads`, `TikTok Ads`, `Email`) và **24.820 bản ghi tồn kho**.
- **Phân chia dữ liệu theo thời gian (Chronological Split):**
  - **Train (70%):** `2024-10-01` – `2026-02-22`.
  - **Validation (15%):** `2026-02-23` – `2026-06-12` (tách riêng hai nửa để chọn mô hình và hiệu chuẩn dải tin cậy khi đủ lịch sử).
  - **Test/Holdout (15%):** `2026-06-13` – `2026-09-30`.
- **Chống rò rỉ dữ liệu:** Tất cả 17 đặc trưng chỉ sử dụng quan sát tại $\le t - 1$; nhãn bất thường trong manifest chỉ dùng để chấm điểm đánh giá trên tập Test.

---

## 4. Kết quả kiểm chứng thực nghiệm (`dp-1.1`)

1. **Dự báo nhu cầu (`30 ngày` trên tập Test Holdout):**
   - **Doanh thu toàn doanh nghiệp:** Chọn `moving_average` (vì LightGBM chưa vượt baseline `>2%` trên Validation) — **Test MAE = `34,584,971.67 ₫`**, **WAPE = `24.14%`**, độ phủ dải 90% đạt **`83.81%`** *(tổng 7 ngày đạt WAPE `21.84%`, độ phủ `91.96%`)*.
   - **SKU chủ lực `P001` (`SmartDesk Mini`):** Chọn **`LightGBM`** (vượt chuẩn `>2%`) — **Test MAE = `2.68` đơn vị/ngày**, **WAPE = `41.87%`**, độ phủ dải 90% đạt **`92.86%`** *(vượt mốc danh nghĩa 90%)*.
   - *(Ứng dụng hiển thị cảnh báo minh bạch khi độ phủ thực nghiệm thấp hơn mức danh nghĩa 90% trên cấp toàn doanh nghiệp.)*
2. **Phát hiện bất thường (Tập Test có gán nhãn sự kiện tổng hợp):**
   - `facebook_spend`: **Precision `100.00%`**, **Recall `82.14%`**, **F1 `90.20%`**, FPR `0.00%`.
   - `revenue`: **Precision `86.67%`**, **Recall `38.24%`**, **F1 `53.06%`** (kết hợp quy tắc giảm bền vững 7 ngày).
   - `facebook_conversion`: **Precision `75.00%`**, **Recall `75.00%`**; `facebook_roas`: **Precision `68.00%`**, **Recall `60.71%`**; `margin`: **Precision `50.00%`**, **Recall `75.00%`**.
   - `stockout_risk` *(luật tồn kho)*: **Precision `18.75%`**, **Recall `25.00%`**, được gắn nhãn giới hạn công khai trên `/models/quality` và màn hình cảnh báo.
3. **Truy vấn Ngôn ngữ tự nhiên (`artifacts/query_benchmark.json`):**
   - **46/46 (`100%`)** bộ câu hỏi tiếng Anh, tiếng Việt và câu hỏi từ chối an toàn vượt qua 100% kiểm tra về intent, thực thi, số học, bộ lọc, loại biểu đồ và trích dẫn nguồn.
   - Độ trễ trung vị (Local Rules): **`1,432.2 ms`** (**p95 = `3,268.6 ms`**). *(Đường Gemini/OpenAI tùy chọn không nằm trong benchmark offline này.)*
4. **Hồi cứu kịch bản (`artifacts/scenario_backtest.json`):**
   - Tái lập theo tuần số lượng bán `P001` theo giá: **WAPE `23.99%`** so với baseline `24.24%`.
   - Tái lập chi tiêu Facebook Ads hàng tuần: **WAPE `33.00%`** so với baseline `25.44%` *(được cảnh báo công khai là độ lỗi lớn hơn baseline)*.

---

## 5. Giá trị kinh doanh (Mục tiêu kỳ vọng — Cần kiểm chứng thực địa)

1. **Rút ngắn thời gian báo cáo & điều tra bất thường:** Chuyển câu hỏi tiếng Việt/Anh thành báo cáo số liệu kèm nguồn và liên kết điều tra 1 chạm từ Cảnh báo -> `/ask?q=...` thay vì ghép file Excel thủ công.
2. **Minh bạch hóa rủi ro trước khi chiết khấu hoặc bơm ngân sách:** Giả định co giãn (`P001`: `-1.1`, `AirPure S`: `-1.4`, người dùng chỉnh được) và tồn kho vật lý giúp lãnh đạo thử trước phương án 0%/5%/10% trên không gian 3D trước khi ra quyết định.
3. **Liên kết khép kín & Nhật ký kiểm toán chống sửa xóa:** Chấp thuận (`accepted`) hoặc từ chối (`rejected`) kịch bản gắn với `recommendation_id` sẽ ghi đồng thời vào bảng `audit_events` có trigger bảo vệ dữ liệu — tuyệt đối không tự động thay giá bán hay đặt hàng ERP.

---

## 6. Những giới hạn cần nói rõ trước Ban Giám Khảo

1. **Dữ liệu tổng hợp (Synthetic Data):** Kết quả hiệu năng trên `f32e87e3a5744333ff98d3bf` phản ánh dữ liệu mô phỏng phục vụ thi đấu; cần thu thập dữ liệu thật tại SME thí điểm và đánh giá lại trên kỳ chưa từng nhìn thấy trước khi dùng cho quyết định vốn thực tế.
2. **Mô hình giao dịch đơn dòng:** Chưa mô hình hóa giỏ hàng nhiều mặt hàng cùng lúc (cross-sell/market basket), tỷ lệ hoàn trả đơn (refunds) sau bán hay chi phí vận hành cố định ngoài giá vốn COGS.
3. **Ước lượng có điều kiện vs. Quan hệ nhân quả:** Các phân rã đóng góp và giả lập kịch bản mô tả sự thay đổi có điều kiện dựa trên giả định danh mục chứ chưa thay thế được thử nghiệm ngẫu nhiên có đối chứng (A/B Test).
4. **Độ nhạy cảnh báo tồn kho & bất thường doanh thu:** Recall của `revenue` (`38.24%`) và `stockout_risk` (`25.00%`) còn khiêm tốn trên các pha chuyển dịch đột ngột; hệ thống công khai các giới hạn này ngay trong giao diện thay vì che giấu.

---

<div align="center">
  <b>DecisionPilot AI — Minh bạch · Chính xác · Có trách nhiệm</b>
</div>
