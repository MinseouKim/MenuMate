"""광고성 리뷰 필터 2단계: 표시 데이터로 학습한 분류 모델 (D75).

배달앱 리뷰의 BiasFree 라벨(리뷰 이벤트 영향 여부)로 글자 n-gram + 로지스틱 회귀를 학습하고
식당 단위로 나눈 평가 결과를 낸다. 결과가 약해 엔진 필터로는 쓰지 않는다 (engine.md 4장).

    .venv/bin/python -m menumate_engine.ad_model
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

DATA = Path(__file__).resolve().parent.parent / 'data'


def train_eval(texts: list[str], labels: list[int], groups: list[str], seed: int = 0, test_size: float = 0.25) -> dict:
    y = np.asarray(labels)
    tr, te = next(GroupShuffleSplit(1, test_size=test_size, random_state=seed).split(texts, y, groups))
    vec = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 4), min_df=2, max_features=200_000, sublinear_tf=True)
    xtr = vec.fit_transform([texts[i] for i in tr])
    xte = vec.transform([texts[i] for i in te])
    model = LogisticRegression(max_iter=2000, C=2, class_weight='balanced').fit(xtr, y[tr])
    p = model.predict_proba(xte)[:, 1]
    pred = (p >= 0.5).astype(int)
    return {
        'auc': round(float(roc_auc_score(y[te], p)), 3),
        'accuracy': round(float(accuracy_score(y[te], pred)), 3),
        'precision': round(float(precision_score(y[te], pred, zero_division=0)), 3),
        'recall': round(float(recall_score(y[te], pred, zero_division=0)), 3),
        'base_rate': round(float(y[te].mean()), 3),
        'n_train': int(len(tr)),
        'n_test': int(len(te)),
    }


def main() -> None:
    rows = [r for r in csv.DictReader(open(DATA / 'delivery_ko.csv', encoding='utf-8-sig')) if r['BiasFree'] in ('0', '1')]
    m = train_eval([r['Review'] for r in rows], [1 if r['BiasFree'] == '0' else 0 for r in rows], [r['RestaurantID'] for r in rows])
    print(json.dumps(m, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
