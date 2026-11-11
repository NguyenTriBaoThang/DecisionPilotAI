# 04 · Giải pháp kỹ thuật (theo code thật)

## Kiến trúc
React SPA → FastAPI (16 endpoint) → lớp phân tích (`analytics.py` SQL/Pandas + `ai_service/`) → SQLAlchemy → SQLite (local) / PostgreSQL 16 (Docker). Model lưu `artifacts/<dataset_id>.joblib`. Chạy: `docker compose up` hoặc `scripts/dev.ps1` / `run.bat`.

## 4 năng lực AI — thực tế code làm gì

### 1. Ask AI (`llm_orchestrator.py`, 311 dòng)
- Mặc định **không dùng LLM** (`LLM_PROVIDER=none`): bộ phân loại ý định bằng **regex** (VI/EN, có xử lý không dấu) → chọn hành động (KPI, top sản phẩm, so sánh kỳ, forecast…) → gọi hàm phân tích có sẵn.
- Tùy chọn OpenAI (gpt-4.1-mini) hoặc Gemini (2.5-flash) để phân loại ý định; chưa có API key thật nào được thử (docs/IMPROVEMENTS.md).
- Từ chối câu hỏi ngoài phạm vi (net profit, dòng tiền, thuế…) hoặc chứa câu lệnh SQL.
- Trả về trace: nguồn bảng, bộ lọc, công thức.
- **Không có** bộ phân tích cú pháp SQL (AST/sqlglot) như README/audit mô tả; an toàn đến từ việc không chạy SQL do người dùng/LLM viết.

### 2. Phát hiện bất thường (`anomaly.py`)
- Baseline trượt (cửa sổ 56 ngày, dịch trễ để không nhìn tương lai), z-score, IQR, **Isolation Forest** (120 cây, contamination 6.5%), kết hợp "hybrid". Có tín hiệu "doanh thu giảm kéo dài 7 ngày" (dp-1.1).
- Phân rã nguyên nhân (`root_cause.py` + `analytics.py`) theo SKU/khu vực/kênh.

### 3. Dự báo (`features.py`, `forecasting.py`)
- LightGBM + 2 baseline (seasonal naive, moving average). Đặc trưng: lag 7/14/28, rolling, lịch/lễ/sự kiện. Chia theo thời gian 70/15/15.
- **Cổng 2%:** chỉ chọn LightGBM nếu MAE validation tốt hơn baseline >2%; ngược lại dùng baseline. Dải 90% hiệu chỉnh trên đoạn validation riêng.
- Test chống rò rỉ tương lai có trong `tests/` (`test_features_use_only_previous_days`).

### 4. Mô phỏng kịch bản (`scenario.py`)
- **Giá:** cầu tuyến tính theo độ co giãn `Q = Q0·max(0, 1+ε·ΔP/P0)`; ε lấy từ catalog sản phẩm hoặc người dùng nhập (P001: −1.1); có phân tích độ nhạy ε±0.3.
- **Quảng cáo:** hàm lũy thừa `ratio^exponent` (lõm, exponent 0.2–0.95); có độ nhạy.
- **Tồn kho:** ràng buộc lead time, tồn tối thiểu.
- Mỗi lần mô phỏng được lưu (ID băm từ input+kết quả) để ghi quyết định đúng bản chạy.

## Quản trị & bảo mật
- Vai trò viewer/analyst/admin qua bearer token (production bắt buộc cấu hình token ≥32 ký tự); so sánh hằng thời gian.
- Audit log + bảng scenario có trigger chặn UPDATE/DELETE (Alembic 0002); tài liệu thừa nhận chủ DB vẫn sửa được.
- Import chỉ khi bật `DEMO_ALLOW_IMPORT` + token riêng, kiểm tra toàn vẹn, có xung đột dataset ID.

## Giao diện
Dashboard + 5 workspace, VI/EN, giao diện 3D "hologram" (Three.js), chế độ demo tĩnh có **mock data** khi không có backend (GitHub Pages `/app/`).

## Kiểm thử/CI
14 hàm test backend (pytest, một số parametrize), 8 test Vitest, e2e Playwright, CI matrix SQLite/PostgreSQL, deploy Pages.
