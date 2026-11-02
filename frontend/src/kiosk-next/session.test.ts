import { describe, expect, it } from 'vitest';
import * as Cart from './cart';
import { createInitialState, reducer, type Action, type SessionState } from './session';
import type { Conditions, Order, Screen } from './types';

const blank: Conditions = { party: 1, spicy: null, kind: '상관없음', texture: '', exclude: [], budget: null, raw: '' };
const run = (actions: Action[], from: SessionState = createInitialState(blank)) => actions.reduce(reducer, from);
const go = (to: Screen): Action => ({ type: 'go', to });
const order = { number: '001', items: [], total: 0, paidAt: new Date(0) } as Order;

describe('session 흐름', () => {
  it('이전 화면은 지나온 순서대로 돌아간다', () => {
    const s = run([go('menu'), go('payment')]);
    expect(s.history).toEqual(['welcome', 'menu']);
    expect(run([{ type: 'back' }], s).screen).toBe('menu');
    expect(run([{ type: 'back' }, { type: 'back' }, { type: 'back' }], s).screen).toBe('welcome');
  });

  it('이미 지나온 화면으로 가면 그 지점까지 기록을 되돌린다', () => {
    const s = run([go('notice'), go('input'), go('review'), go('input')]);
    expect(s.screen).toBe('input');
    expect(s.history).toEqual(['welcome', 'notice']);
  });

  it('처음으로 돌아가면 담은 메뉴·조건·팝업이 모두 지워진다', () => {
    const s = run([
      go('menu'),
      { type: 'cart', change: c => Cart.add(c, [{ id: 'a', quantity: 2 }]) },
      { type: 'conditions/patch', patch: { party: 4 } },
      { type: 'dialog', dialog: { kind: 'home' } },
      { type: 'message', text: '담았어요' },
      { type: 'reset' },
    ]);
    expect(s).toMatchObject({ screen: 'welcome', cart: [], conditions: blank, dialog: null, message: '', history: [], mode: 'recommend' });
  });

  it('주문이 끝나면 완료 화면에 주문을 남기고 장바구니를 비우며 주문 수를 센다', () => {
    const s = run([
      go('payment'),
      { type: 'cart', change: c => Cart.add(c, [{ id: 'a', quantity: 1 }]) },
      { type: 'mode', mode: 'order' },
      { type: 'ordered', order },
    ]);
    expect(s).toMatchObject({ screen: 'done', cart: [], order, orderCount: 1, mode: 'order' });
  });

  it('다음 손님으로 넘어가도 오늘 주문 수는 이어진다', () => {
    const s = run([{ type: 'ordered', order }, { type: 'reset', to: 'welcome', fresh: true }]);
    expect(s.orderCount).toBe(1);
    expect(s.order).toBeNull();
  });

  it('fresh 로 처음 상태가 되면 큰 글씨·음성 안내도 꺼진다', () => {
    const on = run([{ type: 'pref', name: 'large', on: true, byUser: true }, { type: 'pref', name: 'voice', on: true, byUser: true }]);
    expect(run([{ type: 'reset' }], on).prefs.large).toBe(true);
    expect(run([{ type: 'reset', fresh: true }], on).prefs).toEqual({ large: false, voice: false, contrast: false, low: false });
  });
});

describe('session 카메라 화면 맞춤', () => {
  it('시작 화면에서는 55세 이상일 때만 맞추고 지나가는 사람은 계속 지켜본다', () => {
    const adult = run([{ type: 'face', group: 'adult' }]);
    expect(adult).toMatchObject({ faceDone: false, prefs: { large: false, voice: false } });
    const senior = run([{ type: 'face', group: 'senior' }]);
    expect(senior).toMatchObject({ faceDone: true, prefs: { large: true, voice: true } });
    expect(senior.faceNote).not.toBeNull();
  });

  it('주문을 시작한 뒤에는 55세 미만이어도 판정을 끝낸다(바꾸는 것은 없다)', () => {
    const s = run([go('menu'), { type: 'face', group: 'adult' }]);
    expect(s).toMatchObject({ faceDone: true, faceNote: null, prefs: { large: false, voice: false } });
  });

  it('손님이 직접 바꾼 설정은 카메라가 덮어쓰지 않는다', () => {
    const s = run([{ type: 'pref', name: 'large', on: false, byUser: true }, { type: 'face', group: 'senior' }]);
    expect(s).toMatchObject({ faceDone: true, faceNote: null, prefs: { large: false, voice: false } });
  });

  it('한 손님에게 한 번만 맞춘다', () => {
    const s = run([{ type: 'face', group: 'senior' }, { type: 'pref', name: 'large', on: false, byUser: false }, { type: 'face', group: 'senior' }]);
    expect(s.prefs.large).toBe(false);
  });

  it('원래대로 누르면 이전 설정으로 돌아가고 다시는 덮어쓰지 않는다', () => {
    const s = run([{ type: 'face', group: 'senior' }, { type: 'face/undo' }]);
    expect(s).toMatchObject({ prefs: { large: false, voice: false }, faceNote: null, manual: true });
  });

  it('고대비는 손님이 켜도 카메라 맞춤을 막지 않는다', () => {
    const s = run([{ type: 'pref', name: 'contrast', on: true, byUser: true }, { type: 'face', group: 'senior' }]);
    expect(s.prefs).toMatchObject({ contrast: true, large: true });
  });
});

