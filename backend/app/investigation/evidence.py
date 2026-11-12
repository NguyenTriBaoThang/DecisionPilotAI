"""Deterministic evidence and explicit confidence gates."""
from dataclasses import dataclass
from typing import Literal

REFUSAL_TEXT = "Chưa đủ bằng chứng để kết luận"


@dataclass(frozen=True)
class Evidence:
    id: str
    agent: str
    claim: str
    numbers: dict[str, float]
    method: Literal["exact", "model"]
    query: str
    lineage: dict
    chart: dict | None
    shap: dict | None
    non_shap_reason: str | None


@dataclass(frozen=True)
class Sufficiency:
    level: Literal["certain", "likely", "unsure", "refused"]
    explained_share: float
    checks: list[dict]
    missing: list[str]


def assess(explained_share: float, min_group_rows: int, min_group_days: int,
           data_age_hours: float, wape: float | None) -> Sufficiency:
    sample = min_group_rows >= 30 or min_group_days >= 14
    fresh = 0 <= data_age_hours <= 48
    quality = wape is None or 0 <= wape <= 0.30
    checks = [
        dict(rule="explained_share", passed=explained_share >= 0.70, value=explained_share, threshold=0.70),
        dict(rule="min_sample", passed=sample, value={"rows": min_group_rows, "days": min_group_days}, threshold={"rows": 30, "days": 14, "operator": "or"}),
        dict(rule="freshness", passed=fresh, value=data_age_hours, threshold=48),
        dict(rule="wape", passed=quality, value=wape, threshold=0.30),
    ]
    missing = []
    if explained_share < 0.70:
        missing.append("Phần doanh thu được giải thích chưa đủ; bổ sung dữ liệu và kiểm tra các lát cắt còn lại.")
    if not sample:
        missing.append("Mẫu quá nhỏ; bổ sung ít nhất 30 giao dịch hoặc 14 ngày dữ liệu cho mỗi nhóm.")
    if not fresh:
        missing.append("Dữ liệu không nằm trong 48 giờ gần nhất; đồng bộ dữ liệu đến đồng hồ demo.")
    if not quality:
        missing.append("Sai số dự báo vượt ngưỡng; bổ sung dữ liệu và đánh giá lại mô hình trước khi kết luận.")
    if explained_share < 0.50 or (explained_share < 0.70 and not sample):
        level = "refused"
    elif explained_share < 0.70:
        level = "unsure"
    else:
        level = ("certain", "likely", "unsure")[min(2, sum(not ok for ok in (sample, fresh, quality)))]
    return Sufficiency(level, explained_share, checks, missing)
