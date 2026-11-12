"""Append-only demo date clock."""
from datetime import date, timedelta
import numpy as np
import sqlalchemy as sa
from fastapi import HTTPException
from backend.app import services
from backend.app.db import datasets, sales, calendar, products, customers, marketing, inventory, inv_clock, inv_cases, inv_predictions, inv_trace
from backend.app.analytics import dataset_info

TRUE_MARKETING_EXPONENT=.5

def clock(conn, company_id: str) -> dict:
    row=conn.execute(sa.select(inv_clock).where(inv_clock.c.company_id==company_id)).mappings().first()
    if not row:
        info=dataset_info(conn,company_id)
        end=date.fromisoformat(info['end'][:10])
        conn.execute(inv_clock.insert().values(company_id=company_id,base_end=end,current_end=end))
        return {'base_end':end.isoformat(),'current_end':end.isoformat()}
    return {'base_end':row['base_end'].isoformat(),'current_end':row['current_end'].isoformat()}

def _guard(conn, company_id):
    info=dataset_info(conn,company_id)
    if company_id!='comp-default' or info.get('storage_mode')!='legacy_snapshot':
        raise HTTPException(422,'Cỗ máy thời gian chỉ dùng cho bộ dữ liệu mẫu.')
    return info

def advance(engine, company_id: str, days: int) -> dict:
    if days not in (1,7): raise HTTPException(422,'Chỉ được tua 1 hoặc 7 ngày.')
    with engine.begin() as conn:
        info=_guard(conn,company_id); current=clock(conn,company_id); end=date.fromisoformat(current['current_end'])
        for offset in range(1,days+1):
            d=end+timedelta(days=offset); rng=np.random.default_rng(42*100000+d.toordinal())
            conn.execute(calendar.insert().values(date=d,day_of_week=d.weekday(),month=d.month,quarter=(d.month-1)//3+1,
                is_weekend=d.weekday()>=5,is_holiday=False,event_name=None,promotion_flag=False))
            active=conn.execute(sa.select(inv_predictions.c.option_key).join(inv_cases,inv_predictions.c.case_id==inv_cases.c.id)
                .where(inv_cases.c.company_id==company_id,inv_predictions.c.status=='tracking',inv_predictions.c.start_date<d)).scalars().all()
            recent=conn.execute(sa.select(sales.c.product_id,sales.c.region,sales.c.sales_channel,
                sa.func.count(),sa.func.avg(sales.c.quantity)).where(sales.c.date.between(d-timedelta(days=28),d-timedelta(days=1)))
                .group_by(sales.c.product_id,sales.c.region,sales.c.sales_channel)).all()
            customer_ids=conn.execute(sa.select(customers.c.customer_id).order_by(customers.c.customer_id)).scalars().all()
            sold_by_product={}
            for i,(sku,region,channel,count,avg) in enumerate(recent):
                prod=conn.execute(sa.select(products).where(products.c.product_id==sku)).mappings().first()
                expected=float(count or 0)/28
                price_multiplier=1.0
                for key in active:
                    parts=key.split(':')
                    if len(parts)==3 and parts[0]=='price' and parts[1]==sku:
                        discount=float(parts[2]); price_multiplier*=1-discount
                        expected*= (1-discount)**float(prod['elasticity'])
                    elif len(parts)==3 and parts[0]=='marketing' and parts[1]==channel:
                        expected*= (1+float(parts[2]))**TRUE_MARKETING_EXPONENT
                if not customer_ids: continue
                orders=int(rng.poisson(max(0,expected)))
                if not orders: continue
                qty=max(1,int(round(orders*float(avg or 1))))
                price=max(1,int(round(prod['list_price']*price_multiplier)))
                cost=int(prod['unit_cost']); tid=f'T{d:%Y%m%d}{i:05d}'
                cust=customer_ids[int(rng.integers(0,len(customer_ids)))]
                conn.execute(sales.insert().values(transaction_id=tid,date=d,customer_id=cust,product_id=sku,quantity=qty,
                    unit_price=price,discount_pct=0,revenue=price*qty,unit_cost=cost,total_cost=cost*qty,
                    gross_profit=(price-cost)*qty,region=region,sales_channel=channel,campaign_id=None))
                sold_by_product[sku]=sold_by_product.get(sku,0)+qty
            for prod in conn.execute(sa.select(products).where(products.c.is_physical.is_(True))).mappings():
                sku=prod['product_id']
                old=conn.execute(sa.select(inventory.c.closing_stock).where(inventory.c.product_id==sku,
                    inventory.c.date<d).order_by(inventory.c.date.desc()).limit(1)).scalar_one_or_none()
                opening=int(old if old is not None else prod['current_stock'])
                received=max(0,int(prod['reorder_point'] or 0)*2) if opening<=int(prod['reorder_point'] or 0) else 0
                sold=min(sold_by_product.get(sku,0),opening+received)
                closing=opening+received-sold
                conn.execute(inventory.insert().values(date=d,product_id=sku,opening_stock=opening,received_qty=received,
                    sold_qty=sold,closing_stock=closing,stockout_flag=closing==0))
            conn.execute(datasets.update().where(datasets.c.id==1).values(payload={**info,'end':d.isoformat()}))
        conn.execute(inv_clock.update().where(inv_clock.c.company_id==company_id).values(current_end=end+timedelta(days=days)))
    services.clear_caches()
    try:
        from backend.app.investigation.scoring import update_tracking
    except ImportError:
        pass  # Task 8 adds outcome scoring after the clock is implemented.
    else:
        update_tracking(engine,company_id,end+timedelta(days=days))
    return {'base_end':current['base_end'],'current_end':(end+timedelta(days=days)).isoformat()}

def reset(engine, company_id: str) -> dict:
    with engine.begin() as conn:
        info=_guard(conn,company_id); current=clock(conn,company_id); base=date.fromisoformat(current['base_end'])
        for table in (sales,inventory,marketing,calendar): conn.execute(table.delete().where(table.c.date>base))
        seeded_cases=sa.select(inv_predictions.c.case_id).where(inv_predictions.c.seeded.is_(True))
        cases=sa.select(inv_cases.c.id).where(inv_cases.c.company_id==company_id)
        conn.execute(inv_trace.delete().where(inv_trace.c.case_id.in_(cases)))
        conn.execute(inv_predictions.delete().where(inv_predictions.c.case_id.in_(cases),inv_predictions.c.seeded.is_(False)))
        conn.execute(inv_cases.delete().where(inv_cases.c.company_id==company_id,inv_cases.c.id.not_in(seeded_cases)))
        conn.execute(datasets.update().where(datasets.c.id==1).values(payload={**info,'end':base.isoformat()}))
        conn.execute(inv_clock.update().where(inv_clock.c.company_id==company_id).values(current_end=base))
    services.clear_caches()
    return {'base_end':base.isoformat(),'current_end':base.isoformat()}
