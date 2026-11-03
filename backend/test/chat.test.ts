import { describe, expect, it } from 'vitest';
import {
  askedExclude, askedKind, askingOf, converse, describeContext, excludeFromSpeech, excludeMentioned, extractConditions, geminiClient, GREETING, MAX_TURNS, partyMention, partyMentioned, recommendLine, replySharesSingle, sharesSingle, systemPrompt, wantsAnything,
  type LlmClient,
} from '../src/chat.js';
import { fromData, loadMenuKnowledge } from '../src/menuKnowledge.js';

const knowledge = fromData(
  [
    { id: 'noodle-1', name: '짬뽕', price: 11000, category: 'noodle', kind: '면', spicy: 2, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['해산물', '돼지고기'], texture: [], keywords: ['짬뽕'] },
    // 재료 확인됨(빼야 할 재료 없음). 확인 안 된 빈 재료 목록이면 빼는 재료가 있을 때 추천에서 빠진다 (아래 '재료 미확인 메뉴' 테스트)
    { id: 'dimsum-1', name: '모듬 딤섬', price: 19500, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 3, quantityUnit: '8개입', ingredients: [], ingredientsChecked: true, texture: [], badge: '대표' },
    { id: 'soup-1', name: '산라탕', price: 15000, category: 'soup', kind: '스프/탕', spicy: 1, servingPeople: 2, quantityUnit: '1그릇', ingredients: ['계란', '두부'], texture: [], soldOut: true },
  ],
  new Map([['dimsum-1', { id: 'dimsum-1', keywords: ['부드러움', '육즙', '최고·강추'], reviews: [{ quote: '소룡포 육즙이 가득해요', summary: '육즙 가득' }] }]]),
);

function fakeLlm(answer: object | string, capture?: { system?: readonly string[]; messages?: unknown[] }): LlmClient {
  return {
    model: 'fake',
    async generateJson(system, messages) {
      if (capture) { capture.system = system; capture.messages = messages; }
      return typeof answer === 'string' ? answer : JSON.stringify(answer);
    },
  };
}

describe('menuKnowledge', () => {
  it('메뉴를 한 줄로 요약하고 품절은 뺀다', () => {
    const lines = knowledge.lines();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('dimsum-1 | 모듬 딤섬 | 딤섬 | 19,500원');
    expect(lines[1]).toContain('리뷰: 부드러움,육즙,최고·강추');
    expect(knowledge.kinds).toEqual(['면', '딤섬', '스프/탕']);
  });

  it('실제 우루루 데이터 80개를 읽는다', () => {
    const k = loadMenuKnowledge(new URL('../../frontend/src/prototype/menu', import.meta.url).pathname);
    expect(k?.menus.length).toBe(80);
    expect(k?.lines().length).toBeGreaterThan(70);
    expect(k?.menus.some((m) => m.reviewKeywords.length > 0)).toBe(true);
  });
});

describe('systemPrompt', () => {
  it('상황과 메뉴 목록을 넣는다', () => {
    const p = systemPrompt(knowledge, { timeOfDay: 'evening', weather: { tempC: 9, code: 61, label: '비', rainy: true, cold: false, hot: false }, crowd: 'high' }, 0).join('\n');
    expect(p).toContain('날씨: 비, 9도 (비·눈 오는 날)');
    expect(p).toContain('시간대: 저녁');
    expect(p).toContain('붐빔');
    expect(p).toContain('noodle-1 | 짬뽕');
    expect(p).not.toContain('soup-1');
  });
  it('앞부분(규칙·메뉴)은 상황·턴과 무관하게 같고, 바뀌는 상황·발화 수는 뒷부분에만 (프롬프트 캐시가 맞으려면)', () => {
    const [stableA, volatileA] = systemPrompt(knowledge, { timeOfDay: 'evening' }, 0);
    const [stableB, volatileB] = systemPrompt(knowledge, { timeOfDay: 'lunch', crowd: 'high' }, 3);
    expect(stableA).toBe(stableB);
    expect(stableA).toContain('noodle-1 | 짬뽕');
    expect(stableA).not.toContain('시간대');
    expect(volatileA).toContain('시간대: 저녁');
    expect(volatileB).toContain('손님 발화 수: 3');
  });
  it('상황이 없으면 그렇다고 적는다', () => {
    expect(describeContext({})).toBe('상황 정보 없음');
  });
});

