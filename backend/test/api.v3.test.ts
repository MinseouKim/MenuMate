import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LlmClient } from '../src/chat.js';
import { fromData } from '../src/menuKnowledge.js';
import type { Synthesizer } from '../src/tts.js';
import { makeApp } from './app-helpers.js';
import { fixtureMenu, resetDb, testPrisma } from './helpers.js';
import { seedMenu } from '../src/seed/seed.js';

const knowledge = fromData([
  { id: 'noodle-1', name: '짬뽕', price: 11000, category: 'noodle', kind: '면', spicy: 2, servingPeople: 1, quantityUnit: '1그릇', ingredients: [], texture: [] },
]);
const llm: LlmClient = {
  model: 'fake',
  async generateJson() {
    return JSON.stringify({ reply: '몇 분이세요?', conditions: { party: 1, spicy: null, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null }, mood: null, picks: [], done: false });
  },
};
const synthesizer: Synthesizer = { available: true, cacheHits: 0, async speak() { return Buffer.from('mp3'); } };
const weather = { async current() { return { tempC: 20, code: 0, label: '맑음', rainy: false, cold: false, hot: false }; } };

describe('v3 API', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await makeApp({ llm, knowledge, synthesizer, weather, now: () => new Date('2026-11-02T19:30:00+09:00') });
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetDb();
    await seedMenu(testPrisma, fixtureMenu());
  });

  it('CORS 헤더를 붙인다', async () => {
    const r = await app.inject({ method: 'OPTIONS', url: '/api/context', headers: { origin: 'https://menumate-dl.vercel.app', 'access-control-request-method': 'GET' } });
    expect(r.statusCode).toBeLessThan(300);
    expect(r.headers['access-control-allow-origin']).toBe('https://menumate-dl.vercel.app');
  });

  it('GET /api/context — 시간대·날씨·혼잡도', async () => {
    const r = await app.inject('/api/context');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ timeOfDay: 'evening', hour: 19, weather: { tempC: 20, code: 0, label: '맑음', rainy: false, cold: false, hot: false }, crowd: 'low', recentOrders: 0 });
  });

  it('혼잡도는 최근 결제 완료 주문 수로', async () => {
    const paidAt = new Date('2026-11-02T19:20:00+09:00');
    for (let i = 0; i < 5; i++) {
      await testPrisma.order.create({ data: { id: `o${i}`, orderType: 'dine_in', status: 'paid', totalAmount: 1000, orderNumber: `00${i}`, paidAt } });
    }
    await testPrisma.order.create({ data: { id: 'old', orderType: 'dine_in', status: 'paid', totalAmount: 1000, orderNumber: '999', paidAt: new Date('2026-11-02T18:00:00+09:00') } });
    const r = await app.inject('/api/context');
    expect(r.json()).toMatchObject({ crowd: 'high', recentOrders: 5 });
  });

  it('POST /api/tts — audio/mpeg', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/tts', payload: { text: '어서 오세요' } });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('audio/mpeg');
    expect(r.body).toBe('mp3');
  });

  it('POST /api/tts — 빈 문장은 400', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/tts', payload: { text: '' } });
    expect(r.statusCode).toBe(400);
  });

  it('POST /api/chat — 답변과 조건', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/chat', payload: { turns: [], conditions: {}, context: {} } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ reply: '몇 분이세요?', done: false, picks: [], model: 'fake' });
  });

  it('POST /api/chat — turns 형식이 틀리면 400', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/chat', payload: { turns: [{ role: 'robot', text: 'x' }] } });
    expect(r.statusCode).toBe(400);
  });

  it('키가 없으면 503과 손님용 메시지', async () => {
    const bare = await makeApp({ llm: null, knowledge, synthesizer: { available: false, cacheHits: 0, async speak() { throw new (await import('../src/errors.js')).AppError('TTS_UNAVAILABLE'); } }, weather });
    const chat = await bare.inject({ method: 'POST', url: '/api/chat', payload: { turns: [] } });
    expect(chat.statusCode).toBe(503);
    expect(chat.json().error.code).toBe('CHAT_UNAVAILABLE');
    const tts = await bare.inject({ method: 'POST', url: '/api/tts', payload: { text: '안녕' } });
    expect(tts.statusCode).toBe(503);
    expect(tts.json().error.code).toBe('TTS_UNAVAILABLE');
    await bare.close();
  });
});
