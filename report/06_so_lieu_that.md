# 06 · Số liệu đã kiểm chứng (nguồn: `artifacts/`)

Dataset `f32e87e3a5744333ff98d3bf`, bundle `dp-1.1`, **dữ liệu tổng hợp**. Test: 13/06–30/09/2026.

## Dự báo 30 ngày (artifacts/MODEL_EVALUATION.md)
| Mục tiêu | Mô hình được chọn | MAE test | WAPE test | Coverage 90% |
|---|---|---:|---:|---:|
| Doanh thu toàn bộ | moving_average | 34,58 triệu ₫ | **24,14%** | 83,81% |
| Số đơn | moving_average | 14,98 | 23,22% | 83,81% |
| Nhu cầu (units) | moving_average | 17,74 | 23,46% | 80,00% |
| SKU P001 | lightgbm | 2,68 | **41,87%** | 92,86% |

Đọc đúng: LightGBM **không thắng** ở cấp tổng thể (cổng 2% chọn baseline); dải "90%" thực tế phủ 80–84% (chưa đạt 90%); P001 sai số 42% nhưng bản thân dải tin cậy tốt.

## Phát hiện bất thường (có nhãn do tự cài)
| Tín hiệu | Precision | Recall | F1 | FPR |
|---|---:|---:|---:|---:|
| facebook_spend | 100% | 82,1% | 90,2% | 0% |
| facebook_conversion | 75% | 75% | 75% | 8,5% |
| facebook_roas | 68% | 60,7% | 64,2% | 9,8% |
| margin | 50% | 75% | 60% | 2,8% |
| revenue | 86,7% | **38,2%** | 53,1% | 2,6% |
| stockout_risk | 18,8% | 25% | **21,4%** | 13,3% |

Nhãn là các đoạn do chính generator cài → đây là kiểm thử trên dữ liệu tự tạo, không phải bằng chứng ngoài đời.

## Hỏi đáp NL (artifacts/query_benchmark.json)
46 câu có chọn lọc (VI/EN + từ chối): intent/thực thi/số liệu/bộ lọc/biểu đồ/grounded đều 100%; trung vị **1,43 s**, p95 **3,27 s**. Phạm vi ghi rõ: *luật cục bộ, không LLM, dữ liệu tổng hợp* → 100% do bộ câu hỏi do đội tự soạn.

## Mô phỏng (artifacts/scenario_backtest.json, replay 7 ngày)
| Kiểm tra | Baseline WAPE | Kịch bản WAPE |
|---|---:|---:|
| Đơn vị P001 theo tuần | 24,24% | 23,99% (hầu như không đổi) |
| Doanh thu Facebook Ads theo tuần | 25,44% | **33,00% (tệ hơn)** |
| Cạn kho P003 | 2 tuần thực | 2 tuần dự đoán (nhưng chỉ có 2 sự kiện) |

Báo cáo gốc tự ghi: can thiệp không ngẫu nhiên, dùng giá/ngân sách thực làm đầu vào.

## Dữ liệu
Kiểm tra tính toàn vẹn (khóa ngoại, công thức doanh thu/lãi, liên tục kho, SHA-256) theo audit/03 — chưa tự chạy lại.

## Nhận xét
Điểm **đáng khen**: đội ghi rõ hạn chế trong chính báo cáo đánh giá — đây là điểm cộng về độ tin cậy nếu trình bày trung thực. Điểm **cần lưu ý**: không có số liệu nào chứng minh độ chính xác trên dữ liệu thật.