describe('converse', () => {
  it('LLM이 없으면 CHAT_UNAVAILABLE', async () => {
    await expect(converse({ llm: null, knowledge }, { turns: [], conditions: {}, context: {} })).rejects.toMatchObject({ code: 'CHAT_UNAVAILABLE', status: 503 });
  });

  it('첫 인사: 대화가 비어 있으면 LLM 없이 가게 인사와 인원 질문 (날씨 잡담 없음)', async () => {
    const never: LlmClient = { model: 'f', async generateJson() { throw new Error('첫 인사에 LLM을 부르면 안 됨'); } };
    const res = await converse({ llm: never, knowledge }, { turns: [], conditions: {}, context: { timeOfDay: 'evening', weather: { tempC: 9, code: 61, label: '비', rainy: true, cold: true, hot: false } } });
    expect(res.reply).toContain('우루루 평촌본점');
    expect(res.reply).not.toContain('비');
    expect(res.asking).toBe('party');
    expect(res.done).toBe(false);
    expect(res.model).toBe('template');
  });

  it('done이면 picks는 메뉴 지식 안의 판매 중인 id만, 중복 없이 최대 3개', async () => {
    const res = await converse(
      { llm: fakeLlm({ reply: '네!', conditions: { party: 2, spicy: 2, kind: '면', texture: '상관없음', exclude: [], budget: null, totalBudget: null }, mood: 'tired', picks: ['noodle-1', 'ghost', 'dimsum-1', 'soup-1', 'noodle-1'], done: true }), knowledge },
      // 재료를 이미 물은 대화 (안 물었으면 서버가 재료 질문으로 되돌림)
      { turns: [{ role: 'assistant', text: '몇 분?' }, { role: 'user', text: '둘이요 매운 거' }, { role: 'assistant', text: '못 드시는 재료 있으세요?' }, { role: 'user', text: '없어요' }], conditions: { party: 2 }, context: {} },
    );
    expect(res.done).toBe(true);
    expect(res.picks).toEqual(['noodle-1', 'dimsum-1']); // soup-1은 품절
    expect(res.mood).toBe('tired');
    expect(res.conditions).toMatchObject({ party: 2, spicy: 2, kind: '면' });
  });

  it('asking: 질문 중이면 무엇을 묻는지 그대로, 모르는 값·추천 단계면 null', async () => {
    const ask = (asking: unknown, done = false) => converse(
      { llm: fakeLlm({ reply: '어떤 종류가 좋으세요?', conditions: {}, mood: null, picks: [], done, asking }), knowledge },
      // 매운맛·재료·종류를 손님이 이미 말해 추천이 막히지 않는 대화 (asking만 본다)
      { turns: [{ role: 'user', text: '둘이요, 매운 거 괜찮고 못 먹는 거 없고 아무거나 추천해 주세요' }], conditions: {}, context: {} },
    ).then((r) => r.asking);
    expect(await ask('kind')).toBe('kind');
    expect(await ask('exclude')).toBe('exclude');
    // 모르는 값·누락이면 reply 마지막 물음으로 추정 (2026-11-03 오프라인 시험: asking 누락이 서버 검사를 빠져나감)
    expect(await ask('budget')).toBe('kind');
    expect(await ask(undefined)).toBe('kind');
    expect(await ask('kind', true)).toBeNull();
  });

  it('Gemini에 보내는 응답 형식이 asking을 반드시 채우게 한다 (빠지면 Gemini가 보내지 않아 화면이 늘 추정으로 돌아감)', async () => {
    let sent: any;
    const llm: LlmClient = {
      model: 'fake',
      async generateJson(_system, _messages, schema) {
        sent = schema;
        return JSON.stringify({ reply: '몇 분이세요?', conditions: {}, mood: null, picks: [], done: false, asking: 'party' });
      },
    };
    await converse({ llm, knowledge }, { turns: [{ role: 'user', text: '둘이요' }], conditions: {}, context: {} });
    expect(sent.required).toContain('asking');
    expect(sent.properties.asking.enum).toEqual(['party', 'spicy', 'kind', 'exclude', 'other']);
  });

  // ── 2026-11-03 서버 보장 (설계: docs/superpowers/specs/2026-11-03-hands-free-voice-design.md 4-2)
  // 추천(done)이 통과하려면 매운맛·못 드시는 재료·종류를 이미 물은 대화여야 한다(시뮬레이션 뒤 규칙). 그래서 두 질문에 답한 뒤 userText를 말한 대화로 둔다.
  const recommend = (answer: object, userText: string, conditions: object = {}) => converse(
    { llm: fakeLlm({ conditions: {}, mood: null, asking: 'other', ...answer }), knowledge },
    {
      turns: [
        { role: 'assistant', text: '어서 오세요! 몇 분이서 오셨어요?' }, { role: 'user', text: userText },
        { role: 'assistant', text: '매운 음식도 잘 드시나요?' }, { role: 'user', text: '네 괜찮아요' },
        { role: 'assistant', text: '못 드시는 재료 있으세요?' }, { role: 'user', text: '없어요' },
        { role: 'assistant', text: '면, 밥, 딤섬 중에 어떤 종류가 좋으세요?' }, { role: 'user', text: '그냥 다 좋아요' },
      ],
      conditions, context: {},
    },
  );

  it('추천(done)인데 답이 질문으로 끝나면 질문 없는 문장으로 바꾼다', async () => {
    const res = await recommend({ reply: '모듬 딤섬 어떠세요? 다른 알레르기 재료는 없으신가요?', picks: [{ id: 'dimsum-1', why: '여럿이 나눠 먹기 좋아요', heard: null }], done: true, conditions: { party: 2 } }, '둘이요');
    expect(res.done).toBe(true);
    expect(res.reply).not.toContain('?');
    expect(res.reply).toContain('모듬 딤섬');
  });

  it('인원을 말한 적이 없으면 추천을 막고 인원을 묻는다 ("혼자 오셨군요" 단정 금지)', async () => {
    const res = await recommend({ reply: '혼자 오셨군요! 짬뽕 어떠세요', picks: [{ id: 'noodle-1', why: '얼큰해요', heard: null }], done: true }, '아무거나 추천해 주세요');
    expect(res.done).toBe(false);
    expect(res.picks).toEqual([]);
    expect(res.asking).toBe('party');
    expect(res.reply).not.toContain('혼자');
  });

  it('"혼자 왔어요"라고 했으면 1명으로 추천한다', async () => {
    const res = await recommend({ reply: '짬뽕 골라 봤어요.', picks: [{ id: 'noodle-1', why: '얼큰해요', heard: '혼자' }], done: true, conditions: { party: 1 } }, '혼자 왔어요');
    expect(res.done).toBe(true);
    expect(res.picks).toEqual(['noodle-1']);
    expect(res.partyAssumed).toBe(false);
  });

  it(`${MAX_TURNS}번째에 강제로 추천하면서 인원을 모르면 1명 가정을 알린다`, async () => {
    const turns = Array.from({ length: MAX_TURNS }, () => ({ role: 'user' as const, text: '음' }));
    const res = await converse({ llm: fakeLlm({ reply: '골라 봤어요.', conditions: {}, mood: null, picks: [], done: true, asking: 'other' }), knowledge }, { turns, conditions: {}, context: {} });
    expect(res.done).toBe(true);
    expect(res.partyAssumed).toBe(true);
  });

  it('조건을 어긴 pick은 뺀다: 품절, 빼 달라는 재료(해산물 묶음 포함), 안 매운 걸 원하는데 매운 메뉴', async () => {
    const picks = [{ id: 'noodle-1', why: 'a', heard: null }, { id: 'soup-1', why: 'b', heard: null }, { id: 'dimsum-1', why: 'c', heard: null }];
    expect((await recommend({ reply: '골랐어요.', picks, done: true, conditions: { party: 2, exclude: ['새우'] } }, '둘이요, 새우 빼 주세요')).picks).toEqual(['dimsum-1']);
    expect((await recommend({ reply: '골랐어요.', picks, done: true, conditions: { party: 2, spicy: 0 } }, '둘이요, 안 맵게')).picks).toEqual(['dimsum-1']);
  });

  it('추천 이유: heard는 손님이 실제로 한 말만, why는 40자·물음표 없이, review는 리뷰 데이터에서', async () => {
    const res = await recommend({
      reply: '골라 봤어요.', done: true, conditions: { party: 2 },
      picks: [
        { id: 'dimsum-1', why: '둘이 나눠 먹기 좋은 부드러운 딤섬이에요', heard: '둘이서 부드러운 거' },
        { id: 'noodle-1', why: '얼큰한 국물이 생각나실 때 좋아요? 아주 좋아요 정말 좋아요 정말로 좋아요 진짜', heard: '매운 짬뽕 주세요' },
      ],
    }, '둘이서 부드러운 거 먹고 싶어요');
    expect(res.pickReasons).toEqual([
      { id: 'dimsum-1', why: '둘이 나눠 먹기 좋은 부드러운 딤섬이에요', heard: '둘이서 부드러운 거', review: '육즙 가득' },
      { id: 'noodle-1', why: expect.not.stringContaining('?'), heard: null, review: null },
    ]);
    expect(res.pickReasons[1].why.length).toBeLessThanOrEqual(40);
  });

  it('pick이 모두 걸러지면 추천은 하되(done) 걸러진 메뉴 이름을 말하지 않는다', async () => {
    const res = await recommend({ reply: '산라탕 어떠세요.', picks: [{ id: 'soup-1', why: '따뜻해요', heard: null }], done: true, conditions: { party: 2 } }, '둘이요');
    expect(res.done).toBe(true);
    expect(res.picks).toEqual([]);
    expect(res.reply).not.toContain('산라탕');
  });

  it('heardSummary: 지금까지 들은 조건을 짧게 (인원을 모르면 인원은 빼고)', async () => {
    const full = await recommend({ reply: '면 좋죠. 빼실 재료 있으세요?', picks: [], done: false, asking: 'exclude', conditions: { party: 2, spicy: 0, kind: '면', exclude: ['새우'] } }, '둘이요 안 맵게 면으로, 새우 빼고');
    expect(full.heardSummary).toBe('2명 · 안 맵게 · 면 · 새우 빼고');
    const noParty = await recommend({ reply: '몇 분이세요?', picks: [], done: false, asking: 'party', conditions: { spicy: 2 } }, '매운 거요');
    expect(noParty.heardSummary).toBe('맵게');
  });

  it('조건 값을 정리한다 (범위 밖 kind·spicy·party)', async () => {
    const res = await converse(
      { llm: fakeLlm({ reply: 'x', conditions: { party: 50, spicy: 9, kind: '피자', texture: '', exclude: ['새우', '', '새우'], budget: -3, totalBudget: null }, mood: 'weird', picks: [], done: false }), knowledge },
      { turns: [{ role: 'user', text: '안녕' }], conditions: {}, context: {} },
    );
    expect(res.conditions).toEqual({ party: 8, spicy: 3, kind: '상관없음', texture: '상관없음', exclude: ['새우'], budget: null, totalBudget: null });
    expect(res.mood).toBeNull();
  });

  it(`손님 발화가 ${MAX_TURNS}번이면 강제로 done`, async () => {
    const turns = Array.from({ length: MAX_TURNS }, () => ({ role: 'user' as const, text: '음' }));
    const res = await converse(
      { llm: fakeLlm({ reply: '하나 더 여쭤볼게요', conditions: {}, mood: null, picks: ['noodle-1'], done: false }), knowledge },
      { turns, conditions: {}, context: {} },
    );
    expect(res.done).toBe(true);
    expect(res.picks).toEqual(['noodle-1']);
  });

  it('LLM 오류·비JSON은 CHAT_UNAVAILABLE이고 발화는 로그에 남기지 않는다', async () => {
    const warns: string[] = [];
    const log = { warn: (m: string) => warns.push(m) };
    const boom: LlmClient = { model: 'f', async generateJson() { throw new Error('quota'); } };
    await expect(converse({ llm: boom, knowledge, log }, { turns: [{ role: 'user', text: '비밀발화' }], conditions: {}, context: {} })).rejects.toMatchObject({ code: 'CHAT_UNAVAILABLE' });
    await expect(converse({ llm: fakeLlm('not json'), knowledge, log }, { turns: [{ role: 'user', text: '비밀발화' }], conditions: {}, context: {} })).rejects.toMatchObject({ code: 'CHAT_UNAVAILABLE' });
    expect(warns.join('\n')).not.toContain('비밀발화');
  });
});

