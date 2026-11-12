# DecisionPilot AI: thiết kế lại giao diện (UI redesign)

*Ngày: 12/11/2026. Hạn nộp cuộc thi AI for Business: 23:59 13/11/2026.*
*Mockup tham chiếu: [`2026-11-12-ui-redesign-mockups/`](2026-11-12-ui-redesign-mockups/) (mở bằng trình duyệt).*

## 1. Vì sao làm

App hiện có 11 mục menu trong 5 nhóm (Executive Dashboard, Anomaly Center, Forecast Center, Scenario Simulator, Recommendations & XAI, Audit & Governance, Enterprise Knowledge Map, …). Tên mục mang nặng thuật ngữ kỹ thuật, các trang dày chữ. Người dùng mục tiêu là **chủ shop nhỏ, không rành công nghệ (low-code / no-code)**, nên không biết bắt đầu từ đâu. Giám khảo cũng không thấy ngay sản phẩm làm gì.

Mục tiêu: **mở app ra trong 10 giây là hiểu sản phẩm làm gì và việc tiếp theo nên làm là gì.** Giao diện ít chữ, nhiều màu và hình minh hoạ có nghĩa.

Nghiệp vụ suy ra từ KiotViet, Sapo và các bài viết về dashboard cho chủ doanh nghiệp: chủ shop xem hằng ngày doanh thu so với kỳ trước, lãi, số đơn, món bán chạy và hàng sắp hết. Màn hình đầu chỉ nên có khoảng 5–7 con số, dùng màu để báo tốt/xấu.

## 2. Mục tiêu / Không làm / Thất bại nếu

**Mục tiêu**
- Menu chính đúng 4 mục theo vòng lặp quyết định đã có trong `CONTEXT.md`: **Hôm nay · Hỏi AI · Thử trước · Quyết định**. Thêm nhóm "Khác" gồm **Dữ liệu · Nâng cao**.
- Phong cách nhiều màu theo trang tham khảo https://www.hcmuebot.id.vn/ (xem §4).
- Luồng demo hiện có vẫn chạy được trên giao diện mới: Cảnh báo → Hỏi AI → Gợi ý → Thử trước → Chọn làm/Bỏ qua → Nhật ký.

**Không làm**
- Không sửa backend, API hay mô hình. Chỉ thay lớp giao diện và cách sắp xếp trang.
- Không xoá module enterprise của đồng đội (ingestion, multimodal, RAG copilot, lineage, digital twin, XAI governance). Chỉ đưa chúng vào trang "Nâng cao".
- Không làm landing page marketing mới.

**Thất bại nếu**
- Có con số trên giao diện không lấy từ API thật mà không ghi rõ là minh hoạ. Dự án đặt trọng tâm vào tính trung thực số liệu (xem `report/07_sai_lech_va_rui_ro.md`).
- Luồng demo hoặc e2e `demo-flow.spec.ts` bị gãy.
- Mất bản tiếng Anh. Slide và pitch bắt buộc tiếng Anh, nên UI phải chuyển EN được.

## 3. Cấu trúc trang (đã chốt với chủ dự án)

| Menu | Route | Lấy từ trang cũ | Nội dung |
|---|---|---|---|
| **Hôm nay** | `/` | Executive Dashboard + phần tóm tắt của Anomaly + Forecast | Phương án A "Bản tin buổi sáng" (mockup `home-v3-vivid.html`) |
| **Hỏi AI** | `/ask` | Ask Business Data | Mockup `other-screens.html`, khối tím |
| **Thử trước** | `/scenarios` | Scenario Simulator | Mockup `other-screens.html`, khối cam |
| **Quyết định** | `/decisions` (mới) | **Gộp** Recommendations + Audit | Mockup `other-screens.html`, khối xanh lá |
| Dữ liệu | `/data-sources` | Data Sources (+ Settings) | Giữ chức năng, đổi giao diện cho đồng bộ |
| Nâng cao | `/advanced` (mới) | — | Trang lưới thẻ màu dẫn tới: Copilot tài liệu, Truy nguồn số liệu (lineage / knowledge map), Đọc hóa đơn (multimodal), Bản đồ doanh nghiệp (digital twin), Giải thích AI (XAI), Tài liệu kỹ thuật |

