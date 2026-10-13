// 영수증을 QR 주소에 담아 휴대폰에서 열어 보게 합니다. 서버에 저장하지 않고 주소 안에 주문 내용만 넣습니다.
import type { Menu } from './types';
import type { Order } from './Receipt';

interface Payload { v: 1; n: string; t: number; i: ([string, number, number] | [string, number, number, string])[]; m?: string; a?: number; d?: '매장' | '포장' }

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export function encodeOrder(order: Order): string {
  const payload: Payload = { v: 1, n: order.number, t: Math.floor(order.paidAt.getTime() / 1000), i: order.items.map(i => (i.option ? [i.id, i.quantity, i.price, i.option] : [i.id, i.quantity, i.price])) };
  if (order.payment) { payload.m = order.payment.method; payload.a = order.payment.amount; payload.d = order.payment.dine; }
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeOrder(code: string, menus: Menu[]): Order | null {
  try {
    const p = JSON.parse(new TextDecoder().decode(fromBase64Url(code))) as Payload;
    if (p.v !== 1 || !Array.isArray(p.i)) return null;
    const items = p.i.map(([id, quantity, price, option]) => ({ id, quantity, price, option, name: menus.find(m => m.id === id)?.name ?? '메뉴' }));
    return {
      number: String(p.n), items, paidAt: new Date(p.t * 1000),
      total: items.reduce((n, i) => n + i.price * i.quantity, 0),
      payment: p.m !== undefined ? { method: p.m, amount: p.a ?? 0, dine: p.d ?? '매장' } : undefined,
    };
  } catch { return null; }
}

// 휴대폰에서 열리려면 키오스크가 아니라 인터넷에 배포한 주소를 써야 합니다(.env의 VITE_RECEIPT_BASE_URL).
export const receiptBase = () => import.meta.env.VITE_RECEIPT_BASE_URL || `${location.origin}${location.pathname}`;
export const receiptUrl = (order: Order) => `${receiptBase().replace(/#.*$/, '')}#/receipt/${encodeOrder(order)}`;
export const isLocalBase = () => /\/\/(localhost|127\.|192\.168\.|10\.)/.test(receiptBase());
