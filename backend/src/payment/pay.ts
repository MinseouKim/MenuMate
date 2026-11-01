import type { PrismaClient } from '@prisma/client';
import type { PaymentRequest, PaymentResponse } from '../contracts.js';
import { AppError } from '../errors.js';
import { nextOrderNumber } from '../orderNumber.js';
import { getOrderView, toOrderView } from '../orders.js';
import { localDateKey } from '../time.js';
import type { PaymentGateway } from './gateway.js';

export const paymentSchema = {
  body: {
    type: 'object',
    required: ['method'],
    properties: {
      method: { type: 'string', enum: ['card_simulated'] },
      simulate: { type: 'string', enum: ['success', 'fail'] },
    },
  },
} as const;

export interface PayDeps {
  prisma: PrismaClient;
  gateway: PaymentGateway;
  now: () => Date;
}

/** api.md POST /api/orders/:orderId/payment */
export async function payOrder(deps: PayDeps, orderId: string, req: PaymentRequest): Promise<PaymentResponse> {
  const { prisma, gateway, now } = deps;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('ORDER_NOT_FOUND', orderId);
  if (order.status === 'paid') throw new AppError('ORDER_ALREADY_PAID', orderId);

  // 지연이 있는 게이트웨이 호출은 트랜잭션 밖에서 한다
  const result = await gateway.pay({ orderId, amount: order.totalAmount, simulate: req.simulate });

  if (result.result === 'fail') {
    await prisma.paymentAttempt.create({ data: { orderId, method: req.method, result: 'fail', reason: result.reason, createdAt: now() } });
    const view = await getOrderView(prisma, orderId);
    return { result: 'fail', reason: result.reason, order: view! };
  }

  const paidAt = now();
  const paid = await prisma.$transaction(async (tx) => {
    // 아직 결제 전인 주문만 선점한다. 동시에 온 다른 요청이 먼저 바꿨으면 0건
    const claimed = await tx.order.updateMany({ where: { id: orderId, status: 'pending_payment' }, data: { status: 'paid' } });
    if (claimed.count === 0) throw new AppError('ORDER_ALREADY_PAID', orderId);
    const dateKey = localDateKey(paidAt);
    const orderNumber = await nextOrderNumber(tx, dateKey);
    await tx.paymentAttempt.create({ data: { orderId, method: req.method, result: 'success', createdAt: paidAt } });
    return tx.order.update({
      where: { id: orderId },
      data: { orderNumber, orderDateKey: dateKey, paidAt },
      include: { items: true },
    });
  });
  return { result: 'success', order: toOrderView(paid) };
}