// ── 2026-11-03 시뮬레이션(eval/sim) 뒤 PM 결정으로 고친 것
describe('추천 전에 꼭 물을 것: 못 드시는 재료, 종류 (시뮬레이션: 밥 원하는 손님에게 유린기, 채식 손님에게 유니짜장)', () => {
  type Turn = { role: 'user' | 'assistant'; text: string };
  /** 첫인사 다음부터 손님·직원 말을 번갈아 */
  const talk = (...lines: string[]): Turn[] => [GREETING, ...lines].map((text, i) => ({ role: i % 2 === 0 ? 'assistant' : 'user', text }));
  const doneAnswer = (cond: object = {}) => ({
    reply: '모듬 딤섬 골라 봤어요.', conditions: { party: 2, spicy: 0, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null, ...cond },
    mood: null, picks: [{ id: 'dimsum-1', why: '순해요', heard: null }], done: true, asking: 'other',
  });
  const chat = (turns: Turn[], cond: object = {}) => converse({ llm: fakeLlm(doneAnswer(cond)), knowledge }, { turns, conditions: {}, context: {} });

  it('프롬프트: 종류를 모르면(아무거나 제외) done 하지 않고, 추천 전에 못 드시는 재료를 한 번 묻는다 (옛 "인원과 매운맛 또는 종류" 조건 때문에 종류 없이 추천함)', () => {
    const [stable] = systemPrompt(knowledge, {}, 0);
    expect(stable).not.toContain('인원과 (매운맛 또는 종류) 두 가지를 알면');
    expect(stable).toContain('인원 → 매운맛 → 못 드시는 재료');
    expect(stable).toMatch(/못 드시는 재료[^\n]*asking=exclude/);
    expect(stable).toMatch(/종류[^\n]*아무거나[^\n]*done=true|done=true[^\n]*종류[^\n]*아무거나/);
  });

  it('재료를 물은 적도, 손님이 말한 적도 없는데 done이면 재료 질문(exclude)으로 되돌린다 (채식 손님에게 돼지고기 메뉴 추천)', async () => {
    const res = await chat(talk('둘이요', '매운 건 괜찮으세요?', '안 매운 거요'), { kind: '딤섬' });
    expect(res).toMatchObject({ done: false, asking: 'exclude', picks: [], pickReasons: [] });
    expect(res.reply).toContain('못 드시는 재료');
    expect(res.reply.endsWith('?')).toBe(true);
    expect(res.heardSummary).toBe('2명 · 안 맵게 · 딤섬');
  });

  it('재료 질문에 "없어요"류로 답했으면 다시 묻지 않고 추천한다 (답의 내용이 아니라 이미 물었는지로 판단)', async () => {
    for (const answer of ['없어요', '아니요', '괜찮아요', '딱히요', '네', 'No']) {
      const res = await chat(talk('둘이요', '알레르기나 채식 때문에 못 드시는 재료 있으세요?', answer), { kind: '딤섬' });
      expect([answer, res.done]).toEqual([answer, true]);
    }
  });

  it('손님이 먼저 재료를 말했으면 재료를 묻지 않는다 (조건에 들어갔거나, 말에 채식·알레르기·○○ 빼고가 있으면)', async () => {
    expect((await chat(talk('둘이요, 면으로요'), { kind: '면', exclude: ['새우'] })).done).toBe(true);
    expect((await chat(talk('둘이서 딤섬이요. 저 채식해요'), { kind: '딤섬' })).done).toBe(true);
    expect((await chat(talk('둘이요 딤섬으로, 못 먹는 거 없어요'), { kind: '딤섬' })).done).toBe(true);
  });

  it('직원이 재료를 묻다 끊겼으면(끊김) 물은 것으로 치지 않는다', async () => {
    const res = await chat(talk('둘이요', '못 드시는 재료 있으세요? (끊김)', '딤섬이요'), { kind: '딤섬' });
    expect(res).toMatchObject({ done: false, asking: 'exclude' });
  });

  it('종류를 모르고 손님이 "아무거나"류 말도 안 했는데 done이면 종류 질문(kind)으로 되돌린다 (밥 원하는 손님에게 유린기 추천)', async () => {
    const res = await chat(talk('세 명이요', '매운 건 괜찮으세요?', '아주 잘 먹어요', '못 드시는 재료 있으세요?', '없어요'));
    expect(res).toMatchObject({ done: false, asking: 'kind', picks: [] });
    expect(res.reply).toContain('종류');
    expect(res.reply.endsWith('?')).toBe(true);
  });

  it('종류를 알거나, "아무거나·추천해 줘"라고 했으면 종류를 묻지 않는다', async () => {
    const asked = ['둘이요', '못 드시는 재료 있으세요?'];
    expect((await chat(talk(...asked, '없어요'), { kind: '면' })).done).toBe(true); // 테스트 메뉴의 종류: 면·딤섬·스프/탕
    expect((await chat(talk(...asked, '없어요, 아무거나 괜찮아요'))).done).toBe(true);
    expect((await chat(talk('둘이요. 메뉴 좀 추천해 주시겠어요?', '못 드시는 재료 있으세요?', '없어요'))).done).toBe(true);
  });

  it('종류를 이미 물었으면 손님 답이 종류로 안 잡혀도 다시 묻지 않는다 (같은 질문 되풀이 방지)', async () => {
    const res = await chat(talk('둘이요', '못 드시는 재료 있으세요?', '없어요', '면, 밥, 딤섬 중에 어떤 종류가 좋으세요?', '국물 있는 거요'));
    expect(res.done).toBe(true);
  });

  it('둘 다 모르면 정한 순서대로 재료부터 묻는다 (인원 → 매운맛 → 재료 → 종류)', async () => {
    expect((await chat(talk('둘이요', '매운 건 괜찮으세요?', '안 매운 거요'))).asking).toBe('exclude');
  });

  it('손님이 한 번에 다 말하면 더 묻지 않고 바로 추천한다 (턴 수가 늘지 않게)', async () => {
    const res = await chat(talk('둘이요, 안 맵게 면으로 주시고 새우는 빼 주세요'), { kind: '면', exclude: ['새우'] });
    expect(res.done).toBe(true);
    expect(res.picks).toEqual(['dimsum-1']);
  });

  it(`${MAX_TURNS}번째 강제 추천은 재료·종류를 몰라도 그대로 추천한다`, async () => {
    const res = await chat(talk('둘이요', '?', '음', '?', '음', '?', '음', '?', '음', '?', '음', '?', '음'));
    expect(res.done).toBe(true);
  });
});

describe('손님 말·직원 말 판단 (재료·종류 질문 생략 여부)', () => {
  it('wantsAnything: 아무거나·추천해 줘·알아서·모르겠어요는 종류 상관없음, 맵기 이야기의 "상관없어요"는 아님', () => {
    const cases: [string, boolean][] = [
      ['아무거나요', true], ['아무 거나 괜찮아요', true], ['추천해 주세요', true], ['메뉴 좀 추천해 주시겠습니까?', true], ['알아서 해 주세요', true],
      ['잘 모르겠어요', true], ['뭐든 좋아요', true], ['다 상관없어요', true], ['Um... recommend please', true],
      ['맵기는 상관없어요', false], ['매운 건 잘 모르겠어요', false], ['둘이요', false], ['밥으로 할게요', false], ['재료는 상관없어요', false],
    ];
    for (const [text, want] of cases) expect([text, wantsAnything(text)]).toEqual([text, want]);
  });
  it('excludeMentioned: 손님이 못 먹는 재료를 스스로 말했는지 ("못 먹는 거 없어요"도 말한 것), 매운맛 이야기는 아님', () => {
    const cases: [string, boolean][] = [
      ['새우는 빼 주세요', true], ['돼지고기는 못 먹어요', true], ['저 채식해요', true], ['땅콩 알레르기 있어요', true], ['무슬림이라 할랄이요', true],
      ['못 먹는 거 없어요', true], ['가리는 거 없어요', true], ['빼는 거 없어요', true], ['고기 안 먹어요', true],
      ['매운 건 못 먹어요', false], ['매운 거 안 먹어요', false], ['둘이요', false], ['없어요', false], ['맵게 해 주세요', false],
    ];
    for (const [text, want] of cases) expect([text, excludeMentioned(text)]).toEqual([text, want]);
  });
  it('askedExclude·askedKind: 직원 말이 재료·종류를 물었는지 (매운맛 질문과 헷갈리지 않게)', () => {
    expect(askedExclude('알레르기나 채식 때문에 못 드시는 재료 있으세요?')).toBe(true);
    expect(askedExclude('빼 드릴 재료 있으세요?')).toBe(true);
    expect(askedExclude('혹시 못 드시는 거 있으세요?')).toBe(true);
    expect(askedExclude('매운 거 못 드시는 분 있으세요?')).toBe(false);
    expect(askedExclude('매운 음식도 잘 드시나요?')).toBe(false);
    expect(askedKind('면, 밥, 딤섬 중에 어떤 종류가 좋으세요?')).toBe(true);
    expect(askedKind('면이나 밥 중에 뭐가 좋으세요?')).toBe(true);
    expect(askedKind('어떤 메뉴를 드시고 싶으세요?')).toBe(true);
    expect(askedKind('매운 음식도 잘 드시나요?')).toBe(false);
    expect(askedKind('몇 분이서 드실 건가요?')).toBe(false);
  });
});

