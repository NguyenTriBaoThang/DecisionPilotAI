# 03 · Vì sao làm dự án này & painpoint giải quyết

## Vì sao chọn bài toán này (suy luận từ tài liệu dự án + đề thi)
1. **Khớp 1–1 với đề:** nhóm 5 "Data & Decision Intelligence" liệt kê đúng 4 năng lực mà dự án có (NL→báo cáo, phân tích biến động doanh thu, dự báo nhu cầu, so sánh kịch bản).
2. **Bài toán có thật:** SME có dữ liệu (POS, Shopee/TikTok, quảng cáo, kho) nhưng không có nhà phân tích.
3. **Dễ chứng minh bằng demo:** từng bước đều thấy được trên giao diện.

*(Đây là phần tôi suy ra; tài liệu dự án không có ghi chú về lý do chọn đề tài của đội.)*

## Painpoint (theo tài liệu dự án)
| # | Painpoint của SME | Dự án xử lý bằng | Mức chứng minh |
|---|---|---|---|
| 1 | Dữ liệu rải rác (POS, ads, kho, Excel), gom báo cáo mất hàng giờ | Một CSDL quan hệ + dashboard + Ask AI | Có (demo trên dữ liệu tổng hợp) |
| 2 | Không có data analyst/ngân sách | Chạy CPU, local-first, Docker | Có |
| 3 | BI truyền thống chỉ mô tả, không nói "vì sao" | Anomaly + phân rã nguyên nhân (waterfall theo SKU/khu vực/kênh) | Có, độ nhạy còn hạn chế (file 06) |
| 4 | Quyết định giảm giá/ads/nhập hàng theo cảm tính | Dự báo + mô phỏng what-if + khuyến nghị | Có logic; độ chính xác mô phỏng chưa mạnh (file 06) |
| 5 | Chatbot LLM "bịa số" | Số liệu tính bằng code/DB, LLM chỉ hiểu câu hỏi; từ chối câu ngoài phạm vi | Có (benchmark 46 câu) |
| 6 | Thiếu trách nhiệm giải trình | Người duyệt + audit trail + giải thích giả định | Có |

## Đối tượng hưởng lợi
SME 10–100 nhân viên (bán lẻ, e-commerce, phân phối): CEO, quản lý bán hàng, marketing, kho, tài chính.

## Giá trị kinh doanh kỳ vọng — LƯU Ý
Các con số "giảm 95% thời gian báo cáo, giảm 35% stockout, ROAS +28%, tiết kiệm 3 ngày → 10 giây" trong COMPETITION_SUBMISSION.md và audit/08 là **mục tiêu/ước lượng**, không có pilot hay dữ liệu thật đằng sau. Khi trình bày phải gọi là "kỳ vọng/giả định" (xem file 07).

## Điều chưa có
- Chưa có khách hàng/SME thật nào thử, chưa có phỏng vấn người dùng, chưa có dữ liệu thật.
- Chưa có phân tích đối thủ (Power BI, Tableau, Looker, ThoughtSpot, các chatbot BI…) và chưa có mô hình kinh doanh/giá.
