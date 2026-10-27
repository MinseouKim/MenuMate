from menumate_engine.ad_model import train_eval


def test_train_eval_reports_grouped_holdout_metrics():
    # 식당(group)별로 나눠야 같은 식당 글이 학습·평가에 함께 들어가지 않는다
    texts, labels, groups = [], [], []
    for g in range(20):
        for k in range(30):
            ad = k % 2 == 0
            texts.append(('리뷰이벤트 감사합니다 서비스 최고' if ad else '국물이 진하고 면이 쫄깃해요') + f' {g}-{k}')
            labels.append(1 if ad else 0)
            groups.append(f'r{g}')
    m = train_eval(texts, labels, groups, seed=0)
    assert set(m) >= {'auc', 'accuracy', 'precision', 'recall', 'n_train', 'n_test', 'base_rate'}
    assert m['auc'] > 0.95
    assert m['n_train'] + m['n_test'] == len(texts)
    assert m['n_train'] % 30 == 0  # 식당 단위로 나뉨
