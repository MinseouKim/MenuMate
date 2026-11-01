# 계약: Backend API

- 주관: Backend / 검토: Frontend, AI / 승인: PM
- 상태: v1.1 확정 (2026-10-24, Backend 질문 5개 반영: 검증 규칙 4개 명확화 + `NOT_FOUND` 추가)
- 관련 결정: D2, D5, D13, D19, D26, D32, D36, D43

## 공통
- Base: 같은 origin의 `/api` (개발 중에는 Vite가 `localhost:4000`으로 프록시)
- 요청과 응답은 JSON, UTF-8
- 금액은 원 단위 정수
- 시간은 ISO 8601 문자열, 키오스크 로컬 시간대 기준
- **얼굴, 나이, 연령대는 어떤 요청에도 넣지 않는다** (D2)
- 에러 응답 형식 (4xx, 5xx 공통):

```json
{ "error": { "code": "ORDER_NOT_FOUND", "message": "주문을 찾을 수 없어요. 처음부터 다시 해 주세요." } }
```

`message`는 화면에 그대로 띄울 수 있는 한국어 문장이다. 문장은 `design/copy.md` 5장(디자이너 작성)을 기준으로 한다. 아래 표와 본문에 적힌 예시 문장보다 copy.md가 우선이다. (v1.2, D69)

| code | HTTP | 언제 |
|------|------|------|
| `VALIDATION_FAILED` | 400 | 요청 형식이 틀림 |
| `MENU_NOT_FOUND` | 400 | 없는 메뉴 id |
| `MENU_UNAVAILABLE` | 409 | 품절 메뉴 |
| `ORDER_NOT_FOUND` | 404 | 없는 주문 id |
| `ORDER_ALREADY_PAID` | 409 | 이미 결제된 주문에 다시 결제 |
| `NOT_FOUND` | 404 | `/api` 아래 없는 경로, 없는 `/static`·`/models` 파일. message: "요청한 내용을 찾을 수 없어요." (v1.1 추가) |
| `INTERNAL` | 500 | 그 밖의 서버 오류 |

## TypeScript 타입
Backend는 아래 타입을 `backend/src/contracts.ts`에서 export한다. Frontend는 이 파일을 import하거나 같은 모양으로 맞춘다.

```ts
type OrderType = 'dine_in' | 'takeout';
type Answer = 'yes' | 'no' | 'skip';
type Tag = 'spicy' | 'mild' | 'soup' | 'soft' | 'hearty';
type Reason = Tag | 'store_pick';

interface Category { id: string; name: string; sortOrder: number }
interface MenuItem {
  id: string; name: string; price: number; categoryId: string;
  description: string | null; imageUrl: string | null;   // 예: "/static/menu-images/m001.jpg"
  tags: Tag[]; priority: number; sortOrder: number;
}
interface Question { id: string; order: number; text: string }
interface Recommendation { menu: MenuItem; score: number; reasons: Reason[] }
interface OrderLine { menuId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }
interface Order {
  orderId: string; orderType: OrderType; status: 'pending_payment' | 'paid';
  lines: OrderLine[]; totalAmount: number;
  orderNumber: string | null; paidAt: string | null;
}
```

## 엔드포인트

### `GET /api/health`
`200 { "ok": true }`. 키오스크 시작 시 서버가 떠 있는지 확인용.

### `GET /api/menu`
`200 { "storeName": string, "categories": Category[], "items": MenuItem[] }`
- `isAvailable = false` 메뉴는 빼고 보낸다.
- `image`가 `null`이면 `imageUrl`도 `null`.

### `GET /api/questions`
`200 { "questions": Question[] }` — `questions.md`의 4개, `order` 오름차순.

### `POST /api/recommendations`
요청:
```json
{ "answers": [ { "questionId": "q_spicy", "answer": "no" }, { "questionId": "q_soup", "answer": "yes" } ] }
```
- 질문 4개를 다 보내지 않아도 된다 (중간 종료, D17). 빈 배열도 허용.
- 같은 `questionId`가 두 번 오면 `VALIDATION_FAILED`.
- 질문 목록에 없는 `questionId`, `yes`/`no`/`skip`이 아닌 `answer`도 `VALIDATION_FAILED`. (v1.1)
- `reasons`에서 기여 점수가 같은 태그끼리는 Tag 선언 순서(`spicy`, `mild`, `soup`, `soft`, `hearty`)를 따르고, `store_pick`은 항상 맨 끝. (v1.1)

응답: `200 { "items": Recommendation[] }` — 항상 3개 (메뉴가 3개 미만이면 있는 만큼). 계산은 `questions.md`.

### `POST /api/orders`
요청:
```json
{ "orderType": "dine_in", "items": [ { "menuId": "m001", "quantity": 2 } ] }
```
- `items` 1~20줄, `quantity` 1~9. 같은 `menuId`가 여러 줄이면 서버가 합치고, 합친 수량이 9를 넘으면 `VALIDATION_FAILED`. (v1.1)
- **가격은 서버가 DB 기준으로 계산한다.** 클라이언트가 가격을 보내지 않는다.

응답: `201 Order` (`status: "pending_payment"`, `orderNumber: null`)

### `POST /api/orders/:orderId/payment`
요청:
```json
{ "method": "card_simulated", "simulate": "success" }
```
- `method`는 필수이고 지금은 `"card_simulated"`만 허용. 다른 값이면 `VALIDATION_FAILED`. (v1.1)
- `simulate`: `"success"` | `"fail"`. 생략하면 서버 설정 `PAYMENT_SIM_RESULT`(기본 `success`)를 따른다. 시연에서 실패 화면을 보여 줄 때만 `"fail"`을 쓴다.
- 결제 로직은 `PaymentGateway` 인터페이스 뒤에 둔다. 지금 구현체는 시뮬레이션 하나다 (D13).

응답 (둘 다 `200`):
```json
{ "result": "success", "order": { "...": "Order, status=paid, orderNumber=\"007\"" } }
{ "result": "fail", "reason": "카드 승인이 되지 않았어요. 다시 시도해 주세요.", "order": { "...": "Order, status=pending_payment" } }
```
- 실패해도 주문은 그대로 남고, 같은 `orderId`로 다시 결제할 수 있다.
- 결제 시도마다 결과를 기록한다 (성공/실패, 시각).

### 주문번호 규칙 (D43)
- 결제 **성공 시** 발급한다.
- 키오스크 로컬 날짜 기준으로 매일 `001`부터 1씩 증가하는 3자리 문자열. `999` 다음은 `001`.
- 서버를 다시 켜도 그날 번호는 이어진다 (DB에 저장).

## 정적 파일 (Backend가 제공)
| 경로 | 내용 | 설정 |
|------|------|------|
| `/static/menu-images/*` | 메뉴 사진 | `MENU_IMAGE_DIR` |
| `/models/*` | AI 모델 파일, MediaPipe·ONNX Runtime WASM | `MODEL_DIR` (기본 `../ai/models`) |
| `/*` | 빌드된 프론트 (전시용 단일 실행) | `FRONTEND_DIST` (기본 `../frontend/dist`). 폴더가 없으면 건너뜀 |

- `/models/*`에 `.wasm`은 `application/wasm` Content-Type으로 보낸다.
- 프론트 라우트(`/api`, `/static`, `/models` 외)는 `index.html`로 돌려준다.
