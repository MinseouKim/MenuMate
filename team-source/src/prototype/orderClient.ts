// 결제 완료 주문을 서버(team-source/server)에 "최선을 다해" 저장합니다 — 매출 집계·영수증 재발급용.
// 키오스크는 네트워크가 끊겨도 손님 응대를 멈추면 안 되므로, 이 호출은 결제 완료 화면을 막지 않고
// 실패해도 조용히 넘어갑니다(화면에는 아무 표시도 하지 않음). 서버가 없으면(VITE_API_BASE_URL
// 미설정) 아예 호출하지 않습니다.
import type { Order } from './Receipt';

const TIMEOUT_MS = 4000;

function storeSlug(): string {
  return import.meta.env.VITE_STORE_SLUG?.trim() || 'ururu-headquarters';
}

export function persistOrder(order: Order): void {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) return;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  const dineType = order.payment?.dine === '포장' ? 'takeout' : 'dine_in';
  const body = {
    order_number: order.number,
    total_amount: order.total,
    payment_method: order.payment?.method ?? 'unknown',
    dine_type: dineType,
    items: order.items.map((item) => ({
      menu_external_id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      option: item.option ?? null,
    })),
  };
  fetch(`${base.replace(/\/$/, '')}/api/stores/${storeSlug()}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abort.signal,
  })
    .catch(() => { /* 네트워크 오류는 조용히 무시 — 키오스크 결제 완료 흐름을 막지 않음 */ })
    .finally(() => clearTimeout(timer));
}
