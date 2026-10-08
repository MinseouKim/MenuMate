# MenuMate API 명세

프론트·백엔드·AI가 주고받는 약속입니다. 바꿀 때는 이 문서를 먼저 고치고 PR로 알립니다.

## 백엔드

### `GET /api/menu`
키오스크 메뉴판 전체 (품절 포함, 화면에서 '품절' 표시).

```json
{
  "store": "우루루 안양 본점",
  "menus": [
    { "id": 14, "name": "한돈 북경식 탕수육 (소)", "category": "요리", "price": 26000,
      "priceVerified": true, "spicy": 0, "serves": 2, "description": "…", "imageUrl": null, "soldOut": false, "popular": true }
  ]
}
```
- `category`: `식사` | `요리` | `딤섬` | `코스` | `세트`
- `popular`: 대표 메뉴 여부 ('대표 메뉴' 탭, 쉬운 화면 기본 탭)
- `priceVerified: false` → 아직 실제 메뉴판으로 확인하지 않은 예시 가격

## AI

### `POST /api/ai/recommend`
손님 말(STT 결과) → 추천.

요청
```json
{ "text": "두 명인데 안 매운 해물 요리", "ageGroup": "adult", "context": null }
```
- `text` 필수, 200자 이하
- `ageGroup`: `senior` | `adult` | `young` | `unknown` (카메라 꺼짐 = `unknown`)
- `context`: 직전 응답의 `context`를 그대로 보내면 대화가 이어짐. 처음은 `null`

응답
```json
{
  "understood": { "tags": ["나눠 먹는 요리", "해물"], "spicy": false, "people": 2, "budget": null, "excludeIngredients": [] },
  "matches": [ { "id": 19, "reason": "나눠 먹는 요리 · 해물 · 맵지 않음", "score": 8 } ],
  "recommendations": [ { "id": 19, "name": "해물누룽지탕", "price": 35000, "reason": "…" } ],
  "combo": { "items": [ { "id": 19, "quantity": 1 }, { "id": 8, "quantity": 2 } ], "total": 55000, "text": "…" },
  "question": { "text": "매운 음식 괜찮으세요?", "choices": ["매운 거 좋아요", "안 매운 걸로", "조금만 맵게"] },
  "speech": "추천 메뉴는 …입니다.",
  "fallback": false,
  "context": { }
}
```
- **`matches`: 메뉴판에 남길 메뉴 id (점수 순).** 화면은 이 메뉴만 보여 주고 '전체 메뉴 보기'로 되돌릴 수 있음. 고령층(`senior`)은 4개, 그 외 8개까지
- `recommendations`: 그중 상위 2~3개 (추천 카드·음성 안내용)
- `fallback: true`: 알아들은 조건이 없어 대표 메뉴를 보여 줌
- 오류 시 `503 { "fallbackToBasicMode": true }` → 화면은 전체 메뉴판으로 주문 계속

### `GET /api/ai/health` → `{ "ok": true, "menuSource": "json" | "mysql" }`

## 브라우저 이벤트 (프론트 ↔ AI 모듈)

| 이벤트 | 보내는 쪽 | detail |
| --- | --- | --- |
| `menumate:add-to-cart` | 메뉴 카드 '담기' | `{ id, quantity, source: 'board' \| 'ai-recommend' }` |
| `menumate:profile` | 얼굴 인식 | `{ ageGroup, level }` — level 0 보통 · 1 크게 · 2 아주 크게 |

얼굴 영상·사진·특징값은 어디에도 저장하거나 서버로 보내지 않습니다. 서버로 가는 것은 `ageGroup` 단어뿐입니다.
