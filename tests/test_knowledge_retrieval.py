from ai_service.knowledge import answer, chunks


def test_empty_knowledge_abstains():
    result = answer('Chính sách đổi trả là gì?', [])
    assert result['mode'] == 'no_evidence'
    assert result['sources'] == []


def test_retrieval_exposes_original_passage(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'none')
    passage = 'Chính sách đổi trả: thiết bị lỗi kỹ thuật được đổi mới trong 14 ngày.'
    result = answer('Chính sách đổi trả thiết bị lỗi', [{'id': 'doc1', 'title': 'Chính sách', 'content': passage}])
    assert result['mode'] == 'extractive'
    assert result['sources'][0]['excerpt'] == passage
    assert result['sources'][0]['document_id'] == 'doc1'
    assert '[S1]' in result['answer']


def test_chunking_preserves_short_document():
    assert chunks('Một tài liệu ngắn.') == ['Một tài liệu ngắn.']


def test_graph_expands_to_connected_evidence_only(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'none')
    result = answer('Alpha device', [
        {'id': 'a', 'title': 'Alpha device', 'content': 'Alpha device sales', 'entities': ['product:Alpha']},
        {'id': 'b', 'title': 'Kho', 'content': 'Còn 12 chiếc.', 'entities': ['product:Alpha']},
        {'id': 'c', 'title': 'Khác', 'content': 'Còn 99 chiếc.', 'entities': ['product:Other']},
    ])
    by_id = {s['document_id']: s for s in result['sources']}
    assert by_id['b']['retrieval'] == 'graph'
    assert by_id['b']['via'] == by_id['a']['id']
    assert by_id['b']['relations'] == ['product:Alpha']
    assert 'c' not in by_id


def test_active_snapshot_replaces_rag_evidence(tmp_path, monkeypatch):
    import copy
    import sqlalchemy as sa
    import pytest
    from fastapi.testclient import TestClient
    from backend.app.db import metadata, make_engine, sales
    from backend.app.main import create_app
    from backend.app.dataset_knowledge import active_documents
    from scripts.generate import generate
    from scripts.pipeline import load_snapshot

    monkeypatch.setenv('LLM_PROVIDER', 'none')
    engine = make_engine('sqlite:///' + str(tmp_path / 'rag.sqlite'))
    metadata.create_all(engine)
    data, manifest = generate(months=6, transactions=800, sku_count=8, customer_count=100)
    load_snapshot(engine, data, manifest)
    info, docs = active_documents(engine)
    with engine.connect() as conn:
        total = conn.scalar(sa.select(sa.func.sum(sales.c.revenue)))
    assert str(total) in docs[0]['content']
    assert all(doc['dataset_id'] == info['dataset_id'] for doc in docs)
    with TestClient(create_app(engine)) as http:
        graph = http.get('/knowledge/graph').json()
        assert graph['dataset_id'] == info['dataset_id']
        node_ids = {n['id'] for n in graph['nodes']}
        assert graph['edges']
        assert all(e['source'] in node_ids and e['target'] in node_ids for e in graph['edges'])
        response = http.post('/knowledge/query', json={'question': 'Tổng quan doanh thu lợi nhuận toàn bộ dữ liệu'})
        assert response.status_code == 200
        assert response.json()['dataset_id'] == info['dataset_id']
        assert response.json()['sources']
        monthly = http.post('/knowledge/query', json={'question': 'Doanh thu tháng 2026-09 là bao nhiêu?'})
        assert monthly.status_code == 200
        assert monthly.json()['sources']
        assert '2026-09' in monthly.json()['sources'][0]['title']

        changed = copy.deepcopy(data)
        changed['products'][0]['product_name'] = 'SAN_PHAM_MOI_RAG'
        load_snapshot(engine, changed, manifest, expected_id=info['dataset_id'])
        newer, new_docs = active_documents(engine)
        assert newer['dataset_id'] != info['dataset_id']
        assert 'SAN_PHAM_MOI_RAG' in str(new_docs)
        assert all(doc['dataset_id'] == newer['dataset_id'] for doc in new_docs)
        updated_graph = http.get('/knowledge/graph').json()
        assert updated_graph['dataset_id'] == newer['dataset_id']
        assert all(n['id'].startswith(newer['dataset_id']) for n in updated_graph['nodes'])
        response = http.post('/knowledge/query', json={'question': 'Sản phẩm SAN_PHAM_MOI_RAG'})
        assert response.status_code == 200
        assert response.json()['dataset_id'] == newer['dataset_id']
        assert all(s['dataset_id'] == newer['dataset_id'] for s in response.json()['sources'])

        broken = copy.deepcopy(changed)
        broken['inventory_daily'][0]['closing_stock'] += 1
        with pytest.raises(ValueError):
            load_snapshot(engine, broken, manifest, expected_id=newer['dataset_id'])
        assert active_documents(engine)[0]['dataset_id'] == newer['dataset_id']

        # Reject an answer generated while another user switches snapshots.
        def switched_answer(question, documents):
            load_snapshot(engine, data, manifest, expected_id=newer['dataset_id'])
            return {'answer': 'stale', 'sources': [], 'mode': 'extractive'}
        monkeypatch.setattr('backend.app.knowledge.answer', switched_answer)
        assert http.post('/knowledge/query', json={'question': 'Doanh thu'}).status_code == 409
    engine.dispose()
