import { describe, expect, it } from 'vitest';
import { createCatalog } from './catalog';
import * as Cart from './cart';
import type { Menu } from './types';

const menu = (id: string, price: number, extra: Partial<Menu> = {}): Menu => ({
  id, name: id, price, category: 'dimsum', kind: '', spicy: 0, texture: [], flavor: [], ingredients: [],
  quantityUnit: '', servingPeople: 1, pairings: [], ...extra,
});
const catalog = createCatalog([
  menu('a', 1000, { pairings: ['b', 'sold', 'missing'] }),
  menu('b', 2500),
  menu('sold', 900, { soldOut: true }),
  menu('sauce', 5000, { options: ['굴소스', '마늘소스'] }),
]);

describe('cart', () => {
  it('같은 메뉴·같은 옵션은 수량만 더하고, 옵션이 다르면 다른 줄이다', () => {
    let cart = Cart.add(Cart.emptyCart, [{ id: 'a', quantity: 1 }]);
    cart = Cart.add(cart, [{ id: 'a', quantity: 2 }, { id: 'sauce', quantity: 1, option: '굴소스' }]);
    cart = Cart.add(cart, [{ id: 'sauce', quantity: 1, option: '마늘소스' }]);
    expect(cart.map(Cart.lineKey).sort()).toEqual(['a', 'sauce|굴소스', 'sauce|마늘소스']);
    expect(Cart.quantityOf(cart, 'a')).toBe(3);
    expect(Cart.count(cart)).toBe(5);
  });

  it('새로 담은 메뉴가 위에 오고, 한 번에 담은 구성은 순서를 지킨다', () => {
    const cart = Cart.add(Cart.add(Cart.emptyCart, [{ id: 'a', quantity: 1 }]), [{ id: 'b', quantity: 1 }, { id: 'sauce', quantity: 1 }]);
    expect(cart.map(l => l.id)).toEqual(['b', 'sauce', 'a']);
  });

  it('원래 장바구니를 바꾸지 않는다', () => {
    const before = Cart.add(Cart.emptyCart, [{ id: 'a', quantity: 1 }]);
    Cart.add(before, [{ id: 'a', quantity: 5 }]);
    Cart.changeQuantity(before, 'a', 3);
    expect(before).toEqual([{ id: 'a', quantity: 1 }]);
  });

  it('수량은 1 밑으로 내려가지 않고, 지우는 것은 remove 가 한다', () => {
    const cart = Cart.add(Cart.emptyCart, [{ id: 'a', quantity: 1 }]);
    expect(Cart.changeQuantity(cart, 'a', -1)[0].quantity).toBe(1);
    expect(Cart.changeQuantity(cart, 'a', 2)[0].quantity).toBe(3);
    expect(Cart.remove(cart, 'a')).toEqual([]);
  });

  it('카드의 − 는 하나 빼다가 0이 되면 줄을 지운다', () => {
    let cart = Cart.add(Cart.emptyCart, [{ id: 'a', quantity: 2 }]);
    cart = Cart.decrement(cart, 'a');
    expect(Cart.quantityOf(cart, 'a')).toBe(1);
    expect(Cart.decrement(cart, 'a')).toEqual([]);
    expect(Cart.decrement(cart, 'nothing')).toBe(cart);
  });

  it('합계는 메뉴판 가격으로 계산한다', () => {
    const cart = Cart.add(Cart.emptyCart, [{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }]);
    expect(Cart.total(cart, catalog)).toBe(1000 * 2 + 2500);
  });

  it('옵션 있는 메뉴는 기본으로 첫 옵션을 쓴다', () => {
    expect(Cart.withDefaultOption({ id: 'sauce', quantity: 1 }, catalog).option).toBe('굴소스');
    expect(Cart.withDefaultOption({ id: 'sauce', quantity: 1, option: '마늘소스' }, catalog).option).toBe('마늘소스');
    expect(Cart.withDefaultOption({ id: 'a', quantity: 1 }, catalog).option).toBeUndefined();
  });

  it('주문을 만든다: 번호는 세 자리, 가격은 메뉴판 값', () => {
    const cart = Cart.add(Cart.emptyCart, [{ id: 'sauce', quantity: 2, option: '굴소스' }]);
    const paidAt = new Date('2026-11-01T09:00:00');
    const order = Cart.placeOrder({ cart, catalog, number: 7, payment: { method: '카드결제', amount: 10000, dine: '매장' }, paidAt });
    expect(order).toMatchObject({ number: '007', total: 10000, paidAt });
    expect(order.items).toEqual([{ id: 'sauce', name: 'sauce', quantity: 2, price: 5000, option: '굴소스' }]);
  });
});

describe('catalog', () => {
  it('분류별로 찾고, 초성으로 찾고, 없는 id 는 던진다', () => {
    const c = createCatalog([menu('1', 1, { name: '짬뽕', category: 'noodle' }), menu('2', 1, { name: '하가우' })]);
    expect(c.inCategory('noodle').map(m => m.name)).toEqual(['짬뽕']);
    expect(c.search('ㅉㅃ').map(m => m.name)).toEqual(['짬뽕']);
    expect(c.search('ㅎㄱㅇ').map(m => m.name)).toEqual(['하가우']);
    expect(c.search('')).toEqual([]);
    expect(() => c.get('nope')).toThrow('nope');
  });

  it('사진과 리뷰는 주입한 곳에서 가져온다', () => {
    const c = createCatalog([menu('1', 1)], { photo: id => `/img/${id}.webp` });
    expect(c.photo('1')).toBe('/img/1.webp');
    expect(c.reviews('1')).toBeUndefined();
  });
});
