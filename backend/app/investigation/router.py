"""Investigation brief, cases, traces, decisions and demo clock."""
from datetime import date
from typing import Annotated
from fastapi import APIRouter, Header, HTTPException, Request
import sqlalchemy as sa
from backend.app.db import inv_cases, inv_predictions
from backend.app.ingestion.router import require_role, resolve_tenant
from backend.app.investigation import service, scoring, strategy, timemachine
from backend.app.investigation.trace import read_after
from backend.app.analytics import dataset_info
from backend.app.schemas import Question, Filters
from ai_service.llm_orchestrator import query


def build_investigation_router(engine) -> APIRouter:
    router=APIRouter(tags=['AI Investigation Loop'])
    def tenant(request, company_header):
        cid=resolve_tenant(request,company_header)
        with engine.connect() as conn: service.require_demo(conn,cid)
        return cid
    def case_row(conn,case_id,cid):
        row=conn.execute(sa.select(inv_cases).where(inv_cases.c.id==case_id,inv_cases.c.company_id==cid)).mappings().first()
        if row is None: raise HTTPException(404,'Không tìm thấy vụ việc.')
        return dict(row)
    @router.get('/investigation/brief')
    def brief(request:Request,x_company_id:Annotated[str|None,Header()]=None):
        require_role(request,'viewer'); cid=tenant(request,x_company_id)
        service.scan(engine,cid)
        scoring.seed_history(engine,cid)
        with engine.begin() as conn:
            cases=[dict(r) for r in conn.execute(sa.select(inv_cases).where(inv_cases.c.company_id==cid).order_by(inv_cases.c.impact_vnd.desc())).mappings()]
            return {'clock':timemachine.clock(conn,cid),'cases':cases,'scorecard':scoring.scorecard(conn,cid)}
    @router.get('/investigation/cases/{case_id}')
    def get_case(case_id:str,request:Request,x_company_id:Annotated[str|None,Header()]=None):
        require_role(request,'viewer');cid=tenant(request,x_company_id)
        with engine.connect() as conn:
            row=case_row(conn,case_id,cid)
            pred=conn.execute(sa.select(inv_predictions).where(inv_predictions.c.case_id==case_id)).mappings().first()
            info=dataset_info(conn,cid)
            options=[] if not row['summary'] or row['status']=='refused' else [o.__dict__ for o in strategy.build_options(conn,info,row['summary'])]
            return {**row,'options':options,'prediction':dict(pred) if pred else None,
                'progress':scoring.progress(conn,dict(pred),date.fromisoformat(info['end'][:10])) if pred else None}
    @router.post('/investigation/cases/{case_id}/run')
    def run(case_id:str,request:Request,x_company_id:Annotated[str|None,Header()]=None):
        require_role(request,'analyst');cid=tenant(request,x_company_id)
        return service.start_run(engine,case_id,cid)
    @router.get('/investigation/cases/{case_id}/trace')
    def trace(case_id:str,request:Request,after:int=0,x_company_id:Annotated[str|None,Header()]=None):
        require_role(request,'viewer');cid=tenant(request,x_company_id)
        with engine.connect() as conn:
            row=case_row(conn,case_id,cid)
            return {'events':read_after(conn,case_id,after),'run_state':row['run_state']}
    @router.post('/investigation/cases/{case_id}/decide')
    def decide(case_id:str,body:dict,request:Request,x_company_id:Annotated[str|None,Header()]=None):
        identity=require_role(request,'analyst');cid=tenant(request,x_company_id)
        with engine.connect() as conn:
            case_row(conn,case_id,cid)
            today=date.fromisoformat(dataset_info(conn,cid)['end'][:10])
        return strategy.decide(engine,case_id,str(body.get('option_key','')),identity['actor'],today)
    @router.post('/investigation/cases/{case_id}/ask')
    def ask(case_id:str,body:dict,request:Request,x_company_id:Annotated[str|None,Header()]=None):
        require_role(request,'viewer');cid=tenant(request,x_company_id)
        with engine.connect() as conn:
            row=case_row(conn,case_id,cid)
            scope=(row.get('summary') or {}).get('scope') or {}
            context=Filters(start=row['period_current'][0],end=row['period_current'][1],
                product=scope.get('product'),region=scope.get('region'),channel=scope.get('channel'))
            return query(conn,dataset_info(conn,cid),Question(question=str(body.get('question','')),context=context))
    @router.get('/investigation/clock')
    def clock(request:Request,x_company_id:Annotated[str|None,Header()]=None):
        require_role(request,'viewer');cid=tenant(request,x_company_id)
        with engine.begin() as conn: return timemachine.clock(conn,cid)
    @router.post('/investigation/clock/advance')
    def advance(body:dict,request:Request,x_company_id:Annotated[str|None,Header()]=None):
        require_role(request,'analyst');cid=tenant(request,x_company_id)
        return timemachine.advance(engine,cid,body.get('days'))
    @router.post('/investigation/clock/reset')
    def reset(request:Request,x_company_id:Annotated[str|None,Header()]=None):
        require_role(request,'analyst');cid=tenant(request,x_company_id)
        return timemachine.reset(engine,cid)
    return router
