"""평판과 연령대 적합도 (0~1, 0.5가 중립).

- 평판: 메뉴가 나온 리뷰의 긍정 비율을 전체 평균과 비교한다. 리뷰가 적으면 0.5에 가깝게 둔다.
- 연령대 적합도: 나이가 붙은 리뷰가 없어서 (datasets.md 1장)
  ① 국민영양통계 연령층별 다빈도음식 섭취 비율 (그 연령층이 실제로 자주 먹는가)
  ② 메뉴 특징 × 연령대 가중치 규칙
  을 섞는다. ①이 있으면 0.7·① + 0.3·②, 없으면 ②만.
"""

from __future__ import annotations

import csv
import io
import math
from collections import defaultdict
from pathlib import Path

AGE_BANDS = ('under35', '35to54', '55plus')
STAT_GROUPS = ('19~29세', '30~49세', '50~64세')

# 통계 연령층 → 키오스크 연령대 (겹치는 나이만큼 섞음). 65세 이상은 CSV에 없어 50~64세로 대신한다.
BAND_MIX = {
    'under35': {'19~29세': 0.75, '30~49세': 0.25},
    '35to54': {'30~49세': 0.6, '50~64세': 0.4},
    '55plus': {'50~64세': 1.0},
}

# 특징 × 연령대 가중치 (특징이 0.5에서 벗어난 만큼 더하거나 뺌). 근거는 engine.md 3장.
AGE_RULE_WEIGHTS = {
    'under35': {'spicy': 0.20, 'hearty': 0.15, 'soft': -0.10, 'soup': -0.05, 'mild': -0.10, 'light': -0.05},
    '35to54': {},  # D81: 쓰지 않음 (blend_age_fit)
    '55plus': {'soup': 0.15, 'soft': 0.20, 'mild': 0.15, 'light': 0.15, 'spicy': -0.15, 'hearty': -0.05},
}

STAT_WEIGHT = 0.7


def _logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return math.log(p / (1 - p))


def reputation(pos: int, neg: int, p_all: float, m: float = 50.0, k: float = 2.0) -> float:
    """긍정 pos, 부정 neg 리뷰 → 0~1. 전체 긍정 비율 p_all과 같으면 0.5.

    p = (pos + m·p_all) / (pos + neg + m)   (리뷰가 적으면 전체 평균 쪽으로)
    평판 = sigmoid(k · (logit(p) − logit(p_all)))
    """
    p = (pos + m * p_all) / (pos + neg + m)
    return round(1 / (1 + math.exp(-k * (_logit(p) - _logit(p_all)))), 3)


def age_fit_from_band_values(values: dict[str, float]) -> dict[str, float]:
    """연령대별 섭취 비율 → 연령대 적합도. 세 연령대 평균보다 2배 많이 먹으면 1, 절반이면 0."""
    mean = sum(values[b] for b in AGE_BANDS) / len(AGE_BANDS)
    out = {}
    for b in AGE_BANDS:
        idx = values[b] / mean if mean > 0 else 1.0
        out[b] = round(min(1.0, max(0.0, 0.5 + 0.5 * math.log2(max(idx, 1e-6)))), 3)
    return out


def age_fit_from_stats(ratios: dict[str, float]) -> dict[str, float]:
    """국민영양통계 연령층별 섭취 비율(%) → 연령대 적합도 (연령층을 BAND_MIX로 섞은 뒤)."""
    return age_fit_from_band_values({b: sum(w * ratios[g] for g, w in BAND_MIX[b].items()) for b in AGE_BANDS})


def age_fit_rule(features: dict[str, float]) -> dict[str, float]:
    return {
        b: round(min(1.0, max(0.0, 0.5 + sum(w * (features.get(f, 0.5) - 0.5) for f, w in ws.items()))), 3)
        for b, ws in AGE_RULE_WEIGHTS.items()
    }


# D81: 35~54세 규칙은 통계와 반대 방향이었다(상관 −0.48). 이 연령대는 규칙을 쓰지 않고
# 통계가 있으면 통계만, 없으면 중립 0.5로 둔다.
RULE_BANDS = ('under35', '55plus')


def blend_age_fit(stat: dict[str, float] | None, rule: dict[str, float]) -> dict[str, float]:
    out = {}
    for b in AGE_BANDS:
        if b in RULE_BANDS:
            out[b] = round(rule[b], 3) if stat is None else round(STAT_WEIGHT * stat[b] + (1 - STAT_WEIGHT) * rule[b], 3)
        else:
            out[b] = 0.5 if stat is None else round(stat[b], 3)
    return out


CENSORED_FACTOR = 0.8
MIN_OBSERVED_CELLS = 6


def load_freqfood(path: Path) -> tuple[dict[str, dict[str, float]], dict[str, int]]:
    """다빈도음식 CSV → ({음식: {연령층: 평균 섭취 비율(%)}}, {음식: 관찰된 칸 수}).

    한 칸 = (연도, 묶음, 연령층). 연령층마다 3개씩 있는 이름 없는 묶음(성별로 추정)은 순위가 1로 돌아가면
    다음 묶음으로 본다. 각 칸에는 상위 100개 음식만 있으므로, 빠진 음식은 그 칸의 최저 비율 × 0.8로 채운 뒤
    칸들을 평균한다 (100위 밖이라 그보다 낮다).
    """
    raw = path.read_bytes()
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp949')
    cells: dict[tuple, dict[str, float]] = defaultdict(dict)
    block: dict[str, int] = defaultdict(int)
    last_rank: dict[str, int] = {}
    for r in csv.DictReader(io.StringIO(text)):
        if r['분석기준'] != '연령층별':
            continue
        year, rank = r['연도'], int(r['순위'])
        if year in last_rank and rank < last_rank[year]:
            block[year] += 1
        last_rank[year] = rank
        if r['기준값'] in STAT_GROUPS:
            cells[(year, block[year], r['기준값'])][r['음식']] = float(r['비율'])
    foods = {f for c in cells.values() for f in c}
    sums: dict[tuple[str, str], list[float]] = defaultdict(list)
    observed: dict[str, int] = defaultdict(int)
    for (year, b, g), c in cells.items():
        cutoff = min(c.values()) * CENSORED_FACTOR
        for food in foods:
            if food in c:
                observed[food] += 1
                sums[(food, g)].append(c[food])
            else:
                sums[(food, g)].append(cutoff)
    ratios = {food: {g: (sum(sums[(food, g)]) / len(sums[(food, g)]) if sums[(food, g)] else 0.0) for g in STAT_GROUPS} for food in foods}
    return ratios, dict(observed)
