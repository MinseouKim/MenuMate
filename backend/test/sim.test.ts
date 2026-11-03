import { describe, expect, it } from 'vitest';
import type { ChatResponse } from '../src/contracts.js';
import { fromData } from '../src/menuKnowledge.js';
import { makePersonas } from '../src/sim/personas.js';
import { offlineReason, quotaKind } from '../src/sim/quota.js';
import { runPersona, type CustomerTurn } from '../src/sim/run.js';
import { scoreConversation } from '../src/sim/score.js';
import { llmCustomer, scriptedCustomer } from '../src/sim/customer.js';
import { rowsFromRecords, summarize, summarizeByMode, type SimMode } from '../src/sim/summary.js';

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
  const ASKED_EXCLUDE = { role: 'assistant' as const, text: '못 드시는 재료 있으세요?' };
  it('추천이 손님 조건을 어기면 문제로 적는다: 빼는 재료, 안 매운 걸 원하는데 매운 메뉴, 인원 틀림', () => {
    const final = staffReply({ done: true, picks: ['noodle-1'], conditions: { ...staffReply({}).conditions, party: 1 } });
    const s = scoreConversation({ ...base, final, steps: [{ reply: final.reply, asking: null, done: true, ms: 100 }] }, knowledge);
    expect(s.issues).toEqual(expect.arrayContaining(['빼는 재료 위반: 짬뽕', '안 맵게 원했는데 매운 메뉴: 짬뽕', '인원 틀림: 1명 (실제 2명)']));
    expect(s.ok).toBe(false);
  });
  it('1인분 메뉴를 나눠 먹기로 소개하면 문제로 적는다 (why·추천 답)', () => {
    const final = staffReply({
      reply: '둘이 나눠 먹기 좋은 유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'],
      pickReasons: [{ id: 'noodle-2', why: '둘이 나눠 먹기 좋은 순한 짜장이에요', heard: null, review: null }],
      conditions: { ...staffReply({}).conditions, party: 2, spicy: 0, kind: '면' },
    });
    const turns = [{ role: 'user' as const, text: '두 명이요' }, ASKED_EXCLUDE, { role: 'user' as const, text: '없어요' }];
    const s = scoreConversation({ ...base, persona: { ...p, exclude: [] }, final, turns, steps: [{ reply: final.reply, asking: null, done: true, ms: 1 }] }, knowledge);
    expect(s.issues).toEqual(['1인분 메뉴를 나눠 먹기로 소개: 유니짜장']);
  });
  it('조건을 지킨 추천이면 문제 없음, 턴 수·평균 응답 시간도 남긴다', () => {
    // 재료를 묻고(ASKED_EXCLUDE) 종류(면)를 안 뒤의 추천 — 새 채점 규칙(재료·종류 확인 없이 추천)에 걸리지 않게
    const final = staffReply({ reply: '유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'], conditions: { ...staffReply({}).conditions, party: 2, spicy: 0, kind: '면' } });
    const steps = [{ reply: '매운 건 괜찮으세요?', asking: 'spicy' as const, done: false, ms: 1200 }, { reply: '유니짜장 골라 봤어요.', asking: null, done: true, ms: 1800 }];
    const s = scoreConversation({ ...base, persona: { ...p, exclude: [] }, final, steps, turns: [{ role: 'user', text: 'a' }, ASKED_EXCLUDE, { role: 'user', text: 'b' }] }, knowledge);
    expect(s).toMatchObject({ ok: true, issues: [], userTurns: 2, avgMs: 1500 });
  });
  it('손님 역할 AI가 설정과 다른 인원을 말하면 "손님 역할 오류"로 따로 적고 직원 통과(ok)에는 넣지 않는다 (34건 중 "인원 틀림" 9건이 모두 이 경우)', () => {
    const final = staffReply({ reply: '유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'], conditions: { ...staffReply({}).conditions, party: 2, spicy: 0, kind: '면' } });
    const turns = [{ role: 'assistant' as const, text: '몇 분이세요?' }, { role: 'user' as const, text: '두 명이요' }, ASKED_EXCLUDE, { role: 'user' as const, text: '없어요' }];
    const s = scoreConversation({ ...base, persona: { ...p, party: 1, exclude: [] }, final, turns, steps: [{ reply: final.reply, asking: null, done: true, ms: 100 }] }, knowledge);
    expect(s.actorIssues).toEqual(['손님 역할 오류: 인원을 2명으로 말함']);
    expect(s.issues).toEqual([]);
    expect(s.ok).toBe(true);
  });
  it('"N명 이상"이라고 말한 손님은 실제 인원이 N 이상이면 손님 역할 오류가 아니다', () => {
    const final = staffReply({ reply: '유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'], conditions: { ...staffReply({}).conditions, party: 4, spicy: 0, kind: '면' } });
    const turns = [{ role: 'user' as const, text: '네 명 이상이에요' }, ASKED_EXCLUDE, { role: 'user' as const, text: '없어요' }];
    const step = [{ reply: final.reply, asking: null, done: true, ms: 100 }];
    const ok = scoreConversation({ ...base, persona: { ...p, party: 5, exclude: [] }, final, turns, steps: step }, knowledge);
    expect(ok.actorIssues).toEqual([]);
    expect(ok.issues).toEqual([]);
    const bad = scoreConversation({ ...base, persona: { ...p, party: 3, exclude: [] }, final, turns, steps: step }, knowledge);
    expect(bad.actorIssues).toEqual(['손님 역할 오류: 인원을 4명 이상으로 말함']);
  });
  it('손님이 말한 인원과 직원이 적은 인원이 다를 때만 "인원 틀림" (손님 말 기준, 마지막으로 말한 인원)', () => {
    const final = staffReply({ reply: '유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'], conditions: { ...staffReply({}).conditions, party: 1, spicy: 0, kind: '면' } });
    const turns = [{ role: 'user' as const, text: '한 명, 아니 두 명이요' }, ASKED_EXCLUDE, { role: 'user' as const, text: '아 둘이요' }];
    const s = scoreConversation({ ...base, persona: { ...p, party: 2, exclude: [] }, final, turns, steps: [{ reply: final.reply, asking: null, done: true, ms: 100 }] }, knowledge);
    expect(s.actorIssues).toEqual([]);
    expect(s.issues).toEqual(['인원 틀림: 1명 (손님 말 2명)']);
    expect(s.ok).toBe(false);
  });
  it('재료를 묻지도 듣지도 않고 추천하면 "재료 확인 없이 추천", 종류를 모르는데(아무거나도 아님) 추천하면 "종류 확인 없이 추천" (PM 결정 1·2를 채점에도)', () => {
    const final = staffReply({ reply: '유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'], conditions: { ...staffReply({}).conditions, party: 2, spicy: 0 } });
    const steps = [{ reply: final.reply, asking: null, done: true, ms: 100 }];
    const bare = scoreConversation({ ...base, persona: { ...p, exclude: [] }, final, steps, turns: [{ role: 'user', text: '둘이요' }] }, knowledge);
    expect(bare.issues).toEqual(['재료 확인 없이 추천', '종류 확인 없이 추천']);
    const told = scoreConversation({ ...base, persona: { ...p, exclude: [] }, final, steps, turns: [{ role: 'user', text: '둘이요, 못 먹는 거 없고 아무거나요' }] }, knowledge);
    expect(told.issues).toEqual([]);
  });
  it('손님 발화 6번째 강제 추천은 재료·종류 확인 규칙의 예외', () => {
    const final = staffReply({ reply: '유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'], conditions: { ...staffReply({}).conditions, party: 2, spicy: 0 } });
    const turns = [{ role: 'user' as const, text: '둘이요' }, ...Array.from({ length: 5 }, () => ({ role: 'user' as const, text: '음' }))];
    const s = scoreConversation({ ...base, persona: { ...p, exclude: [] }, final, turns, steps: [{ reply: final.reply, asking: null, done: true, ms: 100 }] }, knowledge);
    expect(s.issues).toEqual([]);
  });
  it('질문(done=false)인데 asking이 없으면 "질문 종류 없음"으로 적는다 (화면 답 버튼이 추정으로 돌아감)', () => {
    const s = scoreConversation({ ...base, final: null, steps: [{ reply: '매운 건 괜찮으세요?', asking: null, done: false, ms: 10 }, { reply: '몇 분이세요?', asking: 'party', done: false, ms: 10 }] }, knowledge);
    expect(s.issues).toContain('질문 종류(asking) 없음 1회');
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
  it('손님 역할 오류는 직원 문제(topIssues)와 따로 센다 (예전 기록처럼 actorIssues가 없어도 됨)', () => {
    const row = (issues: string[], actorIssues?: string[]) => ({ persona, score: { ok: issues.length === 0, issues, userTurns: 2, avgMs: 1000, accepted: true, ...(actorIssues ? { actorIssues } : {}) } });
    const s = summarize([
      row([], ['손님 역할 오류: 인원을 2명으로 말함']),
      row([], ['손님 역할 오류: 인원을 4명으로 말함']),
      row(['직원 말 60자 초과 1회']),
    ] as any);
    expect(s.okRate).toBe(0.67);
    expect(s.topIssues).toEqual([{ issue: '직원 말 60자 초과', count: 1 }]);
    expect(s.actorIssues).toEqual([{ issue: '손님 역할 오류', count: 2 }]);
  });
});

