import { describe, expect, it } from 'vitest';
import type { ChatResponse } from '../src/contracts.js';
import { fromData } from '../src/menuKnowledge.js';
import { makePersonas } from '../src/sim/personas.js';
import { quotaKind } from '../src/sim/quota.js';
import { runPersona, type CustomerTurn } from '../src/sim/run.js';
import { scoreConversation } from '../src/sim/score.js';
import { llmCustomer, scriptedCustomer } from '../src/sim/customer.js';
import { summarize } from '../src/sim/summary.js';

const knowledge = fromData([
  { id: 'noodle-1', name: '짬뽕', price: 11000, category: 'noodle', kind: '면', spicy: 2, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['해산물', '돼지고기'], texture: [] },
  { id: 'noodle-2', name: '유니짜장', price: 8000, category: 'noodle', kind: '면', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['돼지고기'], texture: [] },
  { id: 'rice-1', name: '게살볶음밥', price: 13000, category: 'rice', kind: '밥', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['게', '계란'], texture: [] },
]);

describe('makePersonas (다양한 손님 묶음)', () => {
  it('같은 seed면 같은 손님들, 연령대·성별·말투가 골고루 섞인다', () => {
    const a = makePersonas(60, 7);
    expect(makePersonas(60, 7)).toEqual(a);
    expect(new Set(a.map((p) => p.id)).size).toBe(60);
    expect(new Set(a.map((p) => p.age)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(a.map((p) => p.gender)).size).toBe(2);
    expect(new Set(a.map((p) => p.background)).size).toBeGreaterThanOrEqual(6);
  });
  it('설정이 서로 모순되지 않는다: 돼지고기를 안 먹는 배경이면 빼는 재료에 돼지고기, 아이와 오면 인원 2명 이상', () => {
    for (const p of makePersonas(200, 1)) {
      if (p.background.includes('돼지고기 안 먹음')) expect(p.exclude).toContain('돼지고기');
      if (p.withKids) expect(p.party).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('quotaKind (무료 한도 오류 구분)', () => {
  it('하루 한도면 day(이번 회차 중단), 분당 한도면 minute(잠시 쉬고 계속), 그 밖은 null', () => {
    expect(quotaKind(new Error('429 RESOURCE_EXHAUSTED quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier'))).toBe('day');
    expect(quotaKind(new Error('429 RESOURCE_EXHAUSTED quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier'))).toBe('minute');
    expect(quotaKind(new Error('429 Too Many Requests'))).toBe('minute');
    expect(quotaKind(new Error('API key not valid'))).toBeNull();
  });
});

const persona = makePersonas(1, 3)[0];
const staffReply = (over: Partial<ChatResponse>): ChatResponse => ({
  reply: '몇 분이서 드실 건가요?', conditions: { party: 1, spicy: null, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null },
  mood: null, picks: [], pickReasons: [], done: false, asking: 'party', heardSummary: null, partyAssumed: false, model: 'fake', ...over,
});

describe('runPersona (직원 AI ↔ 손님 AI 대화 한 번)', () => {
  it('첫인사 → 손님 → 직원 … 추천(done)까지 주고받고, 마지막에 손님이 추천을 평가한다', async () => {
    const said: string[] = [];
    const customer = async (_p: unknown, turns: { role: string; text: string }[], final: ChatResponse | null): Promise<CustomerTurn> => {
      if (final) return { say: '', accept: true, why: '좋아요' };
      said.push(turns.at(-1)!.text);
      return { say: turns.length === 1 ? '둘이요' : '안 맵게요' };
    };
    let calls = 0;
    const staff = async () => (++calls === 1
      ? staffReply({ reply: '매운 건 괜찮으세요?', asking: 'spicy', conditions: { ...staffReply({}).conditions, party: 2 } })
      : staffReply({ reply: '유니짜장 골라 봤어요.', done: true, asking: null, picks: ['noodle-2'], pickReasons: [{ id: 'noodle-2', why: '순해요', heard: '안 맵게', review: null }], conditions: { ...staffReply({}).conditions, party: 2, spicy: 0 } }));
    const rec = await runPersona({ persona, staff, customer, greeting: '어서 오세요! 몇 분이서 오셨어요?' });
    expect(said[0]).toBe('어서 오세요! 몇 분이서 오셨어요?');
    expect(rec.turns.map((t) => t.role)).toEqual(['assistant', 'user', 'assistant', 'user', 'assistant']);
    expect(rec.final?.picks).toEqual(['noodle-2']);
    expect(rec.verdict).toEqual({ accept: true, why: '좋아요' });
    expect(rec.steps).toHaveLength(2);
  });
  it('손님 발화 6번이 넘도록 추천이 안 나오면 멈춘다', async () => {
    const rec = await runPersona({ persona, staff: async () => staffReply({}), customer: async () => ({ say: '음' }), greeting: '안녕하세요' });
    expect(rec.turns.filter((t) => t.role === 'user')).toHaveLength(6);
    expect(rec.final).toBeNull();
  });
});

describe('scoreConversation (자동 채점)', () => {
  const p = { ...persona, party: 2, exclude: ['해산물'], spicy: '못 먹음' as const };
  const base = { persona: p, turns: [], steps: [], verdict: null, error: null };
  it('추천이 손님 조건을 어기면 문제로 적는다: 빼는 재료, 안 매운 걸 원하는데 매운 메뉴, 인원 틀림', () => {
    const final = staffReply({ done: true, picks: ['noodle-1'], conditions: { ...staffReply({}).conditions, party: 1 } });
    const s = scoreConversation({ ...base, final, steps: [{ reply: final.reply, asking: null, done: true, ms: 100 }] }, knowledge);
    expect(s.issues).toEqual(expect.arrayContaining(['빼는 재료 위반: 짬뽕', '안 맵게 원했는데 매운 메뉴: 짬뽕', '인원 틀림: 1명 (실제 2명)']));
    expect(s.ok).toBe(false);
  });
  it('조건을 지킨 추천이면 문제 없음, 턴 수·평균 응답 시간도 남긴다', () => {
    const final = staffReply({ reply: '유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'], conditions: { ...staffReply({}).conditions, party: 2, spicy: 0 } });
    const steps = [{ reply: '매운 건 괜찮으세요?', asking: 'spicy' as const, done: false, ms: 1200 }, { reply: '유니짜장 골라 봤어요.', asking: null, done: true, ms: 1800 }];
    const s = scoreConversation({ ...base, persona: { ...p, exclude: [] }, final, steps, turns: [{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }] }, knowledge);
    expect(s).toMatchObject({ ok: true, issues: [], userTurns: 2, avgMs: 1500 });
  });
  it('직원 말이 60자를 넘거나, 추천 없이 끝나면 문제로 적는다', () => {
    const long = '가'.repeat(61);
    const s = scoreConversation({ ...base, final: null, steps: [{ reply: long, asking: 'party', done: false, ms: 10 }] }, knowledge);
    expect(s.issues).toEqual(expect.arrayContaining(['직원 말 60자 초과 1회', '추천까지 못 감']));
  });
});

describe('llmCustomer (Gemini가 손님 연기)', () => {
  it('직원 말은 상대(user), 자기 말은 model로 넘기고, 손님 설정을 지시문에 넣는다', async () => {
    const seen: { system: readonly string[]; messages: { role: string; text: string }[] }[] = [];
    const llm = { model: 'f', async generateJson(system: readonly string[], messages: { role: 'user' | 'model'; text: string }[]) { seen.push({ system, messages }); return JSON.stringify({ say: '셋이요', accept: null, why: null }); } };
    const p = { ...persona, background: '일본인 관광객(한국어 초급)', party: 3 };
    const out = await llmCustomer(llm)(p, [{ role: 'assistant', text: '몇 분이세요?' }, { role: 'user', text: '셋' }, { role: 'assistant', text: '매운 건요?' }], null, 'spicy');
    expect(out.say).toBe('셋이요');
    expect(seen[0].messages.map((m) => m.role)).toEqual(['user', 'model', 'user']);
    expect(seen[0].system.join('\n')).toContain('일본인 관광객(한국어 초급)');
    expect(seen[0].system.join('\n')).toContain('3명');
  });
  it('손님 설정의 인원은 아이까지 합친 총인원으로 분명하게 적는다 ("일행 3명(아이 포함)"을 손님 AI가 "아이 포함 네 명"으로 말함)', async () => {
    const systems: string[] = [];
    const llm = { model: 'f', async generateJson(system: readonly string[]) { systems.push(system.join('\n')); return JSON.stringify({ say: '셋이요', accept: null, why: null }); } };
    await llmCustomer(llm)({ ...persona, party: 3, withKids: true }, [{ role: 'assistant', text: '몇 분이세요?' }], null, 'party');
    await llmCustomer(llm)({ ...persona, party: 2, withKids: false }, [{ role: 'assistant', text: '몇 분이세요?' }], null, 'party');
    expect(systems[0]).toContain('일행은 아이까지 모두 합쳐 3명');
    expect(systems[0]).not.toContain('(아이 포함)');
    expect(systems[1]).toContain('일행은 손님 본인까지 모두 합쳐 2명');
  });
  it('추천을 받으면 메뉴 이름을 보여 주고 주문할지 묻는다', async () => {
    let last = '';
    const llm = { model: 'f', async generateJson(_s: readonly string[], messages: { role: 'user' | 'model'; text: string }[]) { last = messages.at(-1)!.text; return JSON.stringify({ say: '', accept: false, why: '새우가 들어가요' }); } };
    const final = staffReply({ reply: '골랐어요.', done: true, picks: ['rice-1'] });
    const v = await llmCustomer(llm, knowledge)(persona, [{ role: 'assistant', text: '골랐어요.' }], final, null);
    expect(last).toContain('게살볶음밥');
    expect(v).toMatchObject({ accept: false, why: '새우가 들어가요' });
  });
});

describe('summarize (쌓인 대화 요약 → 고칠 규칙 찾기)', () => {
  it('통과율·주문 수락률·자주 나온 문제(메뉴 이름 빼고 묶음)·배경별 통과율', () => {
    const row = (background: string, issues: string[], accepted: boolean | null, userTurns = 3, avgMs = 1000) =>
      ({ persona: { ...persona, background }, score: { ok: issues.length === 0, issues, userTurns, avgMs, accepted } });
    const s = summarize([
      row('일본인 관광객(한국어 초급)', ['빼는 재료 위반: 짬뽕', '인원 틀림: 1명 (실제 2명)'], false),
      row('일본인 관광객(한국어 초급)', ['빼는 재료 위반: 하가우'], true),
      row('한국인(서울 표준어)', [], true, 2, 2000),
    ]);
    expect(s).toMatchObject({ conversations: 3, okRate: 0.33, acceptRate: 0.67, avgUserTurns: 2.67, avgMs: 1333 });
    expect(s.topIssues[0]).toEqual({ issue: '빼는 재료 위반', count: 2 });
    expect(s.byBackground['일본인 관광객(한국어 초급)']).toEqual({ conversations: 2, okRate: 0 });
  });
});

describe('scriptedCustomer (예시 답변 손님: 손님 쪽 토큰 0)', () => {
  it('질문 종류에 맞게, 배경 말투로 답한다', async () => {
    const c = scriptedCustomer(knowledge, 1);
    const p = { ...persona, background: '한국인(경상도 사투리)', party: 2, withKids: true, exclude: ['새우'], spicy: '못 먹음' as const, want: '면' };
    const turns = [{ role: 'assistant' as const, text: '몇 분이세요?' }];
    const party = await c(p, turns, null, 'party');
    expect(party.say).toContain('두');
    expect(party.say).toContain('아');
    expect((await c(p, turns, null, 'spicy')).say).toMatch(/못 먹/);
    expect((await c(p, turns, null, 'kind')).say).toContain('면');
    expect((await c(p, turns, null, 'exclude')).say).toContain('새우');
  });
  it('추천을 받으면 자기 조건(빼는 재료·매운맛)으로 주문할지 판단한다', async () => {
    const c = scriptedCustomer(knowledge, 1);
    const p = { ...persona, exclude: ['해산물'], spicy: '못 먹음' as const };
    expect(await c(p, [], staffReply({ done: true, picks: ['noodle-1'] }), null)).toMatchObject({ accept: false });
    expect(await c(p, [], staffReply({ done: true, picks: ['noodle-2'] }), null)).toMatchObject({ accept: true });
  });
});

describe('2026-11-03 첫 회차에서 고친 것', () => {
  it('응답 시간은 직원 AI가 실제로 걸린 시간(staff가 알려 준 ms)으로 잰다 (요청 사이 쉬는 시간 제외)', async () => {
    let t = 0;
    const rec = await runPersona({
      persona, greeting: '어서 오세요',
      customer: async () => ({ say: '둘이요' }),
      staff: async () => { t += 6000; return { ...staffReply({ reply: '골랐어요.', done: true, picks: ['noodle-2'] }), ms: 1500 }; },
      now: () => t,
    });
    expect(rec.steps[0].ms).toBe(1500);
  });
  it('예시 답변 사투리가 어색하게 겹치지 않는다', async () => {
    const c = scriptedCustomer(knowledge, 1);
    const p = { ...persona, background: '한국인(충청도 사투리, 느린 말투)', style: '결정을 잘 못함', spicy: '못 먹음' as const };
    const say = (await c(p, [{ role: 'assistant', text: '?' }], null, 'spicy')).say;
    expect(say).toBe('음… 매운 건 못 먹어유');
    const g = { ...persona, background: '한국인(경상도 사투리)', style: '무뚝뚝함', party: 2, withKids: false };
    expect((await c(g, [], null, 'party')).say).toBe('두 명이라예');
    expect((await c({ ...g, spicy: '못 먹음' as const }, [], null, 'spicy')).say).toBe('매운 건 못 먹어예');
  });
});