describe('손님이 말한 빼야 할 재료는 서버가 직접 읽어 조건에 합친다 (LLM이 exclude를 빠뜨리면 알레르기 재료가 추천에 남음)', () => {
  const sorted = (a: string[]) => [...a].sort();
  const MEAT_SEAFOOD = ['돼지고기', '소고기', '닭고기', '오리', '해산물'];

  it('excludeFromSpeech: 부정 표현이 바로 붙은 재료만 뺀다 (프론트 negatedTerms와 같은 규칙)', () => {
    const cases: [string, string[]][] = [
      ['새우 빼 주세요', ['새우']], ['새우는 빼고 소고기는 좋아요', ['새우']], ['계란 없이 해 주세요', ['계란']], ['굴은 싫어요', ['굴']],
      ['돼지고기 못 먹어요', ['돼지고기']], ['돼지고기 안 먹어요', ['돼지고기']], ['해산물 말고 다른 거요', ['해산물']],
      ['소고기 좋아요', []], ['새우 좋아해요', []], ['매운 건 못 먹어요', []], ['둘이요', []], ['없어요', []],
    ];
    for (const [text, want] of cases) expect([text, sorted(excludeFromSpeech(text))]).toEqual([text, sorted(want)]);
  });

  it('excludeFromSpeech: 생활 표현 — 채식·비건·고기 안 먹음은 고기·해산물 전부, 할랄·무슬림은 돼지고기, 견과류·땅콩 알레르기는 둘 다', () => {
    for (const text of ['채식주의자예요', '저 채식이에요', '비건이에요', '고기 안 먹어요', '고기는 못 먹어요']) expect([text, sorted(excludeFromSpeech(text))]).toEqual([text, sorted(MEAT_SEAFOOD)]);
    for (const text of ['할랄 음식만 먹어요', '무슬림이에요']) expect([text, excludeFromSpeech(text)]).toEqual([text, ['돼지고기']]);
    for (const text of ['견과류 알레르기 있어요', '땅콩 알레르기요']) expect([text, sorted(excludeFromSpeech(text))]).toEqual([text, sorted(['견과류', '땅콩'])]);
  });

  it('excludeFromSpeech: 재료 목록 뒤에 부정 표현이 오면 목록 전체를 뺀다 (랑·이랑·하고·와·과·쉼표)', () => {
    const cases: [string, string[]][] = [
      ['오리랑 생선 빼 주세요', ['오리', '생선']], ['새우이랑 전복은 못 먹어요', ['새우', '전복']], ['계란하고 땅콩은 알레르기 있어요', ['계란', '땅콩', '견과류']],
      ['새우와 굴 빼고요', ['새우', '굴']], ['소고기과 오리 말고요', ['소고기', '오리']], ['새우, 관자, 해삼 없이 해 주세요', ['새우', '관자', '해삼']],
      ['새우랑 소고기 좋아요, 오리는 빼 주세요', ['오리']], ['생선이랑 밥 주세요', []],
    ];
    for (const [text, want] of cases) expect([text, sorted(excludeFromSpeech(text))]).toEqual([text, sorted(want)]);
  });

  it('excludeFromSpeech: 줄임말도 같은 재료로 (닭→닭고기, 돼지→돼지고기, 소·쇠고기→소고기, 달걀→계란), 닭고기를 닭으로 한 번 더 세지 않는다', () => {
    const cases: [string, string[]][] = [
      ['닭은 빼 주세요', ['닭고기']], ['닭고기 빼 주세요', ['닭고기']], ['돼지는 안 먹어요', ['돼지고기']], ['쇠고기 못 먹어요', ['소고기']],
      ['달걀 알레르기 있어요', ['계란']], ['닭이랑 돼지 빼고요', ['닭고기', '돼지고기']], ['닭 요리 좋아요', []],
    ];
    for (const [text, want] of cases) expect([text, excludeFromSpeech(text)]).toEqual([text, want.length > 1 ? expect.arrayContaining(want) : want]);
    expect(excludeFromSpeech('닭이랑 돼지 빼고요')).toHaveLength(2);
  });

  const asked = (userText: string) => [
    { role: 'assistant' as const, text: GREETING }, { role: 'user' as const, text: userText },
    { role: 'assistant' as const, text: '면, 밥, 딤섬 중에 어떤 종류가 좋으세요?' }, { role: 'user' as const, text: '아무거나요' },
  ];
  const run = (userText: string, llmExclude: string[]) => converse(
    { llm: fakeLlm({ reply: '골라 봤어요.', conditions: { party: 2, spicy: 2, exclude: llmExclude }, mood: null, picks: [{ id: 'noodle-1', why: 'a', heard: null }, { id: 'dimsum-1', why: 'b', heard: null }], done: true, asking: 'other' }), knowledge },
    { turns: asked(userText), conditions: {}, context: {} },
  );

  it('LLM이 exclude를 비워 보내도 손님이 "새우 빼 주세요"라고 했으면 새우(해산물) 든 pick을 뺀다', async () => {
    const res = await run('둘이요, 새우는 빼 주세요', []);
    expect(res.conditions.exclude).toContain('새우');
    expect(res.picks).toEqual(['dimsum-1']);
    expect(res.heardSummary).toContain('새우 빼고');
  });

  it('LLM이 넣은 exclude는 지우지 않고 합친다', async () => {
    const res = await run('둘이요, 새우는 빼 주세요', ['계란']);
    expect(sorted(res.conditions.exclude)).toEqual(sorted(['계란', '새우']));
  });

  it('채식 손님이면 LLM이 놓쳐도 돼지고기 든 메뉴를 빼고 추천한다 (시뮬레이션: 채식 손님에게 유니짜장)', async () => {
    const res = await run('둘이요, 저 채식주의자예요', []);
    expect(res.picks).toEqual(['dimsum-1']);
  });

  it('좋다고 말한 재료는 빼지 않는다 ("새우 좋아해요")', async () => {
    const res = await run('둘이요, 새우 좋아해요, 못 먹는 거 없어요', []);
    expect(res.conditions.exclude).toEqual([]);
    expect(res.picks).toEqual(['noodle-1', 'dimsum-1']);
  });
});

describe('오프라인 서버 검사 시험에서 나온 구멍 3가지 (2026-11-03)', () => {
  type Turn = { role: 'user' | 'assistant'; text: string };
  const talk = (...lines: string[]): Turn[] => [GREETING, ...lines].map((text, i) => ({ role: i % 2 === 0 ? 'assistant' : 'user', text }));
  const answer = (o: object) => ({ reply: '모듬 딤섬 골라 봤어요.', conditions: { party: 2 }, mood: null, picks: [{ id: 'dimsum-1', why: '순해요', heard: null }], done: true, asking: 'other', ...o });
  const chat = (turns: Turn[], o: object = {}) => converse({ llm: fakeLlm(answer(o)), knowledge }, { turns, conditions: {}, context: {} });

  it('인원: 손님이 인원을 말했으면 LLM이 적은 인원보다 손님 말(마지막 값)을 따른다 (wrong-party 30건 모두 통과)', async () => {
    const res = await chat(talk('둘이요'), { reply: '매운 건 괜찮으세요?', conditions: { party: 3 }, done: false, asking: 'spicy', picks: [] });
    expect(res.conditions.party).toBe(2);
    expect(res.heardSummary).toBe('2명');
    const fixed = await chat(talk('한 명, 아니 세 명이요'), { reply: '매운 건 괜찮으세요?', conditions: { party: 1 }, done: false, asking: 'spicy', picks: [] });
    expect(fixed.conditions.party).toBe(3);
  });
  it('인원: 손님이 인원을 말하지 않았으면 LLM 값을 그대로 둔다', async () => {
    const res = await chat(talk('매운 거요'), { reply: '몇 분이세요?', conditions: { party: 3 }, done: false, asking: 'party', picks: [] });
    expect(res.conditions.party).toBe(3);
  });

  it('askingOf: 프론트 layout.ts와 같은 규칙 — 마지막 물음 문장, 가장 뒤 낱말, "드시면"의 면 제외, 매운맛+"못 드시"는 spicy', () => {
    const cases: [string, string][] = [
      ['함께 오신 분은 몇 분이신가요?', 'party'], ['매운 음식도 괜찮으세요?', 'spicy'], ['면이 좋으세요, 밥이 좋으세요?', 'kind'], ['빼야 할 재료가 있을까요?', 'exclude'],
      ['어떤 종류가 좋으신가요?', 'kind'], ['네, 이런 메뉴 어떠세요?', 'other'], ['어서 오세요!', 'other'],
      ['화끈하게 매운 요리로 준비해 드릴게요, 면이나 밥 중에서 어떤 걸로 드시겠어요?', 'kind'], ['얼마나 매운 걸로 드릴까요? 면이나 밥 중 어떤 걸로 원하세요?', 'kind'],
      ['그럼 안 매운 국물 요리로 원하시는 면이나 밥 종류가 있으실까요?', 'kind'], ['아이와 함께 드시기 좋은 안 매운 요리로 골라드릴게요. 어떤 종류가 좋으신가요?', 'kind'],
      ['비 오는 저녁이네요, 따뜻한 국물 어떠세요? 몇 분이서 오셨나요?', 'party'], ['두 분이시군요! 매운 음식도 잘 드시나요?', 'spicy'],
      ['일행분 중에 매운 거 못 드시는 분 있나요?', 'spicy'], ['매운 걸 드시면 괜찮으세요?', 'spicy'], ['혹시 못 드시는 재료 있으세요?', 'exclude'], ['돼지고기는 빼 드릴까요?', 'exclude'],
    ];
    for (const [text, want] of cases) expect([text, askingOf(text)]).toEqual([text, want]);
    expect(askingOf('')).toBe('other');
  });
  it('asking 누락·잘못된 값이면 서버가 reply 마지막 물음으로 추정한다 (missing-asking 30건 모두 화면 답 버튼이 추정으로 돌아감)', async () => {
    const ask = (asking: unknown, reply: string) => chat(talk('둘이요'), { reply, asking, done: false, picks: [], conditions: { party: 2 } }).then((r) => r.asking);
    expect(await ask(undefined, '두 분이시군요! 매운 음식도 잘 드시나요?')).toBe('spicy');
    expect(await ask('budget', '혹시 못 드시는 재료 있으세요?')).toBe('exclude');
    expect(await ask(null, '네, 이런 메뉴 어떠세요?')).toBe('other');
    expect(await ask('party', '매운 음식도 잘 드시나요?')).toBe('party'); // 맞는 값이 오면 LLM 값을 그대로
  });

  it('매운맛을 손님이 말하지도, 직원이 묻지도 않았는데 done이면 매운맛 질문으로 되돌린다 (early-done에서 안 맵게 손님에게 매운 메뉴)', async () => {
    const res = await chat(talk('둘이요', '못 드시는 재료 있으세요?', '없어요, 아무거나요'));
    expect(res).toMatchObject({ done: false, asking: 'spicy', picks: [] });
    expect(res.reply).toMatch(/매운/);
    expect(res.reply.endsWith('?')).toBe(true);
  });
  it('질문 순서는 인원 → 매운맛 → 재료 → 종류 (셋 다 모르면 매운맛부터)', async () => {
    expect((await chat(talk('둘이요'))).asking).toBe('spicy');
    expect((await chat(talk('둘이요', '매운 음식도 잘 드시나요?', '네'))).asking).toBe('exclude');
  });
  it('매운맛 질문에 "상관없어요·아무거나"로 답했어도 물은 것으로 치고 다시 묻지 않는다', async () => {
    for (const a of ['상관없어요', '아무거나요', '음…']) {
      const res = await chat(talk('둘이요', '매운 음식도 잘 드시나요?', a, '못 드시는 재료 있으세요?', '없어요, 아무거나 추천해 주세요'));
      expect([a, res.done]).toEqual([a, true]);
    }
  });
  it('손님이 매운맛을 먼저 말했거나 LLM이 매운맛을 조건에 넣었으면 묻지 않는다', async () => {
    expect((await chat(talk('둘이요, 안 맵게 아무거나요', '못 드시는 재료 있으세요?', '없어요'))).done).toBe(true);
    expect((await chat(talk('둘이요', '못 드시는 재료 있으세요?', '없어요, 아무거나요'), { conditions: { party: 2, spicy: 0 } })).done).toBe(true);
  });
  it('매운맛을 묻다 끊겼으면(끊김) 물은 것으로 치지 않는다', async () => {
    const res = await chat(talk('둘이요', '매운 음식도 잘 드시나요? (끊김)', '없어요, 아무거나요'));
    expect(res.asking).toBe('spicy');
  });
});