describe('요약할 때 다시 채점 + mode별 요약 (오프라인 결과가 Gemini 통과율에 섞이지 않게)', () => {
  const final = staffReply({ reply: '유니짜장 골라 봤어요.', done: true, picks: ['noodle-2'], conditions: { ...staffReply({}).conditions, party: 2, spicy: 0, kind: '면' } });
  const oldRecord = {
    at: '2026-11-03T00:00:00Z', model: 'gemini-x', customer: 'gemini',
    persona: { ...persona, party: 1, exclude: [], spicy: '못 먹음' },
    turns: [{ role: 'assistant', text: '몇 분이세요?' }, { role: 'user', text: '두 명이요' }, { role: 'assistant', text: '못 드시는 재료 있으세요?' }, { role: 'user', text: '없어요' }, { role: 'assistant', text: final.reply }],
    steps: [{ reply: final.reply, asking: null, done: true, ms: 100 }], final, verdict: { accept: true, why: '좋아요' }, error: null,
    // 옛 채점기가 저장한 점수 (설정 1명 ↔ 직원 2명을 직원 탓으로 봄)
    score: { ok: false, issues: ['인원 틀림: 2명 (실제 1명)'], userTurns: 2, avgMs: 100, accepted: true },
  };

  it('rowsFromRecords: 저장된 대화를 지금 채점기로 다시 채점한다 (옛 "인원 틀림"이 손님 역할 오류로), 저장된 score 객체는 건드리지 않는다', () => {
    const saved = JSON.parse(JSON.stringify(oldRecord));
    const rows = rowsFromRecords([saved], knowledge);
    expect(rows).toHaveLength(1);
    expect(rows[0].mode).toBe('gemini'); // mode 없는 옛 기록은 Gemini 직원
    expect(rows[0].score).toMatchObject({ ok: true, issues: [], actorIssues: ['손님 역할 오류: 인원을 2명으로 말함'], accepted: true });
    expect(saved.score).toEqual(oldRecord.score);
  });
  it('rowsFromRecords: 오류로 끝난 기록(score·turns 없음)은 뺀다, mode·실수 종류를 옮긴다', () => {
    const rows = rowsFromRecords([
      { at: 'x', persona, error: 'boom' },
      { ...oldRecord, mode: 'offline-fuzz', fuzz: 'ghost-id' },
    ], knowledge);
    expect(rows.map((r) => [r.mode, r.fuzz])).toEqual([['offline-fuzz', 'ghost-id']]);
  });
  it('summarizeByMode: mode별로 따로 요약하고, 오프라인은 실수 종류별 통과율도', () => {
    const row = (mode: SimMode, ok: boolean, fuzz?: string) => ({ persona, mode, fuzz, score: { ok, issues: ok ? [] : ['추천 메뉴 없음'], userTurns: 2, avgMs: 10, accepted: null } });
    const s = summarizeByMode([row('gemini', true), row('gemini', true), row('offline-fuzz', false, 'ghost-id'), row('offline-fuzz', true, 'long-done')]);
    expect(Object.keys(s)).toEqual(['gemini', 'offline-fuzz']);
    expect(s.gemini).toMatchObject({ conversations: 2, okRate: 1 });
    expect(s['offline-fuzz']).toMatchObject({ conversations: 2, okRate: 0.5 });
    expect(s['offline-fuzz']?.byMistake).toEqual({ 'ghost-id': { conversations: 1, okRate: 0, topIssues: [{ issue: '추천 메뉴 없음', count: 1 }] }, 'long-done': { conversations: 1, okRate: 1, topIssues: [] } });
  });
});

describe('offlineReason (Gemini를 못 쓰면 오프라인 서버 검사 시험으로 전환)', () => {
  it('키 없음·하루 한도·키 오류면 이유를, 분당 한도·그 밖의 오류면 null', () => {
    expect(offlineReason(false, '')).toBe('no-key');
    expect(offlineReason(true, '429 RESOURCE_EXHAUSTED quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier')).toBe('day-quota');
    expect(offlineReason(true, 'API key not valid. Please pass a valid API key.')).toBe('key-error');
    expect(offlineReason(true, 'PERMISSION_DENIED')).toBe('key-error');
    expect(offlineReason(true, '429 Too Many Requests')).toBeNull();
    expect(offlineReason(true, 'json 파싱 실패')).toBeNull();
    expect(offlineReason(true, '')).toBeNull();
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
