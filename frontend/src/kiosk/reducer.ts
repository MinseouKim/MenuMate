// 화면 상태 리듀서. docs/contracts/kiosk-flow.md 2장의 전이표(v1.2)를 그대로 옮겼다.
// 순수 함수다: API 호출, TTS, 카메라, 타이머는 useKiosk 훅이 맡는다.
// 전이표에 없는 동작은 상태를 바꾸지 않고 같은 객체를 돌려준다.
import type { KioskAction, KioskState, Screen } from './types';

export const MAX_QUANTITY = 9;

export const initialState = (now: number): KioskState => ({
  screen: 'idle',
  mode: null,
  ageGroup: null,
  surveyIndex: 0,
  answers: [],
  recommendations: [],
  orderType: null,
  cart: [],
  orderId: null,
  orderNumber: null,
  lastInteractionAt: now,
});

const SHOPPING: Screen[] = ['recommend', 'menu'];

/** 모드 전환 버튼이 있는 화면: 판정 후 화면 중 결제 중·주문번호 화면은 뺀다 (v1.2) */
export const canToggleMode = (s: Pick<KioskState, 'screen' | 'mode'>) =>
  s.mode !== null && s.screen !== 'paying' && s.screen !== 'done';

/** order_type, cart 에서 "이전"으로 돌아갈 곳. 추천을 받은 손님은 추천 화면으로 */
const shoppingScreen = (s: KioskState): Screen => (s.recommendations.length > 0 ? 'recommend' : 'menu');

