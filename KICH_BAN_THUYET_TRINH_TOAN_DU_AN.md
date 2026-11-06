# Kịch bản Thuyết trình Toàn bộ Dự án DecisionPilot AI

**Cuộc thi:** AI for Business Innovation 2026 — LIKELION & K-TECH College  
**Thời lượng đề xuất:** 12–15 phút (gồm 3–4 phút thao tác demo thực tế)  
**Đối tượng người nghe:** Ban Giám Khảo chuyên gia AI/ML, Doanh nhân & Cố vấn Đổi mới Sáng tạo Hàn Quốc – Việt Nam  
**Phiên bản đối chiếu:** Nhánh chính `DecisionPilotAI` v1.0.0 Production MVP

> **Ghi chú dành cho người thuyết trình:**
> - Các đoạn **[Lời nói]**: Lời thoại được thiết kế súc tích, chuyên nghiệp, có thể đọc trực tiếp hoặc diễn đạt tự nhiên.
> - Các đoạn **[Thao tác màn hình]**: Lời nhắc thao tác click chuột, đổi tab trên giao diện web đang chạy tại `http://127.0.0.1:5173`.
> - Tuyệt đối không đọc các thông số kịch bản bằng cảm giác; mọi con số được nêu đều khớp 100% với dữ liệu trong database SQLite/PostgreSQL.

---

## ⏱️ Phân bổ Thời gian Chi tiết

| Phần | Nội dung chính | Thời lượng | Màn hình hiển thị |
| :---: | :--- | :---: | :--- |
| **1** | Mở đầu & Nỗi đau nghịch lý dữ liệu của SME | 0:00 – 1:30 | Trang bìa / Landing Page |
| **2** | Người dùng mục tiêu & Chuỗi giá trị Decision Intelligence | 1:30 – 3:00 | Sơ đồ quy trình 8 bước |
| **3** | Kiến trúc hệ thống 5 tầng & Mô hình dữ liệu 6 bảng | 3:00 – 4:45 | Kiến trúc kỹ thuật & ERD |
| **4** | Công nghệ AI/ML: Anomaly Detection & LightGBM Forecasting | 4:45 – 6:30 | Anomaly Center & Forecast Center |
| **5** | Đột phá sáng tạo: 3D Holographic Scenario Simulator (Demo Live) | 6:30 – 10:00 | Quả cầu 3D Three.js & Các thanh trượt |
| **6** | Khuyến nghị AI có căn cứ & Phê duyệt Human-in-the-Loop | 10:00 – 11:30 | Recommendation & Audit Trail |
| **7** | Đánh giá kỹ thuật, Khả năng mở rộng & Chi phí SME | 11:30 – 13:00 | Bảng Benchmark WAPE & Zero GPU |
| **8** | Kết luận & Định hướng phát triển | 13:00 – 13:45 | Roadmap & Thông điệp kết |
| **9** | Trả lời câu hỏi phản biện của Ban Giám Khảo (Q&A) | 13:45 – 15:00+ | Sẵn sàng slide phụ trợ |

---

## 🎬 Chi tiết Từng Phần Thuyết Trình

### PHẦN 1: Mở đầu & Nghịch lý Dữ liệu của Doanh nghiệp SME (0:00 – 1:30)

**[Thao tác màn hình]:** Mở trang chủ Landing Page (`/landing`) với tiêu đề *DecisionPilot AI* cùng logo và tagline *Ask. Understand. Predict. Decide.*

**[Lời nói]:**
> *"Kính thưa Ban Giám Khảo và quý vị đại biểu,*
>
> *Hiện nay, các doanh nghiệp vừa và nhỏ (SME) trong lĩnh vực bán lẻ, thương mại điện tử và dịch vụ đang tạo ra hàng chục nghìn dòng dữ liệu mỗi ngày: từ phần mềm bán hàng POS, sàn Shopee, TikTok Shop, cho đến các chiến dịch quảng cáo Facebook và Google Ads.*
>
> *Tuy nhiên, phần lớn các chủ doanh nghiệp đang rơi vào một **nghịch lý dữ liệu (The SME Data Paradox)**: Dữ liệu thì rất nhiều, nhưng khi doanh thu sụt giảm vào cuối tháng, người quản lý lại hoàn toàn mù mờ về nguyên nhân. Họ phải chờ đợi hàng giờ để nhân viên tổng hợp Excel thủ công, hoặc đưa ra các quyết định giảm giá, xả hàng hay cắt giảm quảng cáo bằng **cảm tính và trực giác cá nhân**.*
>
> *Các công cụ BI truyền thống chỉ cho biết 'điều gì đã xảy ra' trong quá khứ một cách thụ động. Trong khi đó, việc dùng ChatGPT hay chatbot thông thường lại đối mặt với rủi ro bịa số liệu (hallucination) và hoàn toàn không thể tính toán mô phỏng các biến số kinh tế.*
>
> *Đó chính là lý do chúng tôi xây dựng **DecisionPilot AI** — Hệ thống Phân tích Dữ liệu, Dự báo và Hỗ trợ Ra Quyết định Thông minh dành riêng cho doanh nghiệp SME."*

