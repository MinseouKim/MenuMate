import { describe, expect, it } from 'vitest';
import type { MenuItem, Recommendation } from '../api/contracts';
import { initialState, kioskReducer, shouldAutoReset } from './reducer';
import type { KioskAction, KioskState } from './types';

const T = 1000;
const run = (actions: KioskAction[], from: KioskState = initialState(0)) => actions.reduce(kioskReducer, from);

const senior: KioskAction = { type: 'AI_UPDATE', now: T, update: { type: 'decided', group: 'senior', confidence: 0.9, source: 'model' } };
const junior: KioskAction = { type: 'AI_UPDATE', now: T, update: { type: 'decided', group: 'non_senior', confidence: 0.9, source: 'model' } };
const detecting: KioskAction = { type: 'AI_UPDATE', now: T, update: { type: 'detecting', frameGroup: 'senior', run: 1, required: 5, elapsedMs: 0 } };
const answer = (questionId: string, a: 'yes' | 'no' = 'yes'): KioskAction =>
  ({ type: 'ANSWER', questionId, answer: a, questionCount: 4, now: T });
const add = (menuId: string): KioskAction => ({ type: 'ADD_TO_CART', menuId, now: T });

const menuItem = (id: string): MenuItem => ({
  id, name: id, price: 1000, categoryId: 'c', description: null, imageUrl: null, tags: [], priority: 0, sortOrder: 0,
});
const recs: Recommendation[] = ['a', 'b', 'c'].map(id => ({ menu: menuItem(id), score: 1, reasons: [] }));
const fourAnswers = [answer('q1'), answer('q2'), answer('q3'), answer('q4', 'no')];

describe('연령 판정', () => {
  it('idle → detecting → no_face 이면 idle', () => {
    const s = run([detecting]);
    expect(s.screen).toBe('detecting');
    expect(kioskReducer(s, { type: 'AI_UPDATE', now: T, update: { type: 'no_face' } }).screen).toBe('idle');
  });

  it('55+ 확정이면 쉬운 화면 질문', () => {
    const s = run([detecting, senior]);
    expect(s).toMatchObject({ screen: 'survey', mode: 'easy', ageGroup: 'senior', surveyIndex: 0 });
  });

  it('55 미만 확정이면 일반 메뉴판', () => {
    expect(run([detecting, junior])).toMatchObject({ screen: 'menu', mode: 'normal', ageGroup: 'non_senior' });
  });

  it('8초 타임아웃이면 일반 메뉴판, ageGroup=undecided (D16)', () => {
    const s = run([detecting, { type: 'AI_UPDATE', now: T, update: { type: 'timeout' } }]);
    expect(s).toMatchObject({ screen: 'menu', mode: 'normal', ageGroup: 'undecided' });
  });

  it('판정 전 추론 오류(inference_failed)는 타임아웃과 같이 일반 메뉴판 (kiosk-flow v1.1)', () => {
    const error: KioskAction = { type: 'AI_UPDATE', now: T, update: { type: 'error', code: 'inference_failed', message: 'x' } };
    expect(run([detecting, error])).toMatchObject({ screen: 'menu', mode: 'normal', ageGroup: 'undecided' });
    expect(run([error])).toMatchObject({ screen: 'menu', mode: 'normal', ageGroup: 'undecided' });
    const decided = run([detecting, senior]);
    expect(kioskReducer(decided, error)).toBe(decided);
  });

  it('대기 화면에서 타임아웃이 와도 일반 메뉴판 (kiosk-flow v1.1)', () => {
    expect(run([{ type: 'AI_UPDATE', now: T, update: { type: 'timeout' } }])).toMatchObject({ screen: 'menu', ageGroup: 'undecided' });
  });

  it('대기 화면에서 강제 판정(단축키)도 바로 반영된다', () => {
    expect(run([senior]).screen).toBe('survey');
  });

  it('판정이 끝난 뒤의 AI 이벤트는 무시한다 (D18)', () => {
    const s = run([detecting, junior]);
    expect(kioskReducer(s, senior)).toBe(s);
  });

  it('"바로 주문"은 판정 없이 일반 메뉴판 (D46, v1.2)', () => {
    expect(run([{ type: 'START_NORMAL', now: T }])).toMatchObject({ screen: 'menu', mode: 'normal', ageGroup: null });
    expect(run([detecting, { type: 'START_NORMAL', now: T }]).screen).toBe('menu');
  });

  it('"큰 글씨로 주문"은 쉬운 화면 질문, ageGroup=undecided (v1.2, D68)', () => {
    expect(run([{ type: 'START_EASY', now: T }]))
      .toMatchObject({ screen: 'survey', mode: 'easy', ageGroup: 'undecided', surveyIndex: 0, answers: [] });
    expect(run([detecting, { type: 'START_EASY', now: T }]).screen).toBe('survey');
  });

  it('판정 뒤에는 시작 버튼 동작을 무시한다', () => {
    const s = run([junior]);
    expect(kioskReducer(s, { type: 'START_EASY', now: T })).toBe(s);
    expect(kioskReducer(s, { type: 'START_NORMAL', now: T })).toBe(s);
  });
});

