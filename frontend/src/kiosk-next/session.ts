// 손님 한 명의 주문 흐름(세션)을 순수 reducer 로 표현합니다. 타이머·카메라·음성 같은 바깥 일은 useKiosk 가 맡고,
// 여기서는 "어떤 일이 일어나면 상태가 어떻게 바뀌는가"만 정합니다. 그래서 브라우저 없이 테스트할 수 있습니다.
import type { FaceGroup } from '../prototype/ageAssist';
import * as Cart from './cart';
import type { Asking, ChatReply, ChatTurn, PickReason, Conditions, Dialog, KioskContext, Line, Mode, Mood, Order, Prefs, Recommendation, Screen } from './types';

/** 직원 AI와 나눈 대화. 서버가 없으면 failed=true 가 되어 예전 길(말하기 → 확인 → 추천)로 갑니다. */
export interface ChatState {
  turns: ChatTurn[];
  /** 서버 답을 기다리는 중 */
  pending: boolean;
  failed: boolean;
  mood: Mood | null;
  picks: string[];
  done: boolean;
  /** 마지막 질문이 묻는 것(서버가 알려 줄 때만). 화면의 터치 답 버튼이 이 값을 따릅니다. */
  asking: Asking | null;
  /** 대화로 고른 메뉴의 이유(순서 = 추천 순위), 들은 조건 한 줄, 인원을 몰라 1명으로 가정했는지 (2026-11-03) */
  pickReasons: PickReason[];
  heardSummary: string | null;
  partyAssumed: boolean;
  context: KioskContext | null;
}
const NO_CHAT: ChatState = { turns: [], pending: false, failed: false, mood: null, picks: [], done: false, asking: null, pickReasons: [], heardSummary: null, partyAssumed: false, context: null };

export interface SessionState {
  screen: Screen;
  /** 지나온 화면. '이전 화면'은 이 기록으로 돌아갑니다. */
  history: Screen[];
  mode: Mode;
  category: string;
  /** null: 검색 안 함, '': 검색 중(입력 없음) */
  search: string | null;
  cart: Cart.Cart;
  prefs: Prefs;
  /** 손님이 직접 바꾼 설정이 있으면 카메라가 덮어쓰지 않습니다. */
  manual: boolean;
  /** 카메라 화면 맞춤은 손님 한 명마다 한 번만 합니다. */
  faceDone: boolean;
  faceNote: { before: Pick<Prefs, 'large' | 'voice'> } | null;
  conditions: Conditions;
  aiUsed: boolean;
  results: Recommendation[];
  order: Order | null;
  /** 오늘 지금까지 낸 주문 수. 손님이 바뀌어도 이어집니다. */
  orderCount: number;
  message: string;
  dialog: Dialog | null;
  staffCalled: boolean;
  /** 빈 조건. 새 손님을 맞을 때 되돌아가는 값입니다. */
  blank: Conditions;
  chat: ChatState;
  /** 카메라 불편 신호로 큰 글씨를 제안했는지 (손님 한 명당 한 번) */
  comfortAsked: boolean;
}

