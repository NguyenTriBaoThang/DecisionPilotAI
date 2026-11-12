# 05 · Tiến trình & trạng thái hiện tại

*Cập nhật 12/11/2026 10:20, `main` = `7888791` (merge PR #17).*

## Timeline (git)
| Ngày | Mốc |
|---|---|
| 04/11 | Initial commit |
| 05–06/11 | Backend, dashboard, artifacts đánh giá, CI, simulator 3D, trang Ask, docs site GitHub Pages |
| 08/11 | Workspace, showcase Data & Decision Intelligence, 10 báo cáo audit |
| 10/11 | Việt hóa UI, light theme, sửa e2e (PR #14) |
| 11/11 sáng | **PR #15**: nối luồng demo (Cảnh báo → Ask → Khuyến nghị → Thử trước → Quyết định), `recommendation_id`, sửa số liệu sai trong docs, thư mục `report/` |
| 11/11 tối → 12/11 | 11 commit (NguyenTriBaoThang) thêm **6 module "enterprise"** — xem dưới |
| 12/11 sáng | `2e58835` (NguyenTriBaoThang): sửa lỗi lineage `created_at`. **PR #17** (toilact, merge 10:01): thiết kế lại UI 4 tab + sửa backend `Decimal` JSON — xem dưới |

Tác giả theo git (commit không tính merge): NguyenTriBaoThang (29), toilact (22), KienTrungZir (5). Luật cần 3–5 thành viên.

## 6 module mới (11–12/11)
| Module | Backend | Frontend | Test |
|---|---|---|---|
| Nhập dữ liệu đa tenant (connector, mapper, quality) | `backend/app/ingestion/` | `components/ingestion/` | `tests/test_ingestion.py` |
| Multimodal 19 định dạng (ảnh/PDF/audio/video, OCR) + duyệt HITL | `backend/app/multimodal/` | `ExtractionApprovalWorkbench` | `tests/test_multimodal.py` |
| RAG + text-to-SQL copilot (hybrid search, chặn SQL/prompt injection) | `backend/app/rag/` | `components/copilot/` | `tests/test_rag_copilot.py` |
| Data lineage (đồ thị nguồn → mô hình → insight, SSE) | `backend/app/lineage/` | `components/lineage/` | `tests/test_lineage.py` |
| Digital twin scenario simulator | `backend/app/simulator/` | `features/scenario-simulator/` (Twin*) | `tests/test_digital_twin_simulator.py` |
| XAI + audit governance (hash chain) | `backend/app/governance/`, `ai_service/explainability.py` | `features/recommendations-audit/` | `tests/test_xai_recommendations_audit.py` |

Kèm alembic `0003`–`0008`. Router mount ở `backend/app/main.py:157-168` (`/v1`, `/api/v1`, lineage ở gốc).

## Số liệu mới: `artifacts/rag_evaluation_report.json`
Hybrid search Recall@5 = 1.0, MRR = 1.0; faithfulness 1.0; chặn SQL nguy hiểm 8/8; chặn prompt injection 3/3.
**Lưu ý khi trình bày:** bộ đánh giá rất nhỏ, tự soạn (~6 câu truy hồi, 8 probe SQL, 3 injection) → điểm tuyệt đối là bình thường, không nên gọi là "benchmark" trong slide mà gọi là "kiểm thử an toàn".

Số liệu mô hình lõi **không đổi** và đã khớp artifact: WAPE 24,14% (moving average), P001 41,87% / coverage 92,86%, ε P001 = −1.1.

## Giao diện mới (PR #17, 12/11)
Thiết kế cho chủ shop không rành kỹ thuật. Spec: `docs/superpowers/specs/2026-11-12-ui-redesign-design.md`. Ảnh: `screenshots/redesign/` (01–11).

| Tab | Đường dẫn | Nội dung |
|---|---|---|
| **Hôm nay** | `/` | Câu tóm tắt sinh từ dữ liệu; 8 thẻ chỉ số có ▲▼% so kỳ trước (doanh thu, lãi gộp, đơn, ROAS, giá trị đơn TB, khách mới/quay lại, chi quảng cáo, chuyển đổi); 3 ghi chú (cảnh báo, gợi ý, dự báo 30 ngày); biểu đồ doanh thu/lãi gộp theo ngày, kênh bán, top sản phẩm, khu vực, bảng ROAS theo kênh |
| **Hỏi AI** | `/ask` | Hỏi qua `/query`; số nổi bật, biểu đồ, bảng số liệu thu gọn, kỳ dữ liệu, nguồn; nút "Thử trước" |
| **Thử trước** | `/scenarios` | 3 loại (Đổi giá / Quảng cáo / Nhập hàng), thanh trượt; bảng **So sánh trước / sau**; khối Giả định; Chọn làm / Bỏ qua |
| **Quyết định** | `/decisions` | Gộp gợi ý đang chờ (ưu tiên, vì sao, tác động dự kiến, lưu ý) + nhật ký quyết định |
| Dữ liệu | `/data-sources` | Như cũ, đổi khung |
| **Nâng cao** | `/advanced` | Trang trung chuyển tới module cũ: Copilot tài liệu (`/advanced/copilot`), Bản 3D (`/advanced/simulator-3d`), Truy nguồn số liệu, Giải thích AI, Nhật ký kiểm toán, Cảnh báo, Dự báo, Tài liệu. Dự báo / Cảnh báo / Giải thích AI / Kiểm toán đã có header mới, bảng kỹ thuật gom vào "Chi tiết kỹ thuật" |

Backend: `backend/app/db.py` thêm `json_serializer` (Decimal → float, date → ISO). Trước đó `/v1/recommendations` và `/v1/audit/*` trả 500 trên Postgres (Docker). Test: `tests/test_db_json.py`.

Kiểm thử trên máy (12/11): Vitest 73/73, `tsc` sạch, e2e `demo-flow.spec.ts` pass trên Docker; pytest trong container 49 pass + 1 fail OCR (như cũ).

## Trạng thái CI trên `main` (`7888791`) — ĐỎ, e2e tệ hơn trước
| Job | Kết quả |
|---|---|
| Typecheck & Build, Docker build, Docs build, Pages deploy | ✅ |
| Backend tests (sqlite + postgres) | ❌ 1 fail / 49 pass: `test_multimodal.py::test_image_ocr_and_mandatory_hitl_edit_gate` (OCR, như cũ) |
| Browser e2e | ❌ **6 fail / 3 pass** (trước PR #17: 1 fail) |

E2e fail sau PR #17 — **lỗi do PR #17, chưa chẩn đoán xong**:
1. `demo-flow.spec.ts:19` — nút **Choose** bị khóa trên backend e2e của CI (`scripts/e2e_backend`), trong khi pass trên Docker local. Nghi do quyền/đăng nhập của backend e2e khác Docker.
2. `workspace.spec.ts:11` (sign in → scenario → audit) — cùng lỗi nút Choose.
3. `workspace.spec.ts:135` — hóa đơn PNG → HITL (lỗi OCR cũ, kèm bộ lọc sản phẩm đã đổi chỗ).
4. `workspace.spec.ts:235` — RAG Copilot: không thấy ô `Business question` (copilot đã chuyển sang `/advanced/copilot`).
5. `workspace.spec.ts:403` — 3D simulator: không thấy `digital-twin-studio`.
6. `workspace.spec.ts:501` — XAI recommendations + audit.

`workspace.spec.ts` đã được sửa theo nav mới nhưng **chưa chạy được trên máy này** (cần `.venv` Python 3.12), nên lỗi chỉ lộ ra trên CI.

Lỗi OCR (backend + e2e số 3): `backend/app/multimodal/ocr_and_extractors.py` chỉ OCR được bằng WinRT (Windows) hoặc binary `tesseract`; runner CI Linux và `Dockerfile` không cài tesseract → đọc hóa đơn ảnh không ra dữ liệu khi chạy Docker.

Lỗi lineage `created_at`: **đã sửa** ở `2e58835` (đếm dataset theo `max(id)` thay vì `created_at` không tồn tại trên bảng `datasets`). Lưu ý: `max(id)` là id dạng chuỗi, không phải "mới nhất theo thời gian".

## Còn thiếu so với yêu cầu nộp bài
- [ ] Slide PDF tiếng Anh ≤15 trang (có dàn ý: `12_dan_y_slide.md`)
- [ ] Video demo ≤2 phút (có kịch bản: `13_kich_ban_demo.md`)
- [ ] Đóng gói `AI4Biz_Tendoi_2026`, nộp form trước **23:59 13/11**
- [ ] `COMPETITION_SUBMISSION.md` chưa nhắc tới 6 module mới và giao diện 4 tab
- [ ] Ảnh slide/video (`screenshots/demo-flow/`) là **giao diện cũ** → chụp lại bằng UI mới, tiếng Anh
