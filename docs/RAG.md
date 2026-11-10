# RAG trên bộ dữ liệu đang hoạt động

Mở **Kho tri thức & RAG**, nhập câu hỏi về dữ liệu doanh nghiệp. Không cần tải lại tài liệu để dùng dữ liệu mẫu hiện có.

Luồng xử lý: bộ dữ liệu đang hoạt động → tổng hợp SQL → truy xuất các đoạn liên quan bằng TF-IDF → trả lời kèm nguồn. Các căn cứ hiện bao gồm tổng doanh thu/lợi nhuận, tổng hợp theo tháng, sản phẩm, danh mục, khu vực, kênh bán, phân khúc khách hàng, quảng cáo và tồn kho ngày cuối. Không phải công cụ SQL tự do cho mọi tổ hợp bộ lọc.

Sau khi dùng chức năng thay dữ liệu/import thành công, câu hỏi tiếp theo dựng lại căn cứ từ snapshot mới. Không có chỉ mục lưu lâu dài cần bấm đồng bộ. Một giao dịch đọc nhất quán giữ các căn cứ cùng phiên bản; API kiểm tra lại dataset_id sau khi tổng hợp câu trả lời và trả 409 nếu dữ liệu đã đổi. Import thất bại giữ nguyên bộ dữ liệu và nguồn RAG hiện tại. Giao diện xóa kết quả khi dataset_id thay đổi.

Nguồn trả về gồm bảng, kỳ dữ liệu trong trích đoạn, dataset_id, phiên bản nội dung và điểm khớp từ khóa. Điểm này không phải độ tin cậy của câu trả lời. Câu trả lời dùng mô hình khi có cấu hình nhà cung cấp; nếu không, hiển thị trích đoạn trực tiếp. Việc kiểm tra mã trích dẫn không đảm bảo mọi diễn giải của mô hình đều đúng.

`POST /knowledge/query` nhận `question` và `include_documents` (mặc định false). Tài liệu TXT/Markdown cá nhân chỉ được dùng thêm khi bật lựa chọn tương ứng; chúng không bị xóa khi thay dữ liệu doanh nghiệp. Dữ liệu doanh nghiệp dùng chung trong workspace, tài liệu bổ sung được giới hạn theo tài khoản.

Kiểm thử: `python -m pytest tests/test_knowledge_retrieval.py -q`.

## Đồ thị tri thức và Graph RAG

`GET /knowledge/graph` dựng các nút thực thể và căn cứ từ cùng snapshot. Sản phẩm liên kết với căn cứ doanh số, danh mục và tồn kho thông qua thực thể chung. Các nút doanh thu theo tháng không có quan hệ thực thể vẫn được tìm bằng từ khóa. Giao diện cho phép tìm kiếm, chọn nút, xem lân cận và đọc nguyên văn căn cứ.

Truy xuất chọn tối đa 4 đoạn theo từ khóa, sau đó đi qua thực thể chung để bổ sung tối đa 2 đoạn liên quan. Mỗi nguồn ghi `retrieval`, `via` và `relations`; tab đường truy xuất hiển thị chính metadata này. Đây là Graph RAG cục bộ, một bước mở rộng theo quan hệ dữ liệu, chưa có phân cụm cộng đồng hay suy luận nhiều bước. Quan hệ không biểu thị quan hệ nhân quả. Tài liệu cá nhân chưa được trích xuất thực thể nên chỉ tham gia tìm kiếm từ khóa.
