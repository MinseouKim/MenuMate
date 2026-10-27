"""광고성 리뷰 필터 1단계: 규칙 (D75).

대가를 받고 쓴 리뷰(체험단·협찬·원고료·리뷰 이벤트)와 복사해 붙인 리뷰를 찾는다.
2단계 분류 모델은 ad_model.py.
"""

from __future__ import annotations

import re
from collections import Counter

# 대가성 표시 (글쓴이 본인이 받았다고 밝힌 것). "협찬 아님", "경쟁업체", "블로그가 다 체험단 글"처럼
# 남의 광고를 언급하거나 부정하는 글은 걸리지 않게 한다 (1차 표본 판정 결과, engine.md 4장).
_SPONSORED = re.compile(
    r'체험단(?:으로|을\s*통해|에\s*선정|이지만|이었|입니다)'
    r'|협찬(?:을|으로)?\s*(?:\S+\s*){0,2}?(?:받(?!지\s*않|은\s*적)|방문|다녀|진행)'
    r'|제품\s*협찬|^\W*협찬\s|#\s*(?:협찬|광고|체험단)'
    r'|원고료(?:를)?\s*(?:받|지원)|소정의\s*(?:원고료|수수료|사례|제공|지원)'
    r'|업체로부터\s*(?:\S+\s*){0,4}?(?:제공|지원|원고료|받)'
    r'|(?:식사권|식사|음식|메뉴|제품|이용권|금액|비용)\S{0,3}\s*(?:을|를)?\s*(?:(?:무상|무료)\s*(?:으로)?\s*)?(?:제공|지원)\s*받(?!지)'
    r'|(?:무상|무료)\s*(?:으로)?\s*제공\s*받'
    r'|(?:제공|지원)\s*받(?:아|고|았)\S*\s*(?:\S+\s*){0,3}?(?:작성|후기|리뷰|포스팅)'
    r'|서포터즈\s*(?:로|활동)|유료\s*광고\s*(?:포함|입니다)'
)
# 글 전체가 "내 돈으로 샀다"고 밝히면 대가성 표시로 보지 않는다
_SELF_PAID = re.compile(r'내\s*돈\s*내\s*산|협찬\s*(?:아님|아닌|아니|안\s*받|없)')

# 리뷰를 조건으로 받은 혜택 (배달앱 "리뷰 이벤트" 등). "리뷰 이벤트가 없어서", "다 리뷰 이벤트니까"는 제외
_REVIEW_EVENT = re.compile(
    r'리\s*뷰\s*이\s*벤\s*트(?!\s*(?:가|이|는)?\s*(?:없|있네|있더|빼|니까|때\s*말고|중이었다는))'
    r'|리뷰\s*약속|별\s*(?:5|다섯)\s*개?\s*(?:약속|이벤트)'
    r'|(?<!명함)이벤트\s*참여(?=\s*(?:해서|하고|했|합니다|하느라|글|중|하여))'
    r'|참여해서\s*(?:\S+\s*){0,3}?받'
    r'|리뷰\s*(?:쓰고|써서|작성하고|남기고|달고)\s*(?:\S+\s*){0,3}?(?:받았|받고|받아|서비스|증정)'
)

# 배달앱 주문 옵션 표기. 업체가 글자를 가려 쓰는 경우가 많다 (예: "Z1뷰 OI벤트").
_EVENT_OPTION = re.compile(r'(?:리|Z1|2l|ㄹl|ㄹㅣ)\s*뷰\s*(?:이|OI|0I|oI)\s*벤\s*트|별\s*5\s*[＋+]\s*후기|(?:리|ㄹㅣ)\s*뷰\s*약\s*속')
# 이벤트 옵션에서 혜택을 고르지 않은 주문
_EVENT_OPTION_DECLINED = re.compile(r'(?:선택\s*안\s*함|참여\s*안\s*함|미참여)\s*[)）]')

_SENTENCE_SPLIT = re.compile(r'[.!?~。\n]+')


def _repeated_sentence(text: str, min_chars: int = 6, min_count: int = 3) -> bool:
    """같은 문장(공백 빼고 6글자 이상)이 한 리뷰에 3번 이상. "미안하다" 같은 짧은 말버릇은 제외."""
    parts = [p.strip() for p in _SENTENCE_SPLIT.split(text)]
    counts = Counter(p for p in parts if len(re.sub(r'\s', '', p)) >= min_chars)
    return any(c >= min_count for c in counts.values())


def rule_reasons(text: str, order_options: str = '') -> list[str]:
    """걸린 규칙 코드 목록. 비어 있으면 규칙상 광고가 아니다."""
    text = text or ''
    reasons: list[str] = []
    if _SPONSORED.search(text) and not _SELF_PAID.search(text):
        reasons.append('sponsored')
    event_option = bool(order_options) and bool(_EVENT_OPTION.search(order_options)) and not _EVENT_OPTION_DECLINED.search(order_options)
    if _REVIEW_EVENT.search(text) or event_option:
        reasons.append('review_event')
    if _repeated_sentence(text):
        reasons.append('repeated_sentence')
    return reasons


def is_ad_by_rule(text: str, order_options: str = '') -> bool:
    return bool(rule_reasons(text, order_options))


def _normalize(text: str) -> str:
    return re.sub(r'\s+', ' ', text or '').strip()


def find_duplicates(texts: list[str], min_len: int = 15, min_count: int = 3) -> set[int]:
    """같은 글이 min_count번 이상 나오면 복사해 붙인 리뷰로 본다. 짧은 흔한 문장은 제외."""
    norm = [_normalize(t) for t in texts]
    counts = Counter(t for t in norm if len(t) >= min_len)
    return {i for i, t in enumerate(norm) if len(t) >= min_len and counts[t] >= min_count}