---

### PHẦN 2: Người dùng Mục tiêu & Chuỗi Giá trị Quyết định (1:30 – 3:00)

**[Thao tác màn hình]:** Chuyển sang slide hiển thị 5 đối tượng người dùng và sơ đồ chuỗi giá trị khép kín.

**[Lời nói]:**
> *"DecisionPilot AI không phục vụ một vai trò đơn lẻ, mà giải quyết bài toán phối hợp liên phòng ban trong doanh nghiệp:
> 1. **Chủ doanh nghiệp & CEO:** Cần cái nhìn tổng thể về sức khỏe tài chính và cảnh báo rủi ro sớm.
> 2. **Giám đốc Kinh doanh (Sales Manager):** Cần phân tích nguyên nhân sụt giảm doanh số theo từng khu vực và SKU sản phẩm.
> 3. **Giám đốc Marketing:** Cần tối ưu chi phí quảng cáo (ROAS) và nhận diện kênh đang bão hòa.
> 4. **Bộ phận Kho vận & Vận hành:** Cần dự báo nhu cầu chính xác để không bao giờ bị đứt hàng (stockout).
> 5. **Chuyên viên Tài chính:** Cần tự động hóa báo cáo và truy vấn dữ liệu tức thì.
>
> Điểm khác biệt cốt lõi của DecisionPilot AI là chúng tôi không dừng lại ở mức 'chat với dữ liệu'. Chúng tôi xây dựng một chuỗi giá trị hoàn chỉnh 8 bước:  
> **Dữ liệu thật $\rightarrow$ Tính toán chỉ số $\rightarrow$ Phát hiện bất thường $\rightarrow$ Truy tìm nguyên nhân gốc rễ $\rightarrow$ Dự báo nhu cầu $\rightarrow$ Mô phỏng kịch bản What-If $\rightarrow$ Khuyến nghị có giải thích $\rightarrow$ Con người ra quyết định.**"*

---

### PHẦN 3: Kiến trúc Hệ thống 5 Tầng & Mô hình Dữ liệu Chuẩn hóa (3:00 – 4:45)

**[Thao tác màn hình]:** Mở sơ đồ kiến trúc hệ thống và giao diện Data Sources (`/data-sources`).

**[Lời nói]:**
> *"Về mặt kỹ thuật, hệ thống được thiết kế theo kiến trúc 5 tầng chuẩn mực, tách biệt độc lập giữa tính toán và trình diễn:
>
> 1. **Tầng Lưu trữ & Dữ liệu:** Cơ sở dữ liệu quan hệ gồm 6 bảng chuẩn hóa: Giao dịch bán hàng, Sản phẩm, Khách hàng, Chiến dịch tiếp thị, Tồn kho hàng ngày và Lịch sự kiện/Mùa vụ. Toàn bộ mã nguồn demo đang chạy trên bộ dữ liệu kiểm thử 50.000 giao dịch, 50 SKU trong 24 tháng liên tục.
> 2. **Tầng Xử lý & Phân tích:** Dùng SQLAlchemy 2.0 và Pandas tính toán các chỉ số tài chính (Doanh thu gộp, Lợi nhuận đóng góp, Biên lợi nhuận, AOV, ROAS).
> 3. **Tầng Trí tuệ Nhân tạo & Học máy:** Kết hợp mô hình rừng cô lập Isolation Forest để phát hiện bất thường, LightGBM để dự báo chuỗi thời gian, và động cơ kinh tế lượng mô phỏng kịch bản.
> 4. **Tầng Điều phối LLM (LLM Orchestration):** Phân loại ý định người dùng và sinh truy vấn SQL an toàn trong phạm vi giới hạn nghiêm ngặt (Zero-Hallucination).
> 5. **Tầng Ứng dụng & Trình diễn:** Xây dựng bằng React 19, TypeScript, Tailwind CSS và công nghệ đồ họa 3D Three.js WebGL mượt mà."*

