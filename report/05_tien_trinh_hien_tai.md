# 05 · Tiến trình & trạng thái hiện tại

*Cập nhật 12/11/2026, `main` = `27a4b90`.*

## Timeline (git)
| Ngày | Mốc |
|---|---|
| 04/11 | Initial commit |
| 05–06/11 | Backend, dashboard, artifacts đánh giá, CI, simulator 3D, trang Ask, docs site GitHub Pages |
| 08/11 | Workspace, showcase Data & Decision Intelligence, 10 báo cáo audit |
| 10/11 | Việt hóa UI, light theme, sửa e2e (PR #14) |
| 11/11 sáng | **PR #15**: nối luồng demo (Cảnh báo → Ask → Khuyến nghị → Thử trước → Quyết định), `recommendation_id`, sửa số liệu sai trong docs, thư mục `report/` |
| 11/11 tối → 12/11 | 11 commit (NguyenTriBaoThang) thêm **6 module "enterprise"** — xem dưới |

Tác giả theo git: NguyenTriBaoThang (~33), toilact (12), KienTrungZir (6), ChiThanh (1). Luật cần 3–5 thành viên.

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

## Trạng thái CI trên `main` — ĐỎ
| Job | Kết quả |
|---|---|
| Typecheck & Build, Docker build, Docs build, Pages deploy | ✅ |
| Backend tests (sqlite + postgres) | ❌ 1 fail / 47 pass: `test_multimodal.py::test_image_ocr_and_mandatory_hitl_edit_gate` — `promoted_financial_rows` = 0, mong đợi 1 |
| Browser e2e | ❌ `workspace.spec.ts:133` (ingest hóa đơn PNG → HITL → BI): không thấy "E2E Scanner" trong ô Product |

Cả hai lỗi cùng một luồng: **OCR hóa đơn → duyệt → đẩy vào dữ liệu tài chính**. Nguyên nhân (đã đọc code): `backend/app/multimodal/ocr_and_extractors.py` chỉ OCR được bằng WinRT (`sys.platform == "win32"`) hoặc binary `tesseract`; runner CI Linux không có tesseract, `Dockerfile` cũng không cài → test chỉ pass trên máy Windows của tác giả. **Hệ quả cho demo:** chạy bằng Docker (cả trên Mac) thì tính năng đọc hóa đơn ảnh sẽ không ra dữ liệu.

Lỗi phụ trong log e2e: `backend/app/lineage/router.py:105` sắp xếp theo `ingestion_jobs.c.created_at` nhưng bảng không có cột đó → `KeyError: 'created_at'` lặp lại ở luồng SSE lineage (không làm fail test nhưng trang Lineage sẽ không cập nhật realtime).

## Còn thiếu so với yêu cầu nộp bài
- [ ] Slide PDF tiếng Anh ≤15 trang (có dàn ý: `12_dan_y_slide.md`)
- [ ] Video demo ≤2 phút (có kịch bản: `13_kich_ban_demo.md`)
- [ ] Đóng gói `AI4Biz_Tendoi_2026`, nộp form trước **23:59 13/11**
- [ ] `COMPETITION_SUBMISSION.md` chưa nhắc tới 6 module mới