**Trang Hôm nay**
- Dải đầu trang chuyển màu, chứa: nhãn "Dữ liệu cập nhật <tháng>", lời chào, một câu tóm tắt tình hình, nhân vật phi công kèm bong bóng thoại.
- 4 thẻ số, mỗi thẻ một màu và một hình:
  - Doanh thu: thẻ nền xanh đậm đặc.
  - Lãi gộp: xanh lá.
  - Đơn hàng: tím.
  - Quảng cáo thu về (ROAS): hồng đỏ. Thẻ có nhãn trạng thái như "Tăng / Ổn định / Đang lỗ".
- "Việc cần chú ý hôm nay": 3 tờ giấy ghi chú.
  - Vàng: cảnh báo bất thường, nút "Xem vì sao". Nút mở Hỏi AI với câu hỏi điền sẵn, giữ hành vi của `investigate.ts`.
  - Xanh lá: gợi ý hàng đầu, nút "Thử trước". Nút mở Simulator với tham số và `recommendation_id`, giữ hành vi hiện có.
  - Xanh dương: dự báo 30 ngày (khoảng giá trị thấp/cao lấy từ API forecast), nút "Xem dự báo".
- Trang chi tiết cảnh báo và dự báo vẫn giữ route `/anomalies`, `/forecast`, nhưng **không hiện trên menu**. Người dùng vào qua các nút trên trang Hôm nay.

**Trang Hỏi AI**
- Đầu trang có hình robot. Bên dưới là các câu hỏi gợi ý dạng chip có hình.
- Câu trả lời hiện dạng bong bóng phi công: con số chính in to, biểu đồ nhỏ nếu API trả `chart`, dòng "Nguồn" lấy từ `evidence`.
- Nếu câu trả lời liên quan tới một hành động thì có liên kết sang Thử trước.

**Trang Thử trước**
- 3 thẻ chọn loại: **Đổi giá / Quảng cáo / Nhập hàng**, tương ứng 3 kịch bản price / marketing / inventory đang có.
- Mỗi loại có 1–2 thanh kéo. Ba ô kết quả (doanh thu, chi phí liên quan, lãi) có màu tăng/giảm.
- Một tờ ghi chú vàng nhắc rằng kết quả là ước tính có điều kiện.
- 2 nút **Chọn làm / Bỏ qua**, ghi vào nhật ký như luồng accept/reject hiện tại.
- Cảnh 3D (Three.js) và digital twin **chuyển sang Nâng cao**, không nằm ở màn hình chính.

**Trang Quyết định**
- 3 ô đếm: Đã chọn làm / Đã bỏ qua / Gợi ý đang chờ.
- Một danh sách chung gồm gợi ý đang chờ (từ recommendations) và quyết định đã ghi (từ audit). Mỗi dòng có hình theo loại, tiêu đề, người quyết, ngày, căn cứ, nhãn trạng thái.
- Bấm vào một dòng thì mở chi tiết. Phần chi tiết có thể dùng lại `/recommendations/:recId`.

## 4. Ngôn ngữ hình ảnh (đã chốt)

