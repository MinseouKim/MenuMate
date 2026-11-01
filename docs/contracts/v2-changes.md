# 계약 v2 변경: 리뷰 학습 엔진 + 연령대별 추천

- 작성: PM / 상태: v2 초안 확정 (2026-10-27)
- 관련 결정: D72~D80
- 이 문서는 아래 계약들의 v2 변경분이다. 각 계약 원문과 충돌하면 **이 문서가 우선**한다. 각 주관자가 세부를 채우면 PM 승인 후 원문에 합친다.

## 1. 연령대 3단계 (D72)

| 값 | 범위 | 화면 모드 |
|----|------|-----------|
| `under35` | 35세 미만 | normal |
| `35to54` | 35~54세 | normal |
| `55plus` | 55세 이상 | easy (D3 그대로) |
| `unknown` | 판정 안 됨 (타임아웃, 카메라 없음, 버튼으로 시작) | 버튼 선택에 따름 |

- 나이 숫자와 얼굴은 지금처럼 AI 모듈 밖으로 나가지 않는다 (D2).
- **연령대는 서버로 보내지 않는다** (D47 유지). 서버가 세 연령대의 추천을 한 번에 돌려주고, 브라우저가 그중 손님 연령대 것을 고른다 (D73).

## 2. ai-output v2 (주관: AI)
- `decided` 이벤트에 `ageBand: 'under35' | '35to54' | '55plus'`를 추가한다. 기존 `group`(`senior`/`non_senior`)은 화면 모드용으로 유지하고, `group === 'senior'` ⇔ `ageBand === '55plus'`가 항상 성립해야 한다.
- 확정 규칙(연속 프레임, 신뢰도, 8초 타임아웃)은 그대로다. `ageBand` 계산 방식(예: 확정에 쓴 프레임들의 중앙값)은 AI가 정해 `ai/docs/pipeline-io.md`에 적는다.
- `force()`는 `force(ageBand)`도 받는다. 단축키: `Shift+S` → `55plus`, `Shift+N` → `35to54`, `Shift+Y` → `under35`.
- 설정 `bandEdges` 기본값 `[35, 55]`.

## 3. questions v2 (주관: AI, 계산 구현: Backend)
- 질문 **5개 이하**, 답은 `yes` / `no` / `skip` 그대로 (D76).
- 질문은 엔진이 뽑는 메뉴 특징에 맞춘다. AI가 문구·점수 초안을 쓰고 PM이 승인한다. 승인 전까지 Backend와 Frontend는 v1 질문으로 개발을 계속한다.
- 점수 = 취향 점수(질문 답 × 메뉴 특징) + 연령대 적합 점수(엔진) + 리뷰 평판 점수(엔진) + `priority`. 가중치는 AI가 정해 문서에 적는다.
- `reasons`에 엔진 기반 이유 코드를 추가할 수 있다. 코드와 화면 문구 표는 AI가 questions v2에 적는다 (예: `review_good` = "손님 평이 좋아요", `age_fit` = "비슷한 연령대 손님이 좋아해요").

## 4. api v2 (주관: Backend)
`POST /api/recommendations` 요청은 그대로(`answers`만), 응답만 바뀐다.

```json
{
  "items": [ "Recommendation × 3 (연령대 없이 계산, unknown용)" ],
  "byAgeBand": {
    "under35": [ "Recommendation × 3" ],
    "35to54":  [ "Recommendation × 3" ],
    "55plus":  [ "Recommendation × 3" ]
  },
  "engineVersion": "2026-10-30-v1"
}
```
- 서버는 요청마다 세 연령대 + `unknown` 결과를 모두 계산해 보낸다. 손님 연령대를 알지 못한다.
- `items`는 v1 응답과 같은 자리라 v1 프론트도 계속 동작한다.

## 5. 엔진 결과 파일 (주관: AI, 사용: Backend) (D74)
- AI가 개발 컴퓨터에서 Python으로 학습하고, 결과를 `backend/engine/menu-features.json`(커밋함)으로 넘긴다. 전시 때는 이 파일만 쓰고 학습·인터넷은 없다.
- 형식은 AI가 정해 `ai/docs/engine.md`에 적는다. 최소: 메뉴별 특징값(0~1), 연령대별 적합 점수, 리뷰 평판, 근거 리뷰 수, 광고로 걸러진 리뷰 수, 엔진 버전.
- 리뷰 원본 데이터는 커밋하지 않는다 (라이선스). 받는 방법과 출처·라이선스를 `ai/docs/datasets.md`에 적는다.
- 메뉴 이름 매칭: 리뷰의 메뉴 이름과 우루루 메뉴 이름을 맞추는 규칙(동의어 표)도 엔진이 만든다. 매칭이 안 된 메뉴는 기본값(특징 0.5, 평판 중립)으로 둔다.

## 6. 광고성 리뷰 필터 (주관: AI) (D75)
- 1단계 규칙(체험단, 협찬, 제공받아, 원고료, 같은 문장 반복 등), 2단계 광고 표시 데이터가 있으면 분류 모델.
- 걸러진 리뷰 표본 100개로 정확도를 재서 `ai/docs/engine.md`에 보고한다.

## 7. kiosk-flow v1.3 (주관: Frontend)
- 상태의 `ageGroup`을 `ageBand: 'under35' | '35to54' | '55plus' | 'unknown' | null`로 바꾼다. 서버로 보내지 않는다.
- 추천 화면은 `byAgeBand[ageBand] ?? items`를 보여 준다.
- "큰 글씨로 주문" 버튼으로 시작하면 mode=easy, ageBand=`unknown`.

## 8. 메뉴 사진 (주관: Backend, 표시: Frontend) (D77)
- 더미 메뉴에 예시 사진을 넣는다. **CC0, 퍼블릭 도메인, CC BY(출처 표시)** 사진만 쓰고, 출처·작가·라이선스를 `backend/seed/menu-images/CREDITS.md`에 적는다. 출처가 불분명한 사진은 쓰지 않는다.
- 사진은 `backend/seed/menu-images/`에 커밋하고, `MENU_IMAGE_DIR` 기본값을 여기로 바꾼다. 실행 중에는 인터넷을 쓰지 않는다 (D32).
- 사진이 없는 메뉴는 지금처럼 색 카드 (D40).