export function kioskReducer(s: KioskState, a: KioskAction): KioskState {
  switch (a.type) {
    case 'AI_UPDATE': {
      // 판정은 대기·인식 화면에서만 받는다. 확정 뒤에는 재판정하지 않는다 (D18)
      if (s.screen !== 'idle' && s.screen !== 'detecting') return s;
      const u = a.update;
      switch (u.type) {
        case 'detecting':
          return s.screen === 'detecting' ? s : { ...s, screen: 'detecting' };
        case 'no_face':
          return s.screen === 'idle' ? s : { ...s, screen: 'idle' };
        case 'decided':
          return u.group === 'senior'
            ? { ...s, screen: 'survey', mode: 'easy', ageGroup: 'senior', surveyIndex: 0, answers: [], lastInteractionAt: a.now }
            : { ...s, screen: 'menu', mode: 'normal', ageGroup: 'non_senior', lastInteractionAt: a.now };
        case 'timeout':
        case 'error': // 판정 전 추론 오류는 타임아웃과 같게 (kiosk-flow v1.1)
          return { ...s, screen: 'menu', mode: 'normal', ageGroup: 'undecided', lastInteractionAt: a.now };
        default:
          return s;
      }
    }

    case 'START_EASY':
      if (s.screen !== 'idle' && s.screen !== 'detecting') return s;
      return { ...s, screen: 'survey', mode: 'easy', ageGroup: 'undecided', surveyIndex: 0, answers: [], lastInteractionAt: a.now };

    case 'START_NORMAL':
      if (s.screen !== 'idle' && s.screen !== 'detecting') return s;
      return { ...s, screen: 'menu', mode: 'normal', lastInteractionAt: a.now };

    case 'INTERACT':
      return { ...s, lastInteractionAt: a.now };

    case 'TOGGLE_MODE':
      if (!canToggleMode(s)) return s;
      return { ...s, mode: s.mode === 'easy' ? 'normal' : 'easy', lastInteractionAt: a.now };

    case 'OPEN_CHAT':
      if (s.screen !== 'menu') return s;
      return { ...s, screen: 'survey', surveyIndex: 0, answers: [], recommendations: [], lastInteractionAt: a.now };

    case 'ANSWER': {
      if (s.screen !== 'survey' || s.surveyIndex >= a.questionCount) return s;
      // 마지막 답 뒤에는 surveyIndex === questionCount 인 채로 추천 결과를 기다린다
      return {
        ...s,
        answers: [...s.answers.slice(0, s.surveyIndex), { questionId: a.questionId, answer: a.answer }],
        surveyIndex: s.surveyIndex + 1,
        lastInteractionAt: a.now,
      };
    }

    case 'EXIT_SURVEY':
      if (s.screen !== 'survey') return s;
      return { ...s, screen: 'menu', lastInteractionAt: a.now };

    case 'RECS_LOADED':
      if (s.screen !== 'survey') return s;
      return { ...s, screen: 'recommend', recommendations: a.items };

    case 'RECS_FAILED':
      if (s.screen !== 'survey') return s;
      return { ...s, screen: 'menu' };

    case 'ADD_TO_CART': {
      if (!SHOPPING.includes(s.screen)) return s;
      const line = s.cart.find(l => l.menuId === a.menuId);
      const cart = line
        ? s.cart.map(l => (l.menuId === a.menuId ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + 1) } : l))
        : [...s.cart, { menuId: a.menuId, quantity: 1 }];
      return { ...s, cart, orderId: null, lastInteractionAt: a.now };
    }

    case 'GO_MENU': // 추천의 "다른 메뉴 보기", 빈 장바구니의 "메뉴 담으러 가기"
      if (s.screen !== 'recommend' && !(s.screen === 'cart' && s.cart.length === 0)) return s;
      return { ...s, screen: 'menu', lastInteractionAt: a.now };

    case 'CHECKOUT':
      if (!SHOPPING.includes(s.screen) || s.cart.length === 0) return s;
      return { ...s, screen: s.orderType ? 'cart' : 'order_type', lastInteractionAt: a.now };

    case 'CHOOSE_ORDER_TYPE':
      if (s.screen !== 'order_type') return s;
      return { ...s, screen: 'cart', orderType: a.orderType, lastInteractionAt: a.now };

    case 'CHANGE_QTY': {
      if (s.screen !== 'cart') return s;
      const cart = s.cart
        .map(l => (l.menuId === a.menuId ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + a.delta) } : l))
        .filter(l => l.quantity > 0);
      // 장바구니를 바꾸면 기존 주문은 버리고 다음 결제 때 새로 만든다. 비어도 cart 에 머문다 (v1.2)
      return { ...s, cart, orderId: null, lastInteractionAt: a.now };
    }

    case 'PAY_START':
      if ((s.screen !== 'cart' && s.screen !== 'pay_failed') || s.cart.length === 0 || !s.orderType) return s;
      return { ...s, screen: 'paying', lastInteractionAt: a.now };

    case 'ORDER_CREATED':
      if (s.screen !== 'paying') return s;
      return { ...s, orderId: a.orderId };

    case 'PAY_SUCCEEDED':
      if (s.screen !== 'paying') return s;
      return { ...s, screen: 'done', orderNumber: a.orderNumber, lastInteractionAt: a.now };

    case 'PAY_FAILED':
      if (s.screen !== 'paying') return s;
      return { ...s, screen: 'pay_failed' };

    case 'BACK_TO_CART':
      if (s.screen !== 'pay_failed') return s;
      return { ...s, screen: 'cart', lastInteractionAt: a.now };

    case 'BACK':
      switch (s.screen) {
        case 'survey':
          if (s.surveyIndex === 0) return s; // 1번 질문에는 "이전"이 없다 (v1.2)
          return { ...s, surveyIndex: s.surveyIndex - 1, answers: s.answers.slice(0, s.surveyIndex - 1), lastInteractionAt: a.now };
        case 'recommend': {
          const surveyIndex = Math.max(0, s.answers.length - 1);
          return {
            ...s, screen: 'survey', surveyIndex, answers: s.answers.slice(0, surveyIndex),
            recommendations: [], lastInteractionAt: a.now,
          };
        }
        case 'order_type':
        case 'cart':
          return { ...s, screen: shoppingScreen(s), lastInteractionAt: a.now };
        default:
          return s;
      }

    case 'RESET':
      return initialState(a.now);

    default:
      return s;
  }
}

/** 무입력 60초, 주문번호 화면 10초 뒤 초기화할지 (D30). 대기·인식 화면은 초기화할 것이 없다 */
export function shouldAutoReset(
  s: KioskState, now: number, cfg: { idleResetMs: number; doneResetMs: number },
): boolean {
  if (s.screen === 'idle' || s.screen === 'detecting') return false;
  const limit = s.screen === 'done' ? cfg.doneResetMs : cfg.idleResetMs;
  return now - s.lastInteractionAt >= limit;
}