describe('질문', () => {
  it('4번째 답 뒤에는 추천을 기다리고, 받으면 recommend', () => {
    const s = run([senior, ...fourAnswers]);
    expect(s.screen).toBe('survey');
    expect(s.surveyIndex).toBe(4);
    expect(s.answers.map(a => a.answer)).toEqual(['yes', 'yes', 'yes', 'no']);
    expect(kioskReducer(s, { type: 'RECS_LOADED', items: recs })).toMatchObject({ screen: 'recommend', recommendations: recs });
  });

  it('추천 실패 시 menu', () => {
    expect(run([senior, ...fourAnswers, { type: 'RECS_FAILED' }]).screen).toBe('menu');
  });

  it('기다리는 중에는 더 답할 수 없다', () => {
    const s = run([senior, ...fourAnswers]);
    expect(kioskReducer(s, answer('q5'))).toBe(s);
  });

  it('"그냥 메뉴 볼래요"는 menu로, mode 유지 (D17)', () => {
    expect(run([senior, answer('q1'), { type: 'EXIT_SURVEY', now: T }])).toMatchObject({ screen: 'menu', mode: 'easy' });
  });

  it('"AI와 대화하기"는 일반 화면에서 질문을 처음부터 시작 (D19)', () => {
    const s = run([junior, { type: 'OPEN_CHAT', now: T }]);
    expect(s).toMatchObject({ screen: 'survey', mode: 'normal', surveyIndex: 0, answers: [] });
  });

  it('질문 "이전"은 앞 질문으로, 첫 질문에는 "이전"이 없다 (v1.2)', () => {
    const s = run([senior, answer('q1'), answer('q2'), { type: 'BACK', now: T }]);
    expect(s.surveyIndex).toBe(1);
    expect(s.answers.map(a => a.questionId)).toEqual(['q1']);
    const first = run([senior]);
    expect(kioskReducer(first, { type: 'BACK', now: T })).toBe(first);
  });

  it('추천 화면 "이전"은 마지막 질문으로', () => {
    const s = run([senior, ...fourAnswers, { type: 'RECS_LOADED', items: recs }, { type: 'BACK', now: T }]);
    expect(s).toMatchObject({ screen: 'survey', surveyIndex: 3, recommendations: [] });
    expect(s.answers).toHaveLength(3);
  });
});

