import { describe, expect, it } from 'vitest';
import menuData from './menu/menus.json';
import type { Menu } from './types';
import { decodeOrder, encodeOrder } from './receiptLink';
import { explain } from './parse';
import { EXCLUDE_WORDS, KIND_WORDS, KioskAI } from './recommendation';
import { summarize, toCsv, type Session } from './usage';
import { mergeConditions } from './aiClient';

const menus: Menu[] = menuData;

describe('QR receipt link', () => {
  it('round-trips an order including Korean payment names', () => {
    const order = { number: '007', paidAt: new Date('2026-10-09T12:34:00'), total: 44400, items: [{ id: 'dimsum-5', name: '하가우', quantity: 3, price: 9800 }, { id: 'vegetable-6', name: '청경채 야채볶음', quantity: 1, price: 15000, option: '마늘소스' }], payment: { method: '네이버페이', amount: 44400, dine: '포장' as const } };
    const back = decodeOrder(encodeOrder(order), menus)!;
    expect(back).toMatchObject({ number: '007', total: 44400, payment: { method: '네이버페이', amount: 44400, dine: '포장' } });
    expect(back.items[0]).toMatchObject({ name: '하가우', quantity: 3, price: 9800 });
    expect(back.items[1]).toMatchObject({ name: '청경채 야채볶음', option: '마늘소스' });
    expect(back.paidAt.getMinutes()).toBe(34);
  });
  it('rejects a broken code', () => {
    expect(decodeOrder('not-a-receipt', menus)).toBeNull();
  });
});

describe('explain highlights', () => {
  it('marks each phrase with the condition it set', () => {
    const text = '두 명이고 새우는 빼고 딤섬 먹고 싶어요. 1인당 15,000원';
    const marks = explain(text, KIND_WORDS, EXCLUDE_WORDS).map(m => [text.slice(m.start, m.end), m.label]);
    expect(marks).toEqual([['두 명', '인원 2명'], ['새우는 빼고', '새우 제외'], ['딤섬', '종류 딤섬'], ['1인당 15,000원', '1인당 15,000원']]);
  });
});

describe('spicy wording', () => {
  it('does not claim unchecked menus are not spicy', () => {
    const r = KioskAI.recommend({ ...KioskAI.extract(''), spicy: 0 }, menus)[0];
    expect(r.reasons).toContain('맵다는 표시가 없는 메뉴예요');
    expect(r.reasons).not.toContain('안 매운 메뉴예요');
  });
});

describe('server AI merge', () => {
  it('uses LLM numbers but keeps every exclusion', () => {
    const local = KioskAI.extract('새우 빼고 먹고 싶어요');
    const merged = mergeConditions(local, { party_size: 3, spicy_level: 1, budget_per_person: 20000, excluded_ingredients: ['돼지고기'], food_keywords: ['딤섬'] });
    expect(merged).toMatchObject({ party: 3, spicy: 1, budget: 20000, kind: '딤섬' });
    expect(merged.exclude.sort()).toEqual(['돼지고기', '새우']);
  });
});

describe('usage stats', () => {
  it('summarizes sessions and exports CSV', () => {
    const base: Session = { start: 0, end: 60_000, path: 'recommend', outcome: 'ordered', total: 30000, items: 2, voiceTries: 2, voiceOk: 1, large: true, voiceGuide: false, ai: 'llm' };
    const s = summarize([base, { ...base, outcome: 'abandoned', path: 'menu', large: false, ai: 'none', voiceTries: 0, voiceOk: 0 }]);
    expect(s).toMatchObject({ sessions: 2, ordered: 1, orderRate: 50, avgSec: 60, recommendRate: 50, voiceRate: 50, largeRate: 50, llmRate: 100 });
    expect(toCsv([base]).split('\n')).toHaveLength(2);
    expect(summarize([base, { ...base, demo: true }])).toMatchObject({ sessions: 1, demos: 1 });
  });
});
