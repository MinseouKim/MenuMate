# 계약: 키오스크 화면 흐름

- 주관: Frontend / 검토: AI, Backend / 승인: PM
- 상태: v1.1 확정 (2026-10-24, idle에서 판정 수신, AI error 처리, "이전" 목적지, easy 선택지 기준 명확화)
- 관련 결정: D9, D16, D17, D20, D24, D26, D28, D29, D30, D42, D43

화면 상태는 순수 리듀서(`(state, action) => state`)로 만들고, React 화면은 그 상태를 그리기만 한다. 프로토타입 `Kiosk` 모듈이 출발점이다.

## 1. 상태

```ts
type Screen =
  | 'idle'          // 대기. 카메라 안내 문구 상시 표시 (D20)
  | 'detecting'     // 얼굴 보임, 판정 중
  | 'survey'        // 질문 4개 (TTS + 네/아니요)
  | 'recommend'     // 추천 3개
  | 'menu'          // 메뉴판 (카테고리 + 메뉴)
  | 'order_type'    // 매장/포장 선택 (D42)
  | 'cart'          // 장바구니, 수량 변경
  | 'paying'        // 결제 진행 중 (시뮬레이션)
  | 'pay_failed'    // 결제 실패
  | 'done';         // 주문번호 표시

interface KioskState {
  screen: Screen;
  mode: 'easy' | 'normal' | null;      // null = 아직 판정 전
  ageGroup: 'senior' | 'non_senior' | 'undecided' | null; // 세션 메모리에만, 서버로 보내지 않음
  surveyIndex: number;
  answers: { questionId: string; answer: 'yes' | 'no' | 'skip' }[];
  recommendations: Recommendation[];
  orderType: 'dine_in' | 'takeout' | null;
  cart: { menuId: string; quantity: number }[];
  orderId: string | null;
  orderNumber: string | null;
  lastInteractionAt: number;
}
```

## 2. 전이

| 지금 | 일어난 일 | 다음 | 비고 |
|------|----------|------|------|
| idle | AI `detecting` | detecting | |
| detecting | AI `no_face` | idle | |
| idle / detecting | AI `decided: senior` | survey | mode=easy, TTS 인사 후 1번 질문. idle에서도 받음 (Shift+S, v1.1) |
| idle / detecting | AI `decided: non_senior` | menu | mode=normal |
| idle / detecting | AI `timeout` (8초) | menu | mode=normal, ageGroup=undecided (D16) |
| idle / detecting | AI `error` | menu | timeout과 같음. 판정 후 화면에서 오면 무시 (v1.1) |
| idle / detecting | 화면 터치 | menu | mode=normal. 카메라를 안 봐도 주문할 수 있어야 함 |
| menu | "AI와 대화하기" | survey | mode 유지 (D9, D19) |
| survey | 네 / 아니요 | survey 또는 recommend | 4번째 답 뒤 `POST /api/recommendations` |
| survey | "그냥 메뉴 볼래요" | menu | 질문 종료, mode 유지 (D17) |
| recommend | 메뉴 담기 | recommend | 장바구니 개수 갱신 |
| recommend | "다른 메뉴 보기" | menu | |
| menu | 메뉴 담기 | menu | |
| recommend / menu | "주문하기" (장바구니 1개 이상) | order_type 또는 cart | orderType이 없으면 order_type, 있으면 cart |
| order_type | 매장 / 포장 | cart | |
| cart | 수량 +/− | cart | 1~9. 0이 되면 줄 삭제. 장바구니가 비면 menu |
| cart | "결제하기" | paying | `POST /api/orders` → `POST /api/orders/:id/payment` |
| paying | 결제 성공 | done | 주문번호 표시, TTS로 번호 안내 |
| paying | 결제 실패 | pay_failed | 장바구니 유지 |
| pay_failed | "다시 결제" | paying | 같은 orderId로 재시도 |
| pay_failed | "장바구니로" | cart | 장바구니를 바꾸면 orderId를 버리고 다음 결제 때 새로 만든다 |
| done | 10초 경과 또는 "처음으로" | idle | 초기화 (D30) |
| idle·detecting 외 모든 화면 | 60초 무입력 | idle | 초기화 (D30) |
| 판정 후 모든 화면 | "쉬운 화면으로 보기" / "일반 화면으로 보기" | 같은 화면 | mode만 바꿈 |

**초기화**: 상태 전체를 처음 값으로 되돌리고 `ageGate.reset()`, `speaker.cancel()`을 호출한다. 연령·취향·장바구니가 남지 않아야 한다.

뒤로 가기: survey, recommend, order_type, cart에는 "이전" 버튼을 둔다. 전이표에 없는 동작은 무시한다(상태 변화 없음). (v1.1)

| 지금 | "이전" 누르면 |
|------|--------------|
| survey 1번 질문 | menu |
| survey 2~4번 질문 | 이전 질문 (그 답은 지움) |
| recommend | survey 4번 질문 |
| order_type, cart | 추천을 받았으면 recommend, 아니면 menu |

## 3. 예외 상황

| 상황 | 처리 |
|------|------|
| 카메라 권한 거부, 카메라 없음 | 대기 화면에서 터치로 시작 → menu(normal). 상단 "쉬운 화면으로 보기"는 그대로 |
| AI 모델 로드 실패 | 위와 같음. 화면에 오류를 띄우지 않고 개발자 콘솔에만 남김 |
| TTS 사용 불가 (`available=false`) | 글자만 보여 주고 흐름은 그대로 |
| API 실패 | 서버의 `error.message`를 큰 글씨로 보여 주고 "다시 시도" 버튼. 추천 실패 시 menu로 보냄 |
| 서버가 안 떠 있음 (`/api/health` 실패) | 대기 화면에 "잠시 후 이용해 주세요" 표시, 5초마다 재확인 |

## 4. 시연용 단축키 (D24, D30)
`VITE_DEV_SHORTCUTS=true`일 때만 동작한다. 화면에는 아무것도 표시하지 않는다.

| 키 | 동작 |
|----|------|
| `Shift + S` | `ageGate.force('senior')` |
| `Shift + N` | `ageGate.force('non_senior')` |
| `Shift + F` | 다음 결제 1회를 `simulate: "fail"`로 요청 |
| `Shift + R` | 즉시 초기화 |

## 5. 화면 기준 (D25, D31, RULES 참고)
- 세로 1080×1920 고정 캔버스. 창이 더 넓으면 가운데에 두고 양옆은 배경색.
- easy 모드: 본문 28px 이상, 버튼 높이 72px 이상, 대비 7:1 이상, 한 화면 선택지 4개 이하. "선택지"는 고르는 대상(메뉴 카드, 답 버튼)이고, 카테고리 탭 같은 이동용 버튼은 제외한다. 탭도 72px·28px 이상, 최대 6개. (v1.1)
- 판정 후 모든 화면 상단에 모드 전환 버튼.
