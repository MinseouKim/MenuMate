from menumate_engine.ad_filter import find_duplicates, is_ad_by_rule, rule_reasons


# 1단계 규칙 (D75): 체험단, 협찬, 제공받아, 원고료, 리뷰 이벤트, 같은 문장 반복
def test_sponsored_keywords():
    assert 'sponsored' in rule_reasons('체험단으로 다녀왔어요. 국물이 진해요')
    assert 'sponsored' in rule_reasons('업체로부터 소정의 원고료를 받아 작성한 후기입니다')
    assert 'sponsored' in rule_reasons('#협찬 #광고 맛있게 먹었어요')
    assert 'sponsored' in rule_reasons('음식을 무상으로 제공받아 솔직하게 작성했습니다')
    assert 'sponsored' in rule_reasons('식사권을 지원받아 방문했어요')


def test_review_event():
    assert 'review_event' in rule_reasons('리뷰이벤트로 콜라 받았어요 맛있어요')
    assert 'review_event' in rule_reasons('리뷰 약속하고 만두 서비스 받았습니다')
    assert 'review_event' in rule_reasons('별5개 약속 이벤트 참여합니다')
    assert 'review_event' in rule_reasons('리뷰 쓰고 음료 받았어요')


def test_review_event_from_order_options():
    # 배달앱 주문 옵션에 "리뷰 이벤트 참여"를 고른 기록 (가려 쓴 글자 포함)
    meta = '짜글이 정식/1(찜＋별5＋후기） Z1뷰 OI벤트 참여 선택(별5＋후기） 두부 2조각)'
    assert 'review_event' in rule_reasons('맛있어요', order_options=meta)
    assert rule_reasons('맛있어요', order_options='제육볶음 정식/1(공기밥 추가)') == []


def test_repeated_sentence():
    text = '정말 맛있어요. 정말 맛있어요. 정말 맛있어요. 또 올게요'
    assert 'repeated_sentence' in rule_reasons(text)
    assert 'repeated_sentence' not in rule_reasons('맛있어요. 국물이 진해요. 또 올게요')


def test_ordinary_reviews_are_not_ads():
    ordinary = [
        '순대를 시키면 국물이 서비스로 나옴. 깔끔하고 얼큰함.',
        '사장님이 친절하시고 공기밥을 무료로 더 주셨어요',
        '광고 보고 왔는데 기대보다 별로였어요',
        '타임딜 할인받아 구매했는데 구성도 좋고 맛있었습니다.',
        '리뷰 보고 찾아왔는데 칼국수 면이 쫄깃해요',
        '반찬 리필은 셀프입니다. 제공되는 김치가 맛있어요',
        '',
    ]
    for t in ordinary:
        assert rule_reasons(t) == [], t
        assert not is_ad_by_rule(t)


def test_find_duplicates_marks_copy_paste_reviews():
    texts = ['국물이 진하고 고기가 많아서 정말 좋아요!!'] * 3 + ['맛있어요', '맛있어요', '맛있어요', '양이 많아요']
    # 짧은 흔한 문장("맛있어요")은 복붙으로 보지 않는다
    assert find_duplicates(texts, min_len=15, min_count=3) == {0, 1, 2}