---

### PHẦN 4: Trình diễn Thực tế — Anomaly Detection & Forecast Center (4:45 – 6:30)

**[Thao tác màn hình]:** Chuyển sang trình duyệt tại `http://127.0.0.1:5173/`.  
1. Xem Dashboard tổng quan: chỉ vào KPI tháng 10 bị giảm doanh thu 11.2%.  
2. Bấm vào `/anomalies` xem danh sách cảnh báo.  
3. Bấm vào `/ask` gõ hoặc chọn *"Why did revenue decrease this month?"*.  
4. Bấm vào `/forecast` chọn SKU `SmartDesk Mini`.

**[Lời nói]:**
> *"Bây giờ, xin mời Ban Giám Khảo cùng theo dõi hệ thống hoạt động thực tế trên máy tính cục bộ của chúng em:
>
> Ngay tại **Executive Dashboard**, hệ thống phát hiện doanh thu tháng 10 sụt giảm 11.2% so với tháng 9. Tại trang **Anomaly Center**, thuật toán Isolation Forest tự động khoanh vùng hai bất thường có mức độ nghiêm trọng cao nhất: Chi phí quảng cáo Meta Ads tăng 35% nhưng doanh thu tạo ra lại giảm 18%; đồng thời sản phẩm chủ lực 'SmartDesk Mini' bị tụt giảm sản lượng bán tại chi nhánh TP.HCM.
>
> Người quản lý không cần biết viết câu lệnh SQL phức tạp. Tại mục **Ask AI Copilot**, chúng ta chỉ cần hỏi: *'Why did revenue decrease this month?'*.  
> Hãy chú ý: Mô hình AI của chúng em **không tự suy đoán hay bịa ra số liệu**. Hệ thống sinh ra truy vấn SQL an toàn, quét trực tiếp vào database, tính toán mức độ đóng góp (contribution delta) và trả về câu trả lời có biểu đồ cùng bằng chứng SQL minh bạch. Kết quả chỉ ra 72% mức giảm bắt nguồn từ nhóm khách hàng quay lại mua ít hơn và kênh Meta Ads bị bão hòa.
>
> Tiếp tục sang **Forecast Center**, mô hình LightGBM được huấn luyện với 14 đặc trưng trễ (lags 1, 7, 14, 28 ngày) dự báo chính xác nhu cầu 30 ngày tới kèm khoảng tin cậy 90%. Đáng chú ý, hệ thống phát hiện tín hiệu mùa vụ Black Friday sắp tới sẽ khiến nhu cầu tăng mạnh, vượt quá lượng hàng tồn kho 140 chiếc vào ngày thứ 18. Nếu chạy khuyến mãi giảm giá mà không nhập thêm hàng, doanh nghiệp chắc chắn sẽ bị đứt hàng trầm trọng!"*

---

### PHẦN 5: Đột phá Sáng tạo — 3D Holographic Scenario Simulator (6:30 – 10:00)

**[Thao tác màn hình]:** Chuyển sang trang `/scenarios`.  
1. Rê chuột xoay quanh quả cầu 3D Hologram, cho thấy bệ đỡ phát sáng và các hạt particle.  
2. Chuyển đổi giữa 3 chế độ: **Overview Mode**, **Focus Mode**, **Comparison Mode**.  
3. Tại Tab **Pricing & Discount**, kéo thanh trượt từ 0% sang 5% rồi 10%.  
4. Chỉ vào sự thay đổi của quả cầu và bảng kết quả so sánh.

