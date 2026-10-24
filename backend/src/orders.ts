import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { CreateOrderRequest, Order, OrderType } from './contracts.js';
import { AppError } from './errors.js';
import { toLocalIso } from './time.js';

export const MAX_QUANTITY = 9;
export const MAX_LINES = 20;

export const createOrderSchema = {
  body: {
    type: 'object',
    required: ['orderType', 'items'],
    properties: {
      orderType: { type: 'string', enum: ['dine_in', 'takeout'] },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_LINES,
        items: {
          type: 'object',
          required: ['menuId', 'quantity'],
          properties: {
            menuId: { type: 'string', minLength: 1 },
            quantity: { type: 'integer', minimum: 1, maximum: MAX_QUANTITY },
          },
        },
      },
    },
  },
} as const;

type OrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>;

export function toOrderView(o: OrderRow): Order {
  return {
    orderId: o.id,
    orderType: o.orderType as OrderType,
    status: o.status as Order['status'],
    lines: [...o.items]
      .sort((a, b) => a.lineNo - b.lineNo)
      .map(({ menuId, name, unitPrice, quantity, lineTotal }) => ({ menuId, name, unitPrice, quantity, lineTotal })),
    totalAmount: o.totalAmount,
    orderNumber: o.orderNumber,
    paidAt: o.paidAt ? toLocalIso(o.paidAt) : null,
  };
}

export async function getOrderView(prisma: PrismaClient | Prisma.TransactionClient, orderId: string): Promise<Order | null> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  return o ? toOrderView(o) : null;
}

/** 같은 menuId는 처음 나온 자리에 합치고, 가격은 DB 값으로 계산한다 (api.md POST /api/orders) */
export async function createOrder(prisma: PrismaClient, input: CreateOrderRequest): Promise<Order> {
  const merged = new Map<string, number>();
  for (const { menuId, quantity } of input.items) merged.set(menuId, (merged.get(menuId) ?? 0) + quantity);
  for (const q of merged.values()) {
    if (q > MAX_QUANTITY) throw new AppError('VALIDATION_FAILED', `수량 합계가 ${MAX_QUANTITY}를 넘음`);
  }

  const menus = await prisma.menu.findMany({ where: { id: { in: [...merged.keys()] } } });
  const byId = new Map(menus.map((m) => [m.id, m]));
  const lines = [...merged].map(([menuId, quantity], i) => {
    const menu = byId.get(menuId);
    if (!menu) throw new AppError('MENU_NOT_FOUND', menuId);
    if (!menu.isAvailable) throw new AppError('MENU_UNAVAILABLE', menuId);
    return { lineNo: i + 1, menuId, name: menu.name, unitPrice: menu.price, quantity, lineTotal: menu.price * quantity };
  });

  const created = await prisma.order.create({
    data: {
      id: randomUUID(),
      orderType: input.orderType,
      status: 'pending_payment',
      totalAmount: lines.reduce((s, l) => s + l.lineTotal, 0),
      items: { create: lines },
    },
    include: { items: true },
  });
  return toOrderView(created);
}
