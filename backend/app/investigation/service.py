"""Case detection and guarded background investigation runs."""
from datetime import date
from threading import Thread
from uuid import uuid4
import sqlalchemy as sa
from fastapi import HTTPException
from backend.app.analytics import dataset_info
from backend.app.db import inv_cases
from backend.app.investigation.decomposition import decompose_revenue, month_periods
from backend.app.investigation.agents import run_investigation


def require_demo(conn, company_id):
    info=dataset_info(conn,company_id)
    if company_id!='comp-default' or info.get('storage_mode')!='legacy_snapshot':
        raise HTTPException(422,'Điều tra tự động hiện chỉ hỗ trợ bộ dữ liệu mẫu.')
    return info


def scan(engine, company_id):
    with engine.begin() as conn:
        info=require_demo(conn,company_id)
        existing=conn.execute(sa.select(inv_cases.c.id).where(inv_cases.c.company_id==company_id,
            inv_cases.c.dataset_id==info['dataset_id'],inv_cases.c.kind=='revenue_drop').limit(1)).scalar_one_or_none()
        if existing: return existing
        current,prior=month_periods(date.fromisoformat(info['end'][:10]))
        decomp=decompose_revenue(conn,current,prior)
        if decomp.total_delta_daily>=0: return None
        case_id='case-'+uuid4().hex
        conn.execute(inv_cases.insert().values(id=case_id,company_id=company_id,dataset_id=info['dataset_id'],kind='revenue_drop',
            status='new',title=f'Doanh thu {current[0]:%m/%Y} giảm',impact_vnd=round(-decomp.total_delta_daily*((current[1]-current[0]).days+1)),
            period_current=[v.isoformat() for v in current],period_prior=[v.isoformat() for v in prior],summary=None,run_state='idle'))
        return case_id


def start_run(engine,case_id,company_id):
    with engine.begin() as conn:
        info=require_demo(conn,company_id)
        case=conn.execute(sa.select(inv_cases).where(inv_cases.c.id==case_id,inv_cases.c.company_id==company_id)).mappings().first()
        if not case: raise HTTPException(404,'Không tìm thấy vụ việc.')
        result=conn.execute(inv_cases.update().where(inv_cases.c.id==case_id,inv_cases.c.run_state=='idle').values(run_state='running',status='investigating'))
    if result.rowcount:
        def worker():
            try: run_investigation(engine,case_id,info,date.fromisoformat(info['end'][:10]))
            except Exception:
                with engine.begin() as conn:
                    conn.execute(inv_cases.update().where(inv_cases.c.id==case_id).values(run_state='failed'))
        Thread(target=worker,daemon=True).start()
    return {'run_state':'running' if result.rowcount else case['run_state']}
