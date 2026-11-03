import { describe, expect, it } from 'vitest';
import { converse } from '../src/chat.js';
import { fromData } from '../src/menuKnowledge.js';
import { scriptedCustomer } from '../src/sim/customer.js';
import { FUZZ_MISTAKES, fuzzLlm, mistakeFor, runOffline, type FuzzMistake } from '../src/sim/fuzz.js';
import { makePersonas, type Persona } from '../src/sim/personas.js';
import { runPersona } from '../src/sim/run.js';
import { scoreConversation } from '../src/sim/score.js';

const knowledge = fromData([
  { id: 'noodle-1', name: '짬뽕', price: 11000, category: 'noodle', kind: '면', spicy: 2, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['해산물', '돼지고기'], texture: [] },
  { id: 'noodle-2', name: '유니짜장', price: 8000, category: 'noodle', kind: '면', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['돼지고기'], texture: [] },
  { id: 'noodle-3', name: '계란 탕면', price: 9000, category: 'noodle', kind: '면', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['계란'], texture: [] },
  { id: 'rice-1', name: '게살볶음밥', price: 13000, category: 'rice', kind: '밥', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['게', '계란'], texture: [] },
  { id: 'dimsum-1', name: '모듬 딤섬', price: 19500, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 3, quantityUnit: '8개입', ingredients: ['새우'], texture: [] },
]);
const base = makePersonas(1, 3)[0];
/** 계란을 빼야 하고 매운 걸 못 먹는 2명, 면을 원함. 서울 말투(예시 답변이 바뀌지 않게) */
const persona: Persona = { ...base, background: '한국인(서울 표준어)', style: '아주 공손함', party: 2, withKids: false, spicy: '못 먹음', exclude: ['계란'], want: '면', budget: null };