- **Tham chiếu:** HCMUE AI (https://www.hcmuebot.id.vn/).
  - Menu trái nền xanh đậm (khoảng `#14306b` → `#1b2c5c`).
  - Dải đầu trang chuyển màu xanh → tím → hồng (`#1d3a8a` → `#4a2a8f` → `#8a2a6a`).
  - Chữ nhấn trong tiêu đề chuyển vàng → hồng (`#fde68a` → `#f9a8d4`).
  - Thẻ trắng bo góc khoảng 18px, có vòng tròn mờ trang trí ở góc.
  - Nhãn nhỏ dạng viên thuốc ("Mới", "Đang lỗ").
  - Ghi chú dạng giấy dán có băng dính hoặc đinh ghim, hơi xoay.
- **Màu riêng cho mỗi khu vực, dùng nhất quán:** Hôm nay xanh dương / Hỏi AI tím / Thử trước cam / Quyết định xanh lá. Riêng ý nghĩa tăng/giảm luôn là xanh lá/đỏ, ở mọi khu vực.
- **Hình minh hoạ:** bộ **Fluent Emoji 3D** của Microsoft (giấy phép MIT).
  - Nhân vật dẫn đường: `Pilot` 3D. Logo: `Airplane` 3D.
  - Hình mỗi khái niệm: túi tiền = doanh thu, biểu đồ tăng = lãi, giỏ hàng = đơn, loa = quảng cáo, tam giác cảnh báo = cảnh báo, bóng đèn = gợi ý, quả cầu pha lê = dự báo, ống nghiệm = thử trước / nâng cao, bảng kẹp = quyết định, mặt trời = hôm nay, bong bóng chat = hỏi, robot = AI, hộp hồ sơ = dữ liệu, thùng hàng = tồn kho, dấu tick = đã chọn làm.
- **Font:** Plus Jakarta Sans (có bộ chữ tiếng Việt) cho cả tiêu đề và thân.
- **Ít chữ:** mỗi thẻ có tối đa 1 tiêu đề, 1 dòng mô tả và 1 nút. Không có đoạn văn giải thích dài trên màn hình chính.

## 5. Ràng buộc

- Stack hiện có: React 19, Tailwind 4, Recharts, lucide-react, react-router (`frontend/`). Không thêm thư viện UI mới.
- **Song ngữ:** chuỗi giao diện đi qua `t()` trong `frontend/src/preferences.tsx`. Tiếng Việt là mặc định (Vitest kiểm tra điều này), tiếng Anh phải hoạt động cho slide.
- Phải chạy được qua Docker Compose (`localhost:8090`). Đây là cách demo.
- **Deadline gấp:** ưu tiên Hôm nay → Thử trước → Hỏi AI → Quyết định → menu + Nâng cao → Dữ liệu.
- Giữ nguyên các hành vi đã có test: liên kết cảnh báo → Ask (`investigate.ts`), gợi ý → Simulator có `recommendation_id`, accept/reject ghi audit. Selector trong `frontend/e2e/*.spec.ts` được phép cập nhật, nhưng các luồng test phải còn pass.

## 6. Quyết định do người viết tài liệu tự chốt (chủ dự án chưa xác nhận)

- **Dark mode:** chỉ làm giao diện sáng trong lần này và ẩn nút chuyển sáng/tối. Phong cách tham chiếu là nền sáng, mà deadline gấp.
- **Ảnh Fluent Emoji tải về** đưa vào `frontend/public/illustrations/` (khoảng 20 file PNG), không gọi CDN, để demo offline hay trong Docker không bị mất hình.
- Route `/recommendations`, `/audit`, `/knowledge-map` giữ nguyên để không gãy liên kết. Menu chỉ trỏ tới `/decisions` và `/advanced`.
- Settings (ngôn ngữ, phiên đăng nhập) chuyển vào trang Dữ liệu hoặc menu avatar, không còn là mục menu riêng.
- Nhân vật "chị Lan" là người minh hoạ, ghi rõ như trong `CONTEXT.md`. Lời chào lấy theo tên người đăng nhập nếu có.

## 7. Để người làm tự quyết

- Chia component, đặt tên file, cách tổ chức token màu (CSS variables hay Tailwind theme).
- Chi tiết khoảng cách, cỡ chữ, hiệu ứng hover (giữ tinh thần mockup).
- Câu tóm tắt ở trang Hôm nay: sinh từ dữ liệu theo quy tắc đơn giản (so doanh thu với kỳ trước, có cảnh báo hay không) hay gọi LLM. Ưu tiên cách không phụ thuộc LLM.

## 8. Điểm kỹ thuật sau vòng review (người viết tự chốt)

1. **Nguồn dữ liệu cho trang Quyết định:** dùng API cũ `GET /recommendations` (trường `decision`: pending/accepted/rejected) và `GET /audit?kind=decisions`.
   - *Sửa ngày 12/11, khi lập kế hoạch:* API mới `GET /v1/recommendations` (XAI governance) trả lỗi 500 trên Postgres (`TypeError: Object of type Decimal is not JSON serializable`, `governance/service.py:2072`). Các trang XAI cũ vẫn mở được trong Nâng cao. Lỗi này ghi vào `report/`, không sửa trong đợt redesign.
   - Đếm: **Đang chờ** = gợi ý có `decision == "pending"`. **Đã chọn làm / Đã bỏ qua** = dòng audit có `payload.decision` là `accepted` / `rejected` (gồm cả quyết định từ Thử trước).
2. **Thử trước là trang mới, đơn giản, đặt ở `/scenarios`**, gọi thẳng API `/simulate`. Trang làm lại các hành vi đang có:
   - nhận `recommendation_id` và tham số từ gợi ý;
   - Chọn làm / Bỏ qua ghi vào nhật ký.

   Thêm ô chọn **sản phẩm** (cho Đổi giá và Nhập hàng) hoặc **kênh quảng cáo** (cho Quảng cáo); mặc định là mục được gợi ý. Component 3D cũ (`ScenarioSimulator3D`) chuyển sang `/advanced/simulator-3d`. `demo-flow.spec.ts` cập nhật selector theo trang mới, nhưng vẫn kiểm tra cùng luồng.
3. **Dự báo trên trang Hôm nay chỉ hiện con số tổng 30 ngày (`total`)**, ví dụ "khoảng 3,4 tỷ", kèm chú thích "ước tính". **Không** cộng dồn dải trên/dưới theo ngày thành khoảng giá trị, vì làm vậy sai về thống kê. Phạm vi gọi API: doanh thu toàn shop. Thẻ dự báo tải sau, có khung chờ (skeleton), không chặn phần còn lại của trang.
4. **Hỏi AI:** chỉ hiện số to khi API trả `chart`, lấy giá trị nổi bật từ `chart.rows`. Nếu không có `chart` thì hiện câu trả lời thường. Liên kết "Thử trước →" dùng bảng ánh xạ từ khoá sang kịch bản, giống cách `investigate.ts` làm (quảng cáo/kênh → Quảng cáo, giá/giảm giá → Đổi giá, tồn/hết hàng → Nhập hàng). Không khớp từ khoá nào thì không hiện liên kết.
5. **Thẻ Quảng cáo dùng ROAS chung** (`summary.roas`), không lấy số riêng của Facebook. **Không dùng chữ "lỗ".** Nhãn:
   - ROAS < 1: "Thu về chưa đủ vốn"
   - 1 ≤ ROAS < 2: "Bình thường"
   - ROAS ≥ 2: "Tốt"

   Số riêng của Facebook (0,76×) chỉ xuất hiện trong ghi chú cảnh báo, khi API cảnh báo trả về. Thẻ "Lãi gộp" hiện tỷ lệ % (`summary.margin`), đúng như mockup.
6. **Hỏi AI gọi `POST /query`.** API này trả câu trả lời có cấu trúc: `answer`, `chart`, `evidence`, `trace.sources`, và đúng là API mà luồng demo đang kiểm tra ("Facebook Ads is lowest at 0.76×"). Trang chat RAG của đồng đội (`CopilotWorkspace`, `/ask` hiện tại) chuyển sang Nâng cao thành **"Copilot tài liệu"** (`/advanced/copilot`). Giữ hành vi deep link `?q=`: mở trang là tự gửi câu hỏi.
7. **Dữ liệu thật khác với mockup:** tháng 9/2026 doanh thu **giảm 30,6%** so với tháng 8, và ROAS chung là 2,76× (mức "Tốt"). Vì vậy câu chào và câu tóm tắt **phải sinh từ dữ liệu**, không cố định là "tháng này bán tốt".
