// docs/contracts/kiosk-flow.md 1장의 상태와 같은 모양
import type { Answer, OrderType, Recommendation } from '../api/contracts';
import type { AgeGateUpdate } from '../ai/types';

export type Screen =
  | 'idle' | 'detecting' | 'survey' | 'recommend' | 'menu'
  | 'order_type' | 'cart' | 'paying' | 'pay_failed' | 'done';

export type Mode = 'easy' | 'normal';
export type AgeGroup = 'senior' | 'non_senior' | 'undecided';

export interface CartLine { menuId: string; quantity: number }

export interface KioskState {
  screen: Screen;
  mode: Mode | null;
  ageGroup: AgeGroup | null;          // 세션 메모리에만 둔다. 서버로 보내지 않는다 (D2, D47)
  surveyIndex: number;
  answers: { questionId: string; answer: Answer }[];
  recommendations: Recommendation[];
  orderType: OrderType | null;
  cart: CartLine[];
  orderId: string | null;
  orderNumber: string | null;
  lastInteractionAt: number;
}

/** now: 사람이 한 동작이면 lastInteractionAt을 갱신하는 시각 (ms) */
export type KioskAction =
  | { type: 'AI_UPDATE'; update: AgeGateUpdate; now: number }
  | { type: 'TOUCH_START'; now: number }
  | { type: 'INTERACT'; now: number }
  | { type: 'TOGGLE_MODE'; now: number }
  | { type: 'OPEN_CHAT'; now: number }
  | { type: 'ANSWER'; questionId: string; answer: Answer; questionCount: number; now: number }
  | { type: 'EXIT_SURVEY'; now: number }
  | { type: 'RECS_LOADED'; items: Recommendation[] }
  | { type: 'RECS_FAILED' }
  | { type: 'ADD_TO_CART'; menuId: string; now: number }
  | { type: 'GO_MENU'; now: number }
  | { type: 'CHECKOUT'; now: number }
  | { type: 'CHOOSE_ORDER_TYPE'; orderType: OrderType; now: number }
  | { type: 'CHANGE_QTY'; menuId: string; delta: number; now: number }
  | { type: 'PAY_START'; now: number }
  | { type: 'ORDER_CREATED'; orderId: string }
  | { type: 'PAY_SUCCEEDED'; orderNumber: string; now: number }
  | { type: 'PAY_FAILED' }
  | { type: 'BACK_TO_CART'; now: number }
  | { type: 'BACK'; now: number }
  | { type: 'RESET'; now: number };
