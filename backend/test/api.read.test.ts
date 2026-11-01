import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MenuResponse, QuestionsResponse, RecommendationResponse } from '../src/contracts.js';
import { parseEngine } from '../src/engine.js';
import { makeApp } from './app-helpers.js';
import { resetDb, seedFixture } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  await resetDb();
  await seedFixture();
  app = await makeApp();
});
afterAll(() => app.close());

const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });

describe('GET /api/health', () => {
  it('200 { ok: true }', async () => {
    const r = await app.inject('/api/health');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });
});

describe('GET /api/menu', () => {
  it('가게 이름, 카테고리, 판매 중인 메뉴를 정렬해서 돌려준다', async () => {
    const r = await app.inject('/api/menu');
    expect(r.statusCode).toBe(200);
    const body = r.json<MenuResponse>();
    expect(body.storeName).toBe('테스트 식당');
    expect(body.categories).toEqual([
      { id: 'stew', name: '찌개', sortOrder: 1 },
      { id: 'rice', name: '밥', sortOrder: 2 },
      { id: 'noodle', name: '면', sortOrder: 3 },
    ]);
    expect(body.items.map((i) => i.id)).toEqual(['m001', 'm002', 'm003', 'm004', 'm005', 'm007']);
  });

  it('품절 메뉴는 빼고, isAvailable 필드는 보내지 않는다', async () => {
    const body = (await app.inject('/api/menu')).json<MenuResponse>();
    expect(body.items.find((i) => i.id === 'm006')).toBeUndefined();
    expect(body.items[0]).toEqual({
      id: 'm001', name: '된장찌개', price: 9000, categoryId: 'stew', description: '구수한 찌개',
      imageUrl: null, tags: ['mild', 'soup', 'soft'], priority: 0, sortOrder: 1,
    });
  });

  it('image가 있으면 /static/ 경로로, 없으면 null', async () => {
    const body = (await app.inject('/api/menu')).json<MenuResponse>();
    expect(body.items.find((i) => i.id === 'm007')?.imageUrl).toBe('/static/menu-images/m007.jpg');
    expect(body.items.find((i) => i.id === 'm002')?.imageUrl).toBeNull();
  });

  it('tags는 태그 목록 순서로 돌려준다', async () => {
    const body = (await app.inject('/api/menu')).json<MenuResponse>();
    expect(body.items.find((i) => i.id === 'm002')?.tags).toEqual(['spicy', 'soup']);
  });
});

describe('GET /api/questions', () => {
  it('질문 5개를 order 오름차순으로', async () => {
    const r = await app.inject('/api/questions');
    expect(r.statusCode).toBe(200);
    expect(r.json<QuestionsResponse>().questions).toEqual([
      { id: 'q_spicy', order: 1, text: '매운 음식도 괜찮으세요?' },
      { id: 'q_soup', order: 2, text: '따뜻한 국물 요리가 좋으세요?' },
      { id: 'q_soft', order: 3, text: '부드러운 음식이 좋으세요?' },
      { id: 'q_hearty', order: 4, text: '든든하게 드시고 싶으세요?' },
      { id: 'q_light', order: 5, text: '담백한 맛이 좋으세요?' },
    ]);
  });
});

