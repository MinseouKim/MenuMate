import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Order, PaymentResponse } from '../src/contracts.js';
import { SimulatedPaymentGateway, FAIL_REASON } from '../src/payment/gateway.js';
import { makeApp, testConfig } from './app-helpers.js';
import { resetDb, seedFixture, testPrisma } from './helpers.js';

let clock = new Date('2026-10-24T07:00:00Z'); // 16:00 KST
const now = () => clock;
let apps: FastifyInstance[] = [];

async function app(overrides: Parameters<typeof makeApp>[0] = {}) {
  const a = await makeApp({ now, ...overrides });
  apps.push(a);
  return a;
}

async function newOrder(a: FastifyInstance): Promise<string> {
  const r = await a.inject({ method: 'POST', url: '/api/orders', payload: { orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 2 }] } });
  return r.json<Order>().orderId;
}

const pay = (a: FastifyInstance, orderId: string, payload: object = { method: 'card_simulated' }) =>
  a.inject({ method: 'POST', url: `/api/orders/${orderId}/payment`, payload });

beforeEach(async () => {
  clock = new Date('2026-10-24T07:00:00Z');
  await resetDb();
  await seedFixture();
});
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

describe('POST /api/orders/:orderId/payment', () => {
  it('성공하면 paid, 주문번호 001, paidAt은 로컬 ISO', async () => {
    const a = await app();
    const id = await newOrder(a);
    const r = await pay(a, id, { method: 'card_simulated', simulate: 'success' });
    expect(r.statusCode).toBe(200);
    expect(r.json<PaymentResponse>()).toEqual({
      result: 'success',
      order: {
        orderId: id, orderType: 'dine_in', status: 'paid',
        lines: [{ menuId: 'm001', name: '된장찌개', unitPrice: 9000, quantity: 2, lineTotal: 18000 }],
        totalAmount: 18000, orderNumber: '001', paidAt: '2026-10-24T16:00:00+09:00',
      },
    });
  });

  it('주문번호는 결제 성공 순서대로 1씩 오른다', async () => {
    const a = await app();
    const first = await newOrder(a);
    const second = await newOrder(a);
    expect((await pay(a, second)).json<PaymentResponse>().order.orderNumber).toBe('001');
    expect((await pay(a, first)).json<PaymentResponse>().order.orderNumber).toBe('002');
  });

  it('실패하면 200 fail + reason, 주문은 pending_payment로 남고 같은 주문으로 다시 결제할 수 있다', async () => {
    const a = await app();
    const id = await newOrder(a);
    const fail = await pay(a, id, { method: 'card_simulated', simulate: 'fail' });
    expect(fail.statusCode).toBe(200);
    expect(fail.json()).toEqual({
      result: 'fail',
      reason: '카드 승인이 되지 않았어요.',
      order: expect.objectContaining({ orderId: id, status: 'pending_payment', orderNumber: null, paidAt: null, totalAmount: 18000 }),
    });
    const retry = await pay(a, id, { method: 'card_simulated', simulate: 'success' });
    expect(retry.json<PaymentResponse>()).toMatchObject({ result: 'success', order: { status: 'paid', orderNumber: '001' } });
  });

  it('결제 시도마다 결과와 시각을 기록한다', async () => {
    const a = await app();
    const id = await newOrder(a);
    await pay(a, id, { method: 'card_simulated', simulate: 'fail' });
    await pay(a, id, { method: 'card_simulated', simulate: 'success' });
    const attempts = await testPrisma.paymentAttempt.findMany({ where: { orderId: id }, orderBy: { id: 'asc' } });
    expect(attempts.map((x) => [x.method, x.result, x.reason])).toEqual([
      ['card_simulated', 'fail', FAIL_REASON],
      ['card_simulated', 'success', null],
    ]);
    expect(attempts.every((x) => x.createdAt instanceof Date)).toBe(true);
  });

  it('simulate를 생략하면 PAYMENT_SIM_RESULT를 따른다', async () => {
    const a = await app({ config: testConfig({ PAYMENT_SIM_RESULT: 'fail' }) });
    const id = await newOrder(a);
    expect((await pay(a, id)).json().result).toBe('fail');
    expect((await pay(a, id, { method: 'card_simulated', simulate: 'success' })).json().result).toBe('success');
  });

  it('이미 결제된 주문은 409 ORDER_ALREADY_PAID, 번호를 다시 발급하지 않는다', async () => {
    const a = await app();
    const id = await newOrder(a);
    await pay(a, id);
    const again = await pay(a, id);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: { code: 'ORDER_ALREADY_PAID', message: '이미 결제가 끝난 주문이에요.' } });
    expect((await testPrisma.dailyOrderCounter.findUnique({ where: { dateKey: '2026-10-24' } }))?.lastNumber).toBe(1);
  });

  it('없는 주문은 404 ORDER_NOT_FOUND', async () => {
    const a = await app();
    const r = await pay(a, 'no-such-order');
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: { code: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없어요. 처음부터 다시 해 주세요.' } });
  });

  it.each([
    ['method 없음', {}],
    ['method 틀림', { method: 'cash' }],
    ['simulate 틀림', { method: 'card_simulated', simulate: 'maybe' }],
  ])('%s → 400 VALIDATION_FAILED', async (_, body) => {
    const a = await app();
    const id = await newOrder(a);
    const r = await pay(a, id, body);
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_FAILED');
    expect(await testPrisma.paymentAttempt.count()).toBe(0);
  });
});