describe('fuzz: 일부러 실수하는 가짜 직원 LLM (오프라인 서버 검사 시험)', () => {
  it('mistakeFor: 손님 번호마다 실수 종류를 고르게 돌린다', () => {
    const n = FUZZ_MISTAKES.length;
    const counts = new Map<string, number>();
    for (let i = 0; i < n * 3; i++) counts.set(mistakeFor(i), (counts.get(mistakeFor(i)) ?? 0) + 1);
    expect([...counts.values()]).toEqual(Array(n).fill(3));
    expect(FUZZ_MISTAKES).toEqual(expect.arrayContaining(['early-done', 'question-done', 'long-done', 'wrong-party', 'excluded-pick', 'spicy-pick', 'ghost-id', 'missing-exclude', 'missing-asking']));
  });

  it('실수 없는 기준 가짜 직원은 인원 → 매운맛 → 재료 → 종류 순으로 묻고 조건에 맞게 추천한다 (실수만 서버 검사 대상이 되게)', async () => {
    const rec = await runPersona({
      persona, greeting: '어서 오세요! 몇 분이서 오셨어요?', customer: scriptedCustomer(knowledge, 1),
      staff: (turns, conditions) => converse({ llm: fuzzLlm(knowledge, null), knowledge }, { turns, conditions, context: {} }),
    });
    expect(rec.steps.map((s) => s.asking)).toEqual(['spicy', 'exclude', 'kind', null]);
    expect(rec.final?.picks).toEqual(['noodle-2']);
    expect(scoreConversation(rec, knowledge)).toMatchObject({ ok: true, issues: [] });
  });

  /** 인원·매운맛·재료·종류를 다 들은 뒤 fuzz LLM이 내는 원시 JSON */
  const lateRaw = async (m: FuzzMistake) => JSON.parse(await fuzzLlm(knowledge, m).generateJson(['s'], [
    { role: 'user', text: '두 명이에요' }, { role: 'model', text: '매운 음식도 잘 드시나요?' }, { role: 'user', text: '매운 건 못 먹어요' },
    { role: 'model', text: '못 드시는 재료 있으세요?' }, { role: 'user', text: '계란는 빼 주세요' },
    { role: 'model', text: '면, 밥, 딤섬 중에 어떤 종류가 좋으세요?' }, { role: 'user', text: '면 요리요' },
    { role: 'user', text: '[지금까지 파악한 조건: {}. 위 대화를 바탕으로 다음 답변을 JSON으로 주세요.]' },
  ], {}, new AbortController().signal));
  const earlyRaw = async (m: FuzzMistake) => JSON.parse(await fuzzLlm(knowledge, m).generateJson(['s'], [{ role: 'user', text: '두 명이에요' }], {}, new AbortController().signal));

  it('각 실수가 LLM 원시 답에 실제로 들어간다', async () => {
    const ids = (r: { picks: { id: string }[] }) => r.picks.map((p) => p.id);
    expect(await lateRaw('question-done')).toMatchObject({ done: true, reply: expect.stringMatching(/\?$/) });
    expect([...(await lateRaw('long-done')).reply].length).toBeGreaterThan(60);
    expect((await lateRaw('wrong-party')).conditions.party).not.toBe(2);
    expect(ids(await lateRaw('excluded-pick'))[0]).toBe('noodle-3'); // 계란
    expect(ids(await lateRaw('spicy-pick'))[0]).toBe('noodle-1'); // 매운 짬뽕
    expect(ids(await lateRaw('ghost-id'))[0]).toMatch(/^ghost/);
    const share = await lateRaw('share-single'); // 1인분 메뉴를 나눠 먹기로 소개
    expect(share.picks[0].why).toMatch(/나눠/);
    expect(share.reply).toMatch(/나눠/);
    const missing = await lateRaw('missing-exclude');
    expect(missing.conditions.exclude).toEqual([]);
    expect(ids(missing)).toContain('noodle-3');
    expect(await earlyRaw('early-done')).toMatchObject({ done: true });
    expect(await earlyRaw('missing-asking')).not.toHaveProperty('asking');
    expect(await earlyRaw('ghost-id')).toMatchObject({ done: false, asking: 'spicy' }); // 실수는 해당 단계에서만
  });

  it('runOffline: 진짜 converse(서버 검사)를 거친 뒤 채점하고, 기록에 mode·실수 종류를 남긴다', async () => {
    const rec = await runOffline({ persona, index: 6, knowledge, at: '2026-11-03T00:00:00Z' });
    expect(rec).toMatchObject({ at: '2026-11-03T00:00:00Z', mode: 'offline-fuzz', model: 'offline-fuzz', customer: 'script', fuzz: mistakeFor(6) });
    expect(rec.final).not.toBeNull();
    expect(rec.score).toBeDefined();
  });

  it('share-single: 손님 조건에 맞는 1인분 메뉴가 없으면 그냥 통과로 세지 않고 건너뜀을 남긴다 (서버 검사를 시험하지 못한 대화)', async () => {
    // 테스트 메뉴의 1인분은 모두 돼지고기나 계란이 들어감
    const noSingle: Persona = { ...persona, exclude: ['계란', '돼지고기'], want: '상관없음' };
    const rec = await runOffline({ persona: noSingle, index: FUZZ_MISTAKES.indexOf('share-single'), knowledge });
    expect(rec).toMatchObject({ fuzz: null, fuzzSkipped: expect.stringContaining('share-single') });
    expect(rec.final?.reply).not.toMatch(/나눠/);
    const shared = await runOffline({ persona, index: FUZZ_MISTAKES.indexOf('share-single'), knowledge });
    expect(shared).toMatchObject({ fuzz: 'share-single' });
    expect(shared).not.toHaveProperty('fuzzSkipped');
    expect(shared.final?.pickReasons[0].why).not.toMatch(/나눠/); // 서버 검사가 실제로 고침
  });

  it('서버 검사가 막아야 하는 실수는 채점에서 문제가 남지 않는다 (막지 못하면 서버 검사 구멍)', async () => {
    const caught: FuzzMistake[] = ['question-done', 'long-done', 'wrong-party', 'excluded-pick', 'spicy-pick', 'ghost-id', 'missing-exclude', 'missing-asking', 'share-single'];
    for (const m of caught) {
      const index = FUZZ_MISTAKES.indexOf(m);
      const rec = await runOffline({ persona, index, knowledge });
      expect([m, rec.fuzz, rec.score.issues]).toEqual([m, m, []]); // 실수를 실제로 넣었는데(건너뜀 아님) 문제가 남지 않음
    }
    // 너무 이른 done: 서버가 매운맛 → 재료 → 종류 순으로 되돌린다 (매운맛 확인도 서버 보장, 2026-11-03 오프라인 시험 뒤)
    const rec = await runOffline({ persona, index: FUZZ_MISTAKES.indexOf('early-done'), knowledge });
    expect(rec.score.issues).toEqual([]);
    expect(rec.steps.slice(0, 3).map((s) => s.asking)).toEqual(['spicy', 'exclude', 'kind']);
  });
});
