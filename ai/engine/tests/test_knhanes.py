import pytest

from menumate_engine.knhanes import band_of, knhanes_age_fit, match_dish, prevalence
from menumate_engine.signals import age_fit_from_band_values


def names(dish):
    return match_dish(dish)


def test_match_dish_to_menus():
    assert names('돼지고기김치찌개') == {'m002'}
    assert names('두부된장찌개') == {'m001'}
    assert names('순두부찌개') == {'m003'}
    assert names('순대국') == {'m008'}
    assert names('순대국밥') == {'m008'}
    assert names('돌솥비빔밥') == {'m013'}
    assert names('나물비빔밥') == {'m012'}
    assert names('평양물냉면') == {'m021'}
    assert names('소불고기') == {'m015'}
    assert names('제육볶음') == {'m014'}
    assert names('달걀말이') == {'m017'}
    assert names('해물파전') == {'m024'}
    assert names('LA갈비구이') == {'m023'}
    assert names('두부구이') == {'m026'}
    assert names('바지락칼국수') == {'m019'}


def test_instant_and_lookalike_dishes_do_not_match():
    for d in ['육개장사발면', '육개장컵라면', '비빔냉면', '김치전병', '불고기버거', '불고기피자', '오리불고기',
              '비빔면', '칼국수라면', '전주비빔삼각김밥', '오징어채볶음', '두부조림', '김치찌개라면', '']:
        assert names(d) == set(), d


def test_band_of():
    assert band_of(18) is None
    assert band_of(19) == 'under35'
    assert band_of(34) == 'under35'
    assert band_of(35) == '35to54'
    assert band_of(54) == '35to54'
    assert band_of(55) == '55plus'
    assert band_of(80) == '55plus'


def test_prevalence_is_weighted_and_counts_each_person_once():
    rows = [
        # (ID, 나이, 가중치, 음식명) — 한 사람이 같은 음식을 여러 행으로 가질 수 있다
        ('a', 25, 2.0, '된장찌개'), ('a', 25, 2.0, '된장찌개'), ('a', 25, 2.0, '쌀밥'),
        ('b', 30, 1.0, '쌀밥'),
        ('c', 60, 1.0, '된장찌개'), ('d', 70, 3.0, '된장찌개'), ('e', 58, 1.0, '쌀밥'),
        ('f', 10, 5.0, '된장찌개'),  # 19세 미만은 빼고 센다
    ]
    p = prevalence(rows)
    assert p['m001']['under35'] == (pytest.approx(2 / 3), 1)
    assert p['m001']['55plus'] == (pytest.approx(4 / 5), 2)
    assert p['m001']['35to54'] == (0.0, 0)
    assert 'm002' not in p or p['m002']['under35'][1] == 0


def test_age_fit_from_band_values():
    fit = age_fit_from_band_values({'under35': 0.05, '35to54': 0.08, '55plus': 0.12})
    assert fit['55plus'] > fit['35to54'] > fit['under35']
    assert all(v == pytest.approx(0.5) for v in age_fit_from_band_values({'under35': 0.1, '35to54': 0.1, '55plus': 0.1}).values())


def test_knhanes_age_fit_needs_enough_eaters_and_shrinks():
    many = {'under35': (0.03, 30), '35to54': (0.05, 90), '55plus': (0.10, 300)}
    few = {'under35': (0.00, 0), '35to54': (0.01, 2), '55plus': (0.02, 8)}
    fit = knhanes_age_fit(many)
    assert fit is not None and fit['55plus'] > 0.5 > fit['under35']
    assert knhanes_age_fit(few) is None  # 섭취자 30명 미만 → 통계 근거로 쓰지 않음
