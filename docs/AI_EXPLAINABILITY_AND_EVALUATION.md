# GIẢI TRÌNH KIẾN TRÚC AI, ĐÁNH GIÁ MÔ HÌNH & HỎI ĐÁP BAN GIÁM KHẢO (AI EXPLAINABILITY & JUDGES Q&A)

**Dự án:** DecisionPilot AI  
**Cuộc thi:** AI for Business Innovation 2026 — LIKELION  
**Hạng mục:** 5. Data & Decision Intelligence  
**Phiên bản hiện tại:** Platform MVP `v1.0.0` · Model Bundle `dp-1.1` · Dataset `f32e87e3a5744333ff98d3bf`

---

## 1. AI thực sự được sử dụng ở đâu trong DecisionPilot AI?

DecisionPilot AI áp dụng nguyên tắc **"Right Tool for the Right Job"** — không dùng LLM để tính nhẩm số liệu tài chính, mà phân tách rành mạch 4 lớp trí tuệ nhân tạo & toán kinh tế:

```text
┌───────────────────────────────────────────────────────────────────────────────────┐
│                      TỔNG THỂ HỆ THỐNG TRÍ TUỆ NHÂN TẠO                           │
├─────────────────────────────────┬─────────────────────────────────────────────────┤
│ 1. Natural Language Analytics   │ LLM (Gemini 2.5 Flash / GPT-4.1-mini) hoặc      │
│    & Constrained Intent Routing │ Local Rule Fallback -> Pydantic Intent -> SQL   │
├─────────────────────────────────┼─────────────────────────────────────────────────┤
│ 2. Predictive Forecasting       │ Machine Learning (LightGBM 4.6.0) cạnh tranh    │
│    (7 ngày / 30 ngày)           │ cùng Baselines trên 17 đặc trưng theo chuỗi     │
├─────────────────────────────────┼─────────────────────────────────────────────────┤
│ 3. Anomaly Radar & Root Cause   │ Unsupervised ML (IsolationForest, 56d shifted)  │
│    (Đột biến, ROAS, Tồn kho)    │ + IQR + Robust Z-Score + Waterfall Decomposition │
├─────────────────────────────────┼─────────────────────────────────────────────────┤
│ 4. Scenario Simulator &         │ Động cơ toán kinh tế (Price Elasticity, Power  │
│    Human-in-the-Loop Governance │ Curve α=0.65, tồn kho từng ngày) + audit_events  │
└─────────────────────────────────┴─────────────────────────────────────────────────┘
```

1. **Hiểu ý định ngôn ngữ tự nhiên ([`ai_service/llm_orchestrator.py`](../ai_service/llm_orchestrator.py)):** Khi người dùng hỏi bằng tiếng Việt hoặc tiếng Anh, câu hỏi qua lớp kiểm tra chặn prompt injection/SQL (`BLOCKED`), sau đó được ánh xạ qua Google Gemini (`gemini-2.5-flash`), OpenAI (`gpt-4.1-mini`) hoặc bộ luật Regex nội bộ thành đối tượng Pydantic `Intent` (`extra="forbid"`). Mọi phép tính đều chạy bằng câu lệnh SQLAlchemy Core tham số hóa trên kết nối chỉ đọc (`read_connection`).
2. **Dự báo chuỗi thời gian ([`ai_service/forecasting.py`](../ai_service/forecasting.py), [`ai_service/features.py`](../ai_service/features.py)):** Mô hình `LGBMRegressor` sử dụng **17 đặc trưng theo thời điểm** (`lag_1..28`, `mean/std_7..28`, `growth_7`, `weekday`, `month`, `quarter`, `weekend`, `holiday`, `scale`) để dự báo chân trời `7` và `30` ngày, cạnh tranh trực tiếp với `moving_average` và `seasonal_naive`.
3. **Phát hiện bất thường & Bóc tách căn nguyên ([`ai_service/anomaly.py`](../ai_service/anomaly.py), [`ai_service/root_cause.py`](../ai_service/root_cause.py)):** Dùng cửa sổ trượt **56 ngày lùi trước 7 ngày (`shift(7).rolling(56, min_periods=28)`)** kết hợp `IsolationForest(n_estimators=120, contamination=0.065)`, IQR, robust Z-score, cảnh báo suy giảm doanh thu 7 ngày liên tiếp và luật rủi ro đứt hàng (`stockout_risk`), kèm phân rã đóng góp cộng tính theo danh mục, SKU, khu vực và kênh bán.
4. **Mô phỏng kịch bản ([`ai_service/scenario.py`](../ai_service/scenario.py)):** Tính độ nhạy theo công thức phần trăm tuyến tính $Q = Q_0 \cdot \max(0, 1 + e \cdot (P_{\text{new}}/P_0 - 1))$ bị chặn bởi tồn kho, hàm phản ứng ngân sách tiếp thị dạng lũy thừa $(1 + \Delta S)^\alpha$ (mặc định $\alpha = 0.65$), và cân bằng tồn kho từng ngày theo `lead_time_days` / `reorder_point`.

