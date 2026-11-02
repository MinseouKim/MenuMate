import { describe, expect, it } from 'vitest';
import { converse, describeContext, extractConditions, geminiClient, MAX_TURNS, partyMentioned, systemPrompt, type LlmClient } from '../src/chat.js';
import { fromData, loadMenuKnowledge } from '../src/menuKnowledge.js';

const knowledge = fromData(
  [
    { id: 'noodle-1', name: '짬뽕', price: 11000, category: 'noodle', kind: '면', spicy: 2, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['해산물', '돼지고기'], texture: [], keywords: ['짬뽕'] },
    { id: 'dimsum-1', name: '모듬 딤섬', price: 19500, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 3, quantityUnit: '8개입', ingredients: [], texture: [], badge: '대표' },
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
      { turns: [{ role: 'assistant', text: '몇 분?' }, { role: 'user', text: '둘이요 매운 거' }], conditions: { party: 2 }, context: {} },
    );
    expect(res.done).toBe(true);
    expect(res.picks).toEqual(['noodle-1', 'dimsum-1']); // soup-1은 품절
    expect(res.mood).toBe('tired');
    expect(res.conditions).toMatchObject({ party: 2, spicy: 2, kind: '면' });
  });

  it('asking: 질문 중이면 무엇을 묻는지 그대로, 모르는 값·추천 단계면 null', async () => {
    const ask = (asking: unknown, done = false) => converse(
      { llm: fakeLlm({ reply: '어떤 종류가 좋으세요?', conditions: {}, mood: null, picks: [], done, asking }), knowledge },
      { turns: [{ role: 'user', text: '둘이요' }], conditions: {}, context: {} },
    ).then((r) => r.asking);
    expect(await ask('kind')).toBe('kind');
    expect(await ask('exclude')).toBe('exclude');
    expect(await ask('budget')).toBeNull();
    expect(await ask(undefined)).toBeNull();
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
  const recommend = (answer: object, userText: string, conditions: object = {}) => converse(
    { llm: fakeLlm({ conditions: {}, mood: null, asking: 'other', ...answer }), knowledge },
    { turns: [{ role: 'assistant', text: '어서 오세요! 몇 분이서 오셨어요?' }, { role: 'user', text: userText }], conditions, context: {} },
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
