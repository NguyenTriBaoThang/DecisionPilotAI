"""Parallel deterministic specialists; the verifier only challenges failed checks."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import date
from threading import RLock
from typing import Literal

import sqlalchemy as sa

from backend.app.db import calendar, inventory, inv_cases, marketing, read_connection, sales
from backend.app.investigation.decomposition import SOURCE, decompose_revenue, scope_conditions
from backend.app.investigation.evidence import Evidence, REFUSAL_TEXT, assess
from backend.app.investigation.trace import emit
from backend.app.investigation.narration import narrate


@dataclass(frozen=True)
class AgentSpec:
    key: str
    name_vi: str
    emoji: str
    tools: tuple[str, ...]


AGENTS = {key: AgentSpec(key, name, emoji, tools) for key, name, emoji, tools in (
    ("orchestrator", "Điều phối", "🧭", ("decompose_revenue",)),
    ("demand", "Nhu cầu chung", "📉", ("decompose_revenue",)),
    ("region", "Khu vực", "📍", ("decompose_revenue",)),
    ("customer", "Khách hàng", "👥", ("decompose_revenue",)),
    ("inventory", "Tồn kho", "📦", ("inventory",)),
    ("price", "Giá", "🏷️", ("sales",)),
    ("marketing", "Quảng cáo", "📣", ("decompose_revenue", "marketing")),
    ("calendar", "Lịch", "📅", ("calendar",)),
    ("verifier", "Kiểm chứng", "🔎", ("assess",)),
    ("strategist", "Chiến lược", "🧪", ("simulate",)),
)}
SPECIALISTS = ("demand", "region", "customer", "inventory", "price", "marketing", "calendar")
WRITE_LOCK = RLock()


@dataclass
class Finding:
    agent: str
    hypothesis: str
    status: Literal["confirmed", "eliminated", "insufficient"]
    evidence: list[Evidence]


def run_investigation(engine, case_id: str, info: dict, clock_end: date) -> dict:
    def write(agent, kind, payload):
        with WRITE_LOCK, engine.begin() as conn:
            return emit(conn, case_id, agent, kind, payload)

    with read_connection(engine) as conn:
        case = conn.execute(sa.select(inv_cases).where(inv_cases.c.id == case_id)).mappings().one()
        current = tuple(date.fromisoformat(v) for v in case['period_current'])
        prior = tuple(date.fromisoformat(v) for v in case['period_prior'])
        scope = (case['summary'] or {}).get('scope') or {}
        decomposition = decompose_revenue(conn, current, prior, scope)
    with engine.begin() as conn:
        conn.execute(inv_cases.update().where(inv_cases.c.id == case_id).values(status='investigating', run_state='running'))
    for agent in SPECIALISTS:
        write(agent, 'assign', {'text': f"Kiểm tra giả thuyết: {AGENTS[agent].name_vi}"})

    def specialist(agent):
        write(agent, 'tool_call', {'tools': list(AGENTS[agent].tools), 'text': 'Đang truy vấn dữ liệu nguồn.'})
        with read_connection(engine) as conn:
            evidence = []
            def add(claim, numbers, tables, rows, query):
                ev = Evidence(f'ev-{agent}-{len(evidence)+1}', agent, claim, numbers, 'exact', query,
                    {'tables': tables, 'start': prior[0].isoformat(), 'end': current[1].isoformat(), 'rows': int(rows), 'scope': scope},
                    {'type': 'bar', 'x': 'name', 'y': 'value', 'rows': [{'name': key, 'value': value} for key, value in numbers.items()]},
                    None, 'Phép tính kế toán trực tiếp; không dùng mô hình dự báo.')
                evidence.append(ev)
            count = sum(c.rows_current + c.rows_prior for c in decomposition.causes if c.key == 'demand')
            raw = 0.0
            status = 'insufficient'
            if agent in {'demand', 'region', 'customer', 'marketing'}:
                prefix = {'region': 'region:', 'customer': 'segment:', 'marketing': 'marketing:', 'demand': 'demand'}[agent]
                candidates = {k: v for k, v in decomposition.raw_slice_shares.items() if k.startswith(prefix)}
                key, raw = max(candidates.items(), key=lambda item: item[1], default=(prefix, 0.0))
                status = 'confirmed' if raw >= 0.10 else 'eliminated'
                numbers = {'raw_share': raw, 'total_delta_daily': decomposition.total_delta_daily,
                           'delta_daily': raw * decomposition.total_delta_daily}
                if agent == 'demand':
                    numbers['r'] = 1 + decomposition.causes[0].delta_daily / decomposition.prior_daily if decomposition.prior_daily else 1.0
                add(f"Lát cắt: {key}", numbers, ['sales_transactions', 'customers', 'marketing_campaigns'], count,
                    f"Doanh thu trung bình/ngày theo {key}; so sánh {current} với {prior}; scope={scope}")
                if agent == 'marketing' and key.startswith('marketing:'):
                    channel = key.split(':', 1)[1]
                    spends, profits = [], []
                    for start, end in (current, prior):
                        days = (end-start).days+1
                        spends.append(float(conn.scalar(sa.select(sa.func.sum(marketing.c.spend)).where(marketing.c.date.between(start,end), marketing.c.channel == channel)) or 0)/days)
                        profits.append(float(conn.scalar(sa.select(sa.func.sum(sales.c.gross_profit)).select_from(SOURCE).where(sales.c.date.between(start,end), marketing.c.channel == channel, *scope_conditions(scope))) or 0)/days)
                    add('Ảnh hưởng tới lãi; không cộng vào nguyên nhân doanh thu.',
                        {'spend_delta_daily': spends[0]-spends[1], 'gross_profit_delta_daily': profits[0]-profits[1],
                         'profit_pressure_daily': spends[0]-spends[1]-(profits[0]-profits[1])},
                        ['marketing_campaigns', 'sales_transactions'], count, f"Chi phí kênh {channel} trừ lãi gộp quy cho kênh; {prior} → {current}")
            elif agent == 'inventory':
                product_totals = []
                for start, end in (current, prior):
                    product_totals.append(dict(conn.execute(sa.select(sales.c.product_id, sa.func.sum(sales.c.revenue))
                        .select_from(SOURCE).where(sales.c.date.between(start,end), *scope_conditions(scope)).group_by(sales.c.product_id)).all()))
                now, before = product_totals
                top = sorted(now.keys() | before.keys(), key=lambda p: now.get(p,0)/((current[1]-current[0]).days+1)-before.get(p,0)/((prior[1]-prior[0]).days+1))[:5]
                values, rows = [], 0
                for start,end in (current,prior):
                    result = conn.execute(sa.select(sa.func.sum(sa.cast(inventory.c.stockout_flag, sa.Integer)),sa.func.count())
                        .where(inventory.c.date.between(start,end),inventory.c.product_id.in_(top))).one()
                    values.append(int(result[0] or 0)); rows += result[1]
                status = 'eliminated' if values[0] <= values[1] else 'confirmed'
                add('So sánh ngày hết hàng của các sản phẩm mất doanh thu nhiều nhất.',
                    {'current_stockout_days': values[0], 'prior_stockout_days': values[1]}, ['inventory_daily','sales_transactions'], rows,
                    f"SUM(stockout_flag), product_id IN {top}; {prior} → {current}")
            elif agent == 'price':
                values = []
                for start,end in (current,prior):
                    values.append(float(conn.scalar(sa.select(sa.func.avg(sales.c.discount_pct)).select_from(SOURCE)
                        .where(sales.c.date.between(start,end), *scope_conditions(scope))) or 0))
                delta = values[0]-values[1]
                status = 'eliminated' if abs(delta) < 0.02 else 'confirmed'
                add('So sánh tỷ lệ giảm giá trung bình.', {'current_discount': values[0], 'prior_discount': values[1], 'discount_delta': delta},
                    ['sales_transactions'], count, f"AVG(discount_pct); {prior} → {current}; scope={scope}")
            else:
                values, rows = [], 0
                for start,end in (current,prior):
                    result = conn.execute(sa.select(sa.func.sum(sa.cast(sa.or_(calendar.c.is_holiday, calendar.c.promotion_flag),sa.Integer)),sa.func.count())
                        .where(calendar.c.date.between(start,end))).one()
                    values.append(int(result[0] or 0)); rows += result[1]
                status = 'eliminated' if abs(values[0]-values[1]) <= 1 else 'confirmed'
                add('So sánh ngày lễ hoặc khuyến mãi.', {'current_event_days': values[0], 'prior_event_days': values[1]},
                    ['calendar_events'], rows, f"COUNT ngày lễ OR khuyến mãi; {prior} → {current}")
            if count == 0:
                status = 'insufficient'
            finding = asdict(Finding(agent, AGENTS[agent].name_vi, status, evidence))
            finding.update(raw_share=raw, text=evidence[0].claim)
        write(agent, 'finding', finding)
        return finding

    try:
        with ThreadPoolExecutor(max_workers=7) as pool:
            findings = list(pool.map(specialist, SPECIALISTS))
        raw_total = sum(f['raw_share'] for f in findings if f['status'] == 'confirmed')
        if raw_total > 1:
            write('verifier', 'rebuttal', {'reason': f'Các nguyên nhân chồng lấn nhau và chưa trừ phần nhu cầu chung (tổng {raw_total:.0%})',
                'numbers': {'raw_total': raw_total}, 'text': 'Các lát cắt chồng lấn; cần phân rã không trùng lặp.'})
            write('orchestrator', 'recompute', {'text': 'Phân rã lại, mỗi ô dữ liệu chỉ được gán một lần.'})
            with read_connection(engine) as conn:
                decomposition = decompose_revenue(conn,current,prior,scope)
        confirmed = [c for c in decomposition.causes if c.key != 'other' and c.share > 0]
        other = next(c for c in decomposition.causes if c.key == 'other')
        explained = max(0.0, min(1.0, 1-other.share))
        # A numerical accounting allocation alone is not supported causal evidence.
        # Exclude groups that fail both sample gates from the explained portion.
        unsupported = sum(c.share for c in confirmed if max(c.rows_current, c.rows_prior) < 30 and c.days < 14)
        explained = max(0.0, explained - unsupported)
        data_end = date.fromisoformat(str(info['end'])[:10])
        sufficiency = assess(explained, min((max(c.rows_current,c.rows_prior) for c in confirmed),default=0),
            min((c.days for c in confirmed),default=0), (clock_end-data_end).days*24, None)
        exclusive_evidence = Evidence('ev-verifier-exclusive','verifier','Phân rã doanh thu/ngày không chồng lấn.',
            {'total_delta_daily':decomposition.total_delta_daily,'prior_daily':decomposition.prior_daily,
             'current_daily':decomposition.current_daily,
             **{f'share_{i}':c.share for i,c in enumerate(decomposition.causes)}},
            'exact',f'Phân rã tuần tự theo kênh quảng cáo, phân khúc và khu vực; scope={scope}',
            {'tables':['sales_transactions','customers','marketing_campaigns'],
             'start':prior[0].isoformat(),'end':current[1].isoformat(),
             'rows':sum(c.rows_current+c.rows_prior for c in decomposition.causes if c.key=='demand')},
            {'type':'bar','x':'name','y':'value','rows':[{'name':c.label_vi,'value':c.delta_daily} for c in decomposition.causes]},
            None,'Phép tính kế toán, không dùng SHAP.')
        summary = {'headline': REFUSAL_TEXT if sufficiency.level == 'refused' else 'Đã kiểm tra các nguyên nhân biến động doanh thu.',
            'scope': scope, 'causes': [asdict(c) for c in decomposition.causes], 'sufficiency': asdict(sufficiency),
            'evidence': [ev for f in findings for ev in f['evidence']] + [asdict(exclusive_evidence)]}
        write('verifier','verdict', {**asdict(sufficiency), 'text': summary['headline'],
            'evidence':[asdict(exclusive_evidence)]})
        with engine.connect() as conn:
            events = __import__('backend.app.investigation.trace', fromlist=['read_after']).read_after(conn, case_id, 0)
        lines, source = narrate(events)
        write('orchestrator', 'narration', {'lines': lines, 'source': source,
              'text': 'Đã tạo lời kể từ sự kiện và bằng chứng của lượt điều tra.'})
        with engine.begin() as conn:
            conn.execute(inv_cases.update().where(inv_cases.c.id == case_id).values(summary=summary,
                status='refused' if sufficiency.level == 'refused' else 'awaiting_decision',run_state='done'))
        return summary
    except Exception:
        with engine.begin() as conn:
            conn.execute(inv_cases.update().where(inv_cases.c.id == case_id).values(run_state='failed'))
        raise
