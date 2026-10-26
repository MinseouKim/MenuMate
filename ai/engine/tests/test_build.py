from menumate_engine.build import Review, build_engine, order_item_names, validate_backend_schema
from menumate_engine.features import FEATURES
from menumate_engine.menus import load_menus

MENUS = load_menus()


def sample_reviews():
    rs = []
    rs += [Review(f'김치찌개가 얼큰하고 매워요. 또 갈게요 {i}', rating=1, source='kr3') for i in range(30)]
    rs += [Review(f'된장찌개가 순하고 부드러워요 {i}', rating=1, source='kr3') for i in range(25)]
    rs += [Review(f'된장찌개는 좀 짜요 {i}', rating=0, source='kr3') for i in range(5)]
    rs += [Review(f'김치찌개 체험단으로 다녀왔어요 {i}', rating=1, source='kr3') for i in range(5)]
    rs += [Review('호박죽 달달', rating=1, source='kr3') for _ in range(3)]
    # 복사 리뷰(15자 이상 같은 글 3번 이상)를 피하려고 위 글에는 번호를 붙였다
    # 배달: 글에 메뉴명이 없어도 주문한 메뉴가 하나면 그 메뉴의 근거로 쓴다
    rs += [Review('양이 많아서 든든해요', rating=1, source='delivery', order_options='부대찌개 2인분/1(라면사리 추가)', rep_ok=True) for _ in range(25)]
    rs += [Review('맛있어요', rating=1, source='delivery', order_options='부대찌개/1(리뷰이벤트(（찜＋ㄹㅣ뷰약속）콜라))', rep_ok=False) for _ in range(4)]
    return rs


def build():
    return build_engine(sample_reviews(), MENUS, freqfood=None, version='test-v1', now='2026-10-30T12:00:00+09:00', min_reviews=20)


def test_output_matches_backend_schema():
    out = build()
    assert validate_backend_schema(out) == []
    assert out['engineVersion'] == 'test-v1'
    assert out['weights'].keys() >= {'ageFit', 'reputation'}
    assert {s['license'] for s in out['sources']} >= {'CC BY-NC-SA 4.0', 'CC BY 4.0'}
    for m in out['menus']:
        assert m['menuName'] == MENUS[m['menuId']]['name']
        assert set(m['features']) == set(FEATURES)


def test_menus_with_few_reviews_are_left_out():
    ids = {m['menuId'] for m in build()['menus']}
    assert ids == {'m001', 'm002', 'm004'}  # 호박죽(3개)은 빠짐 → Backend가 v1 점수로


def test_ad_reviews_are_counted_and_excluded():
    by = {m['menuId']: m for m in build()['menus']}
    assert by['m002']['adFilteredCount'] == 5
    assert by['m002']['reviewCount'] == 30
    assert by['m004']['adFilteredCount'] == 4
    assert by['m004']['reviewCount'] == 25


def test_features_follow_review_language():
    by = {m['menuId']: m for m in build()['menus']}
    assert by['m002']['features']['spicy'] > by['m001']['features']['spicy']
    assert by['m001']['features']['soft'] > by['m002']['features']['soft']
    assert by['m004']['features']['hearty'] > by['m001']['features']['hearty']


def test_reputation_neutral_center():
    by = {m['menuId']: m for m in build()['menus']}
    assert by['m002']['reputation'] > 0.5 > by['m001']['reputation']


def test_order_item_names():
    opt = '[2~3인분] 짜글이 정식/1(구성(짜글이＋공기밥）x2),맛 선택(더 얼큰하게~)),부대찌개/2(사리)'
    assert order_item_names(opt) == ['[2~3인분] 짜글이 정식', '부대찌개']


def test_validator_catches_bad_values():
    out = build()
    out['menus'][0]['features']['spicy'] = 1.5
    out['menus'][0]['reviewCount'] = 2.5
    errs = validate_backend_schema(out)
    assert len(errs) == 2


def test_d82_weights_and_age_fit_basis():
    out = build()
    assert out['weights'] == {'ageFit': 3, 'reputation': 1.5}
    assert all(m['ageFitBasis'] == 'rule' for m in out['menus'])  # 통계 없이 만들면 모두 규칙
    # 통계(관찰 칸 6개 이상)가 있는 메뉴만 'stats'
    ratios = {'된장찌개': {'19~29세': 5.0, '30~49세': 8.0, '50~64세': 11.0}}
    out2 = build_engine(sample_reviews(), MENUS, freqfood=(ratios, {'된장찌개': 33}), version='t', now='n', min_reviews=20)
    basis = {m['menuId']: m['ageFitBasis'] for m in out2['menus']}
    assert basis == {'m001': 'stats', 'm002': 'rule', 'm004': 'rule'}
    by = {m['menuId']: m for m in out2['menus']}
    assert by['m002']['ageFit']['35to54'] == 0.5  # D81
    assert validate_backend_schema(out2) == []