describe('주문', () => {
  it('빈 장바구니로는 주문하기가 안 된다', () => {
    const s = run([junior]);
    expect(kioskReducer(s, { type: 'CHECKOUT', now: T })).toBe(s);
  });

  it('같은 메뉴를 담으면 수량이 늘고 9개까지', () => {
    const s = run([junior, ...Array(12).fill(add('m1'))]);
    expect(s.cart).toEqual([{ menuId: 'm1', quantity: 9 }]);
  });

  it('주문하기 → 매장/포장 → 장바구니, 두 번째부터는 바로 장바구니 (D42)', () => {
    const s = run([junior, add('m1'), { type: 'CHECKOUT', now: T }]);
    expect(s.screen).toBe('order_type');
    const c = kioskReducer(s, { type: 'CHOOSE_ORDER_TYPE', orderType: 'takeout', now: T });
    expect(c).toMatchObject({ screen: 'cart', orderType: 'takeout' });
    const again = run([{ type: 'BACK', now: T }, { type: 'CHECKOUT', now: T }], c);
    expect(again.screen).toBe('cart');
  });

  it('수량 0이면 줄 삭제, 장바구니가 비어도 cart에 머물고 "메뉴 담으러 가기"로 menu (v1.2)', () => {
    const s = run([junior, add('m1'), add('m2'), { type: 'CHECKOUT', now: T },
      { type: 'CHOOSE_ORDER_TYPE', orderType: 'dine_in', now: T },
      { type: 'CHANGE_QTY', menuId: 'm1', delta: -1, now: T }]);
    expect(s.cart).toEqual([{ menuId: 'm2', quantity: 1 }]);
    const empty = kioskReducer(s, { type: 'CHANGE_QTY', menuId: 'm2', delta: -1, now: T });
    expect(empty).toMatchObject({ screen: 'cart', cart: [] });
    expect(kioskReducer(empty, { type: 'GO_MENU', now: T }).screen).toBe('menu');
    expect(kioskReducer(empty, { type: 'PAY_START', now: T })).toBe(empty);
  });

  it('담은 메뉴가 있으면 장바구니에서 "메뉴 담으러 가기"는 무시 ("이전"을 쓴다)', () => {
    const s = run([junior, add('m1'), { type: 'CHECKOUT', now: T }, { type: 'CHOOSE_ORDER_TYPE', orderType: 'dine_in', now: T }]);
    expect(kioskReducer(s, { type: 'GO_MENU', now: T })).toBe(s);
  });

  it('추천을 본 손님의 장바구니 "이전"은 recommend로', () => {
    const s = run([senior, ...fourAnswers, { type: 'RECS_LOADED', items: recs }, add('a'),
      { type: 'CHECKOUT', now: T }, { type: 'BACK', now: T }]);
    expect(s.screen).toBe('recommend');
  });
});

describe('결제', () => {
  const atCart = run([junior, add('m1'), { type: 'CHECKOUT', now: T },
    { type: 'CHOOSE_ORDER_TYPE', orderType: 'dine_in', now: T }]);

  it('성공하면 주문번호 화면', () => {
    const s = run([{ type: 'PAY_START', now: T }, { type: 'ORDER_CREATED', orderId: 'o1' },
      { type: 'PAY_SUCCEEDED', orderNumber: '007', now: 5000 }], atCart);
    expect(s).toMatchObject({ screen: 'done', orderNumber: '007', orderId: 'o1', lastInteractionAt: 5000 });
  });

  it('실패하면 장바구니 유지, 다시 결제는 같은 orderId', () => {
    const failed = run([{ type: 'PAY_START', now: T }, { type: 'ORDER_CREATED', orderId: 'o1' }, { type: 'PAY_FAILED' }], atCart);
    expect(failed).toMatchObject({ screen: 'pay_failed', orderId: 'o1', cart: atCart.cart });
    expect(kioskReducer(failed, { type: 'PAY_START', now: T })).toMatchObject({ screen: 'paying', orderId: 'o1' });
  });

  it('실패 후 장바구니를 바꾸면 orderId를 버린다', () => {
    const s = run([{ type: 'PAY_START', now: T }, { type: 'ORDER_CREATED', orderId: 'o1' }, { type: 'PAY_FAILED' },
      { type: 'BACK_TO_CART', now: T }, { type: 'CHANGE_QTY', menuId: 'm1', delta: 1, now: T }], atCart);
    expect(s).toMatchObject({ screen: 'cart', orderId: null, cart: [{ menuId: 'm1', quantity: 2 }] });
  });

  it('결제 중이 아닐 때 온 결과는 무시한다 (초기화 뒤 늦게 온 응답)', () => {
    const s = initialState(0);
    expect(kioskReducer(s, { type: 'PAY_SUCCEEDED', orderNumber: '001', now: T })).toBe(s);
  });
});

