"""우루루 메뉴(더미 26개)와 리뷰·통계의 음식 이름을 잇는 동의어 표 (v2-changes 5장).

- patterns: 리뷰 본문에서 그 메뉴를 가리키는 표현. 긴 이름이 짧은 이름에 섞여 세지지 않게 한다
  (돌솥비빔밥 ≠ 비빔밥, 비빔냉면 ≠ 물냉면, 김치전골 ≠ 김치전).
- freqfood: 국민영양통계 다빈도음식의 음식명 (연령대 적합도 근거). 없으면 규칙만 쓴다.
메뉴가 바뀌면(우루루 실데이터) 이 표만 고치면 된다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

MENU_FILE = Path(__file__).resolve().parents[3] / 'backend' / 'seed' / 'menu.dummy.json'

MENU_RULES: dict[str, dict] = {
    'm001': {'patterns': [r'된장\s*찌개'], 'freqfood': ['된장찌개']},
    'm002': {'patterns': [r'김치\s*찌개'], 'freqfood': ['김치찌개']},
    'm003': {'patterns': [r'순두부'], 'freqfood': ['순두부찌개']},
    'm004': {'patterns': [r'부대\s*찌개'], 'freqfood': ['부대찌개']},
    'm005': {'patterns': [r'갈비탕'], 'freqfood': ['갈비탕']},
    'm006': {'patterns': [r'육개장'], 'freqfood': ['육개장· 쇠고기']},
    'm007': {'patterns': [r'돼지\s*국밥'], 'freqfood': []},
    'm008': {'patterns': [r'순대\s*국밥', r'순댓국', r'순대국'], 'freqfood': ['순대국']},
    'm009': {'patterns': [r'콩나물\s*(?:국밥|해장국)'], 'freqfood': ['콩나물국']},
    'm010': {'patterns': [r'전복죽'], 'freqfood': ['어패류죽']},
    'm011': {'patterns': [r'호박죽'], 'freqfood': ['채소죽']},
    'm012': {'patterns': [r'(?<!돌솥)(?<!돌솥 )비빔밥'], 'freqfood': ['비빔밥']},
    'm013': {'patterns': [r'돌솥\s*비빔밥'], 'freqfood': ['비빔밥']},
    'm014': {'patterns': [r'제육'], 'freqfood': ['불고기· 돼지고기']},
    'm015': {'patterns': [r'불고기'], 'freqfood': ['불고기']},
    'm016': {'patterns': [r'오징어\s*(?:덮밥|볶음)'], 'freqfood': []},
    'm017': {'patterns': [r'(?:계란|달걀)\s*말이'], 'freqfood': []},
    'm018': {'patterns': [r'잔치\s*국수'], 'freqfood': ['국수']},
    'm019': {'patterns': [r'칼국수'], 'freqfood': ['칼국수']},
    'm020': {'patterns': [r'비빔\s*국수'], 'freqfood': ['비빔국수']},
    'm021': {'patterns': [r'물\s*냉면', r'(?<!비빔)(?<!비빔 )냉면'], 'freqfood': ['물냉면']},
    'm022': {'patterns': [r'수제비'], 'freqfood': ['수제비']},
    'm023': {'patterns': [r'(?:LA|La|la|엘에이)\s*갈비'], 'freqfood': ['갈비구이· 소']},
    'm024': {'patterns': [r'파전'], 'freqfood': ['파전']},
    'm025': {'patterns': [r'김치전(?!골)'], 'freqfood': ['김치전']},
    'm026': {'patterns': [r'두부\s*(?:부침|구이)'], 'freqfood': ['두부부침/전']},
}

_COMPILED = {mid: re.compile('|'.join(f'(?:{p})' for p in r['patterns'])) for mid, r in MENU_RULES.items()}


def load_menus(path: Path = MENU_FILE) -> dict[str, dict]:
    items = json.loads(path.read_text(encoding='utf-8'))['items']
    return {m['id']: m for m in items}


def match_menus(text: str) -> set[str]:
    """글에 나온 메뉴 id 집합."""
    if not text:
        return set()
    return {mid for mid, rx in _COMPILED.items() if rx.search(text)}


def find_mentions(text: str) -> list[tuple[int, int, str]]:
    """글 속 메뉴 언급 위치 (시작, 끝, 메뉴 id). 겹치면 긴 쪽을 남긴다."""
    found = []
    for mid, rx in _COMPILED.items():
        found += [(m.start(), m.end(), mid) for m in rx.finditer(text or '')]
    found.sort(key=lambda x: (x[0], -(x[1] - x[0])))
    out: list[tuple[int, int, str]] = []
    for st, en, mid in found:
        if out and st < out[-1][1]:
            continue
        out.append((st, en, mid))
    return out


def mention_windows(text: str, menu_id: str, before: int = 10, after: int = 40) -> list[str]:
    """메뉴가 나온 곳 주변 글 (앞 10자, 뒤 40자). 다른 메뉴가 나오면 거기서 끊는다.

    마침표 없이 긴 리뷰에서 다른 음식의 맛 표현이 섞이지 않게 한다.
    """
    ms = find_mentions(text)
    out = []
    for i, (st, en, mid) in enumerate(ms):
        if mid != menu_id:
            continue
        lo = max(st - before, ms[i - 1][1] if i > 0 else 0)
        hi = min(en + after, ms[i + 1][0] if i + 1 < len(ms) else len(text))
        out.append(text[lo:hi])
    return out