describe('재료 미확인 메뉴 안전 (Claude 시험 손님 117: 채식 손님에게 재료 목록이 빈 메뉴가 추천됨)', () => {
  const k = fromData([
    { id: 'unknown-1', name: '소룡포', price: 9000, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 1, quantityUnit: '4개', ingredients: [], texture: [] },
    { id: 'checked-1', name: '야채 교자', price: 8000, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 1, quantityUnit: '6개', ingredients: [], ingredientsChecked: true, texture: [] },
    { id: 'known-1', name: '새우 하가우', price: 9000, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 1, quantityUnit: '4개', ingredients: ['새우'], texture: [] },
  ]);
  const picks = ['unknown-1', 'checked-1', 'known-1'].map((id) => ({ id, why: '좋아요', heard: null }));
  const run = (userText: string, exclude: string[]) => converse(
    { llm: fakeLlm({ reply: '골라 봤어요.', conditions: { party: 1, spicy: 0, kind: '딤섬', exclude }, mood: null, picks, done: true, asking: 'other' }), knowledge: k },
    { turns: [{ role: 'assistant', text: GREETING }, { role: 'user', text: userText }], conditions: {}, context: {} },
  );

  it('빼야 할 재료가 있으면 재료 목록이 비어 있고 확인 표시가 없는 메뉴는 뺀다 (프론트 recommendation.ts unknown()과 같은 규칙)', async () => {
    const res = await run('혼자요, 안 맵게 딤섬으로, 새우는 빼 주세요', ['새우']);
    expect(res.picks).toEqual(['checked-1']);
  });
  it('빼야 할 재료가 없으면 재료 미확인 메뉴도 추천할 수 있다', async () => {
    const res = await run('혼자요, 안 맵게 딤섬으로, 못 먹는 거 없어요', []);
    expect(res.picks).toEqual(['unknown-1', 'checked-1', 'known-1']);
  });
  it('메뉴 목록 한 줄에 재료가 확인 안 된 메뉴는 그렇다고 적는다 (LLM이 재료 없음으로 오해하지 않게)', () => {
    const [unknownLine, checkedLine] = k.lines();
    expect(unknownLine).toContain('재료: 확인 안 됨');
    expect(checkedLine).not.toContain('확인 안 됨');
  });
});

describe('"네 명 이상이에요" → 정확한 인원 한 번 다시 묻기 (2026-11-03 팀장 로컬 키오스크 시험)', () => {
  type Turn = { role: 'user' | 'assistant'; text: string };
  const talk = (...lines: string[]): Turn[] => [GREETING, ...lines].map((text, i) => ({ role: i % 2 === 0 ? 'assistant' : 'user', text }));
  const asking = (o: object = {}) => ({ reply: '매운 음식도 잘 드시나요?', conditions: {}, mood: null, picks: [], done: false, asking: 'spicy', ...o });
  const chat = (turns: Turn[], o: object = {}) => converse({ llm: fakeLlm(asking(o)), knowledge }, { turns, conditions: {}, context: {} });

  it('partyMention: 인원과 "이상·넘어요·넘게·보다 많아요" 여부', () => {
    const cases: [string, { n: number; atLeast: boolean } | null][] = [
      ['네 명 이상이에요', { n: 4, atLeast: true }], ['4명 넘어요', { n: 4, atLeast: true }], ['넷 넘게 왔어요', { n: 4, atLeast: true }],
      ['네 명보다 많아요', { n: 4, atLeast: true }], ['네 명이 넘어요', { n: 4, atLeast: true }], ['다섯 명 이상', { n: 5, atLeast: true }],
      ['일곱 명 이상이에요', { n: 7, atLeast: true }], ['일곱 명이요', { n: 7, atLeast: false }], ['여덟 명', { n: 8, atLeast: false }],
      ['다섯 명이요', { n: 5, atLeast: false }], ['네 명 이상, 아니 여섯 명이요', { n: 6, atLeast: false }], ['매운 거요', null],
    ];
    for (const [text, want] of cases) expect([text, partyMention(text)]).toEqual([text, want]);
  });

  it('"N명 이상"(N<7)이면 인원을 확정하지 않고 정확히 몇 분인지 묻는다 (asking=party, 조건 인원은 N으로 두되 요약 칩엔 안 넣음)', async () => {
    for (const o of [{}, { done: true, picks: [{ id: 'dimsum-1', why: 'x', heard: null }], reply: '모듬 딤섬 골라 봤어요.' }]) {
      const res = await chat(talk('네 명 이상이에요'), o);
      expect(res).toMatchObject({ done: false, asking: 'party', picks: [], partyAssumed: false });
      expect(res.reply).toMatch(/정확히 몇 분/);
      expect(res.reply.endsWith('?')).toBe(true);
      expect([...res.reply].length).toBeLessThanOrEqual(60);
      expect(res.conditions.party).toBe(4);
      expect(res.heardSummary ?? '').not.toContain('4명');
    }
  });
  it('다시 물은 뒤 손님이 숫자를 말하면 그 숫자로 확정하고 다음 질문으로 넘어간다', async () => {
    const res = await chat(talk('네 명 이상이에요', '네 분 이상이시군요. 정확히 몇 분이세요?', '여섯 명이요'));
    expect(res).toMatchObject({ asking: 'spicy', conditions: { party: 6 } });
    expect(res.heardSummary).toBe('6명');
  });
  it('다시 물었는데 또 "이상"이면 더 묻지 않고 그 N으로 확정 (무한 반복 금지)', async () => {
    const res = await chat(talk('네 명 이상이에요', '네 분 이상이시군요. 정확히 몇 분이세요?', '다섯 명 이상이요'));
    expect(res).toMatchObject({ asking: 'spicy', conditions: { party: 5 } });
  });
  it('다시 물은 뒤 손님이 숫자 없이 다른 말을 해도 다시 묻지 않고 N으로 확정', async () => {
    const res = await chat(talk('네 명 이상이에요', '네 분 이상이시군요. 정확히 몇 분이세요?', '음 잘 모르겠어요'));
    expect(res).toMatchObject({ asking: 'spicy', conditions: { party: 4 } });
  });
  it('7명 이상("일곱 명 이상이에요", 프론트 7명 이상 버튼)은 바로 7로 확정', async () => {
    const res = await chat(talk('일곱 명 이상이에요'));
    expect(res).toMatchObject({ asking: 'spicy', conditions: { party: 7 } });
    expect(res.heardSummary).toBe('7명');
  });
  it(`${MAX_TURNS}번째 강제 추천이면 다시 묻지 않고 N으로 추천`, async () => {
    const res = await chat(talk('음', '?', '음', '?', '음', '?', '음', '?', '음', '?', '네 명 이상이에요'), { done: true, picks: [{ id: 'dimsum-1', why: 'x', heard: null }], reply: '모듬 딤섬 골라 봤어요.' });
    expect(res).toMatchObject({ done: true, conditions: { party: 4 } });
  });
});

