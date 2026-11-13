from datetime import date
import sqlalchemy as sa

from backend.app.db import datasets, sales, marketing, inventory, inv_predictions, audit_hash_chain
from backend.app.investigation.timemachine import advance, reset
from test_investigation import inv_env, make_case


def test_advance_appends_without_touching_history(inv_env):
    engine = inv_env[1]
    with engine.connect() as conn:
        old = conn.execute(sa.select(sales).where(sales.c.date <= date(2026, 9, 30)).order_by(sales.c.transaction_id)).all()
        dataset_id = conn.scalar(sa.select(datasets.c.payload))['dataset_id']
    advanced = advance(engine, 'comp-default', 7)
    assert advanced['current_end'] == '2026-10-07'
    with engine.connect() as conn:
        assert conn.execute(sa.select(sales).where(sales.c.date <= date(2026, 9, 30)).order_by(sales.c.transaction_id)).all() == old
        assert conn.scalar(sa.select(datasets.c.payload))['dataset_id'] == dataset_id
        assert conn.scalar(sa.select(sa.func.max(sales.c.date))) == date(2026, 10, 7)
    reset(engine, 'comp-default')


def test_marketing_effect_and_inventory_balances(inv_env):
    engine=inv_env[1]
    with engine.connect() as conn:
        previous=conn.scalar(sa.select(sa.func.sum(marketing.c.spend)).where(
            marketing.c.channel=='Facebook Ads',marketing.c.date.between(date(2026,9,3),date(2026,9,30))))
        chain_before=conn.scalar(sa.select(sa.func.count()).select_from(audit_hash_chain))
    case_id,_=make_case(engine)
    with engine.begin() as conn:
        conn.execute(inv_predictions.insert().values(id='pred-clock-marketing',case_id=case_id,
            option_key='marketing:Facebook Ads:-0.3',metric='gross_profit',scope={'channel':'Facebook Ads'},
            baseline_daily=1,predicted_delta_pct=0,calibrated_delta_pct=0,start_date=date(2026,9,30),
            horizon_days=14,status='tracking',seeded=False))
    try:
        advance(engine,'comp-default',1)
        with engine.connect() as conn:
            spend=conn.scalar(sa.select(sa.func.sum(marketing.c.spend)).where(
                marketing.c.channel=='Facebook Ads',marketing.c.date==date(2026,10,1)))
            assert abs(spend-previous/28*.7)<=1
            for sku,sold in conn.execute(sa.select(sales.c.product_id,sa.func.sum(sales.c.quantity))
                    .where(sales.c.date==date(2026,10,1)).group_by(sales.c.product_id)):
                stock_sold=conn.scalar(sa.select(inventory.c.sold_qty).where(
                    inventory.c.product_id==sku,inventory.c.date==date(2026,10,1)))
                if stock_sold is not None: assert sold==stock_sold
    finally:
        reset(engine,'comp-default')
    with engine.connect() as conn:
        assert conn.scalar(sa.select(sa.func.count()).select_from(audit_hash_chain))>=chain_before