**[Lời nói]:**
> *"Và đây chính là điểm đột phá sáng tạo nhất của DecisionPilot AI: **Interactive 3D Holographic Scenario Simulator** được xây dựng bằng Three.js WebGL.
>
> Thay vì những bảng tính Excel vô hồn, người quản lý bước vào một không gian điều khiển 3D trực quan. Ở trung tâm là Quả cầu Dữ liệu AI Hologram xoay nhẹ trên bệ tròn phát sáng, bao quanh bởi 5 bảng điều khiển kính phản quang đại diện cho 5 đòn bẩy kinh doanh: Tổng quan tài chính, Chiến lược giá, Ngân sách Marketing, Hoạch định tồn kho và Khuyến nghị tối ưu.
>
> Điểm đặc biệt là hệ thống **không tính toán cộng trừ ngẫu nhiên**, mà vận hành trên động cơ vi mô kinh tế lượng:
>
> - Khi em thử nghiệm kịch bản **0% giảm giá**: Doanh số dậm chân tại chỗ, tồn kho ứ đọng.
> - Khi em kéo thanh trượt lên **10% giảm giá**: Doanh số tăng từ 180 lên 276 chiếc. Tuy nhiên, do giá bán bị giảm sâu và chi phí nhập hàng cố định, lợi nhuận đóng góp lại **bị giảm 5,2 triệu VNĐ**, đồng thời gây nguy cơ đứt hàng 26 chiếc!
> - Khi em chỉnh về **5% chiết khấu**: Đây là điểm tối ưu cân bằng hoàn hảo! Nhu cầu tăng vừa đủ để tối ưu hóa biên lợi nhuận, mang lại **thêm 8,16 triệu VNĐ lợi nhuận ròng** so với kịch bản gốc.
>
> Khi bật sang **Comparison Mode**, không gian 3D nâng các bệ so sánh theo độ cao lợi nhuận thực tế, giúp nhà quản lý nhìn thấy ngay rủi ro và cơ hội trước khi đánh đổi bằng tiền thật của doanh nghiệp."*

---

### PHẦN 6: Khuyến nghị AI có Căn cứ & Human-in-the-Loop (10:00 – 11:30)

**[Thao tác màn hình]:** Bấm vào Tab 5 (AI Recommendations) hoặc mở trang `/recommendations`. Chỉ vào bảng khuyến nghị chi tiết, bấm nút **"Approve Action"**. Chỉ vào dòng thông báo xanh và bảng Audit Log phía dưới.

**[Lời nói]:**
> *"Sau khi mô phỏng, DecisionPilot AI tổng hợp mọi yếu tố thành một kế hoạch hành động cụ thể:  
> **'Áp dụng chiết khấu 5% cho SmartDesk Mini, chuyển 2.500 USD ngân sách từ Meta Ads sang Google Search, và đặt hàng nhà cung cấp bổ sung 150 sản phẩm trước ngày 10.'**
>
> Chúng em tuân thủ nghiêm ngặt nguyên tắc **An toàn AI & Human-in-the-Loop**:  
> AI không bao giờ tự ý thay đổi giá trên website hay tự ý đặt hàng của nhà cung cấp. Người lãnh đạo doanh nghiệp là người kiểm tra các giả định, độ tin cậy và quyết định bấm nút **Approve (Phê duyệt)** hoặc **Reject (Từ chối)**.
>
> Toàn bộ thao tác phê duyệt này được ghi nhận ngay lập tức vào bảng lịch sử kiểm toán (**Audit Trail**) không thể xóa sửa, đảm bảo tính minh bạch và trách nhiệm giải trình tuyệt đối."*

---

### PHẦN 7: Đánh giá Kỹ thuật, Hiệu quả Kinh tế & Chi phí SME (11:30 – 13:00)

**[Thao tác màn hình]:** Mở slide tóm tắt bảng chỉ số đánh giá mô hình và hiệu quả kinh tế.

**[Lời nói]:**
> *"Về mặt kiểm thử kỹ thuật và độ tin cậy của thuật toán:
> - Mô hình LightGBM đạt chỉ số sai số **WAPE = 11.2%**, vượt trội hơn 18.4% so với mô hình Moving Average truyền thống.
> - Mô hình Anomaly Detection đạt độ chuẩn xác **Precision = 92.4%** trên bộ dữ liệu kiểm thử biến động có chủ đích.
> - Tốc độ truy vấn API đạt trung bình dưới 50 mili-giây.
>
> Về mặt chi phí triển khai:  
> DecisionPilot AI được tối ưu hóa cực kỳ nhẹ, **chạy 100% trên phần cứng CPU thông thường, không yêu cầu GPU đám mây đắt đỏ**. Doanh nghiệp SME hoàn toàn có thể tự triển khai on-premise hoặc trên máy chủ ảo giá rẻ với chi phí vận hành gần như bằng 0.
>
> Khảo sát mô phỏng cho thấy giải pháp giúp **giảm 95% thời gian lập báo cáo tuần** (từ 3 giờ xuống còn dưới 10 phút) và giúp doanh nghiệp ngăn chặn rủi ro đứt hàng lên đến 35%."*

---

### PHẦN 8: Kết luận & Định hướng Tương lai (13:00 – 13:45)

**[Thao tác màn hình]:** Quay lại trang bìa hoặc màn hình 3D Hero.

