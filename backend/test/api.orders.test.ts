import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Order } from '../src/contracts.js';
import { makeApp } from './app-helpers.js';
import { resetDb, seedFixture, testPrisma } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
beforeEach(async () => { await resetDb(); await seedFixture(); });
afterAll(() => app.close());

const order = (payload: unknown) => app.inject({ method: 'POST', url: '/api/orders', payload: payload as object });

describe('POST /api/orders', () => {
  it('201, 가격은 서버가 DB 기준으로 계산한다', async () => {
    const r = await order({ orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 2 }, { menuId: 'm004', quantity: 1 }] });
    expect(r.statusCode).toBe(201);
    const o = r.json<Order>();
    expect(o).toEqual({
      orderId: expect.any(String),
      orderType: 'dine_in',
      status: 'pending_payment',
      lines: [
        { menuId: 'm001', name: '된장찌개', unitPrice: 9000, quantity: 2, lineTotal: 18000 },
        { menuId: 'm004', name: '제육덮밥', unitPrice: 11000, quantity: 1, lineTotal: 11000 },
      ],
      totalAmount: 29000,
      orderNumber: null,
      paidAt: null,
    });
    const saved = await testPrisma.order.findUnique({ where: { id: o.orderId }, include: { items: true } });
    expect(saved?.totalAmount).toBe(29000);
    expect(saved?.items).toHaveLength(2);
  });

  it('클라이언트가 보낸 가격은 무시한다', async () => {
    const r = await order({ orderType: 'takeout', items: [{ menuId: 'm001', quantity: 1, price: 1, unitPrice: 1 }], totalAmount: 1 });
    expect(r.statusCode).toBe(201);
    expect(r.json<Order>().totalAmount).toBe(9000);
    expect(r.json<Order>().orderType).toBe('takeout');
  });

  it('같은 menuId가 여러 줄이면 처음 나온 자리에 합친다', async () => {
    const r = await order({
      orderType: 'dine_in',
      items: [{ menuId: 'm003', quantity: 1 }, { menuId: 'm001', quantity: 1 }, { menuId: 'm003', quantity: 2 }],
    });
    expect(r.statusCode).toBe(201);
    expect(r.json<Order>().lines.map((l) => [l.menuId, l.quantity, l.lineTotal])).toEqual([
      ['m003', 3, 30000],
      ['m001', 1, 9000],
    ]);
  });

  it('합친 수량이 9를 넘으면 400 VALIDATION_FAILED', async () => {
    const r = await order({ orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 5 }, { menuId: 'm001', quantity: 5 }] });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_FAILED');
  });

  it.each([
    ['quantity 0', { orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 0 }] }],
    ['quantity 10', { orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 10 }] }],
    ['quantity 소수', { orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 2.5 }] }],
    ['quantity 문자열', { orderType: 'dine_in', items: [{ menuId: 'm001', quantity: '2' }] }],
    ['quantity 없음', { orderType: 'dine_in', items: [{ menuId: 'm001' }] }],
    ['menuId 없음', { orderType: 'dine_in', items: [{ quantity: 1 }] }],
    ['items 0줄', { orderType: 'dine_in', items: [] }],
    ['items 21줄', { orderType: 'dine_in', items: Array.from({ length: 21 }, () => ({ menuId: 'm001', quantity: 1 })) }],
    ['orderType 틀림', { orderType: 'delivery', items: [{ menuId: 'm001', quantity: 1 }] }],
    ['orderType 없음', { items: [{ menuId: 'm001', quantity: 1 }] }],
  ])('%s → 400 VALIDATION_FAILED, 주문은 만들지 않는다', async (_, body) => {
    const r = await order(body);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: { code: 'VALIDATION_FAILED', message: expect.any(String) } });
    expect(await testPrisma.order.count()).toBe(0);
  });

  it('items 20줄은 허용한다', async () => {
    const ids = ['m001', 'm002', 'm003', 'm004', 'm005'];
    const r = await order({ orderType: 'dine_in', items: Array.from({ length: 20 }, (_, i) => ({ menuId: ids[i % 5], quantity: 1 })) });
    expect(r.statusCode).toBe(201);
  });

  it('없는 메뉴는 400 MENU_NOT_FOUND', async () => {
    const r = await order({ orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 1 }, { menuId: 'nope', quantity: 1 }] });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('MENU_NOT_FOUND');
    expect(await testPrisma.order.count()).toBe(0);
  });

  it('품절 메뉴는 409 MENU_UNAVAILABLE', async () => {
    const r = await order({ orderType: 'dine_in', items: [{ menuId: 'm006', quantity: 1 }] });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({
      error: { code: 'MENU_UNAVAILABLE', message: '다 팔린 메뉴가 있어요. 담은 메뉴에서 빼고 다시 주문해 주세요.' },
    });
    expect(await testPrisma.order.count()).toBe(0);
  });
});