---

## 2. Vì sao chọn từng mô hình cụ thể?

| Thành phần | Mô hình lựa chọn | Lý do kỹ thuật & Thực tế SME | Phương án đã cân nhắc |
| :--- | :--- | :--- | :--- |
| **Dự báo nhu cầu** | **LightGBM + Baselines (2% Gate)** | Dữ liệu SME có cả chuỗi tổng ổn định lẫn SKU biến động mạnh. Mô hình cây GBDT chạy nhẹ trên CPU với 17 đặc trưng có chia tỷ lệ `scale`; ngưỡng `>2%` ngăn việc dùng mô hình phức tạp khi Moving Average đã tốt hơn. | ARIMA riêng lẻ khó chia sẻ tín hiệu chéo giữa 50 SKUs; mạng Deep Learning tốn GPU và dễ overfitting trên 730 ngày dữ liệu. |
| **Phát hiện bất thường** | **56d Shifted Isolation Forest + Robust Z/IQR** | Dịch lùi 7 ngày giúp bản thân sự cố đang diễn ra không làm nhiễu đường cơ sở. Kết hợp học không giám sát + kiểm tra tương quan chi phí/ROAS + quy tắc tồn kho. | Ngưỡng tĩnh toàn cục bỏ sót suy giảm theo tuần hoặc nhiễu mùa vụ cuối tuần. |
| **Phân tích câu hỏi** | **Constrained Intent Extraction** | Ép đầu ra vào Pydantic `Intent` khép kín và thực thi câu lệnh SQLAlchemy Core cố định; loại bỏ nguy cơ SQL injection và LLM tự bịa phép tính. | Free-form Text-to-SQL dễ sinh truy vấn sai bảng, lọt DDL/DML hoặc sai định nghĩa KPI. |
| **Giả lập kịch bản** | **Econometric & Inventory Calculators** | Minh bạch giả định ($e \pm 0.30$, $\alpha \pm 0.15$) để chủ doanh nghiệp kiểm chứng trực tiếp trước khi phê duyệt. | Hộp đen RL/neural simulator khó giải trình trước kiểm toán và đội vận hành SME. |

---

## 3. Dữ liệu huấn luyện & Phân chia chống rò rỉ (`f32e87e3a5744333ff98d3bf`)

- **Dữ liệu chuẩn hóa (730 ngày, 01/10/2024 – 30/09/2026):**
  - `sales_transactions`: **50.000** giao dịch (kênh `Online`, `Retail`, `B2B`).
  - `products`: **50** mã SKU (`34` sản phẩm vật lý + `16` gói dịch vụ/SaaS thuộc 6 danh mục).
  - `customers`: **10.000** khách hàng phân bổ trên **4 khu vực** (`HCMC`, `Hanoi`, `Da Nang`, `Can Tho`) và 4 phân khúc (`Returning`, `Individual`, `Corporate`, `Price-sensitive`).
  - `marketing_campaigns`: **2.920** bản ghi ngày $\times$ kênh (`Facebook Ads`, `Google Ads`, `TikTok Ads`, `Email`).
  - `inventory_daily`: **24.820** dòng sổ kho vật lý mỗi ngày ($34 \times 730$).
- **Phân chia theo thời gian (Chronological Split 70 / 15 / 15):**
  - **Train:** `2024-10-01` $\rightarrow$ `2026-02-22`
  - **Validation:** `2026-02-23` $\rightarrow$ `2026-06-12` *(tách riêng đoạn chọn mô hình và đoạn hiệu chuẩn khoảng tin cậy khi đủ độ dài lịch sử)*
  - **Test (Holdout):** `2026-06-13` $\rightarrow$ `2026-09-30`

---

## 4. Cổng kiểm soát Baseline (>2% Rule Gate)

Tại từng lát cắt `(target, scope, horizon)`, thuật toán kiểm định trên tập Validation trước khi công bố:

$$\text{Chọn LightGBM} \iff \text{MAE}_{\text{val}}(\text{LightGBM}) < 0.98 \times \min\big(\text{MAE}_{\text{val}}(\text{Moving Average}),\; \text{MAE}_{\text{val}}(\text{Seasonal Naive})\big)$$

- **Thực nghiệm minh chứng sự trung thực:** Với tổng doanh thu toàn doanh nghiệp (`revenue | all`, 30d), `Moving Average` chiến thắng ở vòng Validation và được giữ lại với **Test WAPE `24.14%`** (7d là `21.84%`). Ngược lại, ở lát cắt SKU chủ lực `demand | sku:P001` (SmartDesk Mini), biến động theo tuần và ngày lễ giúp **LightGBM** vượt qua cổng 2% với **Test MAE `2.68` đơn vị**, **Test WAPE `41.87%`**, và độ phủ thực tế đạt **`92.86%`**.

