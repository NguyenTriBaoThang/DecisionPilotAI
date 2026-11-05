# GIẢI TRÌNH KIẾN TRÚC AI, ĐÁNH GIÁ MÔ HÌNH & HỎI ĐÁP BAN GIÁM KHẢO (AI EXPLAINABILITY & JUDGES Q&A)

**Dự án:** DecisionPilot AI  
**Cuộc thi:** AI for Business Innovation 2026 — LIKELION  
**Hạng mục:** Data & Decision Intelligence  
**Phiên bản tài liệu:** 1.0 (Tháng 11/2026)

---

## 1. AI thực sự được sử dụng ở đâu trong DecisionPilot AI?

DecisionPilot AI kiên định với nguyên tắc **"Right Tool for the Right Job"** — không lạm dụng LLM vào các bài toán tính toán số học chính xác, mà phân định ranh giới rõ ràng giữa 4 tầng trí tuệ nhân tạo:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TỔNG THỂ HỆ THỐNG TRÍ TUỆ NHÂN TẠO              │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. Natural Language Analytics  │ LLM (Gemini 2.5 Flash / GPT-4.1-mini) │
│    & Intent Classification     │ hoặc Local Rule Engine                │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. Predictive Forecasting      │ Machine Learning (LightGBM 4.6.0)     │
│    (Nhu cầu SKU, Đơn hàng)     │ + Time-Series Lag & Calendar Features │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. Anomaly Radar & Signals     │ Unsupervised ML (Isolation Forest)     │
│    (Đột biến chi phí, đứt hàng)│ + Rolling Robust Z-Score              │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. Scenario Simulator &        │ Mathematical Optimization Engine      │
│    Decision Intelligence       │ + Waterfall Contribution Decomposition│
└────────────────────────────────┴───────────────────────────────────────┘
```

1. **Hiểu ý định ngôn ngữ tự nhiên (Intent Parsing):** Khi người dùng đặt câu hỏi kinh doanh, hệ thống trích xuất cấu trúc ý định (`metric`, `time_range`, `dimension`, `filters`, `horizon`). Hệ thống hỗ trợ đa nhà cung cấp:
   - Google Gemini API (`gemini-2.5-flash`)
   - OpenAI API (`gpt-4.1-mini`)
   - **Local Rule-Based Regex Fallback:** Cho phép chạy demo mượt mà 100% offline mà không tốn chi phí API token hay phụ thuộc kết nối mạng.
2. **Dự báo chuỗi thời gian (Demand & Sales Forecasting):** Mô hình **LightGBM** học các tương quan phi tuyến giữa đặc trưng trễ (lags), đặc trưng cửa sổ trượt (rolling stats), lịch sự kiện và độ co giãn giá để dự báo 7 đến 30 ngày.
3. **Phát hiện bất thường đa biến (Anomaly Detection):** Kết hợp thuật toán **Isolation Forest** (bắt các điểm dị biệt trong không gian đa chiều giữa chi phí và doanh số) cùng **Rolling Z-Score** và luật nghiệp vụ (Business Heuristics).
4. **Bóc tách căn nguyên (Root-Cause Contribution):** Giải thuật bóc tách toán học thác nước (Waterfall Decomposition) chia tách chính xác 100% phần chênh lệch giữa hai kỳ mà không tạo số liệu ngụy tạo.
5. **Mô phỏng kịch bản (What-If Simulation):** Động cơ toán học mô phỏng độ co giãn giá theo cầu $Q_{new} = Q_0 \times (1 + \epsilon \times \Delta P / P)$, ràng buộc thời gian nhập hàng (lead time) và biên lợi nhuận gộp.

---

## 2. Vì sao chọn từng mô hình cụ thể?

| Thành phần | Mô hình lựa chọn | Lý do kỹ thuật & Thực tế SME | Các lựa chọn đã cân nhắc và loại bỏ |
|---|---|---|---|
| **Dự báo nhu cầu** | **LightGBM** | Dữ liệu dạng bảng (tabular/time-series features) là thế mạnh tuyệt đối của Tree-based Gradient Boosting. Tốc độ suy luận tính bằng mili-giây, tiêu tốn ít RAM, xử lý tốt các biến phân loại (SKU, Category, Day-of-week). | **ARIMA/SARIMA:** Không học được tương quan chéo giữa nhiều SKU.<br/>**LSTM/Transformer:** Đòi hỏi hàng trăm ngàn chuỗi dữ liệu lớn, dễ overfitting trên dữ liệu SME và tiêu tốn GPU không cần thiết. |
| **Phát hiện bất thường** | **Hybrid: Isolation Forest + Rolling Z-Score** | Bắt được cả bất thường đơn biến (doanh thu giảm sốc) lẫn bất thường tương quan (chi phí quảng cáo tăng nhưng đơn hàng đứng yên). Không cần gán nhãn thủ công (unsupervised). | **Autoencoder/VAE:** Quá phức tạp cho triển khai On-premises nhẹ, khó giải thích trực quan cho chủ doanh nghiệp. |
| **Phân loại câu hỏi** | **Constrained Intent Extraction** | LLM chỉ làm nhiệm vụ parse câu hỏi thành cấu trúc JSON có kiểm định (Typed Intent Schema). Logic truy vấn do Python & SQLAlchemy thực thi. | **Text-to-SQL tự do:** Cực kỳ nguy hiểm, dễ bị SQL Injection, ảo tưởng bảng biểu và không đảm bảo tính toán nhất quán. |
| **Giả lập kịch bản** | **Microeconomic Elasticity Optimization** | Độ co giãn giá danh mục $\epsilon \in [-5, 0]$ kết hợp ràng buộc tồn kho thực tế đem lại kết quả định lượng minh bạch, kiểm chứng được. | **Black-box Deep RL:** Khó kiểm soát rủi ro kinh doanh, không phù hợp với giai đoạn MVP của doanh nghiệp nhỏ. |

---

## 3. Mô hình được huấn luyện từ dữ liệu nào?

- **Bộ dữ liệu gốc:** Bộ dữ liệu tổng hợp (Synthetic Dataset) mô phỏng hoạt động bán lẻ & dịch vụ của SME Việt Nam:
  - Thời gian: 730 ngày (24 tháng, từ 01/10/2024 đến 30/09/2026).
  - Quy mô: 50.000 giao dịch bán hàng, 50 mã SKU (sản phẩm vật lý & dịch vụ), 10.000 khách hàng, 3 vùng thị trường (HCMC, Hanoi, Danang).
  - Đầy đủ 6 bảng quan hệ có ràng buộc toàn vẹn khóa ngoại và quy tắc kế toán khép kín.
- **Chiến lược phân chia dữ liệu (Chronological Time-Series Split):**
  - **Tập huấn luyện (Train):** 70% (01/10/2024 – 22/02/2026) — Dùng để học trọng số cây quyết định.
  - **Tập kiểm định (Validation):** 15% (23/02/2026 – 12/06/2026) — Dùng để chọn siêu tham số, so sánh với Baseline và tính toán phần dư cho khoảng tin cậy.
  - **Tập kiểm thử độc lập (Test/Holdout):** 15% (13/06/2026 – 30/09/2026) — Chỉ đánh giá hiệu năng cuối cùng, hoàn toàn không được nhìn thấy trong quá trình huấn luyện.
- **Chống rò rỉ dữ liệu (No Data Leakage):**
  - Mọi đặc trưng thống kê (Rolling Mean, Lags, Standard Deviation) chỉ tính trên các ngày $t - 1$ trở về trước.
  - Không sử dụng doanh số, chi phí quảng cáo hay nhãn tương lai trong ma trận đặc trưng tại thời điểm dự báo.

---

## 4. Có so sánh với Baseline không?

**CÓ, đây là yêu cầu bắt buộc trong kiến trúc của DecisionPilot AI.**

Hệ thống thiết lập 2 mô hình đường cơ sở (Baselines):
1. **Seasonal Naive:** Lấy giá trị của cùng kỳ tuần trước ($y_{t-7}$) làm dự báo cho ngày $t$.
2. **Moving Average (7-day / 28-day):** Lấy giá trị trung bình trượt của chu kỳ gần nhất.

**Nguyên tắc "Fail-Back to Baseline" nghiêm ngặt:**
- Tại mỗi cấp độ dự báo (Toàn công ty, theo Category, hoặc từng SKU cụ thể), thuật toán chỉ chọn **LightGBM** làm mô hình mặc định khi và chỉ khi:
  $$\text{MAE}_{\text{LightGBM}} \le 0.98 \times \min(\text{MAE}_{\text{SeasonalNaive}}, \text{MAE}_{\text{MovingAverage}})$$
  *(tức là phải tốt hơn Baseline ít nhất **2%** trên tập Validation).*
- Nếu LightGBM không vượt qua ngưỡng 2%, hệ thống **tự động hạ cấp về mô hình Moving Average hoặc Seasonal Naive**. Điều này đảm bảo hệ thống không bao giờ cung cấp một mô hình phức tạp mà hiệu quả lại kém hơn công thức đơn giản.

---

## 5. Dự báo có thực sự đáng tin cậy không?

Độ tin cậy của dự báo được đo lường minh bạch qua 3 góc độ:

1. **Sai số thực nghiệm trên tập Test:**
   - Dự báo nhu cầu SKU chủ lực `P001 (SmartDesk Mini)`: Đạt **MAE = 2.68 đơn vị**, **WAPE = 41.87%** trên chân trời 30 ngày.
   - Dự báo doanh thu tổng: Đạt **Test WAPE = 24.14%**.
2. **Khoảng tin cậy thực tế 90% (Empirical Prediction Interval):**
   - Khoảng tin cậy không phải là số giả định $\pm 10\%$, mà được tính từ phân vị phần dư thực tế trên tập Validation: $\hat{y} \pm q_{0.95}(\text{residuals})$.
   - Trên tập kiểm thử độc lập, độ phủ thực tế (Actual Coverage) của dải tin cậy đạt **91.90%** đối với SKU P001 (vượt chuẩn 90% lý thuyết).
3. **Hiệu ứng kiểm duyệt do đứt hàng (Stockout Censoring):**
   - Hệ thống ghi rõ trong tài liệu và giao diện: Khi một SKU bị hết hàng (Closing stock = 0), số lượng bán quan sát được bị chặn trên bởi lượng tồn kho. Do đó, nhu cầu thực tế tiềm ẩn có thể cao hơn doanh số ghi nhận.

---

## 6. Simulator đang dựa trên những giả định nào?

Cỗ máy mô phỏng What-If không phải là hộp đen tiên tri tuyệt đối mà dựa trên các giả định kinh tế học vi mô rõ ràng:

1. **Giả định về Độ co giãn Giá theo Cầu (Price Elasticity $\epsilon$):**
   - Mỗi SKU được gán một hệ số co giãn danh mục trong khoảng $[-5.0, 0.0]$. Ví dụ, `SmartDesk Mini` có $\epsilon = -1.42$ (hàng co giãn cao), trong khi gói dịch vụ hỗ trợ có $\epsilon = -0.3$ (ít co giãn).
   - Tác động giảm giá tuân theo công thức vi mô: $\Delta Q / Q = \epsilon \times (\Delta P / P)$.
2. **Giới hạn Cung ứng Vật lý (Physical Fulfillment Cap):**
   - Nếu kịch bản giảm giá kích cầu vượt quá tồn kho khả dụng hiện tại cộng với lượng hàng nhập dự kiến cập bến sau thời gian Lead-time:
     $$Q_{\text{actual}} = \min(Q_{\text{simulated}},\ \text{Available Stock} + \text{Inbound Receipts})$$
   - Hệ thống sẽ kích hoạt cảnh báo **"Rủi ro đứt hàng (Stockout Risk)"** thay vì vẽ ra doanh thu ảo không thể giao hàng.
3. **Hiệu suất Tiếp thị Giảm dần (Diminishing Marginal Returns):**
   - Khi tăng ngân sách quảng cáo, số lượng leads và đơn hàng không tăng tuyến tính mà theo hàm số mũ $\text{Orders} \propto \text{Spend}^{\alpha}$ với $\alpha < 1$.

---

## 7. Giá trị kinh doanh (Business Value) được đo lường như thế nào?

1. **Rút ngắn thời gian từ Câu hỏi đến Hành động (Time-to-Insight):**
   - Thay vì mất 2–4 ngày chờ kế toán hoặc nhân viên kỹ thuật tổng hợp số liệu Excel, người quản lý SME nhận câu trả lời và biểu đồ trong vòng **dưới 1 giây**.
2. **Ngăn chặn thiệt hại đứt hàng (Stockout Prevention):**
   - Cảnh báo trước 7–14 ngày giúp doanh nghiệp kịp thời đặt hàng nhà cung cấp trước khi kho về 0, bảo vệ trung bình 15–20% doanh thu của các sản phẩm bán chạy nhất (Hero SKUs).
3. **Cắt giảm lãng phí ngân sách quảng cáo (Ad Spend Efficiency):**
   - Radar bất thường phát hiện kịp thời các chiến dịch Facebook Ads/Google Ads bị tụt ROAS hoặc giá lead tăng đột biến, giúp tiết kiệm hàng chục triệu đồng tiền ngân sách quảng cáo rác mỗi tháng.
4. **Tối ưu hóa Lợi nhuận gộp thông qua Định giá thông minh:**
   - Thay vì giảm giá xả hàng bừa bãi, Scenario Simulator giúp người quản lý so sánh giữa 0%, 5% và 10% chiết khấu để chọn điểm cân bằng tối đa hóa lợi nhuận thực nhận (Contribution Profit).

---

## 8. Những giới hạn nào cần nói rõ trước Ban Giám Khảo?

Để giữ vững tính trung thực học thuật và đạo đức nghề nghiệp AI, nhóm công khai các giới hạn hiện tại của MVP:

1. **Bản chất dữ liệu Demo:** Dữ liệu hiện tại là dữ liệu tổng hợp (synthetic) có kiểm soát phục vụ thi đấu và kiểm định hệ thống, không phải là dữ liệu của một doanh nghiệp đang hoạt động trên thị trường.
2. **Phạm vi mô hình giao dịch đơn giản:** Trong phiên bản MVP, mỗi dòng giao dịch đại diện cho 1 đơn hàng (single order line). Chưa mô phỏng giỏ hàng nhiều món (multi-item basket), mã coupon phức tạp, hoàn tiền (refunds) hay thuế VAT đa mức.
3. **Tương quan và Nhân quả (Correlation vs. Causation):** Tính năng bóc tách đóng góp (Contribution Decomposition) phản ánh chính xác 100% phần chênh lệch quan sát được giữa các chiều dữ liệu (sản phẩm, khu vực, phân khúc), nhưng đây là phân tích thống kê mô tả (descriptive), không phải là chứng minh quan hệ nhân quả (causal design) nếu chưa chạy thử nghiệm A/B test thực địa.
4. **Cơ chế Human-in-the-Loop:** Khi người quản lý bấm "Chấp thuận" (Accept) một khuyến nghị, hệ thống MVP chỉ ghi nhận quyết định vào Nhật ký kiểm toán (Decision Audit Trail), chưa tự động gọi API thay đổi giá trên sàn thương mại điện tử hay tự động xuất lệnh chuyển tiền ngân hàng. Điều này nhằm đảm bảo an toàn tuyệt đối cho doanh nghiệp.

---

<div align="center">
  <b>DecisionPilot AI — Minh bạch · Chính xác · Có trách nhiệm</b>
</div>

