"""국민건강영양조사(KNHANES) 24시간 회상 자료 → 연령대별 메뉴 섭취 비율 → 연령대 적합도.

원시자료(개인 단위)는 data/knhanes/에만 두고 커밋하지 않는다. 결과 파일에는 연령대별 집계값만 들어간다.
받는 방법: ai/docs/knhanes-guide.md

필요한 변수 (HN24_24RC 한 파일에 모두 있다): ID, age(나이), wt_ntr(영양조사 가중치), N_DNAME(음식명)
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from .signals import AGE_BANDS, age_fit_from_band_values

KNHANES_DIR = Path(__file__).resolve().parent.parent / 'data' / 'knhanes'
MIN_EATERS = 30  # 19세 이상 섭취자가 이보다 적으면 통계 근거로 쓰지 않는다
SHRINK_K = 30  # 섭취자가 적을수록 0.5 쪽으로: fit = 0.5 + (fit − 0.5)·n/(n+K)

# 음식명(N_DNAME) → 메뉴. (포함, 제외). 즉석식품과 다른 음식에 섞인 이름은 제외한다.
_INSTANT = r'사발면|컵라면|라면|면사리|삼각김밥|버거|피자|샌드위치|김밥|주먹밥|도시락|볶음밥'
DISH_RULES: dict[str, tuple[str, str]] = {
    'm001': (r'된장찌개', _INSTANT),
    'm002': (r'김치찌개', _INSTANT),
    'm003': (r'순두부찌개', _INSTANT),
    'm004': (r'부대찌개', _INSTANT),
    'm005': (r'갈비탕', _INSTANT),
    'm006': (r'육개장', _INSTANT + r'|칼국수|죽'),
    'm007': (r'돼지국밥', _INSTANT),
    'm008': (r'순대국', _INSTANT),
    'm009': (r'콩나물국밥|콩나물해장국', _INSTANT),
    'm010': (r'전복죽', _INSTANT),
    'm011': (r'호박죽', _INSTANT),
    'm012': (r'비빔밥', _INSTANT + r'|돌솥'),
    'm013': (r'돌솥비빔밥', _INSTANT),
    'm014': (r'제육', _INSTANT),
    'm015': (r'불고기', _INSTANT + r'|오리|오삼|전골'),
    'm016': (r'오징어덮밥|오징어볶음|오징어제육', _INSTANT + r'|채'),
    'm017': (r'계란말이|달걀말이', _INSTANT),
    'm018': (r'잔치국수|멸치국수|^국수$', _INSTANT),
    'm019': (r'칼국수', _INSTANT),
    'm020': (r'비빔국수|비빔막국수', _INSTANT),
    'm021': (r'물냉면', _INSTANT + r'|비빔'),
    'm022': (r'수제비', _INSTANT),
    'm023': (r'LA갈비|엘에이갈비', _INSTANT),
    'm024': (r'파전', _INSTANT),
    'm025': (r'김치전(?!병|골)', _INSTANT),
    'm026': (r'두부부침|두부구이', _INSTANT),
}
_COMPILED = {m: (re.compile(inc), re.compile(exc)) for m, (inc, exc) in DISH_RULES.items()}


def match_dish(dish_name: str) -> set[str]:
    if not dish_name:
        return set()
    return {m for m, (inc, exc) in _COMPILED.items() if inc.search(dish_name) and not exc.search(dish_name)}


def band_of(age: float) -> str | None:
    """키오스크 연령대 (D72). 19세 미만은 제외."""
    if age is None or age < 19:
        return None
    if age < 35:
        return 'under35'
    if age < 55:
        return '35to54'
    return '55plus'


def prevalence(
    rows: Iterable[tuple], persons: Iterable[tuple] | None = None
) -> dict[str, dict[str, tuple[float, int]]]:
    """rows: (ID, 나이, 영양조사 가중치, 음식명) → {메뉴: {연령대: (가중 섭취 비율, 섭취자 수)}}.

    섭취 비율 = 조사 하루 동안 그 메뉴를 한 번이라도 먹은 사람의 가중 비율.
    persons: 기본DB(ALL)의 (ID, 나이, 영양조사 가중치). 주면 가중치 > 0인 사람을 분모로 쓴다
    (24RC에 음식 행이 없는 영양조사 대상자도 포함). 없으면 24RC에 나온 사람이 분모다.
    """
    person: dict[str, tuple[str, float]] = {}
    if persons is not None:
        for pid, age, w in persons:
            b = band_of(age)
            if b is not None and w and w > 0:
                person[pid] = (b, float(w))
    ate: dict[str, set[str]] = defaultdict(set)
    match_cache: dict[str, set[str]] = {}
    for pid, age, w, dish in rows:
        b = band_of(age)
        if b is None:
            continue
        if persons is None:
            person[pid] = (b, float(w or 0))
        elif pid not in person:
            continue  # 기본DB에서 영양조사 대상이 아닌 사람
        if dish not in match_cache:
            match_cache[dish] = match_dish(dish)
        for m in match_cache[dish]:
            ate[m].add(pid)
    wsum = defaultdict(float)
    for b, w in person.values():
        wsum[b] += w
    out: dict[str, dict[str, tuple[float, int]]] = {}
    for m, pids in ate.items():
        num = defaultdict(float)
        cnt = defaultdict(int)
        for pid in pids:
            b, w = person[pid]
            num[b] += w
            cnt[b] += 1
        out[m] = {b: ((num[b] / wsum[b]) if wsum[b] else 0.0, cnt[b]) for b in AGE_BANDS}
    return out


def knhanes_age_fit(band_stats: dict[str, tuple[float, int]], min_eaters: int = MIN_EATERS, k: float = SHRINK_K) -> dict[str, float] | None:
    """한 메뉴의 연령대별 (비율, 섭취자 수) → 연령대 적합도. 섭취자가 적으면 None (통계 근거 없음)."""
    n = sum(c for _, c in band_stats.values())
    if n < min_eaters:
        return None
    fit = age_fit_from_band_values({b: band_stats[b][0] for b in AGE_BANDS})
    shrink = n / (n + k)
    return {b: round(0.5 + (fit[b] - 0.5) * shrink, 3) for b in AGE_BANDS}


def load_rows(path: Path) -> list[tuple]:
    import pyreadstat

    df, _ = pyreadstat.read_sav(str(path), usecols=['ID', 'age', 'wt_ntr', 'N_DNAME'])
    return list(df[['ID', 'age', 'wt_ntr', 'N_DNAME']].itertuples(index=False, name=None))


def load_persons(path: Path) -> list[tuple]:
    import pyreadstat

    df, _ = pyreadstat.read_sav(str(path), usecols=['ID', 'age', 'wt_ntr'])
    return list(df[['ID', 'age', 'wt_ntr']].itertuples(index=False, name=None))


def load_knhanes(directory: Path = KNHANES_DIR) -> tuple[dict, dict] | None:
    """data/knhanes/HN??_24RC.sav를 모두 읽어 메뉴별 연령대 통계를 낸다. 파일이 없으면 None.

    같은 연도의 기본DB(HN??_ALL.sav)가 있으면 ID로 합쳐 분모(영양조사 대상자)를 기본DB 기준으로 잡는다.
    한 연도라도 기본DB가 없으면 모든 연도를 24RC 기준으로 계산한다 (연도끼리 기준을 맞춤).
    """
    files = sorted(directory.glob('HN*_24RC.sav')) if directory.exists() else []
    if not files:
        return None
    rows: list[tuple] = []
    for f in files:
        rows += load_rows(f)
    alls = [f.with_name(f.name.replace('_24RC', '_ALL')) for f in files]
    persons = None
    if all(a.exists() for a in alls):
        persons = []
        for a in alls:
            persons += load_persons(a)
    used = [f.name for f in files] + ([a.name for a in alls] if persons is not None else [])
    return prevalence(rows, persons=persons), {'files': used}
