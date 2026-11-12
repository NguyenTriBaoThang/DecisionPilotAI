import pytest

from backend.app.investigation.evidence import assess


@pytest.mark.parametrize('args,level', [
    ((0.49, 100, 30, 1, None), 'refused'),
    ((0.6, 100, 30, 1, None), 'unsure'),
    ((0.85, 100, 30, 1, 0.24), 'certain'),
    ((0.85, 100, 30, 72, None), 'likely'),
    ((0.6, 12, 5, 1, None), 'refused'),
    ((0.70, 30, 0, 48, 0.30), 'certain'),
    ((0.70, 0, 14, 48, None), 'certain'),
    ((0.85, 12, 5, 72, None), 'unsure'),
    ((0.50, 30, 0, 1, None), 'unsure'),
])
def test_assess_levels(args, level):
    result = assess(*args)
    assert result.level == level
    assert {c['rule'] for c in result.checks} == {'explained_share', 'min_sample', 'freshness', 'wape'}


def test_assess_stale_downgrades():
    result = assess(0.85, 100, 30, 72, None)
    assert result.level == 'likely'
    assert any('48 giờ' in reason for reason in result.missing)


def test_numbers_in_parses_vietnamese_formats():
    from backend.app.investigation.narration import numbers_in
    assert set(numbers_in('giảm 18%, mất 1,9 tỷ, 44% → 20%, 1.240')) >= {18, 1.9e9, 44, 20, 1240}


def test_check_numbers_rejects_invented():
    from backend.app.investigation.narration import check_numbers
    assert not check_numbers('giảm 25%', [0.18])
    assert check_numbers('giảm 18%', [0.18])


def test_llm_invented_number_replaced(monkeypatch):
    from backend.app.investigation.narration import narrate, template_line
    from ai_service.llm_orchestrator import PROVIDERS
    class Provider:
        def extract(self, prompt, question):
            return '{"lines":[{"seq":1,"text":"Giảm 99%"}]}'
    monkeypatch.setitem(PROVIDERS, 'test', (Provider, 'INV_TEST_KEY'))
    monkeypatch.setenv('INV_TEST_KEY', 'test')
    event = {'seq': 1, 'type': 'finding', 'payload': {'text': 'Đã kiểm tra doanh thu.', 'numbers': {'share': 0.18}}}
    lines, _ = narrate([event], 'test')
    assert lines == [{'seq': 1, 'text': template_line(event)}]
