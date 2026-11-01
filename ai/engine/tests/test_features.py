import pytest

from menumate_engine.features import FEATURES, cue_hits, score_features


def hits(s):
    return {f: v for f, v in cue_hits(s).items() if v != (0, 0)}


def test_feature_list():
    # v1 태그 5개 + questions v2용 담백함(light)
    assert FEATURES == ('spicy', 'mild', 'soup', 'soft', 'hearty', 'light')


def test_spicy_and_soup_cues():
    h = hits('김치찌개가 얼큰하고 칼칼해요')
    assert h['spicy'] == (1, 0)
    assert h['soup'][0] == 1


def test_negated_spicy_counts_as_mild():
    h = hits('하나도 안 맵고 순해요')
    assert h['spicy'] == (0, 1)
    assert h['mild'][0] >= 1
    assert hits('맵지 않아요')['spicy'] == (0, 1)


def test_salty_is_negative_light_but_not_jinjja():
    assert hits('국물이 좀 짜요')['light'] == (0, 1)
    assert hits('진짜 맛있어요') == {}
    assert hits('짜장면 먹고 싶다') == {}
    assert hits('담백하고 깔끔해요')['light'] == (1, 0)


def test_soft_and_hearty():
    assert hits('고기가 부드럽고 야들야들')['soft'] == (1, 0)
    assert hits('고기가 질겨요')['soft'] == (0, 1)
    assert hits('양이 많아서 든든해요')['hearty'] == (1, 0)
    assert hits('양이 적어요')['hearty'] == (0, 1)


def test_score_features_ranks_by_cue_rate_and_shrinks_sparse_menus():
    stats = {
        'hot': {'n': 400, 'spicy': (200, 10)},
        'plain': {'n': 400, 'spicy': (5, 60)},
        'mid': {'n': 400, 'spicy': (60, 20)},
        'rare': {'n': 3, 'spicy': (3, 0)},
    }
    priors = {'hot': {'spicy': 0.8}, 'plain': {'spicy': 0.2}, 'mid': {'spicy': 0.2}, 'rare': {'spicy': 0.2}}
    s = score_features(stats, priors)
    for m in s.values():
        for f in FEATURES:
            assert 0.0 <= m[f] <= 1.0
    assert s['hot']['spicy'] > s['mid']['spicy'] > s['plain']['spicy']
    assert s['hot']['mild'] < s['plain']['mild']
    # 리뷰 3개뿐인 메뉴는 매운 표현이 100%여도 사전값(0.2) 가까이에 머문다
    assert s['rare']['spicy'] < 0.35
    assert s['rare']['light'] == pytest.approx(0.5, abs=0.05)


def test_intrinsic_prior_keeps_tagged_feature_from_collapsing():
    # 국물 태그가 있는 찌개는 리뷰에서 "국물"을 덜 말해도 0으로 떨어지지 않는다 (사전값과 반반)
    stats = {
        'stew': {'n': 1000, 'soup': (20, 0)},
        'gukbap': {'n': 1000, 'soup': (400, 0)},
        'bibim': {'n': 1000, 'soup': (10, 0)},
    }
    priors = {'stew': {'soup': 0.8}, 'gukbap': {'soup': 0.8}, 'bibim': {'soup': 0.2}}
    s = score_features(stats, priors)
    assert s['stew']['soup'] >= 0.4
    assert s['gukbap']['soup'] > s['stew']['soup'] > s['bibim']['soup']