describe('따뜻하고 함께 고르는 말투 — 서버가 대신 쓰는 문장 (2026-11-03 팀장: 친근하고 상호적으로, 마음이 따뜻해지게)', () => {
  type Turn = { role: 'user' | 'assistant'; text: string };
  const talk = (...lines: string[]): Turn[] => [GREETING, ...lines].map((text, i) => ({ role: i % 2 === 0 ? 'assistant' : 'user', text }));
  const done = (o: object = {}) => ({ reply: '골랐어요?', conditions: { party: 2 }, mood: null, picks: [{ id: 'dimsum-1', why: '순해요', heard: null }], done: true, asking: 'other', ...o });
  const chat = (turns: Turn[], o: object = {}) => converse({ llm: fakeLlm(done(o)), knowledge }, { turns, conditions: {}, context: {} });
  /** 서버가 되돌릴 때 쓰는 질문을 실제 대화에서 꺼낸다 */
  const questions = async () => ({
    party: (await chat(talk('아무거나 추천해 주세요'))).reply,
    exact: (await chat(talk('네 명 이상이에요'), { done: false, asking: 'spicy', reply: '매운 건요?', picks: [] })).reply,
    spicy: (await chat(talk('둘이요'))).reply,
    exclude: (await chat(talk('둘이요', '매운 음식은 괜찮으세요?', '네'))).reply,
    kind: (await chat(talk('둘이요', '매운 음식은 괜찮으세요?', '네', '못 드시는 재료 있으세요?', '없어요'))).reply,
  });

  it('서버 질문은 짧은 반응·공감 한마디 뒤에 묻는다 (기계적인 "~ 있으세요?" 한 줄이 아님), 재료 질문은 편하게 말해도 된다는 느낌', async () => {
    const q = await questions();
    for (const key of ['party', 'exact', 'spicy', 'kind'] as const) expect([key, q[key]]).toEqual([key, expect.stringMatching(/^[^?]+[.!]\s\S[^?]*\?$/)]);
    expect(q.exclude).toContain('편하게');
  });
  it('서버 질문은 길이·물음표 규칙을 지키고, 숫자는 우리말(TTS), asking 추정(askingOf)과 질문 판단(asked*)이 그대로 맞는다', async () => {
    const q = await questions();
    for (const [key, text] of Object.entries(q)) {
      expect([key, [...text].length <= 60, text.split('?').length - 1, /\d/.test(text)]).toEqual([key, true, 1, false]);
    }
    expect([askingOf(q.party), askingOf(q.exact), askingOf(q.spicy), askingOf(q.exclude), askingOf(q.kind)]).toEqual(['party', 'party', 'spicy', 'exclude', 'kind']);
    expect([askedExclude(q.exclude), askedKind(q.kind)]).toEqual([true, true]);
    // 다른 질문으로 잘못 읽히지 않게
    expect([askedExclude(q.spicy), askedExclude(q.kind), askedKind(q.spicy), askedKind(q.exclude), /매운|맵/.test(q.exclude), /매운|맵/.test(q.kind)]).toEqual([false, false, false, false, false, false]);
  });
  it('서버 질문을 한 번 했으면 다음 턴에 같은 질문을 되풀이하지 않는다 (새 문장도 "물었다"로 인식)', async () => {
    const q = await questions();
    const res = await chat(talk('둘이요', q.spicy, '네', q.exclude, '없어요', q.kind, '국물 있는 거요'));
    expect(res.done).toBe(true);
  });

  it('질문 답이 60자를 넘으면 앞쪽 반응 문장을 덜어 60자 안으로 줄이고 질문은 남긴다 (반응 한마디가 붙으면서 길어질 수 있음; 실측 Gemini 답은 59자까지 나옴)', async () => {
    const long = '생일 축하드려요! 조금 매운 건 괜찮으시군요! 알레르기나 채식·종교 때문에 못 드시는 재료가 있으면 편하게 말씀해 주실래요?';
    const res = await chat(talk('넷이요', '매운 음식은 괜찮으세요?', '조금 매운 건 괜찮아요'), { done: false, asking: 'exclude', reply: long, picks: [] });
    expect([...res.reply].length).toBeLessThanOrEqual(60);
    // 필요한 만큼만 덜어 낸다 (가까운 반응 한마디는 남김)
    expect(res.reply).toBe('조금 매운 건 괜찮으시군요! 알레르기나 채식·종교 때문에 못 드시는 재료가 있으면 편하게 말씀해 주실래요?');
    expect(res.asking).toBe('exclude');
  });
  it('질문 한 문장만으로도 60자를 넘으면 같은 걸 묻는 서버 질문으로 바꾼다, 60자 이내 답은 그대로', async () => {
    const huge = `${'정말 '.repeat(20)}매운 음식은 괜찮으세요?`;
    const res = await chat(talk('둘이요'), { done: false, asking: 'spicy', reply: huge, picks: [] });
    expect([...res.reply].length).toBeLessThanOrEqual(60);
    expect(res.reply).toMatch(/매운/);
    const ok = '두 분이 오셨군요, 반가워요! 매운 음식은 괜찮으세요?';
    expect((await chat(talk('둘이요'), { done: false, asking: 'spicy', reply: ok, picks: [] })).reply).toBe(ok);
  });
  it('추천 답이 picks에 없는 메뉴 이름을 말하면 서버 추천 문장으로 바꾼다 (실제 Gemini: 게살스프·유니짜장을 고르고 "우육탕면으로 골라 봤어요")', async () => {
    const k = fromData([
      { id: 'noodle-7', name: '소고기 우육탕면', price: 13000, category: 'noodle', kind: '면', spicy: 1, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['소고기'], texture: [] },
      { id: 'soup-3', name: '옥수수 게살스프', price: 9000, category: 'soup', kind: '스프/탕', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['게'], texture: [] },
      { id: 'noodle-1', name: '원심 유니짜장', aliases: ['유니짜장'], price: 8000, category: 'noodle', kind: '면', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['돼지고기'], texture: [] },
    ]);
    const run = (reply: string) => converse(
      { llm: fakeLlm({ reply, conditions: { party: 1, spicy: 0, kind: '스프/탕' }, mood: 'tired', picks: [{ id: 'soup-3', why: 'a', heard: null }, { id: 'noodle-1', why: 'b', heard: null }], done: true, asking: 'other' }), knowledge: k },
      { turns: talk('혼자요, 안 맵게요. 따뜻한 국물이요', '못 드시는 재료 있으세요?', '없어요'), conditions: {}, context: {} },
    ).then((r) => r.reply);
    const replaced = await run('따뜻한 국물을 찾으시는군요, 몸을 녹여줄 부드러운 우육탕면으로 골라 봤어요. 맛있게 드세요!');
    expect(replaced).not.toContain('우육탕면');
    expect(replaced).toContain('옥수수 게살스프');
    // 고른 메뉴는 이름 일부(게살스프)·별칭(유니짜장)으로 말해도 그대로 둔다
    const kept = '따뜻한 게살스프랑 순한 유니짜장으로 골라 봤어요. 맛있게 드세요!';
    expect(await run(kept)).toBe(kept);
  });
  it('recommendLine: 손님 말(안 맵게)과 기분(지침·축하)을 짚어 따뜻하게 마무리, 60자 이내 평서문', () => {
    const plain = recommendLine(['짬뽕', '모듬 딤섬']);
    expect(plain).toMatch(/맛있게 드세요!$/);
    expect(recommendLine(['유니짜장'], { spicy: 0 })).toContain('안 맵게');
    expect(recommendLine(['유니짜장'], { mood: 'tired' })).toMatch(/고생/);
    expect(recommendLine(['유니짜장'], { mood: 'celebrate' })).toMatch(/축하/);
    const longNames = ['참깨소스로 맛을 낸 유자향 토마토 샐러드', '바삭하게 튀긴 고추 유린기 반마리', '어향동고새우와 바오번 세트'];
    for (const opts of [{}, { spicy: 0 }, { mood: 'tired' as const }, { mood: 'celebrate' as const, spicy: 0 }]) {
      const line = recommendLine(longNames, opts);
      expect([[...line].length <= 60, line.includes('?')]).toEqual([true, false]);
    }
  });
  it('추천 답을 서버가 바꿀 때(질문으로 끝남) 손님이 말한 안 맵게·기분을 반영한다', async () => {
    const res = await chat(talk('둘이요, 오늘 너무 피곤해요. 안 맵게 아무거나요', '못 드시는 재료 있으세요?', '없어요'), { mood: 'tired', conditions: { party: 2, spicy: 0 } });
    expect(res.done).toBe(true);
    expect(res.reply).toMatch(/고생/);
    expect(res.reply).toContain('모듬 딤섬');
    expect(res.reply.includes('?')).toBe(false);
  });
});

