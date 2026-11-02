import { describe, expect, it } from 'vitest';
import { converse, describeContext, extractConditions, MAX_TURNS, systemPrompt, type LlmClient } from '../src/chat.js';
import { fromData, loadMenuKnowledge } from '../src/menuKnowledge.js';

const knowledge = fromData(
  [
    { id: 'noodle-1', name: '짬뽕', price: 11000, category: 'noodle', kind: '면', spicy: 2, servingPeople: 1, quantityUnit: '1그릇', ingredients: ['해산물', '돼지고기'], texture: [], keywords: ['짬뽕'] },
    { id: 'dimsum-1', name: '모듬 딤섬', price: 19500, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 3, quantityUnit: '8개입', ingredients: [], texture: [], badge: '대표' },
    { id: 'soup-1', name: '산라탕', price: 15000, category: 'soup', kind: '스프/탕', spicy: 1, servingPeople: 2, quantityUnit: '1그릇', ingredients: ['계란', '두부'], texture: [], soldOut: true },
  ],
  new Map([['dimsum-1', { id: 'dimsum-1', keywords: ['부드러움', '육즙', '최고·강추'], reviews: [{ quote: '소룡포 육즙이 가득해요', summary: '육즙 가득' }] }]]),
);

function fakeLlm(answer: object | string, capture?: { system?: string; messages?: unknown[] }): LlmClient {
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
    const p = systemPrompt(knowledge, { timeOfDay: 'evening', weather: { tempC: 9, code: 61, label: '비', rainy: true, cold: false, hot: false }, crowd: 'high' }, 0);
    expect(p).toContain('날씨: 비, 9도 (비·눈 오는 날)');
    expect(p).toContain('시간대: 저녁');
    expect(p).toContain('붐빔');
    expect(p).toContain('noodle-1 | 짬뽕');
    expect(p).not.toContain('soup-1');
  });
  it('상황이 없으면 그렇다고 적는다', () => {
    expect(describeContext({})).toBe('상황 정보 없음');
  });
});

describe('converse', () => {
  it('LLM이 없으면 CHAT_UNAVAILABLE', async () => {
    await expect(converse({ llm: null, knowledge }, { turns: [], conditions: {}, context: {} })).rejects.toMatchObject({ code: 'CHAT_UNAVAILABLE', status: 503 });
  });

  it('첫 인사: 대화가 비어 있으면 시작 신호를 보내고 답을 정리한다', async () => {
    const cap: { system?: string; messages?: any[] } = {};
    const res = await converse(
      { llm: fakeLlm({ reply: '비 오는 저녁이네요! 몇 분이세요?', conditions: { party: 1, spicy: null, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null }, mood: null, picks: [], done: false }, cap) , knowledge },
      { turns: [], conditions: {}, context: { timeOfDay: 'evening' } },
    );
    expect(res.reply).toBe('비 오는 저녁이네요! 몇 분이세요?');
    expect(res.done).toBe(false);
    expect(res.picks).toEqual([]);
    expect(cap.messages?.[0]).toMatchObject({ role: 'user' });
    expect(String(cap.messages?.[0].text)).toContain('대화 시작');
  });

  it('done이면 picks는 메뉴 지식 안의 id만, 최대 3개', async () => {
    const res = await converse(
      { llm: fakeLlm({ reply: '네!', conditions: { party: 2, spicy: 2, kind: '면', texture: '상관없음', exclude: [], budget: null, totalBudget: null }, mood: 'tired', picks: ['noodle-1', 'ghost', 'dimsum-1', 'soup-1', 'noodle-1'], done: true }), knowledge },
      { turns: [{ role: 'assistant', text: '몇 분?' }, { role: 'user', text: '둘이요 매운 거' }], conditions: { party: 2 }, context: {} },
    );
    expect(res.done).toBe(true);
    expect(res.picks).toEqual(['noodle-1', 'dimsum-1', 'soup-1']);
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
