"""메뉴 특징값 (0~1). 메뉴가 나온 문장에서 맛 표현을 세고, 메뉴끼리 비교해 0~1로 바꾼다.

특징 (질문 v1 태그 5개 + 질문 v2용 1개):
- spicy 매운맛 / mild 순한맛 / soup 국물 / soft 부드러움 / hearty 든든함(양) / light 담백함(짜지 않음)
"""

from __future__ import annotations

import re

import numpy as np

FEATURES = ('spicy', 'mild', 'soup', 'soft', 'hearty', 'light')
PRIOR_SHARE = 0.5

_R = re.compile

# (긍정 표현, 부정 표현, 긍정을 세기 전에 지울 부정 문맥)
_CUES: dict[str, tuple[re.Pattern, re.Pattern | None, re.Pattern | None]] = {
    'spicy': (
        _R(r'맵|매워|매운(?!탕)|매콤|얼큰|칼칼|화끈|청양|땡초|매움'),
        _R(r'안\s*맵|안\s*매워|맵지\s*(?:도\s*|는\s*)?않|덜\s*맵|매운\s*맛이\s*(?:약|없)'),
        _R(r'안\s*맵|안\s*매워|맵지\s*(?:도\s*|는\s*)?않|덜\s*맵|매운\s*맛이\s*(?:약|없)'),
    ),
    'mild': (_R(r'순하|순한|순해|슴슴|자극적이지\s*않|안\s*맵|맵지\s*(?:도\s*|는\s*)?않'), None, None),
    'soup': (_R(r'국물|육수|뜨끈|얼큰|진국|사골|해장'), _R(r'국물이?\s*(?:없|적|부족)'), _R(r'국물이?\s*(?:없|적|부족)')),
    'soft': (
        _R(r'부드럽|부드러|야들|촉촉|말랑|연하|연해|살살\s*녹|녹아|술술|폭신|보들'),
        _R(r'질기|질겨|질김|딱딱|뻣뻣|퍽퍽|뻑뻑'),
        None,
    ),
    'hearty': (
        _R(r'든든|푸짐|양이?\s*(?:도\s*)?(?:많|넉넉|엄청)|배\s*(?:부르|불러)|배불|넉넉'),
        _R(r'양이?\s*(?:좀\s*|조금\s*|너무\s*|살짝\s*)?(?:적|작|부족)|감질'),
        None,
    ),
    'light': (
        _R(r'담백|깔끔|슴슴|심심하|싱겁|싱거|짜지\s*(?:도\s*)?않|안\s*짜|자극적이지\s*않'),
        _R(r'(?<![진가])짜(?:요|다|고|서|네|더|긴|게|웠|워)|짭짤|간이\s*(?:좀\s*)?(?:세|쎄|강)|자극적(?!이지)|느끼|기름지'),
        None,
    ),
}
# light는 "짜지 않"을 지운 뒤 "짜"를 센다
_LIGHT_NEG_GUARD = _R(r'짜지\s*(?:도\s*)?않|안\s*짜')


def cue_hits(sentence: str) -> dict[str, tuple[int, int]]:
    """문장 하나에서 특징별 (긍정 있음 0/1, 부정 있음 0/1)."""
    out: dict[str, tuple[int, int]] = {}
    for f, (pos_rx, neg_rx, guard) in _CUES.items():
        neg = 1 if neg_rx is not None and neg_rx.search(sentence) else 0
        rest = guard.sub(' ', sentence) if guard is not None else sentence
        if f == 'light':
            neg = 1 if neg_rx.search(_LIGHT_NEG_GUARD.sub(' ', sentence)) else 0
            rest = sentence
        pos = 1 if pos_rx.search(rest) else 0
        out[f] = (pos, neg)
    return out


def _scale(rates: dict[str, float], ns: dict[str, int], min_n: int) -> dict[str, float]:
    """메뉴끼리 비교해 0~1로. 근거가 충분한 메뉴들의 10~90 백분위를 0~1로 둔다."""
    base = [r for m, r in rates.items() if ns[m] >= min_n]
    if len(base) < 2:
        return {m: 0.5 for m in rates}
    lo, hi = np.percentile(base, 10), np.percentile(base, 90)
    if hi - lo < 1e-9:
        return {m: 0.5 for m in rates}
    return {m: float(np.clip((r - lo) / (hi - lo), 0, 1)) for m, r in rates.items()}


def score_features(
    stats: dict[str, dict], priors: dict[str, dict[str, float]], k: float = 40.0, min_n: int = 20
) -> dict[str, dict[str, float]]:
    """stats[menu] = {'n': 근거 문장 수, feature: (긍정, 부정)} → 메뉴별 특징값 0~1.

    리뷰값 = w·(메뉴끼리 비교한 표현 비율) + (1−w)·사전값,  w = n / (n + k)
    값 = 0.5·사전값 + 0.5·리뷰값
    사전값은 메뉴 태그(v1)에서 온다. 리뷰는 "얼마나 자주 말하는가"라서 국물·부드러움처럼
    음식 자체의 성질은 덜 말해질 수 있다. 그래서 사전값을 절반 남긴다. 근거가 적으면 사전값에 더 가깝다.
    """
    ns = {m: int(s.get('n', 0)) for m, s in stats.items()}

    def pn(m, f):
        return stats[m].get(f, (0, 0))

    rates: dict[str, dict[str, float]] = {f: {} for f in FEATURES}
    for m in stats:
        n = max(ns[m], 1)
        for f in FEATURES:
            p, q = pn(m, f)
            if f == 'mild':
                sp, sn = pn(m, 'spicy')
                rates[f][m] = (p + sn - sp) / n
            else:
                rates[f][m] = (p - q) / n
    scaled = {f: _scale(rates[f], ns, min_n) for f in FEATURES}

    out: dict[str, dict[str, float]] = {}
    for m in stats:
        w = ns[m] / (ns[m] + k)
        pr = priors.get(m, {})
        out[m] = {}
        for f in FEATURES:
            if f in pr:
                prior = pr[f]
            elif f == 'mild' and 'spicy' in pr:
                prior = 1 - pr['spicy']
            else:
                prior = 0.5
            data = w * scaled[f][m] + (1 - w) * prior
            out[m][f] = round(float(PRIOR_SHARE * prior + (1 - PRIOR_SHARE) * data), 3)
    return out
