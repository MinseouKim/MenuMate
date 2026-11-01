# 계약: 취향 질문과 추천 점수

- 주관: AI / 검토: Frontend, Backend / 승인: PM
- 상태: **v2 확정 (2026-10-27, D82)**. 질문 5개(q_light 추가), 엔진 특징값 점수, 연령대·평판 가중치, priority 계수 0.5, 추천 이유 코드 3개 추가
- 이전: v1.1 (2026-10-26, q_soft 문구 변경)
- 관련 결정: D5, D6, D14, D17, D19, D28, D69, D72~D76, D81, D82
- 근거 문서: [`ai/docs/questions-v2.md`](../../ai/docs/questions-v2.md) (초안·시뮬레이션), [`ai/docs/engine.md`](../../ai/docs/engine.md) (엔진 값 계산)

## 원칙
- 질문은 **5개**, 답은 `yes` / `no` / `skip` 세 가지다. 화면에서는 "네", "아니요" 버튼과 "그냥 메뉴 볼래요"(질문 종료, D17)를 쓴다. `skip`은 TTS나 화면 오류 등으로 답 없이 넘어갈 때만 쓴다.
- 55세 이상/미만 모두 같은 질문, 같은 점수다 (D19). **연령대는 서버로 보내지 않는다** (D47, D73). 서버는 세 연령대 결과를 모두 계산해 보내고, 브라우저가 손님 연령대 것을 고른다 (v2-changes 4장).
- 질문 데이터의 원본은 Backend 코드 한 곳이다. 프론트는 `GET /api/questions`로 받아 화면과 TTS에 쓴다. 프론트와 AI 코드에 질문 문구를 복사하지 않는다.
- 문장은 짧게, 취향만 묻는다. 씹는 능력·건강·나이를 캐묻는 느낌이 나지 않게 한다.

## 질문 목록

| 순서 | id | 화면/음성 문구 | yes 점수 | no 점수 |
|------|----|---------------|---------|---------|
| 1 | `q_spicy` | 매운 음식도 괜찮으세요? | spicy +2, mild −1 | spicy −3, mild +1 |
| 2 | `q_soup` | 따뜻한 국물 요리가 좋으세요? (v2 문구) | soup +2 | soup −1 |
| 3 | `q_soft` | 부드러운 음식이 좋으세요? | soft +2 | (변화 없음) |
| 4 | `q_hearty` | 든든하게 드시고 싶으세요? | hearty +2 | hearty −1 |
| 5 | `q_light` (v2 새로) | 담백한 맛이 좋으세요? | light +2 | light −1 |

`skip`은 점수에 아무 영향이 없다.

## 추천 점수 계산

```
prefs[f]    = 각 답의 점수를 특징별로 더한 값 (없으면 0)
feature[f]  = 엔진 특징값 0~1 (backend/engine/menu-features.json)
              엔진에 없는 메뉴는 v1처럼 메뉴 태그가 있으면 1, 없으면 0 (light는 태그가 없으므로 0)

score(menu) = Σ prefs[f] × feature[f]
            + W_age × (ageFit[band] − 0.5)      ← 연령대별 결과에만. items(연령대 모름)에는 넣지 않음
            + W_rep × (reputation − 0.5)
            + menu.priority × 0.5
```

| 기호 | 값 | 출처 |
|------|----|------|
| 특징 f | spicy, mild, soup, soft, hearty, light | 엔진 파일 `features` |
| `W_age` | 3 | 엔진 파일 `weights.ageFit` (Backend는 파일 값을 읽는다) |
| `W_rep` | 1.5 | 엔진 파일 `weights.reputation` |
| priority 계수 | **0.5** (v1의 1.5에서 낮춤, D82) | Backend 코드 |

- 엔진에 없는 메뉴(파일이 없거나 메뉴가 빠진 경우): 연령대·평판 항은 0(중립)이다.
- `isAvailable = false` 메뉴는 제외한다.
- 정렬: `score` 내림차순 → `priority` 내림차순 → `sortOrder` 오름차순 → `id` 오름차순. 같은 입력이면 항상 같은 결과가 나와야 한다.
- 상위 **3개**를 돌려준다. 응답은 `items`(연령대 모름)와 `byAgeBand.under35 / 35to54 / 55plus` (v2-changes 4장).
- 모든 답이 `skip`이거나 질문을 중간에 종료해도 계산은 동작해야 한다.
- priority를 0.5로 낮춘 이유 (D82): priority는 관리자 우선 추천 자리(D6)다. 그런데 지금 더미 값은 임의로 붙인 것이라 손님 취향을 이기면 안 된다. 0.5면 점수가 비슷할 때만 앞으로 온다. 시뮬레이션해 보면 모든 답이 `skip`일 때를 빼고는 1위가 취향에 따라 바뀐다.

## 추천 이유 (`reasons`)

| reason | 화면 문구 | 붙이는 조건 |
|--------|-----------|-------------|
| `spicy` | 매콤한 맛 | prefs[spicy] > 0 이고 feature[spicy] ≥ 0.5 |
| `mild` | 순한 맛 | prefs[mild] > 0 이고 feature[mild] ≥ 0.5 |
| `soup` | 따뜻한 국물 | prefs[soup] > 0 이고 feature[soup] ≥ 0.5 |
| `soft` | 부드러운 식감 | prefs[soft] > 0 이고 feature[soft] ≥ 0.5 |
| `hearty` | 든든한 한 끼 | prefs[hearty] > 0 이고 feature[hearty] ≥ 0.5 |
| `light` (v2) | 담백한 맛 | prefs[light] > 0 이고 feature[light] ≥ 0.5 |
| `age_fit` (v2) | 또래 분들이 자주 드세요 | 연령대별 결과(`byAgeBand`)에서만, ageFit[band] ≥ 0.6 이고 엔진 파일의 그 메뉴 `ageFitBasis === "stats"` |
| `review_good` (v2) | 손님 평이 좋아요 | reputation ≥ 0.70 이고 reviewCount ≥ 100 |
| `store_pick` | 사장님 추천 | priority > 0 |

- 순서: 특징 이유(기여 `prefs × feature`가 큰 순, 같으면 위 표 순서) → `age_fit` → `review_good` → `store_pick`.
- 엔진에 없는 메뉴에는 특징 이유와 `store_pick`만 붙는다 (feature가 태그 1/0).
- `age_fit`은 나이가 붙은 리뷰가 아니라 공공 통계(그 연령층이 실제로 자주 먹는 음식)에 근거한다. 그래서 "좋아해요"가 아니라 "자주 드세요"로 쓴다. 규칙만으로 만든 적합도(`ageFitBasis === "rule"`)는 점수에는 쓰지만 이유로 보여 주지 않는다.
- 화면에는 앞에서 2~3개만 보여 주기를 권한다 (Frontend 판단).

## TTS 규칙 (AI 담당, D28)
- 질문 화면에 들어오면 문구를 한 번 읽는다. 화면에 "다시 듣기" 버튼을 둔다.
- 읽는 중에 답 버튼을 누르면 읽기를 멈추고 다음 질문으로 간다.
- 질문 외 안내 문구(시작 인사, 추천 결과 안내 등)는 Frontend가 정하고 같은 TTS 모듈로 읽는다.

## 바꾸는 절차
문구나 점수를 바꾸려면 AI가 이 문서를 고치고, Backend가 같은 값으로 코드와 테스트를 고친 뒤 PM이 승인한다. 가중치(`W_age`, `W_rep`)는 엔진 파일 `weights`로 바꾼다 (코드 수정 없음).
