"""Optional grounded narration with per-event numeric validation."""
import json
import os
import re
from typing import Iterable

from ai_service.llm_orchestrator import PROVIDERS


def numbers_in(text: str) -> list[float]:
    values = []
    for match in re.finditer(r"(?<![\w])[-+]?\d[\d.,]*(?:\s*(?:tỷ|triệu|nghìn|ngàn))?\s*%?", text, re.I):
        raw = match.group(0).strip()
        suffix = re.search(r"(tỷ|triệu|nghìn|ngàn)\s*%?$", raw, re.I)
        number = re.sub(r"\s*(?:tỷ|triệu|nghìn|ngàn)\s*%?$", "", raw, flags=re.I).strip().rstrip("%")
        if "," in number and "." in number:
            number = number.replace(".", "").replace(",", ".")
        elif "," in number:
            number = number.replace(",", ".")
        elif "." in number and len(number.split(".")[-1]) == 3:
            number = number.replace(".", "")
        try:
            value = float(number)
            multiplier = {"tỷ": 1e9, "triệu": 1e6, "nghìn": 1e3, "ngàn": 1e3}
            values.append(value * multiplier[suffix.group(1).lower()] if suffix else value)
        except ValueError:
            continue
    return values


def check_numbers(text: str, evidence_numbers: Iterable[float], tol: float = 0.01) -> bool:
    allowed = [float(n) for n in evidence_numbers]
    for seen in numbers_in(text):
        if not any(abs(seen - n) <= tol * max(abs(n), 1.0) or abs(seen / 100 - n) <= tol * max(abs(n), 0.01)
                   for n in allowed):
            return False
    return True


def _payload_numbers(payload):
    found = []
    def walk(value):
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float)):
            found.append(float(value))
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)
    walk(payload)
    # Percentages in trace payloads are often represented as ratios.
    return found + [n * 100 for n in found if abs(n) <= 1]


def template_line(event: dict) -> str:
    payload = event.get("payload") or {}
    return str(payload.get("text") or payload.get("reason") or f"{event.get('agent', 'AI')} đã hoàn tất bước kiểm tra.")


def narrate(events: list[dict], provider: str | None = None) -> tuple[list[dict], str]:
    templates = {e["seq"]: template_line(e) for e in events}
    name = (provider if provider is not None else os.getenv("LLM_PROVIDER", "none")).lower()
    if name not in PROVIDERS or not os.getenv(PROVIDERS[name][1]):
        return ([{"seq": seq, "text": line} for seq, line in templates.items()], "template")
    try:
        implementation, _ = PROVIDERS[name]
        prompt = ("Diễn đạt từng sự kiện bằng tiếng Việt. Chỉ trả JSON {\"lines\":[{\"seq\":int,\"text\":str}]}. "
                  "Không thêm bất kỳ con số nào. Giữ nguyên ý từ payload.")
        response = implementation().extract(prompt, json.dumps(events, ensure_ascii=False, default=str))
        proposed = json.loads(response)["lines"]
        by_seq = {int(row["seq"]): str(row["text"]) for row in proposed}
        lines = []
        for event in events:
            seq = event["seq"]
            text = by_seq.get(seq, templates[seq])
            if not check_numbers(text, _payload_numbers(event.get("payload") or {})):
                text = templates[seq]
            lines.append({"seq": seq, "text": text})
        return lines, "llm"
    except Exception:
        return ([{"seq": seq, "text": line} for seq, line in templates.items()], "template")
