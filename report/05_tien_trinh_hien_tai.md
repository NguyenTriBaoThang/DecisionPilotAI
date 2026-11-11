# 05 · Tiến trình & trạng thái hiện tại

## Timeline (git, 24 commit, 04/11 → 10/11/2026)
| Ngày | Mốc |
|---|---|
| 04/11 | Initial commit |
| 05/11 | Khởi tạo cấu trúc, backend, dashboard; artifacts đánh giá; script dev Windows; CI + templates; simulator 3D; trang Ask |
| 06/11 | Triển khai nền tảng đầy đủ (forecast, 3D simulation, CRM backend); site tài liệu GitHub Pages; api client + mock data |
| 08/11 | Dashboard, workspace, simulator 3D, showcase Data & Decision Intelligence; README gọn; **10 báo cáo audit** (ngày 08/11) |
| 10/11 | Việt hóa toàn bộ UI, cải thiện light theme, sửa e2e (PR #14); deploy Pages + audit + UI; merge |

Đóng góp theo git: NguyenTriBaoThang ~19 commit, KienTrungZir 5 commit. **Chỉ thấy 2 người đóng góp** — luật cần 3–5 thành viên (xem file 09).

## Đã hoàn thành (xác nhận có trong repo)
- [x] Dataset tổng hợp 6 bảng + pipeline sinh/kiểm tra/bootstrap
- [x] Backend 16 endpoint, migration, phân quyền, audit
- [x] 4 module AI + notebook EDA/Anomaly/Forecast/Scenario
- [x] Model đã train (`dp-1.1`) + báo cáo đánh giá + 10 hình
- [x] Frontend 6 workspace, VI/EN, 3D, import dữ liệu
- [x] Docker Compose, CI, Pages deploy, docs site 16 chương
- [x] Tài liệu nộp bài: COMPETITION_SUBMISSION.md, research-proposal.md

## Chưa làm / còn thiếu so với yêu cầu nộp bài
- [ ] **Slide PDF tiếng Anh ≤15 trang** (chưa thấy file nào)
- [ ] Video demo ≤2 phút cho vòng pitch
- [ ] Đóng gói folder `AI4Biz_Tendoi_2026`
- [ ] Xác nhận đã đăng ký thi (form đăng ký) và đủ ≥3 thành viên
- [ ] Chạy thử LLM thật (Gemini/OpenAI) — chưa có
- [ ] Thử với dữ liệu thật của một SME — chưa có

## Backlog đã biết (docs/audit/09)
P2: pytest chậm (~3 phút, nạp 50k dòng); cấu hình GitHub Pages "Source = GitHub Actions". P3: bundle three.js 534 kB; multi-tenant (v1.1). Roadmap công bố: kết nối KiotViet/Sapo/Haravan, cảnh báo Telegram/Zalo, CLV (chưa làm).

## Ghi chú vận hành
Ngày 11/11 git sạch (`main`). Báo cáo audit ghi chạy trên đường dẫn `G:/GITHUB/...` (máy khác); trên máy này chưa cài node_modules/.venv nên **tôi chưa chạy được test/app**.