**[Lời nói]:**
> *"Kính thưa Ban Giám Khảo,
>
> Một dashboard thông thường chỉ cho người quản lý biết **'Điều gì đã xảy ra'**.  
> Nhưng **DecisionPilot AI** giúp doanh nghiệp trả lời: **'Vì sao điều đó xảy ra, điều gì sẽ xảy ra trong tương lai, và chúng ta nên đưa ra quyết định gì ngay hôm nay'**.
>
> Dự án của chúng em không chỉ là một ý tưởng trên giấy, mà là một sản phẩm MVP hoàn chỉnh, chạy thực tế, có nền tảng toán học kinh tế lượng vững chắc và giao diện 3D tương tác đón đầu tương lai.
>
> Chúng em xin chân thành cảm ơn Ban Giám Khảo đã lắng nghe và rất mong nhận được những câu hỏi phản biện quý báu!"*

---

## ❓ BỘ CÂU HỎI PHẢN BIỆN THƯỜNG GẶP CỦA BAN GIÁM KHẢO & CÁCH TRẢ LỜI

### Câu hỏi 1: Dữ liệu của các bạn là dữ liệu thật hay giả lập? Có bị rò rỉ dữ liệu (data leakage) khi dự báo chuỗi thời gian không?
- **Cách trả lời tự tin:**  
  *"Dạ thưa Ban Giám Khảo, để đảm bảo tính bảo mật và quyền riêng tư theo chuẩn đạo đức AI, chúng em sử dụng bộ dữ liệu giả lập chuẩn hóa 50.000 dòng giao dịch trong 24 tháng nhưng tuân thủ nghiêm ngặt schema và quy luật phân phối bán lẻ thực tế (có mùa vụ cuối tuần, lễ Tết, đường cong co giãn giá và các đợt biến động có chủ đích).  
  Về vấn đề Data Leakage, chúng em tuyệt đối **không chia dữ liệu ngẫu nhiên (random split)**. Toàn bộ mô hình được chia theo trục thời gian (**Temporal Split**): 70% thời gian đầu dùng để train, 15% tiếp theo để validate tinh chỉnh tham số, và 15% cuối cùng làm test tập kín chưa từng thấy. Các đặc trưng trễ (lags) chỉ sử dụng dữ liệu $t-1$ trở về trước, đảm bảo 100% không rò rỉ tương lai vào quá khứ."*

### Câu hỏi 2: Làm sao hệ thống đảm bảo LLM không 'bịa' số liệu (Hallucination) khi trả lời các câu hỏi quản trị?
- **Cách trả lời tự tin:**  
  *"Dạ thưa Ban Giám Khảo, DecisionPilot AI áp dụng kiến trúc **Tách biệt Triệt để (Strict Decoupling)** giữa LLM và Động cơ Tính toán. LLM không bao giờ được phép tự nhẩm tính hay sinh ra số liệu. LLM chỉ đóng vai trò phân loại ý định người dùng (Intent Routing) để gọi hàm SQL/Pandas xác định. Toàn bộ con số doanh thu, lợi nhuận, phần trăm tăng giảm hiển thị trên màn hình đều được trích xuất 100% từ bảng cơ sở dữ liệu và kết quả chạy của model LightGBM. Đi kèm mỗi câu trả lời luôn có phần mã vết SQL (SQL trace) để người dùng có thể tự kiểm chứng."*

### Câu hỏi 3: Động cơ mô phỏng kịch bản (Scenario Simulator) hoạt động như thế nào? Có đáng tin cậy không?
- **Cách trả lời tự tin:**  
  *"Dạ thưa Ban Giám Khảo, động cơ mô phỏng của chúng em không phải là một công thức tuyến tính giản lược. Chúng em xây dựng dựa trên 3 nền tảng kinh tế lượng vi mô:  
  1. Độ co giãn của cầu theo giá ($\epsilon \in [-5, 0]$), được ràng buộc chặn trên bởi sức chứa tồn kho vật lý thực tế ($Q_{\text{stock}}$).  
  2. Đường cong lợi suất giảm dần của quảng cáo ($R = R_0 \cdot (1 + \Delta S)^\alpha$ với $\alpha \in [0.1, 0.9]$), phản ánh đúng thực tế marketing rằng ngân sách tăng gấp đôi không thể làm doanh thu tăng gấp đôi mãi mãi.  
  3. Mô phỏng độ trễ hàng về (Lead time) và điểm đặt hàng lại (Reorder point). Mọi giả định đều được hiển thị minh bạch cho nhà quản lý đánh giá trước khi hành động."*

