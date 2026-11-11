# 08 · Đối chiếu tiêu chí chấm điểm

Đánh giá của tôi (độc lập, thận trọng), không dùng điểm 98/100 tự chấm trong audit/10.

| Tiêu chí (trọng số) | Điểm mạnh | Điểm yếu / câu hỏi giám khảo có thể hỏi | Ước lượng |
|---|---|---|---|
| **Problem (25%)** Vấn đề thật? đối tượng rõ? nguyên nhân/tác động? | Persona SME rõ; 5–6 painpoint cụ thể, dễ hiểu | Không có bằng chứng thị trường/khảo sát/phỏng vấn; số tác động là giả định; "SME" còn rộng (nên chọn 1 ngách, vd. shop bán lẻ online) | Khá |
| **Idea & Creativity (30%)** Sáng tạo? AI phù hợp? cải thiện cách làm? | Vòng lặp hỏi→hiểu→dự báo→mô phỏng→duyệt; ràng buộc "LLM không tính số"; cổng 2% và công khai hạn chế; 3D là điểm gây ấn tượng | Nhiều đội cũng làm "chat với dữ liệu"; phải nêu rõ khác biệt thật (mô phỏng + audit + trung thực về độ tin cậy). Hiện Ask AI mặc định là regex, chưa phải LLM — cần giải thích AI "ở đâu thật sự" (ML dự báo, Isolation Forest) | Khá–Tốt |
| **Feasibility (20–25%)** Triển khai được? lợi ích thiết thực? | MVP chạy, Docker, CI, phân quyền, audit, chi phí thấp (CPU) | Chưa dùng dữ liệu thật; mô hình tổng thể chỉ bằng baseline; mô phỏng marketing kém baseline; chưa có kế hoạch onboarding dữ liệu (kết nối KiotViet… chỉ là roadmap) | Trung bình–Khá |
| **Presentation (20–25%)** Rõ, trực quan, tự tin | Có sẵn giao diện, hình, docs site; demo trực quan | **Chưa có slide PDF tiếng Anh**; chưa có video 2 phút; dự án quá rộng, cần kể thành 1 câu chuyện (ví dụ doanh thu tháng 9 giảm → vì sao → mô phỏng → quyết định) | Phụ thuộc vào việc làm slide |

## Điểm cộng đã có
Có prototype/MVP chạy được (điểm cộng theo thể lệ) và có site demo trực tuyến.

## Nên nhấn trong slide (an toàn và thật)
- Câu chuyện doanh thu 9/2026: hệ thống phát hiện tín hiệu, chỉ ra Facebook spend ×1.85 + HCMC giảm → mô phỏng → khuyến nghị.
- "Biết mình không biết": dải tin cậy, cảnh báo độ phủ, từ chối câu ngoài phạm vi, người duyệt + audit.
- Chạy local, không gửi dữ liệu ra ngoài (nếu không bật LLM).

## Nên tránh nói
"Zero hallucination" tuyệt đối, "industry-first", WAPE 11%, precision 92%, 98/100, mọi con số % tác động kinh doanh chưa có nguồn.
