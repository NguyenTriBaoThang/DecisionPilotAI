"""Outcome tracking, scoring and forecast calibration."""
from datetime import date, timedelta
from calendar import monthrange
from uuid import uuid4
import sqlalchemy as sa
from backend.app.db import inv_cases, inv_predictions, sales, marketing


def verdict(predicted: float, actual: float) -> str:
    same_sign = (predicted == 0 or actual == 0 or (predicted > 0) == (actual > 0))
    both_small = abs(predicted) < .01 and abs(actual) < .01
    return "correct" if (both_small or (same_sign and abs(actual-predicted) <= .5*max(abs(predicted), .01))) else "wrong"


def calibration_factor(conn, company_id: str, kind: str) -> float:
    rows = conn.execute(sa.select(inv_predictions.c.predicted_delta_pct, inv_predictions.c.actual_delta_pct)
        .select_from(inv_predictions.join(inv_cases, inv_predictions.c.case_id == inv_cases.c.id))
        .where(inv_cases.c.company_id==company_id, inv_cases.c.kind==kind, inv_predictions.c.status=='scored',
               inv_predictions.c.predicted_delta_pct!=0)).all()
    return max(.3,min(1.5,sum(a/p for p,a in rows)/len(rows))) if rows else 1.0


def progress(conn, prediction: dict, today: date) -> dict:
    start=prediction['start_date']; horizon=prediction['horizon_days']; day=max(0,min(horizon,(today-start).days))
    base=max(float(prediction['baseline_daily']),1.0); scope=prediction.get('scope') or {}
    measure=sales.c.gross_profit if prediction['metric']=='gross_profit' else sales.c.revenue
    q=sa.select(sa.func.sum(measure)).where(sales.c.date.between(start+timedelta(days=1), today))
    for key,col in [('product',sales.c.product_id),('region',sales.c.region)]:
        if key in scope: q=q.where(col==scope[key])
    if scope.get('channel'):
        q=q.select_from(sales.join(marketing,sa.and_(sales.c.campaign_id==marketing.c.campaign_id,
            sales.c.date==marketing.c.date))).where(marketing.c.channel==scope['channel'])
    observed=float(conn.scalar(q) or 0)/max(1,(today-start).days)
    actual=observed/base-1
    return {'day':day,'horizon':horizon,'actual_delta_pct':actual,'predicted_delta_pct':prediction['calibrated_delta_pct'],'on_track':abs(actual-prediction['calibrated_delta_pct']) < max(.01,abs(prediction['calibrated_delta_pct'])*.5)}


def update_tracking(engine, company_id: str, today: date) -> list[str]:
    scored=[]
    with engine.begin() as conn:
        rows=conn.execute(sa.select(inv_predictions).join(inv_cases,inv_predictions.c.case_id==inv_cases.c.id).where(
            inv_cases.c.company_id==company_id,inv_predictions.c.status=='tracking')).mappings().all()
        for row in rows:
            if (today-row['start_date']).days < row['horizon_days']: continue
            result=progress(conn,dict(row),today); actual=result['actual_delta_pct']
            conn.execute(inv_predictions.update().where(inv_predictions.c.id==row['id']).values(status='scored',actual_delta_pct=actual,
                verdict=verdict(row['calibrated_delta_pct'],actual),scored_at=sa.func.current_timestamp()))
            conn.execute(inv_cases.update().where(inv_cases.c.id==row['case_id']).values(status='scored'))
            scored.append(row['id'])
    return scored


def scorecard(conn, company_id: str) -> dict:
    rows=conn.execute(sa.select(inv_predictions.c.verdict,inv_cases.c.kind).join(inv_cases,inv_predictions.c.case_id==inv_cases.c.id)
        .where(inv_cases.c.company_id==company_id,inv_predictions.c.status=='scored')).all()
    by_kind={}
    for decision,kind in rows:
        item=by_kind.setdefault(kind,{'scored':0,'correct':0})
        item['scored']+=1;item['correct']+=int(decision=='correct')
    lessons=[]
    for kind in by_kind:
        factor=calibration_factor(conn,company_id,kind)
        if abs(factor-1)>.15:
            lessons.append(f"Lần trước mình đoán {'quá lạc quan' if factor<1 else 'quá thận trọng'} {abs(1-factor):.0%} với {kind}.")
    return {'scored':len(rows),'correct':sum(r[0]=='correct' for r in rows),'by_kind':by_kind,'lessons':lessons}


def seed_history(engine, company_id: str) -> int:
    if company_id!='comp-default': return 0
    with engine.begin() as conn:
        existing=conn.scalar(sa.select(sa.func.count()).select_from(inv_predictions).where(inv_predictions.c.seeded.is_(True)))
        if existing: return int(existing)
        candidates=[]
        for year in (2024,2025):
            for month in range(1,13):
                if (year,month)<(2024,11) or (year,month)>(2025,12): continue
                end=date(year,month,monthrange(year,month)[1]); start=end.replace(day=1)
                prior_end=start-timedelta(days=1); prior_start=prior_end.replace(day=1)
                now=float(conn.scalar(sa.select(sa.func.sum(sales.c.revenue)).where(sales.c.date.between(start,end))) or 0)/((end-start).days+1)
                old=float(conn.scalar(sa.select(sa.func.sum(sales.c.revenue)).where(sales.c.date.between(prior_start,prior_end))) or 0)/((prior_end-prior_start).days+1)
                if old>0: candidates.append((now/old-1,end,start,prior_start,prior_end))
        from backend.app.analytics import dataset_info
        info=dataset_info(conn,company_id)
        for _,end,start,prior_start,prior_end in sorted(candidates)[:3]:
            baseline=float(conn.scalar(sa.select(sa.func.sum(sales.c.revenue)).where(sales.c.date.between(end-timedelta(days=27),end))) or 0)/28
            future=float(conn.scalar(sa.select(sa.func.sum(sales.c.revenue)).where(sales.c.date.between(end+timedelta(days=1),end+timedelta(days=14)))) or 0)/14
            actual=future/baseline-1 if baseline else 0.0
            case_id='seed-'+uuid4().hex
            conn.execute(inv_cases.insert().values(id=case_id,company_id=company_id,dataset_id=info['dataset_id'],kind='revenue_drop',
                status='scored',title=f'Doanh thu {end:%m/%Y}',impact_vnd=0,period_current=[start.isoformat(),end.isoformat()],
                period_prior=[prior_start.isoformat(),prior_end.isoformat()],summary=None,run_state='done'))
            conn.execute(inv_predictions.insert().values(id='pred-'+uuid4().hex,case_id=case_id,option_key='hold',metric='revenue',
                scope={},baseline_daily=baseline,predicted_delta_pct=0.0,calibrated_delta_pct=0.0,start_date=end,horizon_days=14,
                status='scored',actual_delta_pct=actual,verdict=verdict(0.0,actual),scored_at=sa.func.current_timestamp(),seeded=True))
        return min(3,len(candidates))