describe('1인분 메뉴를 "나눠 먹기"로 소개하지 않기 (2026-11-03 팀장: 2명에게 1인분 유니짜장을 "둘이 나눠 먹기 좋은"이라고 함)', () => {
  // 테스트 메뉴: 짬뽕은 1인분, 모듬 딤섬은 3인분
  const recommend = (answer: object, party = 2) => converse(
    { llm: fakeLlm({ conditions: { party, spicy: 2, kind: '면' }, mood: null, asking: 'other', done: true, ...answer }), knowledge },
    { turns: [{ role: 'assistant', text: GREETING }, { role: 'user', text: party === 1 ? '혼자요, 매운 거 좋아요' : '둘이요, 매운 거 좋아요' }, { role: 'assistant', text: '못 드시는 재료 있으세요?' }, { role: 'user', text: '없어요' }], conditions: {}, context: {} },
  );

  it('프롬프트의 why 예시가 1인분 짜장을 "둘이 나눠 먹기 좋은"으로 소개하지 않는다 (모델이 예시를 그대로 따라 함)', () => {
    const [stable] = systemPrompt(knowledge, {}, 0);
    expect(stable).not.toContain('둘이 나눠 먹기 좋은 순한 짜장');
  });
  it('1인분 메뉴의 why에 "나눠" 표현이 있으면 인원에 맞는 기본 이유로 바꾸고, 여러 인분 메뉴는 그대로 둔다', async () => {
    const picks = [
      { id: 'dimsum-1', why: '셋이 나눠 먹기 좋은 딤섬이에요', heard: null },
      { id: 'noodle-1', why: '둘이 나눠 먹기 좋은 얼큰한 짬뽕이에요', heard: null },
    ];
    const two = await recommend({ reply: '골라 봤어요.', picks });
    expect(two.pickReasons.map((p) => p.why)).toEqual(['셋이 나눠 먹기 좋은 딤섬이에요', '얼큰한 짬뽕이에요']); // 나눠 먹기 마디만 덜어 냄
    for (const why of ['함께 나눠 드시기 좋아요', '둘이 같이 나눠 먹는 짬뽕이에요', 'share하기 좋은 짬뽕']) {
      const r = await recommend({ reply: '골라 봤어요.', picks: [{ id: 'noodle-1', why, heard: null }] });
      expect([why, r.pickReasons[0].why]).toEqual([why, '한 분에 하나씩 드시기 좋은 메뉴예요']);
    }
    const one = await recommend({ reply: '골라 봤어요.', picks: [{ id: 'noodle-1', why: '둘이 나눠 먹는 짬뽕이에요', heard: null }] }, 1);
    expect(one.pickReasons[0].why).toBe('말씀하신 조건에 맞는 메뉴예요');
    const ok = await recommend({ reply: '골라 봤어요.', picks: [{ id: 'noodle-1', why: '얼큰하고 든든한 짬뽕이에요', heard: null }] });
    expect(ok.pickReasons[0].why).toBe('얼큰하고 든든한 짬뽕이에요');
  });
  it('추천 답(reply)에 1인분 메뉴 이름과 "나눠 먹" 표현이 같이 나오면 서버 추천 문장으로 바꾼다, 여러 인분 메뉴면 그대로', async () => {
    const bad = await recommend({ reply: '한산한 오후에 나눠 먹기 좋은 짬뽕입니다.', picks: [{ id: 'noodle-1', why: '얼큰해요', heard: null }] });
    expect(bad.reply).not.toMatch(/나눠|나누어/);
    expect(bad.reply).toContain('짬뽕');
    const fine = '셋이 나눠 드시기 좋은 모듬 딤섬이에요. 맛있게 드세요!';
    expect((await recommend({ reply: fine, picks: [{ id: 'dimsum-1', why: '좋아요', heard: null }] })).reply).toBe(fine);
  });
  it('sharesSingle: 1인분 메뉴를 나눠 먹기로 말하는지 (채점·서버 검사 공용)', () => {
    const [noodle, dimsum] = [knowledge.byId('noodle-1')!, knowledge.byId('dimsum-1')!];
    expect(sharesSingle('둘이 나눠 먹기 좋은 짬뽕이에요', [noodle])).toBe(true);
    expect(sharesSingle('나눠 먹기 좋은 모듬 딤섬이에요', [dimsum])).toBe(false);
    expect(sharesSingle('얼큰한 짬뽕이에요', [noodle])).toBe(false);
    expect(sharesSingle('두 분이 나눠 드시기 좋아요', [noodle])).toBe(true); // why는 이름이 없어도 그 메뉴 이야기
  });

  // 코드 리뷰(2026-11-03)에서 찾은 구멍: 줄여 부른 이름("짜장"), 넓은 나눠 먹기 말, 섞인 추천의 오탐, why 통째 교체
  const mixed = fromData([
    { id: 'noodle-1', name: '짬뽕', price: 11000, category: 'noodle', kind: '면', spicy: 2, servingPeople: 1, quantityUnit: '1그릇', ingredients: [], ingredientsChecked: true, texture: [] },
    { id: 'noodle-2', name: '원심 유니짜장', price: 8000, category: 'noodle', kind: '면', spicy: 0, servingPeople: 1, quantityUnit: '1그릇', ingredients: [], ingredientsChecked: true, texture: [] },
    { id: 'dish-1', name: '생등심 탕수육', price: 25000, category: 'dish', kind: '요리', spicy: 0, servingPeople: 3, quantityUnit: '1접시', ingredients: [], ingredientsChecked: true, texture: [] },
  ]);
  const [jjamppong, jjajang, tangsuyuk] = ['noodle-1', 'noodle-2', 'dish-1'].map((id) => mixed.byId(id)!);
  const recommendMixed = (reply: string, ids: string[]) => converse(
    { llm: fakeLlm({ reply, conditions: { party: 2, spicy: 2, kind: '상관없음' }, mood: null, asking: 'other', done: true, picks: ids.map((id) => ({ id, why: '좋아요', heard: null })) }), knowledge: mixed },
    { turns: [{ role: 'assistant', text: GREETING }, { role: 'user', text: '둘이요, 매운 거 좋아요, 아무거나' }, { role: 'assistant', text: '못 드시는 재료 있으세요?' }, { role: 'user', text: '없어요' }], conditions: {}, context: {} },
  );

  it('나눠 먹기 말: "두 분이서 함께", "다 같이", "둘이 함께 즐기기", "2인이 같이 먹기"도 잡고, "한 분에 하나씩"·곁들임 "같이"는 아님', () => {
    for (const t of ['두 분이서 함께 드시기 좋은 짬뽕이에요', '다 같이 드시기 좋은 짬뽕이에요', '둘이 함께 즐기기 좋은 짬뽕이에요', '2인이 같이 먹기 좋은 짬뽕이에요', '일행분들과 함께 드시기 좋아요']) {
      expect([t, sharesSingle(t, [jjamppong])]).toEqual([t, true]);
    }
    for (const t of ['한 분에 하나씩 드시기 좋은 짬뽕이에요', '두 분이 각각 하나씩 드시기 좋아요', '탕수육과 같이 드시기 좋은 짬뽕이에요', '바다 같이 시원한 짬뽕이에요']) {
      expect([t, sharesSingle(t, [jjamppong])]).toEqual([t, false]);
    }
  });
  it('고른 메뉴가 모두 1인분이면 이름이 없거나 줄여 불러도("짜장") 나눠 먹기 말이 나오면 서버 추천 문장으로 바꾼다', async () => {
    expect(replySharesSingle('둘이 나눠 먹기 좋은 순한 짜장 골라 봤어요.', [jjajang])).toBe(true);
    expect(replySharesSingle('두 분이서 함께 드시기 좋게 골라 봤어요.', [jjajang, jjamppong])).toBe(true);
    const res = await recommendMixed('둘이 나눠 먹기 좋은 순한 짜장 골라 봤어요.', ['noodle-2']);
    expect(res.reply).not.toMatch(/나눠/);
    expect(res.reply).toContain('원심 유니짜장');
  });
  it('섞인 추천: 나눠 먹기 말이 붙은 메뉴만 본다 ("탕수육은 나눠 드시고 짬뽕은 한 분에 하나씩"은 그대로)', async () => {
    const fine = '탕수육은 나눠 드시고 짬뽕은 한 분에 하나씩 드세요!';
    expect(replySharesSingle(fine, [tangsuyuk, jjamppong])).toBe(false);
    expect((await recommendMixed(fine, ['dish-1', 'noodle-1'])).reply).toBe(fine);
    expect(replySharesSingle('나눠 드시기 좋은 탕수육과 얼큰한 짬뽕 골라 봤어요.', [tangsuyuk, jjamppong])).toBe(false);
    expect(replySharesSingle('바삭한 탕수육, 둘이 함께 즐기기 좋은 짜장 골라 봤어요.', [tangsuyuk, jjajang])).toBe(true);
    expect(replySharesSingle('짬뽕은 나눠 드시고 탕수육도 드세요!', [tangsuyuk, jjamppong])).toBe(true);
    expect(replySharesSingle('나눠 먹기 좋고 바삭한 탕수육이랑 짬뽕 골라 봤어요.', [tangsuyuk, jjamppong])).toBe(false); // 마디에 메뉴가 없으면 다음 마디의 첫 메뉴
    const bad = await recommendMixed('탕수육이랑 다 같이 드시기 좋은 짬뽕 골라 봤어요.', ['dish-1', 'noodle-1']);
    expect(bad.reply).not.toMatch(/같이/);
  });
  it('1인분 메뉴 why는 나눠 먹기 마디만 덜고, 남는 게 마땅치 않으면 기본 이유로', async () => {
    const whyOf = async (why: string) => (await recommend({ reply: '골라 봤어요.', picks: [{ id: 'noodle-1', why, heard: null }] })).pickReasons[0].why;
    expect(await whyOf('나눠 먹기 좋은 얼큰한 짬뽕이에요')).toBe('얼큰한 짬뽕이에요');
    expect(await whyOf('두 분이서 함께 드시기 좋은 얼큰한 짬뽕이에요')).toBe('얼큰한 짬뽕이에요');
    expect(await whyOf('둘이 나눠 먹기 좋고 든든한 짬뽕이에요')).toBe('든든한 짬뽕이에요');
    expect(await whyOf('얼큰해서 둘이 나눠 먹기 좋아요')).toBe('한 분에 하나씩 드시기 좋은 메뉴예요');
    expect(await whyOf('나눠 먹는 짬뽕이에요')).toBe('한 분에 하나씩 드시기 좋은 메뉴예요');
  });
});

