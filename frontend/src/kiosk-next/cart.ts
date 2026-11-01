// 장바구니. 같은 메뉴라도 옵션(예: 굴소스/마늘소스)이 다르면 다른 줄입니다.
// 모든 함수는 새 장바구니를 돌려주고 원래 것을 바꾸지 않습니다. 가격은 항상 메뉴판(catalog)에서 읽습니다.
import type { Catalog } from './catalog';
import type { Line, Order, PaymentResult } from './types';

export type Cart = readonly Line[];
export const emptyCart: Cart = [];

export const lineKey = (line: Line) => (line.option ? `${line.id}|${line.option}` : line.id);
export const lineName = (name: string, line: Line) => (line.option ? `${name} (${line.option})` : name);

export const count = (cart: Cart) => cart.reduce((n, l) => n + l.quantity, 0);
export const quantityOf = (cart: Cart, id: string) => cart.filter(l => l.id === id).reduce((n, l) => n + l.quantity, 0);
export const total = (cart: Cart, catalog: Catalog) => cart.reduce((n, l) => n + catalog.get(l.id).price * l.quantity, 0);

/** 새로 담은 메뉴는 맨 위, 같은 메뉴·같은 옵션은 수량만 더합니다. 한상 구성은 구성 순서 그대로 위에서부터 보입니다. */
export function add(cart: Cart, items: readonly Line[]): Cart {
  const next = cart.map(l => ({ ...l }));
  for (const item of [...items].reverse()) {
    const old = next.find(l => lineKey(l) === lineKey(item));
    if (old) old.quantity += item.quantity; else next.unshift({ ...item });
  }
  return next;
}

/** 수량을 바꿉니다. 1 밑으로는 내려가지 않습니다(없애려면 remove). */
export const changeQuantity = (cart: Cart, key: string, delta: number): Cart =>
  cart.map(l => (lineKey(l) === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l));

export const remove = (cart: Cart, key: string): Cart => cart.filter(l => lineKey(l) !== key);

/** 메뉴 카드의 − 버튼: 그 메뉴의 첫 줄에서 하나 빼고, 0이 되면 줄을 지웁니다. */
export function decrement(cart: Cart, id: string): Cart {
  const i = cart.findIndex(l => l.id === id);
  if (i < 0) return cart;
  return cart[i].quantity > 1 ? cart.map((l, j) => (j === i ? { ...l, quantity: l.quantity - 1 } : l)) : cart.filter((_, j) => j !== i);
}

/** 옵션이 있는 메뉴를 옵션 없이 담을 때(추천 조합 담기 등)는 첫 번째 옵션을 기본으로 씁니다. */
export function withDefaultOption(line: Line, catalog: Catalog): Line {
  const options = catalog.get(line.id).options;
  return options?.length && !line.option ? { ...line, option: options[0] } : line;
}


export interface PlaceOrder { cart: Cart; catalog: Catalog; number: number; payment: PaymentResult; paidAt: Date }

/** 결제가 끝난 장바구니를 영수증에 쓰는 주문으로 바꿉니다. 결제 연동 시 번호는 서버 값으로 바꾸면 됩니다. */
export function placeOrder({ cart, catalog, number, payment, paidAt }: PlaceOrder): Order {
  return {
    number: String(number).padStart(3, '0'),
    items: cart.map(l => {
      const m = catalog.get(l.id);
      return { id: m.id, name: m.name, quantity: l.quantity, price: m.price, option: l.option };
    }),
    total: total(cart, catalog),
    paidAt,
    payment,
  };
}
