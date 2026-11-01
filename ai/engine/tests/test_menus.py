from menumate_engine.menus import MENU_RULES, load_menus, match_menus

MENUS = load_menus()


def ids(text):
    return {MENUS[i]['name'] for i in match_menus(text)}


def test_all_26_dummy_menus_have_rules():
    assert len(MENUS) == 26
    assert set(MENUS) == set(MENU_RULES)


def test_basic_names_and_synonyms():
    assert ids('된장찌개가 구수해요') == {'된장찌개'}
    assert ids('순댓국 국물이 진해요') == {'순대국밥'}
    assert ids('순대국 먹으러 갔어요') == {'순대국밥'}
    assert ids('엘에이 갈비 맛있음') == {'LA갈비'}
    assert ids('LA갈비가 달달') == {'LA갈비'}
    assert ids('파전이 바삭해요') == {'해물파전'}
    assert ids('두부구이도 좋아요') == {'두부부침'}


def test_longer_names_win_over_shorter_ones():
    # 돌솥비빔밥은 비빔밥으로, 비빔냉면은 물냉면으로, 김치전골은 김치전으로 세지 않는다
    assert ids('돌솥비빔밥 누룽지까지') == {'돌솥비빔밥'}
    assert ids('비빔밥이랑 돌솥비빔밥 둘 다') == {'비빔밥', '돌솥비빔밥'}
    assert ids('비빔냉면 맵다') == set()
    assert ids('평양냉면 육수가 슴슴') == {'물냉면'}
    assert ids('김치전골이 얼큰') == set()
    assert ids('김치찌개랑 김치전') == {'김치찌개', '김치전'}
    assert ids('순두부찌개 부드러움') == {'순두부찌개'}


def test_no_false_matches():
    assert ids('진짜 맛있어요') == set()
    assert ids('짜장면이 짜요') == set()
    assert ids('') == set()


def test_find_mentions_and_windows():
    from menumate_engine.menus import find_mentions, mention_windows

    text = '된장찌개는 구수하고 짜지 않았고 김치찌개는 정말 칼칼하게 맵네요'
    ms = find_mentions(text)
    assert [MENUS[m]['name'] for _, _, m in ms] == ['된장찌개', '김치찌개']
    w_doen = mention_windows(text, 'm001')
    w_kim = mention_windows(text, 'm002')
    # 다른 메뉴가 나오면 창을 거기서 끊는다
    assert len(w_doen) == 1 and '칼칼' not in w_doen[0] and '구수' in w_doen[0]
    assert '칼칼' in w_kim[0] and '구수' not in w_kim[0]
    assert mention_windows('맛있어요', 'm001') == []