describe('모드 전환과 초기화', () => {
  it('판정 전에는 모드 전환 불가, 판정 후에는 화면 그대로 mode만 바꿈', () => {
    const s = initialState(0);
    expect(kioskReducer(s, { type: 'TOGGLE_MODE', now: T })).toBe(s);
    expect(run([senior, { type: 'TOGGLE_MODE', now: T }])).toMatchObject({ screen: 'survey', mode: 'normal' });
  });

  it('결제 중·주문번호 화면에서는 모드 전환을 무시한다 (v1.2)', () => {
    const paying = run([junior, add('m1'), { type: 'CHECKOUT', now: T },
      { type: 'CHOOSE_ORDER_TYPE', orderType: 'dine_in', now: T }, { type: 'PAY_START', now: T }]);
    expect(kioskReducer(paying, { type: 'TOGGLE_MODE', now: T })).toBe(paying);
    const done = kioskReducer(paying, { type: 'PAY_SUCCEEDED', orderNumber: '001', now: T });
    expect(kioskReducer(done, { type: 'TOGGLE_MODE', now: T })).toBe(done);
    const failed = kioskReducer(paying, { type: 'PAY_FAILED' });
    expect(kioskReducer(failed, { type: 'TOGGLE_MODE', now: T }).mode).toBe('easy');
  });

  it('RESET은 연령·취향·장바구니를 모두 지운다 (D30)', () => {
    const s = run([senior, answer('q1'), add('m1'), { type: 'RESET', now: 9 }]);
    expect(s).toEqual(initialState(9));
  });

  it('60초 무입력이면 초기화, 대기·인식 화면은 제외', () => {
    const cfg = { idleResetMs: 60000, doneResetMs: 15000 };
    const s = run([junior]);
    expect(shouldAutoReset(s, T + 59999, cfg)).toBe(false);
    expect(shouldAutoReset(s, T + 60000, cfg)).toBe(true);
    expect(shouldAutoReset(initialState(0), 1e9, cfg)).toBe(false);
    expect(shouldAutoReset(run([detecting]), 1e9, cfg)).toBe(false);
  });

  it('주문번호 화면은 15초 뒤 초기화 (v1.2)', () => {
    const cfg = { idleResetMs: 60000, doneResetMs: 15000 };
    const done: KioskState = { ...initialState(0), screen: 'done', mode: 'normal', lastInteractionAt: T };
    expect(shouldAutoReset(done, T + 14999, cfg)).toBe(false);
    expect(shouldAutoReset(done, T + 15000, cfg)).toBe(true);
  });

  it('사람의 동작은 lastInteractionAt을 갱신한다', () => {
    expect(run([junior, { type: 'INTERACT', now: 4242 }]).lastInteractionAt).toBe(4242);
  });
});

describe('개인정보 (D2, D47)', () => {
  it('상태 키는 계약 1장과 같고 나이 숫자를 담는 필드가 없다', () => {
    expect(Object.keys(initialState(0)).sort()).toEqual([
      'ageGroup', 'answers', 'cart', 'lastInteractionAt', 'mode', 'orderId', 'orderNumber',
      'orderType', 'recommendations', 'screen', 'surveyIndex',
    ]);
  });

  it('판정 뒤 상태에는 연령대 문자열만 남는다', () => {
    const s = run([detecting, senior]);
    expect(s.ageGroup).toBe('senior');
    expect(JSON.stringify(s)).not.toMatch(/"age"\s*:/);
    expect(JSON.stringify(s)).not.toMatch(/confidence/);
  });
});

describe('순서에 맞지 않는 동작은 무시한다', () => {
  const idle = initialState(0);
  const ignored: KioskAction[] = [
    { type: 'OPEN_CHAT', now: T }, answer('q1'), { type: 'EXIT_SURVEY', now: T }, add('m1'),
    { type: 'CHECKOUT', now: T }, { type: 'CHOOSE_ORDER_TYPE', orderType: 'dine_in', now: T },
    { type: 'CHANGE_QTY', menuId: 'm1', delta: 1, now: T }, { type: 'PAY_START', now: T },
    { type: 'ORDER_CREATED', orderId: 'x' }, { type: 'PAY_FAILED' }, { type: 'BACK_TO_CART', now: T },
    { type: 'BACK', now: T }, { type: 'RECS_LOADED', items: recs }, { type: 'RECS_FAILED' }, { type: 'GO_MENU', now: T },
  ];
  it.each(ignored.map(a => [a.type, a] as const))('대기 화면에서 %s', (_, a) => {
    expect(kioskReducer(idle, a)).toBe(idle);
  });
});