describe('POST /api/recommendations', () => {
  it('답에 맞춰 3개를 점수, 이유와 함께 돌려준다', async () => {
    const r = await post('/api/recommendations', {
      answers: [
        { questionId: 'q_spicy', answer: 'no' },
        { questionId: 'q_soup', answer: 'yes' },
        { questionId: 'q_soft', answer: 'yes' },
        { questionId: 'q_hearty', answer: 'skip' },
      ],
    });
    expect(r.statusCode).toBe(200);
    const items = r.json<RecommendationResponse>().items;
    // m001, m005: soup 2 + mild 1 + soft 2 = 5 (sortOrder 같음 → id) / m003: mild 1 / m002: soup 2 - 3 + 0.5 = -0.5
    expect(items.map((i) => [i.menu.id, i.score, i.reasons])).toEqual([
      ['m001', 5, ['soup', 'soft', 'mild']],
      ['m005', 5, ['soup', 'soft', 'mild']],
      ['m003', 1, ['mild']],
    ]);
  });

  it('빈 배열도 허용하고 priority만으로 3개를 고른다 (품절 제외)', async () => {
    const r = await post('/api/recommendations', { answers: [] });
    expect(r.statusCode).toBe(200);
    expect(r.json<RecommendationResponse>().items.map((i) => i.menu.id)).toEqual(['m002', 'm001', 'm003']);
  });

  it('v2: 세 연령대 추천(byAgeBand)과 engineVersion을 함께 돌려준다', async () => {
    const r = await post('/api/recommendations', { answers: [{ questionId: 'q_soup', answer: 'yes' }] });
    expect(r.statusCode).toBe(200);
    const body = r.json<RecommendationResponse>();
    expect(Object.keys(body.byAgeBand).sort()).toEqual(['35to54', '55plus', 'under35']);
    for (const band of ['under35', '35to54', '55plus'] as const) {
      expect(body.byAgeBand[band]).toHaveLength(3);
    }
    expect(typeof body.engineVersion).toBe('string');
  });

  it('v2: 엔진 파일이 없으면 세 연령대 모두 items와 같고 engineVersion은 "none"', async () => {
    const r = await post('/api/recommendations', { answers: [{ questionId: 'q_spicy', answer: 'no' }] });
    const body = r.json<RecommendationResponse>();
    expect(body.byAgeBand.under35).toEqual(body.items);
    expect(body.byAgeBand['35to54']).toEqual(body.items);
    expect(body.byAgeBand['55plus']).toEqual(body.items);
    expect(body.engineVersion).toBe('none');
  });

  it('같은 questionId가 두 번 오면 400 VALIDATION_FAILED', async () => {
    const r = await post('/api/recommendations', {
      answers: [{ questionId: 'q_soup', answer: 'yes' }, { questionId: 'q_soup', answer: 'no' }],
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({
      error: { code: 'VALIDATION_FAILED', message: '주문 내용을 확인하지 못했어요. 처음부터 다시 해 주세요.' },
    });
  });

  it.each([
    ['answers 없음', {}],
    ['answers가 배열이 아님', { answers: 'yes' }],
    ['없는 questionId', { answers: [{ questionId: 'q_age', answer: 'yes' }] }],
    ['잘못된 answer', { answers: [{ questionId: 'q_soup', answer: 'maybe' }] }],
  ])('%s → 400 VALIDATION_FAILED', async (_, body) => {
    const r = await post('/api/recommendations', body);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: { code: 'VALIDATION_FAILED', message: expect.any(String) } });
  });

  it('JSON 문법이 틀리면 400 VALIDATION_FAILED', async () => {
    const r = await app.inject({
      method: 'POST', url: '/api/recommendations', headers: { 'content-type': 'application/json' }, payload: '{"answers": [',
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_FAILED');
  });
});

describe('에러 형식', () => {
  it('서버 오류는 500 INTERNAL, 내부 메시지는 숨긴다', async () => {
    const reject = () => Promise.reject(new Error('secret detail'));
    const failingPrisma = new Proxy({}, { get: () => new Proxy({}, { get: () => reject }) }) as never;
    const broken = await makeApp({ prisma: failingPrisma });
    const r = await broken.inject('/api/menu');
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ error: { code: 'INTERNAL', message: '잠시 문제가 생겼어요. 다시 시도해 주세요.' } });
    expect(r.body).not.toContain('secret');
    await broken.close();
  });
});

describe('POST /api/recommendations + 엔진 (v2)', () => {
  const parsed = parseEngine({
    engineVersion: '2026-10-30-test',
    weights: { ageFit: 2, reputation: 2 },
    menus: [
      // 된장찌개(m001): 55+에게 잘 맞음, 비빔밥(m003): 35세 미만에게 잘 맞음
      { menuName: '된장찌개', features: {}, ageFit: { under35: 0, '35to54': 0.5, '55plus': 1 }, reputation: 0.5, reviewCount: 10, adFilteredCount: 0 },
      { menuName: '비빔밥', features: {}, ageFit: { under35: 1, '35to54': 0.5, '55plus': 0 }, reputation: 0.5, reviewCount: 10, adFilteredCount: 0 },
    ],
  });
  if (!parsed.ok) throw new Error(parsed.errors.join());
  let engineApp: FastifyInstance;
  beforeAll(async () => { engineApp = await makeApp({ engine: parsed.engine }); });
  afterAll(() => engineApp.close());

  it('연령대마다 엔진의 연령대 적합 점수를 반영하고, items는 연령대 없이 계산한다', async () => {
    const r = await engineApp.inject({ method: 'POST', url: '/api/recommendations', payload: { answers: [] } });
    const body = r.json<RecommendationResponse>();
    expect(body.engineVersion).toBe('2026-10-30-test');
    const top = (list: { menu: { id: string }; score: number }[]) => list.map((i) => [i.menu.id, i.score]);
    expect(top(body.items)).toEqual([['m002', 0.5], ['m001', 0], ['m003', 0]]);
    expect(top(body.byAgeBand['55plus'])).toEqual([['m001', 1], ['m002', 0.5], ['m005', 0]]);
    expect(top(body.byAgeBand.under35)).toEqual([['m003', 1], ['m002', 0.5], ['m005', 0]]);
    expect(top(body.byAgeBand['35to54'])).toEqual(top(body.items));
  });
});
