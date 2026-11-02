import { describe, expect, it } from 'vitest';
import { converse, GREETING, type LlmClient, type LlmMessage } from '../src/chat.js';
import { fromData } from '../src/menuKnowledge.js';
import { makePersonas } from '../src/sim/personas.js';
import { addCustomerTurn, applyStaff, finishRecord, isSessionId, relayLlm, staffPrompt, startSession } from '../src/sim/session.js';

const knowledge = fromData([
  { id: 'noodle-1', name: '짬뽕', price: 11000, category: 'noodle', kind: '면', spicy: 2, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['해산물', '돼지고기'], texture: [] },
  { id: 'noodle-2', name: '유니짜장', price: 8000, category: 'noodle', kind: '면', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['돼지고기'], texture: [] },
]);
const personas = makePersonas(5, 2026).map((p) => ({ ...p, party: 2, exclude: [], spicy: '상관없음' as const }));
const raw = (o: object) => JSON.stringify({ reply: '', conditions: {}, mood: null, picks: [], done: false, asking: 'other', ...o });

describe('Claude 자체 대화 시험 세션 (scripts/sim-step.ts의 핵심 로직)', () => {
  it('startSession: 손님 번호(1부터)로 설정을 고르고, 첫인사로 시작한다', () => {
    const s = startSession('c1', 3, personas, { context: { timeOfDay: 'lunch', crowd: 'low' }, now: '2026-11-03T00:00:00Z' });
    expect(s).toMatchObject({ id: 'c1', personaNo: 3, persona: personas[2], turns: [{ role: 'assistant', text: GREETING }], steps: [], final: null, createdAt: '2026-11-03T00:00:00Z' });
    expect(() => startSession('c1', 0, personas)).toThrow();
    expect(() => startSession('c1', 6, personas)).toThrow();
  });

  it('isSessionId: 파일 이름으로 안전한 id만 (경로 이동 막기)', () => {
    expect(isSessionId('2026-11-03-p3-ab12')).toBe(true);
    expect(isSessionId('../state')).toBe(false);
    expect(isSessionId('a/b')).toBe(false);
    expect(isSessionId('')).toBe(false);
  });

  it('staffPrompt: 직원 LLM이 실제로 받는 시스템 프롬프트·메시지와 똑같다', async () => {
    let s = startSession('c1', 1, personas, { context: { timeOfDay: 'lunch' } });
    s = addCustomerTurn(s, '두 명이에요');
    let seen: { system: readonly string[]; messages: LlmMessage[] } | null = null;
    const capture: LlmClient = { model: 'cap', async generateJson(system, messages) { seen = { system, messages }; return raw({ reply: '매운 건 괜찮으세요?', asking: 'spicy' }); } };
    await converse({ llm: capture, knowledge }, { turns: s.turns, conditions: s.conditions, context: s.context });
    expect(staffPrompt(s, knowledge)).toEqual(seen);
  });

  it('addCustomerTurn: 직원 말 다음에만, 추천이 끝나면 더 못 한다, 빈 말은 안 된다', async () => {
    const s = addCustomerTurn(startSession('c1', 1, personas), '두 명이에요');
    expect(s.turns.at(-1)).toEqual({ role: 'user', text: '두 명이에요' });
    expect(() => addCustomerTurn(s, '또')).toThrow();
    expect(() => addCustomerTurn(startSession('c1', 1, personas), '  ')).toThrow();
  });

  it('applyStaff: 직원 원시 JSON을 그대로 돌려주는 대리 LLM으로 converse를 돌려 서버 검사를 적용하고 세션에 쌓는다', async () => {
    let s = addCustomerTurn(startSession('c1', 1, personas), '두 명이에요');
    // 재료·종류를 모른 채 done + 없는 메뉴 id → 서버가 재료 질문으로 되돌림
    const r1 = await applyStaff(s, raw({ reply: '짬뽕 어떠세요?', conditions: { party: 2 }, picks: [{ id: 'ghost', why: 'x', heard: null }], done: true }), knowledge);
    expect(r1.response).toMatchObject({ done: false, asking: 'exclude', picks: [] });
    expect(r1.session.turns.at(-1)).toEqual({ role: 'assistant', text: r1.response.reply });
    expect(r1.session.steps).toHaveLength(1);
    expect(r1.session.conditions).toEqual(r1.response.conditions);
    s = addCustomerTurn(r1.session, '없어요, 아무거나 추천해 주세요');
    const r2 = await applyStaff(s, raw({ reply: '유니짜장 골라 봤어요.', conditions: { party: 2 }, picks: [{ id: 'noodle-2', why: '순해요', heard: null }], done: true }), knowledge);
    expect(r2.response).toMatchObject({ done: true, picks: ['noodle-2'] });
    expect(r2.session.final).toEqual(r2.response);
    expect(() => addCustomerTurn(r2.session, '더')).toThrow();
  });

  it('applyStaff: 손님 차례가 아니거나 JSON이 깨졌으면 오류, 세션은 그대로', async () => {
    const s0 = startSession('c1', 1, personas);
    await expect(applyStaff(s0, raw({ reply: '네' }), knowledge)).rejects.toThrow();
    const s = addCustomerTurn(s0, '두 명이에요');
    await expect(applyStaff(s, '{not json', knowledge)).rejects.toThrow();
    expect(s.steps).toEqual([]);
    expect(s.turns).toHaveLength(2);
  });

  it('relayLlm: 받은 원시 문자열을 그대로 돌려준다 (모델 이름 claude)', async () => {
    const llm = relayLlm('{"a":1}');
    expect(llm.model).toBe('claude');
    expect(await llm.generateJson([], [], {}, new AbortController().signal)).toBe('{"a":1}');
  });

  it('finishRecord: 채점해 mode=claude 기록을 만든다 (추천을 받았을 때만 손님 평가)', async () => {
    let s = addCustomerTurn(startSession('c1', 1, personas), '두 명이에요, 못 먹는 거 없고 아무거나요');
    s = (await applyStaff(s, raw({ reply: '유니짜장 골라 봤어요.', conditions: { party: 2 }, picks: [{ id: 'noodle-2', why: '순해요', heard: null }], done: true }), knowledge)).session;
    const rec = finishRecord(s, true, '좋아요', knowledge, '2026-11-03T01:00:00Z');
    expect(rec).toMatchObject({ at: '2026-11-03T01:00:00Z', mode: 'claude', model: 'claude', customer: 'claude', persona: personas[0], verdict: { accept: true, why: '좋아요' }, error: null });
    expect(rec.score).toMatchObject({ ok: true, accepted: true });
    const unfinished = finishRecord(addCustomerTurn(startSession('c2', 1, personas), '두 명'), false, '추천 못 받음', knowledge);
    expect(unfinished.verdict).toBeNull();
    expect(unfinished.score.issues).toContain('추천까지 못 감');
  });
});