describe('session 추천 조건', () => {
  const spoken: Conditions = { ...blank, party: 2, raw: '두 명이요' };

  it('AI 가 다시 읽은 결과는 그 사이 손님이 고치지 않았을 때만 반영한다', () => {
    const refined = { ...spoken, party: 3 };
    const s = run([{ type: 'conditions', conditions: spoken }, { type: 'conditions/refined', from: spoken, to: refined }]);
    expect(s).toMatchObject({ conditions: refined, aiUsed: true });
    const edited = run([{ type: 'conditions', conditions: spoken }, { type: 'conditions/patch', patch: { party: 5 } }, { type: 'conditions/refined', from: spoken, to: refined }]);
    expect(edited).toMatchObject({ conditions: { party: 5 }, aiUsed: false });
  });
});

describe('직원 AI 대화 (chat)', () => {
  const reply = { reply: '몇 분이세요?', conditions: { party: 1, spicy: null, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null }, mood: null, picks: [], done: false };
  it('손님 말은 turns와 raw에 쌓이고 답을 기다리는 상태가 된다', () => {
    const s = run([{ type: 'chat/user', text: ' 둘이요 ' }]);
    expect(s.chat).toMatchObject({ turns: [{ role: 'user', text: '둘이요' }], pending: true });
    expect(s.conditions.raw).toBe('둘이요');
    expect(run([{ type: 'chat/user', text: '매운 건 빼고' }], s).conditions.raw).toBe('둘이요 매운 건 빼고');
  });
  it('빈 말은 무시한다', () => {
    expect(run([{ type: 'chat/user', text: '   ' }]).chat.turns).toEqual([]);
  });
  it('AI 답은 조건을 덮어쓰고 picks·done을 남기며 aiUsed가 된다', () => {
    const s = run([
      { type: 'chat/user', text: '둘이서 매운 면' },
      { type: 'chat/assistant', reply: { ...reply, reply: '이런 메뉴 어떠세요?', conditions: { ...reply.conditions, party: 2, spicy: 2, kind: '면' }, picks: ['noodle-1'], done: true, mood: 'tired' } },
    ]);
    expect(s.chat).toMatchObject({ pending: false, done: true, picks: ['noodle-1'], mood: 'tired' });
    expect(s.chat.turns.map(t => t.role)).toEqual(['user', 'assistant']);
    expect(s.conditions).toMatchObject({ party: 2, spicy: 2, kind: '면', raw: '둘이서 매운 면' });
    expect(s.aiUsed).toBe(true);
  });
  it('서버가 알려 준 질문 종류(asking)를 기억하고, 옛 서버처럼 없으면 null', () => {
    expect(run([{ type: 'chat/user', text: '둘이요' }, { type: 'chat/assistant', reply: { ...reply, asking: 'spicy' } }]).chat.asking).toBe('spicy');
    expect(run([{ type: 'chat/user', text: '둘이요' }, { type: 'chat/assistant', reply }]).chat.asking).toBeNull();
  });
  it('서버가 없으면 failed가 되고 더는 기다리지 않는다', () => {
    const s = run([{ type: 'chat/user', text: '둘이요' }, { type: 'chat/failed' }]);
    expect(s.chat).toMatchObject({ pending: false, failed: true });
  });
  it('처음으로 돌아가면 대화는 지워지고 상황(날씨)은 남는다', () => {
    const ctx = { timeOfDay: 'evening' as const, hour: 19, weather: null, crowd: 'low' as const, recentOrders: 0 };
    const s = run([{ type: 'chat/context', context: ctx }, { type: 'chat/user', text: '둘이요' }, { type: 'chat/assistant', reply }, { type: 'reset' }]);
    expect(s.chat).toEqual({ turns: [], pending: false, failed: false, mood: null, picks: [], done: false, asking: null, context: ctx });
  });
  it('큰 글씨 제안은 손님 한 명당 한 번이고 처음으로 가면 풀린다', () => {
    const s = run([go('menu'), { type: 'comfort/asked' }]);
    expect(s.comfortAsked).toBe(true);
    expect(run([{ type: 'reset' }], s).comfortAsked).toBe(false);
  });
});