describe('추천 답 길이 60자 이내 (시뮬레이션에서 추천 답이 60자를 넘음)', () => {
  const long = fromData([
    { id: 'a', name: '참깨소스로 맛을 낸 유자향 토마토 샐러드', price: 9000, category: 'salad', kind: '냉채/샐러드', spicy: 0, servingPeople: 2, quantityUnit: '1접시', ingredients: [], texture: [] },
    { id: 'b', name: '바삭하게 튀긴 고추 유린기 반마리', price: 18000, category: 'chicken', kind: '치킨', spicy: 0, servingPeople: 2, quantityUnit: '1접시', ingredients: [], texture: [] },
    { id: 'c', name: '어향동고새우와 바오번 세트', price: 22000, category: 'seafood', kind: '해산물', spicy: 0, servingPeople: 2, quantityUnit: '1접시', ingredients: [], texture: [] },
  ]);
  const turns = [
    { role: 'assistant' as const, text: GREETING }, { role: 'user' as const, text: '둘이요, 매운 거 괜찮고 못 먹는 거 없고 아무거나요' },
  ];

  it('done인데 reply가 60자를 넘으면 서버가 짧은 추천 문장으로 바꾼다', async () => {
    const reply = '네 분이서 드시기 좋은 안 매운 요리로 준비해 드릴게요. 베이징덕과 어향동고새우가 한산한 아침 시간에 편안하게 즐기기 좋습니다.';
    const res = await converse(
      { llm: fakeLlm({ reply, conditions: { party: 2 }, mood: null, picks: [{ id: 'dimsum-1', why: '좋아요', heard: null }], done: true, asking: 'other' }), knowledge },
      { turns, conditions: {}, context: {} },
    );
    expect(res.done).toBe(true);
    expect([...res.reply].length).toBeLessThanOrEqual(60);
    expect(res.reply).toContain('모듬 딤섬');
  });

  it('60자 이내인 추천 답은 그대로 둔다', async () => {
    const reply = '둘이 나눠 드시기 좋은 모듬 딤섬 골라 봤어요.';
    const res = await converse(
      { llm: fakeLlm({ reply, conditions: { party: 2 }, mood: null, picks: [{ id: 'dimsum-1', why: '좋아요', heard: null }], done: true, asking: 'other' }), knowledge },
      { turns, conditions: {}, context: {} },
    );
    expect(res.reply).toBe(reply);
  });

  it('recommendLine: 메뉴 이름이 길면 앞 1~2개 + "등"으로 줄여 60자를 넘지 않는다', () => {
    const names = long.menus.map((m) => m.name);
    for (const n of [1, 2, 3]) {
      const line = recommendLine(names.slice(0, n));
      expect([n, [...line].length <= 60]).toEqual([n, true]);
      expect(line).toContain(names[0]);
    }
    expect(recommendLine(names)).toContain('등');
    // 따뜻한 마무리로 바뀜 (2026-11-03 팀장 요청). 조사(을/를)는 마지막 이름에 맞춘다
    expect(recommendLine(['짬뽕', '모듬 딤섬'])).toContain('짬뽕, 모듬 딤섬을 골라 봤어요');
    expect([...recommendLine(['가'.repeat(80)])].length).toBeLessThanOrEqual(60);
  });

  it('done 답을 바꿀 때도 길이 제한을 지킨다 (긴 메뉴 이름 3개)', async () => {
    const res = await converse(
      { llm: fakeLlm({ reply: '어떠세요?', conditions: { party: 2 }, mood: null, picks: ['a', 'b', 'c'].map((id) => ({ id, why: '좋아요', heard: null })), done: true, asking: 'other' }), knowledge: long },
      { turns, conditions: {}, context: {} },
    );
    expect(res.picks).toEqual(['a', 'b', 'c']);
    expect([...res.reply].length).toBeLessThanOrEqual(60);
  });
});

describe('extractConditions', () => {
  it('기존 aiClient 계약 모양으로 돌려준다', async () => {
    const res = await extractConditions(
      { llm: fakeLlm({ party_size: 3, spicy_level: 7, budget_per_person: 15000.4, excluded_ingredients: ['새우'], food_keywords: ['딤섬'] }), knowledge },
      '셋이서 딤섬, 새우는 빼고',
    );
    expect(res).toEqual({ source: 'llm', conditions: { party_size: 3, spicy_level: 3, budget_per_person: 15000, excluded_ingredients: ['새우'], food_keywords: ['딤섬'] } });
  });
});

describe('partyMentioned', () => {
  it('손님 말에서 인원을 읽고, 인원 말이 없으면 null (기본 1명으로 채우지 않음)', () => {
    const cases: [string, number | null][] = [
      ['혼자 왔어요', 1], ['저 혼자요', 1], ['두 명이에요', 2], ['둘이요', 2], ['둘이서 왔어요', 2], ['세 명이에요', 3], ['셋이요, 애기 하나 있어요', 3],
      ['넷이서 왔고 아이가 있어요', 4], ['네 명 이상이에요', 4], ['4명이요', 4], ['다섯 명', 5],
      ['매운 거 좋아요', null], ['네, 좋아요', null], ['아무거나 추천해 주세요', null], ['1인당 만오천원이요', null],
    ];
    for (const [text, want] of cases) expect([text, partyMentioned(text)]).toEqual([text, want]);
  });
  it('영어로 말한 인원 (Claude 시험 손님 116 "Five people... 오 명?"을 못 읽어 인원 질문으로 되돌아감)', () => {
    const cases: [string, number | null][] = [
      ['Five people', 5], ['five', 5], ['5 people', 5], ['Just me', 1], ['just me, thanks', 1], ['two of us', 2], ['One person', 1], ['Three persons', 3],
      ['eight', 8], ['Two people, two명이에요', 2], ['We are four', 4],
      ['this one please', null], ['someone recommend', null], ['anyone? 추천해 주세요', null], ['Not really... A little bit spicy is okay.', null],
    ];
    for (const [text, want] of cases) expect([text, partyMentioned(text)]).toEqual([text, want]);
  });
  it('한자어 수사 인원 "이 명·삼 명·오 명·육 명·칠 명·팔 명", "일 명"은 정확히일 때만. 뒤에 명이 없으면 인원이 아님', () => {
    const cases: [string, number | null][] = [
      ['Five people... 오 명?', 5], ['이 명이요', 2], ['삼 명', 3], ['오명이에요', 5], ['육 명', 6], ['칠 명이요', 7], ['팔 명', 8], ['일 명이요', 1],
      ['이 사람이 매운 거 못 먹어요', null], ['오 분만 기다려 주세요', null], ['이거 주세요', null], ['일이 많아서 빨리요', null], ['오징어 빼 주세요', null],
      ['삼선짬뽕 주세요', null], ['이분이 계산해요', null], ['칠리새우요', null],
    ];
    for (const [text, want] of cases) expect([text, partyMentioned(text)]).toEqual([text, want]);
  });
  it('고쳐 말하면 마지막에 말한 인원 ("한 명, 아니 두 명"을 1명으로 읽어 재채점에서 거짓 "인원 틀림"이 남음)', () => {
    const cases: [string, number][] = [
      ['한 명, 아니 두 명이에요 아이도 있어요', 2], ['한 명, 아니 두 사람 있어요', 2], ['Three… 두 명, 아니 세 명이에요', 3], ['두 명, 아니 세 명이라예', 3],
      ['3명, 아니 4명이요', 4], ['넷, 아니 다섯 명', 5], ['다섯 명, 아니 넷이요', 4],
    ];
    for (const [text, want] of cases) expect([text, partyMentioned(text)]).toEqual([text, want]);
  });
});

describe('geminiClient 요청 설정', () => {
  it('출력 길이 제한·낮은 temperature, thinking은 설정했을 때만 보낸다', async () => {
    const seen: any[] = [];
    const generate = async (req: any) => { seen.push(req); return { text: '{}' }; };
    const signal = new AbortController().signal;
    await geminiClient('k', 'gemini-x', { generate, thinking: 'minimal' }).generateJson(['고정', '상황'], [{ role: 'user', text: '둘이요' }], {}, signal);
    await geminiClient('k', 'gemini-x', { generate }).generateJson(['고정'], [{ role: 'user', text: '둘이요' }], {}, signal);
    expect(seen[0].config).toMatchObject({ systemInstruction: '고정\n\n상황', temperature: 0.3, maxOutputTokens: expect.any(Number), thinkingConfig: { thinkingLevel: 'MINIMAL' } });
    expect(seen[1].config).not.toHaveProperty('thinkingConfig');
  });
});
