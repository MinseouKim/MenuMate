"""엔진 결과 파일 만들기: backend/engine/menu-features.json (D74, v2-changes 5장).

    .venv/bin/python -m menumate_engine.build
형식은 Backend의 engine.ts(parseEngine)와 같다. 자세한 계산은 ai/docs/engine.md.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from .ad_filter import find_duplicates, rule_reasons
from .features import FEATURES, cue_hits, score_features
from .fetch import DATA_DIR, SOURCES
from .menus import MENU_RULES, load_menus, match_menus, mention_windows
from .signals import AGE_BANDS, MIN_OBSERVED_CELLS, STAT_GROUPS, age_fit_from_stats, age_fit_rule, blend_age_fit, load_freqfood, reputation

REPO = Path(__file__).resolve().parents[3]
OUT_FILE = REPO / 'backend' / 'engine' / 'menu-features.json'
REPORT_FILE = Path(__file__).resolve().parent.parent / 'out' / 'engine_report.json'

# questions-v2.md에서 정한다. Backend는 파일의 weights를 읽는다.
WEIGHTS = {'ageFit': 2, 'reputation': 2}
MIN_REVIEWS = 20
V1_TAGS = ('spicy', 'mild', 'soup', 'soft', 'hearty')

_SENT = re.compile(r'[.!?\n~。]+|(?<=[요다음함임])\s+')
_ORDER_ITEM = re.compile(r'(?:^|[,)）])\s*([^,()（）/]+?)\s*/\s*\d+\s*(?=[(（]|,|$)')


@dataclass
class Review:
    text: str
    rating: int | None  # 1 긍정, 0 부정, None 모름/애매
    source: str  # 'kr3' | 'delivery'
    order_options: str = ''
    rep_ok: bool = True  # 평판 계산에 써도 되는가 (배달앱: BiasFree=1만)


def order_item_names(order_options: str) -> list[str]:
    """배달앱 Menu 열 → 주문한 메뉴 이름들 ("이름/수량(옵션)")."""
    return [m.strip() for m in _ORDER_ITEM.findall(order_options or '')]


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENT.split(text or '') if s and s.strip()]


def build_engine(
    reviews: Iterable[Review],
    menus: dict[str, dict],
    freqfood: tuple[dict[str, dict[str, float]], dict[str, int]] | None,
    version: str,
    now: str,
    min_reviews: int = MIN_REVIEWS,
) -> dict:
    reviews = list(reviews)
    dups = find_duplicates([r.text for r in reviews])
    stats = {m: {'n': 0, **{f: [0, 0] for f in FEATURES}} for m in menus}
    count, ad = Counter(), Counter()
    rep = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # menu → source → [긍정, 부정]
    totals = defaultdict(lambda: [0, 0])  # source → [긍정, 부정]

    for i, r in enumerate(reviews):
        mentioned = match_menus(r.text) & menus.keys()
        ordered = set().union(*(match_menus(n) for n in order_item_names(r.order_options))) & menus.keys() if r.order_options else set()
        targets = mentioned | ordered
        flagged = i in dups or bool(rule_reasons(r.text, r.order_options))
        rated = r.rating is not None and r.rep_ok
        if rated and not flagged:
            totals[r.source][0 if r.rating == 1 else 1] += 1
        if not targets:
            continue
        if flagged:
            for m in targets:
                ad[m] += 1
            continue
        for m in targets:
            count[m] += 1
            ev = mention_windows(r.text, m)
            if not ev and m in ordered and len(ordered) == 1:
                ev = split_sentences(r.text)  # 주문한 메뉴가 하나면 리뷰 전체가 그 메뉴 이야기
            stats[m]['n'] += len(ev)
            for s in ev:
                for f, (p, q) in cue_hits(s).items():
                    stats[m][f][0] += p
                    stats[m][f][1] += q
            if rated:
                rep[m][r.source][0 if r.rating == 1 else 1] += 1

    keep = [m for m in menus if count[m] >= min_reviews]
    priors = {
        m: {**{t: (0.8 if t in menus[m].get('tags', []) else 0.2) for t in V1_TAGS}, 'light': 0.5} for m in keep
    }
    feats = score_features({m: {'n': stats[m]['n'], **{f: tuple(stats[m][f]) for f in FEATURES}} for m in keep}, priors)

    p_all = {s: (p / (p + q) if p + q else 0.5) for s, (p, q) in totals.items()}
    out_menus = []
    for m in sorted(keep):
        n_rep = sum(p + q for p, q in rep[m].values())
        rep_v = (
            round(sum((p + q) * reputation(p, q, p_all[s]) for s, (p, q) in rep[m].items()) / n_rep, 3)
            if n_rep
            else 0.5
        )
        ratios, observed = freqfood if freqfood else ({}, {})
        names = [n for n in MENU_RULES[m]['freqfood'] if n in ratios]
        stat = None
        if names and sum(observed.get(n, 0) for n in names) >= MIN_OBSERVED_CELLS:
            avg = {g: sum(ratios[n][g] for n in names) / len(names) for g in STAT_GROUPS}
            stat = age_fit_from_stats(avg)
        rule = age_fit_rule(feats[m])
        out_menus.append(
            {
                'menuId': m,
                'menuName': menus[m]['name'],
                'features': feats[m],
                'ageFit': blend_age_fit(stat, rule),
                'reputation': rep_v,
                'reviewCount': int(count[m]),
                'adFilteredCount': int(ad[m]),
                # 아래는 설명용. Backend는 읽지 않는다.
                'evidence': {
                    'sentences': int(stats[m]['n']),
                    'ratedReviews': int(n_rep),
                    'ageFitSource': 'stats+rule' if stat else 'rule',
                    'statFoods': names,
                    'statCells': int(sum(observed.get(n, 0) for n in names)),
                },
            }
        )
    return {
        'engineVersion': version,
        'generatedAt': now,
        'weights': dict(WEIGHTS),
        'sources': [
            {'name': s['name'], 'url': s['page'], 'license': s['license']} for s in SOURCES.values()
        ],
        'note': '리뷰 원문은 담지 않는다. 메뉴별 통계값만 담는다. 계산: ai/docs/engine.md',
        'menus': out_menus,
    }


def _unit(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 1


def _count(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def validate_backend_schema(out: dict) -> list[str]:
    """Backend parseEngine(backend/src/engine.ts)과 같은 검사. 오류 목록(비면 통과)."""
    errs = []
    if not isinstance(out.get('engineVersion'), str) or not out['engineVersion']:
        errs.append('engineVersion')
    w = out.get('weights')
    if not isinstance(w, dict) or not all(isinstance(w.get(k), (int, float)) and w[k] >= 0 for k in ('ageFit', 'reputation')):
        errs.append('weights')
    if not isinstance(out.get('menus'), list):
        return errs + ['menus']
    for i, m in enumerate(out['menus']):
        at = f'menus[{i}]'
        if not isinstance(m.get('menuName'), str) or not m['menuName'].strip():
            errs.append(f'{at}.menuName')
        if 'menuId' in m and not isinstance(m['menuId'], str):
            errs.append(f'{at}.menuId')
        feats = m.get('features')
        if not isinstance(feats, dict):
            errs.append(f'{at}.features')
        else:
            errs += [f'{at}.features.{k}' for k, v in feats.items() if not _unit(v)]
        af = m.get('ageFit')
        if not isinstance(af, dict) or not all(_unit(af.get(b)) for b in AGE_BANDS):
            errs.append(f'{at}.ageFit')
        if not _unit(m.get('reputation')):
            errs.append(f'{at}.reputation')
        for k in ('reviewCount', 'adFilteredCount'):
            if not _count(m.get(k)):
                errs.append(f'{at}.{k}')
    return errs


def load_reviews(data_dir: Path = DATA_DIR) -> Iterable[Review]:
    import pyarrow.parquet as pq

    t = pq.read_table(data_dir / SOURCES['kr3']['file'], columns=['Review', 'Rating']).to_pydict()
    for text, rating in zip(t['Review'], t['Rating']):
        yield Review(text or '', rating if rating in (0, 1) else None, 'kr3')
    with open(data_dir / SOURCES['delivery']['file'], encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            taste = int(row['Taste']) if row['Taste'].isdigit() else None
            rating = None if taste is None or taste == 0 or taste == 3 else (1 if taste >= 4 else 0)
            yield Review(row['Review'], rating, 'delivery', row['Menu'], rep_ok=row['BiasFree'] == '1')


def main() -> None:
    kst = timezone(timedelta(hours=9))
    now = datetime.now(kst).replace(microsecond=0)
    version = f'{now:%Y-%m-%d}-v1'
    out = build_engine(load_reviews(), load_menus(), load_freqfood(DATA_DIR / SOURCES['freqfood']['file']), version, now.isoformat())
    errs = validate_backend_schema(out)
    if errs:
        raise SystemExit(f'형식 오류: {errs[:10]}')
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{OUT_FILE} 메뉴 {len(out["menus"])}개, 버전 {version}')


if __name__ == '__main__':
    main()
