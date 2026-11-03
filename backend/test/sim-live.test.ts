import { describe, expect, it } from 'vitest';
import type { LiveCall } from '../src/chatRecord.js';
import type { ChatResponse } from '../src/contracts.js';
import { fromData } from '../src/menuKnowledge.js';
import { groupLiveCalls, livePersona, replayCase, scoreLiveCase, summarizeLive } from '../src/sim/live.js';

// 실사용 기록(CHAT_RECORD_DIR) → 대화 단위 케이스 → 채점·재생 (scripts/live-cases.ts의 핵심 로직)
const knowledge = fromData([
  { id: 'dimsum-1', name: '모듬 딤섬', price: 19500, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 3, quantityUnit: '8개입', ingredients: ['새우'], texture: [] },
  { id: 'noodle-2', name: '유니짜장', price: 8000, category: 'noodle', kind: '면', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['돼지고기'], texture: [] },
]);
const G = { role: 'assistant' as const, text: '우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?' };
const u = (text: string) => ({ role: 'user' as const, text });
const a = (text: string) => ({ role: 'assistant' as const, text });
const resp = (reply: string, o: Partial<ChatResponse> = {}) => ({
  reply, conditions: { party: 2, spicy: null, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null },
  picks: [], pickReasons: [], asking: 'spicy' as const, done: false, heardSummary: null, partyAssumed: false, model: 'gemini-x', ...o,
});
const at = (sec: number) => new Date(Date.UTC(2026, 10, 3, 5, 0, sec)).toISOString();
const call = (sec: number, turns: LiveCall['turns'], response?: ReturnType<typeof resp>, error?: string): LiveCall =>
  ({ at: at(sec), mode: 'live', turns, conditions: {}, ms: 900, ...(response ? { response } : {}), ...(error ? { error } : {}) });

const R1 = '매운 음식도 잘 드시나요?';
const R2 = '알레르기나 채식·종교 때문에 못 드시는 재료 있으세요?';
const R3 = resp('말씀 듣고 유니짜장 골라 봤어요.', { done: true, asking: null, picks: ['noodle-2'] });
const RB1 = '매운 음식도 잘 드시나요?';
const calls: LiveCall[] = [
  call(0, []), // 첫인사만 (대화 아님)
  call(1, [G, u('두 명이요')], resp(R1)),
  call(2, [G, u('혼자요')], resp(RB1)),
  call(5, [G, u('두 명이요'), a(R1), u('안 맵게요')], resp(R2, { asking: 'exclude' })),
  call(7, [G, u('혼자요'), a(RB1), u('매운 거요')], undefined, 'CHAT_UNAVAILABLE'),
  call(8, [G, u('혼자요'), a(RB1), u('매운 거요')], resp(R2, { asking: 'exclude' })), // 실패 뒤 다시 시도
  call(9, [G, u('두 명이요'), a(R1), u('안 맵게요'), a(`${R2} (끊김)`), u('새우는 빼 주세요')], R3),
  call(3 * 3600, [G, u('두 명이요')], resp(R1)), // 3시간 뒤 다른 손님
];

describe('groupLiveCalls: 호출을 대화 단위로 묶는다', () => {
  it('뒤 호출의 turns가 앞 호출 turns + 그 답(끊김 표시 허용)으로 시작하면 같은 대화, 가장 긴 것만 남긴다', () => {
    const cases = groupLiveCalls(calls);
    expect(cases.map((c) => c.userSays)).toEqual([['두 명이요', '안 맵게요', '새우는 빼 주세요'], ['혼자요', '매운 거요'], ['두 명이요']]);
    const [first, second] = cases;
    expect(first).toMatchObject({ calls: 3, errors: 0, startedAt: at(1), endedAt: at(9), final: R3 });
    expect(first.turns.at(-1)).toEqual(a(R3.reply));
    expect(first.steps.map((s) => s.asking)).toEqual(['spicy', 'exclude', null]);
    expect(second).toMatchObject({ calls: 3, errors: 1, final: null });
    expect(second.steps).toHaveLength(2); // 실패한 호출은 단계에서 빼고, 다시 시도한 답만
  });
  it('첫인사만 있는 호출(turns 비어 있음)은 대화로 치지 않고, 30분 넘게 떨어지면 다른 대화', () => {
    expect(groupLiveCalls([call(0, [])])).toEqual([]);
    expect(groupLiveCalls(calls).at(-1)?.startedAt).toBe(at(3 * 3600));
  });
});

describe('실사용 케이스 채점·재생', () => {
  it('livePersona: 손님 말로 채점용 조건을 만든다 (인원·빼는 재료·안 맵게)', () => {
    expect(livePersona(['두 명이요', '안 맵게요', '새우는 빼 주세요'], null)).toEqual({ party: 2, exclude: ['새우'], spicy: '못 먹음' });
    expect(livePersona(['아무거나요'], 3)).toEqual({ party: 3, exclude: [], spicy: '상관없음' });
  });
  it('scoreLiveCase: 손님이 말한 조건을 어긴 추천을 잡는다 (새우 빼 달라는데 새우 든 딤섬)', () => {
    const [c] = groupLiveCalls(calls);
    const bad = { ...c, final: { ...R3, picks: ['dimsum-1'] } };
    expect(scoreLiveCase(bad, knowledge).issues).toContain('빼는 재료 위반: 모듬 딤섬');
    expect(scoreLiveCase(c, knowledge).issues).not.toContain('빼는 재료 위반: 모듬 딤섬');
  });
  it('summarizeLive: 케이스 수·추천까지 간 수·실패 호출 수·통과율', () => {
    const cases = groupLiveCalls(calls);
    const s = summarizeLive(cases.map((c) => ({ case: c, score: scoreLiveCase(c, knowledge) })));
    expect(s).toMatchObject({ cases: 3, finished: 1, errorCalls: 1, conversations: 3 });
    expect(s.topIssues.find((i) => i.issue === '추천까지 못 감')?.count).toBe(2);
  });
  it('replayCase: 손님 발화를 같은 순서로 새 직원(staff)에게 다시 넣고, 추천이 나오거나 발화가 끝나면 멈춘다', async () => {
    const [c] = groupLiveCalls(calls);
    const seen: number[] = [];
    let n = 0;
    const staff = async (turns: LiveCall['turns']) => { seen.push(turns.length); return { ...(++n === 2 ? R3 : resp(R1)), mood: null } as ChatResponse; };
    const rec = await replayCase(c, staff);
    expect(seen).toEqual([2, 4]);
    expect(rec.turns.map((t) => t.text)).toEqual([G.text, '두 명이요', R1, '안 맵게요', R3.reply]);
    expect(rec.final?.picks).toEqual(['noodle-2']);
    expect(rec.steps).toHaveLength(2);
  });
});
