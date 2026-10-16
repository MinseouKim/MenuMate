import { describe, expect, it, vi } from 'vitest';
import { groupOf } from './faceAssist';
import { WebSpeechSttProvider } from '../services/stt/webSpeechSttProvider';
import menuData from './menu/menus.json';
import type { Menu } from './types';
import { decodeOrder, encodeOrder, encodeOrderShort, receiptBase, receiptUrl } from './receiptLink';
import QRCode from 'qrcode';
import { explain } from './parse';
import { EXCLUDE_WORDS, KIND_WORDS, KioskAI } from './recommendation';
import { summarize, toCsv, type Session } from './usage';
import { mergeConditions } from './aiClient';

const menus: Menu[] = menuData;

describe('QR receipt link', () => {
  it('resolves the deployed receipt path to an absolute QR URL', () => {
    vi.stubEnv('VITE_RECEIPT_BASE_URL', '/receipt.html');
    try {
      expect(receiptBase()).toBe(`${window.location.origin}/receipt.html`);
      vi.stubEnv('VITE_RECEIPT_BASE_URL', 'https://example.com/receipt.html');
      expect(receiptBase()).toBe('https://example.com/receipt.html');
    } finally { vi.unstubAllEnvs(); }
  });
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
  it('short v2 code keeps the receipt and makes a much smaller QR', () => {
    const order = { number: '007', paidAt: new Date('2026-10-09T12:34:00'), total: 44400, items: [{ id: 'dimsum-5', name: '하가우', quantity: 3, price: 9800 }, { id: 'vegetable-6', name: '청경채 야채볶음', quantity: 1, price: 15000, option: '마늘소스' }], payment: { method: '네이버페이', amount: 44400, dine: '포장' as const } };
    const code = encodeOrderShort(order, menus);
    expect(code).toMatch(/^2~[\w.~-]+$/);
    const back = decodeOrder(code, menus)!;
    expect(back).toMatchObject({ number: '007', total: 44400, payment: { method: '네이버페이', amount: 44400, dine: '포장' } });
    expect(back.items).toMatchObject([{ id: 'dimsum-5', name: '하가우', quantity: 3, price: 9800 }, { id: 'vegetable-6', name: '청경채 야채볶음', option: '마늘소스' }]);
    expect(back.paidAt.getMinutes()).toBe(34);
    // 메뉴 5개 주문도 QR 버전 7(45×45칸) 이하로 들어가야 합니다. 예전 방식은 71×71칸이었습니다.
    const five = { ...order, items: menus.slice(0, 5).map(m => ({ id: m.id, name: m.name, quantity: 1, price: m.price })) };
    expect(QRCode.create(receiptUrl(five, menus), { errorCorrectionLevel: 'M' }).version).toBeLessThanOrEqual(7);
    expect(decodeOrder('2~001~zz~0s~b5.x', menus)).toBeNull();
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

describe('카메라 화면 맞춤 나이대', () => {
  it('최근 추정값 3개 이상의 가운데 값으로 나눕니다', () => {
    expect(groupOf([70, 65])).toBeNull();
    expect(groupOf([64, 30, 71])).toBe('senior');
    expect(groupOf([8, 10, 40])).toBe('child');
    expect(groupOf([25, 70, 33])).toBe('adult');
  });
});

describe('누르면 시작·다시 누르면 끝 음성 인식', () => {
  it('끝날 때 들은 문장을 한 번에 넘기고, 잠깐 조용했던 것은 오류로 보지 않습니다', () => {
    let rec!: { onresult: (e: unknown) => void; onerror: (e: unknown) => void; onend: () => void; continuous: boolean };
    vi.stubGlobal('SpeechRecognition', class { lang = ''; continuous = false; interimResults = false; onresult = null; onerror = null; onend = null; constructor() { rec = this as never; } start() {} stop() { rec.onend(); } abort() {} });
    const got: string[] = [], interim: string[] = [], errors: string[] = [];
    const stt = new WebSpeechSttProvider();
    stt.start({ onResult: t => got.push(t), onInterim: t => interim.push(t), onError: e => errors.push(e), onEnd: () => {} });
    expect(rec.continuous).toBe(true);
    const r = (t: string, isFinal: boolean) => Object.assign([{ transcript: t }], { isFinal });
    rec.onresult({ results: [r('두 명이고 ', true), r('새우는', false)] });
    rec.onerror({ error: 'no-speech' });
    rec.onresult({ results: [r('두 명이고 ', true), r('새우는 빼고 딤섬', true)] });
    stt.stop();
    expect(interim).toEqual(['두 명이고 새우는', '두 명이고 새우는 빼고 딤섬']);
    expect(got).toEqual(['두 명이고 새우는 빼고 딤섬']);
    expect(errors).toEqual([]);
    vi.unstubAllGlobals();
  });
});