---

## 5. Độ tin cậy của Dự báo, Bất thường & Copilot

1. **Khoảng tin cậy 90% hiệu chuẩn thực nghiệm:** Độ rộng dải dự báo được tính trực tiếp từ sai số tuyệt đối trên đoạn Validation tách riêng cho chân trời ngắn (`1–7 ngày`) và dài (`8–30 ngày`). Trên tập Test 30 ngày, độ phủ đo được là **`92.86%`** cho `demand | sku:P001` và **`83.81%`** cho `revenue | all` (cảnh báo minh bạch ngay trên UI khi thực đo thấp hơn 90% danh định hoặc khi có đứt hàng kiểm duyệt nhu cầu).
2. **Đánh giá phát hiện bất thường (`artifacts/MODEL_EVALUATION.md`):**
   - `facebook_spend`: Precision **`100.00%`**, Recall **`82.14%`**, F1 **`90.20%`**, FPR **`0.00%`**.
   - `revenue`: Precision **`86.67%`**, Recall **`38.24%`**, F1 **`53.06%`**, FPR **`2.63%`**.
   - `facebook_conversion`: F1 **`75.00%`** | `facebook_roas`: F1 **`64.15%`** | `margin`: F1 **`60.00%`**.
3. **Đánh giá Natural Language Copilot (`artifacts/query_benchmark.json`):** Đạt **`46/46 (100%)`** ở toàn bộ các tiêu chí (`intent`, `execution`, `filters`, `chart`, `numerical`, `grounded`) gồm tiếng Anh, tiếng Việt và câu hỏi từ chối tiêm mã độc; độ trễ **trung vị `1.432 ms` (`~1.43s`)**, **p95 `3.269 ms`**.
4. **Đánh giá Replay Kịch bản 7 ngày (`artifacts/scenario_backtest.json`):** Nhu cầu P001 theo tuần cải thiện từ `24.24%` WAPE (Baseline) xuống **`23.99%` WAPE** (Scenario); kiểm tra cạn kho `P003` khớp **`15/15` tuần** (`2/2` tuần đứt hàng).

---

## 6. Simulator dựa trên giả định nào?

1. **Độ co giãn giá (`e ∈ [-5, 0]`):** Lấy từ danh mục SKU (ví dụ `SmartDesk Mini` P001 có `e = -1.1`, `AirPure S` P002 có `e = -1.4`, `FocusCam Pro` P003 có `e = -0.8`) hoặc do quản lý nhập, áp dụng biến động tuyến tính theo phần trăm giá bán thực hiện 90 ngày gần nhất và kiểm tra biên độ nhạy $e \pm 0.30$.
2. **Giới hạn tồn kho vật lý:** Lượng bán thực hiện bị chặn ở mức `current_stock` trong kịch bản giá (`risk = demand - sold`), và mô phỏng cân bằng kho từng ngày theo `arrival_day` cùng `reorder_point` trong kịch bản tồn kho.
3. **Suy giảm lợi suất biên quảng cáo:** Hàm lũy thừa $(1 + \Delta \text{Spend})^\alpha$ với $\alpha \in [0.20, 0.95]$ (mặc định `0.65`, kiểm tra nhạy $\alpha \pm 0.15$) trên cơ sở 28 ngày lịch sử gần nhất; phản ánh phân bổ quan sát được chứ không thay thế thử nghiệm A/B nhân quả.

---

## 7. Những giới hạn công khai trước Ban Giám Khảo

1. **Dữ liệu tổng hợp có kiểm soát:** Dùng bộ dữ liệu synthetic chuẩn hóa `f32e87e3a5744333ff98d3bf` (50.000 dòng) để kiểm chứng công thức kế toán, rò rỉ dữ liệu và logic mô hình; triển khai thực tế cần nhập snapshot mới và chạy huấn luyện lại (`scripts/train.py`).
2. **Đơn hàng một dòng & Kiểm duyệt đứt hàng:** Mỗi bản ghi `sales_transactions` ứng với một đơn hàng/mặt hàng đơn lẻ; khi tồn kho về 0 (`closing_stock = 0`), doanh số bán quan sát bị chặn bởi tồn kho nên nhu cầu thực tế có thể cao hơn số bán.
3. **Tương quan vs. Nhân quả:** Phân rã đóng góp giải thích 100% chênh lệch quan sát giữa các chiều dữ liệu, nhưng không chứng minh quan hệ nhân quả thử nghiệm.
4. **Human-in-the-Loop bắt buộc:** Chấp thuận khuyến nghị hoặc kịch bản chỉ ghi nhật ký quản trị vào `audit_events` (`accepted` / `rejected`), tuyệt đối không tự động sửa giá trên sàn hay tự xuất lệnh đặt hàng/chuyển tiền.

---

<div align="center">
  <b>DecisionPilot AI — Minh bạch · Chính xác · Có trách nhiệm</b>
</div>
