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