export type Action =
  | { type: 'go'; to: Screen }
  | { type: 'back' }
  | { type: 'reset'; to?: Screen; fresh?: boolean }
  | { type: 'mode'; mode: Mode }
  | { type: 'category'; id: string }
  | { type: 'search'; query: string | null }
  | { type: 'cart'; change: (cart: Cart.Cart) => Cart.Cart }
  | { type: 'pref'; name: keyof Prefs; on: boolean; byUser: boolean }
  | { type: 'face'; group: FaceGroup }
  | { type: 'face/done' }
  | { type: 'face/undo' }
  | { type: 'face/note-clear' }
  | { type: 'conditions'; conditions: Conditions }
  | { type: 'conditions/patch'; patch: Partial<Conditions> }
  | { type: 'conditions/refined'; from: Conditions; to: Conditions }
  | { type: 'results'; results: Recommendation[] }
  | { type: 'ordered'; order: Order }
  | { type: 'message'; text: string }
  | { type: 'dialog'; dialog: Dialog | null }
  | { type: 'staff-called' }
  | { type: 'chat/context'; context: KioskContext | null }
  | { type: 'chat/user'; text: string }
  /** 가게 첫인사를 서버 없이 바로 */
  | { type: 'chat/greet'; text: string }
  /** 답을 기다리는 중에 손님이 이어 말함: 마지막 손님 말에 합쳐 다시 보냅니다 */
  | { type: 'chat/amend'; text: string }
  /** 손님이 직원 말을 끊음 */
  | { type: 'chat/interrupted' }
  | { type: 'chat/pending'; on: boolean }
  | { type: 'chat/assistant'; reply: ChatReply }
  | { type: 'chat/failed' }
  | { type: 'comfort/asked' };

const START_CATEGORY = 'duck-fish';
const NO_PREFS: Prefs = { large: false, voice: false, contrast: false, low: false };

export function createInitialState(blank: Conditions): SessionState {
  return {
    screen: 'welcome', history: [], mode: 'recommend', category: START_CATEGORY, search: null,
    cart: Cart.emptyCart, prefs: NO_PREFS, manual: false, faceDone: false, faceNote: null,
    conditions: blank, aiUsed: false, results: [], order: null, orderCount: 0,
    message: '', dialog: null, staffCalled: false, blank, chat: NO_CHAT, comfortAsked: false,
  };
}

