import pytest

from menumate_engine.signals import (
    AGE_BANDS,
    age_fit_from_stats,
    age_fit_rule,
    blend_age_fit,
    load_freqfood,
    reputation,
)


def test_reputation_is_relative_to_overall_and_shrinks_small_samples():
    assert reputation(85, 15, p_all=0.85) == pytest.approx(0.5, abs=0.01)
    assert reputation(380, 20, p_all=0.85) > 0.6
    assert reputation(250, 150, p_all=0.85) < 0.4
    assert abs(reputation(3, 0, p_all=0.85) - 0.5) < 0.05
    for pos, neg in [(0, 0), (1000, 0), (0, 1000)]:
        assert 0 <= reputation(pos, neg, p_all=0.85) <= 1


def test_age_fit_from_stats_orders_bands_by_intake():
    older = age_fit_from_stats({'19~29세': 4.0, '30~49세': 6.0, '50~64세': 11.0})
    assert set(older) == set(AGE_BANDS) == {'under35', '35to54', '55plus'}
    assert older['55plus'] > older['35to54'] > older['under35']
    flat = age_fit_from_stats({'19~29세': 5.0, '30~49세': 5.0, '50~64세': 5.0})
    assert all(v == pytest.approx(0.5) for v in flat.values())
    younger = age_fit_from_stats({'19~29세': 20.0, '30~49세': 8.0, '50~64세': 4.0})
    assert younger['under35'] > younger['55plus']
    assert all(0 <= v <= 1 for v in younger.values())


def test_age_fit_rule_from_features():
    gentle = age_fit_rule({'spicy': 0.1, 'mild': 0.9, 'soup': 0.9, 'soft': 0.9, 'hearty': 0.4, 'light': 0.8})
    fiery = age_fit_rule({'spicy': 0.95, 'mild': 0.05, 'soup': 0.2, 'soft': 0.2, 'hearty': 0.9, 'light': 0.2})
    assert gentle['55plus'] > gentle['under35']
    assert fiery['under35'] > fiery['55plus']
    neutral = age_fit_rule({f: 0.5 for f in ('spicy', 'mild', 'soup', 'soft', 'hearty', 'light')})
    assert all(v == pytest.approx(0.5) for v in neutral.values())


def test_blend_uses_rule_only_without_stats():
    rule = {'under35': 0.4, '35to54': 0.5, '55plus': 0.6}
    stat = {'under35': 0.2, '35to54': 0.5, '55plus': 0.9}
    assert blend_age_fit(None, rule) == rule
    b = blend_age_fit(stat, rule)
    assert b['55plus'] == pytest.approx(0.7 * 0.9 + 0.3 * 0.6, abs=1e-3)


def test_load_freqfood_imputes_censored_cells(tmp_path):
    # 연령층마다 상위 100개만 있다. 빠진 칸은 그 칸(연도·묶음·연령층)의 최저 비율 × 0.8로 채운다
    f = tmp_path / 'ff.csv'
    rows = [
        '연도,분석기준,기준값,순위,음식,비율,표준오차',
        '2022,연령층별,50~64세,20,된장찌개,11.0,1',
        '2022,연령층별,19~29세,30,된장찌개,6.0,1',
        '2022,연령층별,19~29세,100,커피,2.0,1',
        '2022,연령층별,30~49세,100,커피,1.0,1',
        '2022,연령층별,50~64세,100,커피,1.5,1',
        '2022,연령층별,19~29세,1,된장찌개,8.0,1',  # 순위가 다시 1 → 다음 묶음 (성별로 추정)
        '2023,성별,전체,1,된장찌개,9.0,1',
    ]
    f.write_bytes('\n'.join(rows).encode('cp949'))
    ratios, observed = load_freqfood(f)
    assert ratios['된장찌개']['19~29세'] == pytest.approx(7.0)
    assert ratios['된장찌개']['30~49세'] == pytest.approx(0.8)
    assert ratios['된장찌개']['50~64세'] == pytest.approx(11.0)
    assert observed['된장찌개'] == 3
    assert observed['커피'] == 3