describe('주문번호 규칙 (D43)', () => {
  it('999 다음은 001', async () => {
    await testPrisma.dailyOrderCounter.create({ data: { dateKey: '2026-10-24', lastNumber: 998 } });
    const a = await app();
    expect((await pay(a, await newOrder(a))).json<PaymentResponse>().order.orderNumber).toBe('999');
    expect((await pay(a, await newOrder(a))).json<PaymentResponse>().order.orderNumber).toBe('001');
  });

  it('로컬 날짜가 바뀌면 001부터 다시 시작한다', async () => {
    const a = await app();
    clock = new Date('2026-10-24T14:59:00Z'); // 23:59 KST
    expect((await pay(a, await newOrder(a))).json<PaymentResponse>().order.orderNumber).toBe('001');
    expect((await pay(a, await newOrder(a))).json<PaymentResponse>().order.orderNumber).toBe('002');
    clock = new Date('2026-10-24T15:00:00Z'); // 다음 날 00:00 KST
    const r = (await pay(a, await newOrder(a))).json<PaymentResponse>();
    expect(r.order.orderNumber).toBe('001');
    expect(r.order.paidAt).toBe('2026-10-25T00:00:00+09:00');
  });

  it('서버를 다시 켜도 그날 번호가 이어진다', async () => {
    const a = await app();
    await pay(a, await newOrder(a));
    await a.close();
    apps = apps.filter((x) => x !== a);
    const b = await app();
    expect((await pay(b, await newOrder(b))).json<PaymentResponse>().order.orderNumber).toBe('002');
  });

  it('같은 주문에 결제가 동시에 두 번 와도 번호는 한 번만 발급된다', async () => {
    const slow = new SimulatedPaymentGateway({ defaultResult: 'success', delayMs: 30 });
    const a = await app({ gateway: slow });
    const id = await newOrder(a);
    const [r1, r2] = await Promise.all([pay(a, id), pay(a, id)]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 409]);
    expect((await testPrisma.dailyOrderCounter.findUnique({ where: { dateKey: '2026-10-24' } }))?.lastNumber).toBe(1);
  });
});

describe('SimulatedPaymentGateway', () => {
  it('설정된 지연 시간만큼 기다린 뒤 결과를 돌려준다', async () => {
    const waits: number[] = [];
    const g = new SimulatedPaymentGateway({ defaultResult: 'success', delayMs: 1500, sleep: async (ms) => { waits.push(ms); } });
    expect(await g.pay({ orderId: 'o', amount: 1000 })).toEqual({ result: 'success' });
    expect(await g.pay({ orderId: 'o', amount: 1000, simulate: 'fail' })).toEqual({ result: 'fail', reason: FAIL_REASON });
    expect(waits).toEqual([1500, 1500]);
  });
});
