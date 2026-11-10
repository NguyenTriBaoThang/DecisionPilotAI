"""Build source evidence from one consistent active snapshot; never cache old data."""
from datetime import date, timedelta
import json

import sqlalchemy as sa

from backend.app.analytics import dataset_info, grouped, sales_total, marketing_summary
from backend.app.db import read_connection, inventory, products, sales


def active_documents(engine):
    with read_connection(engine) as conn:
        info = dataset_info(conn)
        identifier = info['dataset_id']
        start, end = date.fromisoformat(info['start']), date.fromisoformat(info['end'])
        docs = []

        def add(title, table, values, period=None, entities=None):
            content = (f'{title}. Kỳ dữ liệu: {period or str(start) + " đến " + str(end)}. '
                       f'Đơn vị tiền: {info.get("currency", "VND")}. '
                       + json.dumps(values, ensure_ascii=False, default=str))
            docs.append(dict(id=f'{identifier}:{len(docs)}', title=title, content=content,
                             dataset_id=identifier, table=table, entities=entities or [],
                             values=values, period=period or f'{start} đến {end}'))

        labels = {'revenue': 'doanh thu', 'gross_profit': 'lợi nhuận gộp', 'orders': 'số đơn hàng',
                  'units': 'số lượng bán', 'customers': 'khách hàng', 'margin': 'biên lợi nhuận',
                  'aov': 'giá trị đơn trung bình', 'spend': 'chi phí quảng cáo',
                  'attributed_revenue': 'doanh thu quy thuộc quảng cáo'}

        def translated(values):
            return {labels.get(k, k): v for k, v in values.items()}

        add('Tổng quan doanh thu và lợi nhuận toàn bộ dữ liệu', 'sales_transactions',
            translated(sales_total(conn, start, end, {})))
        year_key, month_key = sa.extract('year', sales.c.date), sa.extract('month', sales.c.date)
        monthly = {(int(r['year']), int(r['month'])): dict(r) for r in conn.execute(sa.select(
            year_key.label('year'), month_key.label('month'),
            sa.func.sum(sales.c.revenue).label('revenue'),
            sa.func.sum(sales.c.gross_profit).label('gross_profit'),
            sa.func.sum(sales.c.quantity).label('units'), sa.func.count().label('orders'),
            sa.func.count(sa.distinct(sales.c.customer_id)).label('customers')
        ).group_by(year_key, month_key)).mappings()}
        month = start
        while month <= end:
            following = date(month.year + (month.month == 12), month.month % 12 + 1, 1)
            last = min(end, following - timedelta(days=1))
            add(f'Doanh thu lợi nhuận tháng {month:%Y-%m}', 'sales_transactions',
                translated({k: v for k, v in monthly.get((month.year, month.month), dict(revenue=0, gross_profit=0, units=0, orders=0, customers=0)).items() if k not in ('year', 'month')}), f'{month} đến {last}')
            month = following
        category_by_product = dict(conn.execute(sa.select(products.c.product_name, products.c.category)).all())
        for row in conn.execute(sa.select(products)).mappings():
            add(f'Hồ sơ sản phẩm: {row["product_name"]}', 'products',
                {'mã sản phẩm': row['product_id'], 'tên sản phẩm': row['product_name'],
                 'danh mục': row['category'], 'thương hiệu': row['brand'],
                 'nhà cung cấp': row['supplier'], 'giá niêm yết': row['list_price'],
                 'giá vốn đơn vị': row['unit_cost'], 'điểm đặt hàng lại': row['reorder_point'],
                 'thời gian nhập hàng (ngày)': row['lead_time_days']},
                entities=[f'product:{row["product_name"]}', f'category:{row["category"]}'])
        for dimension, title in [('product', 'Sản phẩm'), ('category', 'Danh mục'),
                                 ('region', 'Khu vực'), ('channel', 'Kênh bán hàng'),
                                 ('segment', 'Phân khúc khách hàng')]:
            for row in grouped(conn, start, end, {}, dimension):
                add(f'{title}: {row["name"]}', 'sales_transactions, products, customers', translated(row),
                    entities=[f'{dimension}:{row["name"]}'] +
                    ([f'category:{category_by_product[row["name"]]}'] if dimension == 'product' else []))
        _, channels = marketing_summary(conn, start, end)
        for row in channels:
            add(f'Quảng cáo marketing: {row["name"]}', 'marketing_campaigns, sales_transactions', translated(row), entities=[f'marketing:{row["name"]}'])
        latest = conn.scalar(sa.select(sa.func.max(inventory.c.date)))
        if latest:
            query = sa.select(products.c.product_name, inventory.c.closing_stock,
                              inventory.c.stockout_flag).select_from(inventory.join(products)).where(inventory.c.date == latest)
            for row in conn.execute(query).mappings():
                add(f'Tồn kho {row["product_name"]}', 'inventory_daily, products',
                    {'tồn cuối ngày': row['closing_stock'], 'hết hàng': row['stockout_flag']}, str(latest), entities=[f'product:{row["product_name"]}'])
        return info, docs


def knowledge_graph(info, documents):
    nodes, edges = {}, []
    for doc in documents:
        if not doc.get('content', '').strip():
            continue
        nodes[doc['id']] = dict(id=doc['id'], label=doc['title'], kind='evidence',
                                detail=doc['content'], table=doc['table'],
                                facts=[dict(title=doc['title'], values=doc.get('values', {}),
                                            period=doc.get('period'), table=doc['table'], source_id=doc['id'])],
                                dataset_id=info['dataset_id'], dataset_kind=info.get('kind'))
        for entity in doc.get('entities', []):
            kind, label = entity.split(':', 1)
            entity_id = info['dataset_id'] + ':entity:' + entity
            node = nodes.setdefault(entity_id, dict(id=entity_id, label=label, kind=kind,
                detail='', facts=[], dataset_id=info['dataset_id'], dataset_kind=info.get('kind'), tables=[]))
            if doc['table'] not in node['tables']:
                node['tables'].append(doc['table'])
            # Only attach facts directly about this entity; never sum overlapping sources.
            if entity == doc['entities'][0]:
                node['facts'].append(dict(title=doc['title'], values=doc.get('values', {}),
                    period=doc.get('period'), table=doc['table'], source_id=doc['id']))
                node['detail'] += doc['content'] + '\n'
            edges.append(dict(source=entity_id, target=doc['id'], label='có căn cứ'))
    # Remove entities with no direct evidence instead of displaying placeholder nodes.
    nodes = {key: node for key, node in nodes.items() if node['facts']}
    edges = [edge for edge in edges if edge['source'] in nodes and edge['target'] in nodes]
    return dict(dataset_id=info['dataset_id'], dataset_kind=info.get('kind'),
                nodes=list(nodes.values()), edges=edges)
