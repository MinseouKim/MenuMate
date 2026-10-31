import { describe, expect, it } from 'vitest';
import { applyMenuOverrides } from './menuLive';
import type { Menu } from './types';

const menu = (id: string, extra: Partial<Menu> = {}): Menu => ({
  id, name: `메뉴 ${id}`, price: 10000, category: 'x', kind: '딤섬', spicy: 0, texture: [], flavor: [], ingredients: [],
  quantityUnit: '개', servingPeople: 1, pairings: [], ...extra,
});

describe('applyMenuOverrides', () => {
  const base = [menu('a'), menu('b')];

  it('서버가 없거나 override가 비어 있으면 base를 그대로 돌려준다', () => {
    expect(applyMenuOverrides(base, null)).toBe(base);
    expect(applyMenuOverrides(base, new Map())).toBe(base);
  });

  it('override가 이미 같은 값이면 같은 배열을 돌려줘서 화면을 다시 그리지 않는다', () => {
    const overrides = new Map([['a', { name: '메뉴 a', price: 10000, soldOut: undefined }]]);
    expect(applyMenuOverrides(base, overrides)).toBe(base);
  });

  it('값이 하나라도 다르면 바뀐 메뉴만 새로 만들고 나머지는 그대로 둔다', () => {
    const next = applyMenuOverrides(base, new Map([['a', { price: 12000 }]]));
    expect(next).not.toBe(base);
    expect(next[0].price).toBe(12000);
    expect(next[1]).toBe(base[1]);
    expect(base[0].price).toBe(10000);
  });

  it('같은 override를 두 번 적용하면 두 번째는 같은 배열이다', () => {
    const overrides = new Map([['b', { soldOut: true }]]);
    const once = applyMenuOverrides(base, overrides);
    expect(applyMenuOverrides(once, overrides)).toBe(once);
  });
});