# 1차 표본 100개 판정(2026-10-27)에서 나온 오탐·정탐을 고정한다 (engine.md 4장)
FALSE_POSITIVES_ROUND1 = [
    '근처 업체에서 패러글라이딩하면 음료 50% 할인 쿠폰을 줍니다',
    '정말 맛있어요 경쟁업체에서 테러하는 것 같음',
    '해산물 유통업체에서 차린 가게라 재료가 좋아요',
    '이 가게에서 1원도 협찬받지 않고, 순수하게 맛있게 먹어서 공유드려요',
    '근처 헬 카페 2층, 협찬 아님, 분위기 있음',
    '언제나와 같이 역시 협찬이나 광고가 아닌 내 돈 내산',
    '블로그가 체험단 글이 대부분이라 아직 평가 불가',
    '협찬으로 드신 분들이 대부분이라 불안하긴 했음',
    '극찬을 하는 블로그를 보고 갔는데 먹고 나서 다시 보니 협찬',
    '블로그로 광고로 도배한 광고글임!!! 속았어요',
    '차라리 유료 광고하실 돈으로 포장 서비스를 해주시던가',
    '첨가물이 없다는 입구 광고글처럼 국물이 뽀얗다',
    '지난번에 체험단으로 방문했다가 만족스러워서 내돈내산으로 재방문했어요',
    '네이버 리뷰만 보고 갔는데 과장된 것 같아요 네이버 리뷰 이벤트가 있네요',
    '평점 절대 믿지 마세요 다 리뷰 이벤트니까',
    '리뷰 이벤트 때 말고는 리뷰 잘 안 쓰는데 친절에 감동했어요',
    '리뷰이벤트가 없어서 아쉬웠지만 다음에 또 시켜먹을게요',
    '명함이벤트 참여했더니 갑자기 피부 관리 당첨 전화가 왔어요',
    'sns 이벤트 참여하면 나초 안주를 주는 혜자 술집',
    '감자 고동 추억 팔이 누구냐 넌. 누구냐 넌. 누구냐 넌. 만두집',
    '미안하다. 성급한 일반화다. 미안하다. 논점 일탈이다. 미안하다.',
]

TRUE_POSITIVES_ROUND1 = [
    '. . 제품 협찬 서면칸다소바',
    '협찬 더 바리스트로 부산 센텀시티. 커피가 찐해요',
    '블로그 협찬으로 맨 처음 방문한 뒤 너무 맛있어 7번 방문',
    '블로그 체험단이지만.. 맛있어서 인스타그램에도 업데이트',
    '팬아시아를 맨 처음 체험단으로 다녀온 이후 단골이 되었어요',
    '망고 플레이트에서 식사권을 제공받았습니다',
    '망고 플레이트에서 식사를 제공받았습니다.',
    '이벤트 참여하느라 클라우드에서 사진 찾는데 다시 봐도 먹고 싶네요',
    '리뷰 이벤트 중이었다는, 나도 참여해서 스프라이트 받았다',
    '마라샹궈 맛있어요 이벤트 참여해서 음료수도 받았어요!',
    '이벤트 참여합니다.',
    '홀릭 도장 깨기 이벤트 참여 글입니다',
    '리뷰 이벤트. 식당 깨끗 친절. 우럭조림 맛있음',
    '저는 리뷰 이벤트로 공짜로 묵었습니다',
    '이틀 만에 또 왔고 여 리뷰 이벤트!! 하이볼 준대요',
    '리뷰이벤트로 주신 계란찜 엄청 부드럽구',
    '리뷰이벤트 어묵은 니모가 크기도 더 크고 귀엽네용',
    '리뷰이벤트합니다. 별점이 너무 좋아서 시켜봤는데',
    '리뷰이벤트 공기밥이 안와서 좀 아쉬웠지만',
    '맛있어요 !리뷰이벤트도 감사합니다',
]


def test_round1_false_positives_are_not_ads():
    for t in FALSE_POSITIVES_ROUND1:
        assert rule_reasons(t) == [], t


def test_round1_true_positives_stay_ads():
    for t in TRUE_POSITIVES_ROUND1:
        assert rule_reasons(t) != [], t


def test_round2_fixes():
    # 2차 표본: 이벤트 옵션에서 "선택안함"을 고른 주문, "협찬 안 받았고요"
    assert rule_reasons('맛있어요', order_options='당일 삶은 구구족/1(리뷰이벤트(（찜＋ㄹㅣ뷰약속）선택안함))') == []
    assert rule_reasons('개쌉존맛입니다.. 저 협찬 안 받았고요..') == []
    assert rule_reasons('맛있어요', order_options='구구족/1(리뷰이벤트(（찜＋ㄹㅣ뷰약속）맛보기 막국수))') == ['review_event']
