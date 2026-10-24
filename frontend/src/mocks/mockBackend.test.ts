import { beforeEach, describe, expect, it } from 'vitest';
import type { Order, Recommendation } from '../api/contracts';
import { createMockBackend, type MockBackend } from './mockBackend';

let api: MockBackend;
beforeEach(() => { api = createMockBackend({ payDelayMs: 0 }); });

const recommend = async (answers: unknown[]) =>
  (await api.handle('POST', '/api/recommendations', { answers })).body as { items: Recommendation[] };

describe('가짜 Backend (api.md, questions.md)', () => {
  it('질문 4개를 order 순으로 준다', async () => {
    const res = await api.handle('GET', '/api/questions', null);
    expect((res.body as { questions: { id: string }[] }).questions.map(q => q.id))
      .toEqual(['q_spicy', 'q_soup', 'q_soft', 'q_hearty']);
  });

  it('답이 없으면 priority 순으로 3개, store_pick 이유', async () => {
    const { items } = await recommend([]);
    expect(items).toHaveLength(3);
    expect(items[0].menu.priority).toBeGreaterThan(0);
    expect(items[0].reasons).toContain('store_pick');
  });

  it('맵지 않고 국물·부드러운 것을 원하면 그 태그가 이유로 붙는다', async () => {
    const { items } = await recommend([
      { questionId: 'q_spicy', answer: 'no' }, { questionId: 'q_soup', answer: 'yes' },
      { questionId: 'q_soft', answer: 'yes' }, { questionId: 'q_hearty', answer: 'no' },
    ]);
    expect(items[0].menu.tags).not.toContain('spicy');
    expect(items[0].reasons).toEqual(expect.arrayContaining(['soup', 'soft']));
  });

  it('같은 questionId가 두 번이면 VALIDATION_FAILED', async () => {
    const res = await api.handle('POST', '/api/recommendations', {
      answers: [{ questionId: 'q_soup', answer: 'yes' }, { questionId: 'q_soup', answer: 'no' }],
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('수량 10이면 400, 가격은 서버가 계산', async () => {
    expect((await api.handle('POST', '/api/orders', { orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 10 }] })).status).toBe(400);
    const res = await api.handle('POST', '/api/orders', { orderType: 'dine_in', items: [{ menuId: 'm001', quantity: 2 }, { menuId: 'm001', quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'pending_payment', lines: [{ menuId: 'm001', quantity: 3 }], orderNumber: null });
  });

  it('결제 실패 뒤 같은 orderId로 다시 결제하면 주문번호 001', async () => {
    const order = (await api.handle('POST', '/api/orders', { orderType: 'takeout', items: [{ menuId: 'm002', quantity: 1 }] })).body as Order;
    const fail = await api.handle('POST', `/api/orders/${order.orderId}/payment`, { method: 'card_simulated', simulate: 'fail' });
    expect(fail.body).toMatchObject({ result: 'fail', order: { status: 'pending_payment' } });
    const ok = await api.handle('POST', `/api/orders/${order.orderId}/payment`, { method: 'card_simulated' });
    expect(ok.body).toMatchObject({ result: 'success', order: { status: 'paid', orderNumber: '001' } });
    const again = await api.handle('POST', `/api/orders/${order.orderId}/payment`, { method: 'card_simulated' });
    expect(again).toMatchObject({ status: 409, body: { error: { code: 'ORDER_ALREADY_PAID' } } });
  });

  it('없는 주문은 ORDER_NOT_FOUND', async () => {
    expect(await api.handle('POST', '/api/orders/nope/payment', {})).toMatchObject({ status: 404 });
  });
});
