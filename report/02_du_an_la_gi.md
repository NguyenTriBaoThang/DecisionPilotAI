# 02 · DecisionPilot AI là gì

**Tên:** DecisionPilot AI · **Tagline:** *Ask. Understand. Predict. Decide.*
**Mô tả:** hệ thống AI phân tích dữ liệu kinh doanh, dự báo và hỗ trợ ra quyết định cho SME bán lẻ/dịch vụ.
**Repo:** github.com/NguyenTriBaoThang/DecisionPilotAI · **Docs site:** nguyentribaothang.github.io/DecisionPilotAI · MIT license.

## Một câu
Thay vì dashboard chỉ cho biết "chuyện gì đã xảy ra", hệ thống trả lời tiếp "vì sao", "sắp tới ra sao", "nếu giảm giá 5% thì sao", rồi ghi lại quyết định của người quản lý.

## Chuỗi quyết định (decision loop)
Dữ liệu → KPI → Phát hiện bất thường → Phân rã nguyên nhân → Dự báo → Mô phỏng kịch bản → Khuyến nghị → **Người duyệt** → Audit log.

## 6 màn hình (workspace)
| # | Màn hình | Làm gì |
|---|---|---|
| 1 | Executive Dashboard | KPI: doanh thu, lợi nhuận gộp, biên, đơn hàng, AOV, ROAS, tồn kho |
| 2 | Ask AI | Hỏi tiếng Việt/Anh → trả lời kèm số liệu, biểu đồ, vết truy xuất (trace) |
| 3 | Anomaly Center | Cảnh báo bất thường theo mức độ + phân rã nguyên nhân theo SKU/khu vực/kênh |
| 4 | Forecast Center | Dự báo 7/30 ngày kèm dải tin cậy 90% |
| 5 | Scenario Simulator | What-if: giá, ngân sách quảng cáo, tồn kho/lead time; giao diện 3D Three.js |
| 6 | Recommendations & Audit | Khuyến nghị xếp hạng, nút Accept/Reject, nhật ký không sửa/xóa thông thường |

Thêm: Data Sources (import ZIP/XLSX), Settings (ngôn ngữ VI/EN, theme), trang tài liệu kỹ thuật.

## Thành phần repo
- `ai_service/` (~900 dòng Python): anomaly, features, forecasting, llm_orchestrator, root_cause, scenario
- `backend/app/` (FastAPI, 16 endpoint, SQLAlchemy 2, Alembic 2 migration)
- `frontend/` (React 19 + TS + Vite + Tailwind 4 + Three.js + Recharts), test Vitest + Playwright
- `docs-site/` (site tài liệu 16 chương trên GitHub Pages)
- `data/synthetic/` (6 bảng CSV: 50.000 giao dịch, 50 SKU, 10.000 khách, 730 ngày 10/2024–9/2026)
- `artifacts/` (model joblib, báo cáo đánh giá, 10 hình), `notebooks/` (4 notebook), `docs/` (tài liệu + 10 báo cáo audit)

## Dữ liệu
**Hoàn toàn tổng hợp** (seed 42), mô phỏng SME bán lẻ Việt Nam, có chủ ý cài sự kiện bất thường (doanh thu giảm 9/2026, Facebook spend ×1.85, stockout P003…) để kiểm thử phát hiện.
