// 영수증을 QR 주소에 담아 휴대폰에서 열어 보게 합니다. 서버에 저장하지 않고 주소 안에 주문 내용만 넣습니다.
import type { Menu } from './types';
import type { Order } from './Receipt';

interface Payload { v: 1; n: string; t: number; i: ([string, number, number] | [string, number, number, string])[]; m?: string; a?: number; d?: '매장' | '포장' }

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// v2: QR이 촘촘하면 휴대폰 카메라가 잘 못 읽어서, 주소에 넣는 주문 내용을 최대한 짧게 씁니다.
// 형식: 2~번호~결제시각(36진수)~결제수단·식사방법~메뉴들   메뉴: 짧은id.수량.가격(36진수)[.옵션번호], 메뉴끼리는 _
// 짧은id는 분류 글자+번호(dimsum-5 → b5). 한글(결제 수단·옵션 이름)은 주소에서 길어지므로 번호로 바꿉니다.
const CATS = ['duck-fish', 'dimsum', 'vegetable', 'cold', 'soup', 'chicken', 'pork', 'beef', 'noodle', 'rice', 'seafood'];
const METHODS = ['카드결제', '카카오페이', '네이버페이', '토스페이'];
const shortId = (id: string) => { const m = id.match(/^(.+)-(\d+)$/); const c = m ? CATS.indexOf(m[1]) : -1; return c >= 0 ? `${String.fromCharCode(97 + c)}${m![2]}` : id; };
const longId = (s: string) => { const m = s.match(/^([a-k])(\d+)$/); return m ? `${CATS[m[1].charCodeAt(0) - 97]}-${m[2]}` : s; };

export function encodeOrderShort(order: Order, menus: Menu[]): string {
  const items = order.items.map(i => {
    const opt = i.option ? menus.find(m => m.id === i.id)?.options?.indexOf(i.option) ?? -1 : -1;
    return [shortId(i.id), i.quantity.toString(36), i.price.toString(36), ...(opt >= 0 ? [String(opt)] : [])].join('.');
  }).join('_');
  const pay = order.payment ? `${Math.max(0, METHODS.indexOf(order.payment.method))}${order.payment.dine === '포장' ? 't' : 's'}` : '';
  return ['2', order.number, Math.floor(order.paidAt.getTime() / 1000).toString(36), pay, items].join('~');
}

function decodeShort(code: string, menus: Menu[]): Order | null {
  const [v, number, t, pay, list] = code.split('~');
  if (v !== '2' || !number || !t || list === undefined) return null;
  const items = list ? list.split('_').map(part => {
    const [sid, q, p, o] = part.split('.');
    const id = longId(sid); const menu = menus.find(m => m.id === id);
    const num = /^[0-9a-z]+$/;
    if (!num.test(q ?? '') || !num.test(p ?? '')) throw new Error('bad item');
    const quantity = parseInt(q, 36), price = parseInt(p, 36);
    if (!(quantity > 0)) throw new Error('bad item');
    return { id, quantity, price, option: o !== undefined ? menu?.options?.[Number(o)] : undefined, name: menu?.name ?? '메뉴' };
  }) : [];
  const total = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const seconds = /^[0-9a-z]+$/.test(t) ? parseInt(t, 36) : NaN;
  if (!(seconds > 0)) return null;
  return {
    number, items, total, paidAt: new Date(seconds * 1000),
    payment: pay ? { method: METHODS[Number(pay[0])] ?? '카드결제', amount: total, dine: pay[1] === 't' ? '포장' : '매장' } : undefined,
  };
}

/** v1(예전 QR): 주문 내용을 JSON으로 만들어 base64url로 넣었습니다. 이미 찍어 간 영수증이 계속 열리도록 읽기는 유지합니다. */
export function encodeOrder(order: Order): string {
  const payload: Payload = { v: 1, n: order.number, t: Math.floor(order.paidAt.getTime() / 1000), i: order.items.map(i => (i.option ? [i.id, i.quantity, i.price, i.option] : [i.id, i.quantity, i.price])) };
  if (order.payment) { payload.m = order.payment.method; payload.a = order.payment.amount; payload.d = order.payment.dine; }
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeOrder(code: string, menus: Menu[]): Order | null {
  try {
    if (code.startsWith('2~')) return decodeShort(code, menus);
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

// 휴대폰에서 열리려면 키오스크가 아니라 인터넷에 배포한 주소를 써야 합니다.
// 기본은 Vercel에 올린 휴대폰 영수증 페이지(DEPLOYMENT.md)이고, 다른 곳에 올렸으면 .env의 VITE_RECEIPT_BASE_URL로 바꿉니다.
export const DEPLOYED_RECEIPT_URL = 'https://menumate-dl.vercel.app/receipt.html';
export const receiptBase = () => new URL(import.meta.env.VITE_RECEIPT_BASE_URL || DEPLOYED_RECEIPT_URL, window.location.href).href;
export const receiptUrl = (order: Order, menus: Menu[]) => `${receiptBase().replace(/#.*$/, '')}#${encodeOrderShort(order, menus)}`;
export const isLocalBase = () => /\/\/(localhost|127\.|192\.168\.|10\.)/.test(receiptBase());
