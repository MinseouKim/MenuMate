# 계약: 메뉴 JSON 스키마

- 주관: Backend / 검토: Frontend, AI / 승인: PM
- 상태: v1 확정 (2026-10-24)
- 관련 결정: D7, D12, D33, D40, D6

더미 메뉴와 우루루 본점 실데이터는 **이 스키마 하나**를 쓴다. Backend는 이 JSON을 시드로 DB에 넣고, 같은 모양으로 `GET /api/menu`에 내보낸다 (`api.md`).

## 파일 형태

```json
{
  "storeName": "우루루 본점",
  "version": "2026-10-24-dummy",
  "categories": [
    { "id": "stew", "name": "찌개·탕", "sortOrder": 1 }
  ],
  "items": [
    {
      "id": "m001",
      "name": "된장찌개",
      "price": 9000,
      "categoryId": "stew",
      "description": "구수한 집된장으로 끓인 찌개",
      "image": null,
      "tags": ["soup", "mild", "soft"],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 1
    }
  ]
}
```

## 필드

### categories[]
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | ✅ | 영문 소문자, 숫자, `-`만 사용. 파일 안에서 유일 |
| `name` | string | ✅ | 화면에 보이는 이름 |
| `sortOrder` | integer | ✅ | 작은 값이 먼저 |

### items[]
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string | ✅ | 파일 안에서 유일. 실데이터로 바꿔도 같은 메뉴는 같은 id 권장 |
| `name` | string | ✅ | 메뉴명 |
| `price` | integer | ✅ | 원 단위 정수. 소수 금지 |
| `categoryId` | string | ✅ | `categories[].id` 중 하나 |
| `description` | string \| null | | 한 줄 설명. 쉬운 화면에서는 생략 가능 |
| `image` | string \| null | ✅ | 이미지 파일 상대 경로(`menu-images/m001.jpg`). `null`이면 프론트가 카테고리 색 카드 + 메뉴명으로 그린다 (D40) |
| `tags` | string[] | ✅ | 아래 태그 목록에서만 고른다. 빈 배열 허용 |
| `priority` | integer | ✅ | 관리자 우선 추천 가중치 (D6). 기본 0, 범위 0~3 |
| `isAvailable` | boolean | ✅ | `false`면 메뉴판과 추천에서 제외 (품절) |
| `sortOrder` | integer | ✅ | 카테고리 안에서의 순서 |

## 태그 목록 (고정)

추천 점수(`questions.md`)가 이 태그만 쓴다. 태그를 추가하려면 `questions.md`와 함께 바꾸고 PM 승인을 받는다.

| 태그 | 의미 |
|------|------|
| `spicy` | 매운 음식 |
| `mild` | 맵지 않고 순한 음식 |
| `soup` | 국물 있는 음식 |
| `soft` | 부드러워 씹기 쉬운 음식 |
| `hearty` | 양이 많고 든든한 음식 |

## 이미지
- 이미지 파일은 Backend가 로컬 폴더(`MENU_IMAGE_DIR`)에서 `/static/menu-images/...`로 제공한다. 외부 URL 금지 (D32).
- 더미 데이터는 모두 `image: null`로 둔다. 인터넷에서 받은 사진을 쓰지 않는다 (D40).
- 실데이터 사진은 JPG 또는 WebP, 가로 800px 이상 권장.

## 검증 규칙 (Backend 시드 스크립트가 검사)
- `categoryId`가 없는 카테고리를 가리키면 실패
- `price`가 정수가 아니거나 0 이하이면 실패
- 목록에 없는 태그가 있으면 실패
- `id` 중복이면 실패
- 카테고리가 6개를 넘으면 실패 (쉬운 화면 탭 최대 6개, D51. v1.1)
- 실패하면 어떤 항목의 어떤 필드가 문제인지 출력하고 DB를 바꾸지 않는다

## 더미 데이터
- Backend가 `backend/seed/menu.dummy.json`으로 만든다. 한식 메뉴 20~30개, 카테고리 4~6개.
- 태그 5개가 골고루 쓰이게 하고, `priority`가 1 이상인 메뉴를 2~3개 둔다.
- 우루루 실데이터가 이 스키마와 다르게 오면 Backend가 변환 스크립트를 만들고, 스키마는 바꾸지 않는다.