/** 처음 상태로. 완료 화면(to='done')은 지나온 길(mode)과 주문을 남겨 영수증을 보여 줍니다. */
function fresh(state: SessionState, to: Screen, wipePrefs: boolean): SessionState {
  const done = to === 'done';
  return {
    ...state,
    screen: to, history: [], category: START_CATEGORY, search: null, cart: Cart.emptyCart,
    conditions: state.blank, aiUsed: false, results: [], dialog: null, message: '', staffCalled: false,
    // 상황(날씨·시간대)은 손님이 바뀌어도 그대로 쓰고, 대화만 새로 시작합니다.
    chat: { ...NO_CHAT, context: state.chat.context },
    mode: done ? state.mode : 'recommend',
    order: done ? state.order : null,
    prefs: wipePrefs ? NO_PREFS : state.prefs,
    ...(to === 'welcome' ? { faceDone: false, manual: false, faceNote: null, comfortAsked: false } : {}),
  };
}

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'go': {
      if (action.to === state.screen) return state;
      const seen = state.history.indexOf(action.to);
      return { ...state, screen: action.to, history: seen >= 0 ? state.history.slice(0, seen) : [...state.history, state.screen] };
    }
    case 'back':
      return { ...state, screen: state.history[state.history.length - 1] ?? 'welcome', history: state.history.slice(0, -1) };
    case 'reset':
      return fresh(state, action.to ?? 'welcome', action.fresh ?? false);
    case 'mode':
      return { ...state, mode: action.mode };
    case 'category':
      return { ...state, category: action.id };
    case 'search':
      return { ...state, search: action.query };
    case 'cart':
      return { ...state, cart: action.change(state.cart) };
    case 'pref':
      return {
        ...state,
        prefs: { ...state.prefs, [action.name]: action.on },
        manual: state.manual || (action.byUser && action.name !== 'contrast'),
      };
    case 'face': {
      if (state.faceDone) return state;
      // 시작 화면에서는 55세 이상일 때만 바로 맞춥니다(지나가는 사람은 계속 지켜봅니다).
      if (state.screen === 'welcome' && action.group !== 'senior') return state;
      if (state.manual || action.group === 'adult') return { ...state, faceDone: true };
      return {
        ...state,
        faceDone: true,
        faceNote: { before: { large: state.prefs.large, voice: state.prefs.voice } },
        prefs: { ...state.prefs, large: true, voice: true },
      };
    }
    case 'face/done':
      return { ...state, faceDone: true };
    case 'face/undo':
      return state.faceNote
        ? { ...state, prefs: { ...state.prefs, ...state.faceNote.before }, faceNote: null, manual: true }
        : state;
    case 'face/note-clear':
      return { ...state, faceNote: null };
    case 'conditions':
      return { ...state, conditions: action.conditions, aiUsed: false };
    case 'conditions/patch':
      return { ...state, conditions: { ...state.conditions, ...action.patch } };
    case 'conditions/refined':
      // 그 사이 손님이 조건을 고쳤으면 AI 결과로 덮어쓰지 않습니다.
      return JSON.stringify(state.conditions) === JSON.stringify(action.from)
        ? { ...state, conditions: action.to, aiUsed: true }
        : state;
    case 'results':
      return { ...state, results: action.results };
    case 'ordered':
      return { ...fresh(state, 'done', false), order: action.order, orderCount: state.orderCount + 1 };
    case 'message':
      return { ...state, message: action.text };
    case 'dialog':
      return { ...state, dialog: action.dialog, ...(action.dialog?.kind === 'help' ? { staffCalled: false } : {}) };
    case 'staff-called':
      return { ...state, staffCalled: true };
    case 'chat/context':
      return { ...state, chat: { ...state.chat, context: action.context } };
    case 'chat/user': {
      const text = action.text.trim();
      if (!text) return state;
      // 손님이 말한 문장들을 이어 붙여 두면(raw), 메뉴 이름 언급 가점과 '이렇게 이해했어요' 표시에 그대로 쓸 수 있습니다.
      const raw = [state.conditions.raw, text].filter(Boolean).join(' ');
      return { ...state, chat: { ...state.chat, turns: [...state.chat.turns, { role: 'user', text }], pending: true }, conditions: { ...state.conditions, raw } };
    }
    case 'chat/greet':
      return { ...state, chat: { ...state.chat, turns: [{ role: 'assistant', text: action.text }], pending: false, failed: false, asking: 'party' } };
    case 'chat/amend': {
      const text = action.text.trim();
      const turns = [...state.chat.turns];
      const last = turns.length - 1;
      if (!text || turns[last]?.role !== 'user') return state;
      turns[last] = { role: 'user', text: `${turns[last].text} ${text}` };
      return { ...state, chat: { ...state.chat, turns, pending: true }, conditions: { ...state.conditions, raw: [state.conditions.raw, text].filter(Boolean).join(' ') } };
    }
    case 'chat/interrupted': {
      const turns = [...state.chat.turns];
      const last = turns.length - 1;
      if (turns[last]?.role !== 'assistant') return state;
      turns[last] = { ...turns[last], interrupted: true };
      return { ...state, chat: { ...state.chat, turns } };
    }
    case 'chat/pending':
      return { ...state, chat: { ...state.chat, pending: action.on } };
    case 'chat/assistant': {
      const { reply } = action;
      return {
        ...state,
        chat: {
          ...state.chat, turns: [...state.chat.turns, { role: 'assistant', text: reply.reply }], pending: false, mood: reply.mood, picks: reply.picks, done: reply.done, asking: reply.asking ?? null,
          pickReasons: reply.pickReasons ?? [], heardSummary: reply.heardSummary ?? null, partyAssumed: reply.partyAssumed ?? false,
        },
        conditions: { ...state.conditions, ...reply.conditions },
        aiUsed: true,
      };
    }
    case 'chat/failed':
      return { ...state, chat: { ...state.chat, pending: false, failed: true } };
    case 'comfort/asked':
      return { ...state, comfortAsked: true };
  }
}

/** 카드·설명 팝업·말로 주문에서 메뉴를 담을 때 쓰는 줄. */
export const lineOf = (id: string, quantity: number, option?: string): Line => (option ? { id, quantity, option } : { id, quantity });
