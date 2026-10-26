import { describe, expect, it } from 'vitest';
import type { Tag } from '../src/contracts.js';
import { recommend, type MenuItemWithAvailability } from '../src/recommend.js';
import { QUESTIONS } from '../src/questions.js';

function menu(id: string, tags: Tag[], opts: Partial<MenuItemWithAvailability> = {}): MenuItemWithAvailability {
  return {
    id, name: id, price: 9000, categoryId: 'c', description: null, imageUrl: null,
    tags, priority: 0, sortOrder: 1, isAvailable: true, ...opts,
  };
}

const ids = (r: { menu: { id: string } }[]) => r.map((x) => x.menu.id);

describe('QUESTIONS', () => {
  it('questions.md의 4개 질문을 순서대로 갖는다', () => {
    expect(QUESTIONS.map((q) => [q.order, q.id, q.text])).toEqual([
      [1, 'q_spicy', '매운 음식도 괜찮으세요?'],
      [2, 'q_soup', '따뜻한 국물이 있는 음식이 좋으세요?'],
      [3, 'q_soft', '부드러운 음식이 좋으세요?'],
      [4, 'q_hearty', '든든하게 드시고 싶으세요?'],
    ]);
  });
});

describe('recommend', () => {
  it('답이 없으면 priority × 1.5 점수와 정렬 규칙으로 3개를 고른다', () => {
    const menus = [
      menu('m005', [], { sortOrder: 2 }),
      menu('m004', [], { sortOrder: 2 }),
      menu('m003', [], { sortOrder: 1 }),
      menu('m002', [], { priority: 1 }),
      menu('m001', [], { priority: 2 }),
    ];
    const r = recommend(menus, []);
    expect(ids(r)).toEqual(['m001', 'm002', 'm003']);
    expect(r.map((x) => x.score)).toEqual([3, 1.5, 0]);
  });

  it('점수가 같으면 priority 내림차순 → sortOrder 오름차순 → id 오름차순', () => {
    const menus = [
      menu('b', ['soup'], { sortOrder: 1 }),          // 2
      menu('a', ['soup'], { sortOrder: 1 }),          // 2
      menu('c', ['soup'], { sortOrder: 0 }),          // 2
      menu('p', [], { priority: 1, sortOrder: 9 }),   // 1.5
      menu('q', ['hearty'], { priority: 0 }),         // 0
    ];
    // 점수 2.0이 되도록: p는 soup 없이 priority만. 비교용으로 soup 동점 3개
    const r = recommend(menus, [{ questionId: 'q_soup', answer: 'yes' }], { limit: 5 });
    expect(ids(r)).toEqual(['c', 'a', 'b', 'p', 'q']);
  });

  it('점수가 같을 때 priority가 높은 메뉴가 먼저 온다', () => {
    // x: soup(2) + priority 0 = 2 / y: soup -1 + priority 2 = 2
    const menus = [menu('x', ['soup'], { sortOrder: 0 }), menu('y', ['soup', 'hearty'], { priority: 2, sortOrder: 5 })];
    const r = recommend(menus, [
      { questionId: 'q_soup', answer: 'yes' },
      { questionId: 'q_hearty', answer: 'no' },
    ]);
    expect(r.map((x) => [x.menu.id, x.score])).toEqual([['y', 4], ['x', 2]]);
    const r2 = recommend(
      [menu('x', ['soup'], { sortOrder: 0 }), menu('y', ['hearty'], { priority: 2, sortOrder: 5 })],
      [{ questionId: 'q_soup', answer: 'yes' }, { questionId: 'q_hearty', answer: 'no' }],
    );
    // x = 2, y = -1 + 3 = 2 → 동점, priority 높은 y가 먼저
    expect(r2.map((x) => [x.menu.id, x.score])).toEqual([['y', 2], ['x', 2]]);
  });

  it('q_spicy no는 spicy -3, mild +1', () => {
    const r = recommend([menu('hot', ['spicy']), menu('mild', ['mild'])], [{ questionId: 'q_spicy', answer: 'no' }]);
    expect(r.map((x) => [x.menu.id, x.score])).toEqual([['mild', 1], ['hot', -3]]);
  });

  it('q_spicy yes는 spicy +2, mild -1', () => {
    const r = recommend([menu('hot', ['spicy']), menu('mild', ['mild'])], [{ questionId: 'q_spicy', answer: 'yes' }]);
    expect(r.map((x) => [x.menu.id, x.score])).toEqual([['hot', 2], ['mild', -1]]);
  });

  it('q_soft no와 skip은 점수에 영향이 없다', () => {
    const menus = [menu('s', ['soft'])];
    expect(recommend(menus, [{ questionId: 'q_soft', answer: 'no' }])[0].score).toBe(0);
    expect(recommend(menus, [{ questionId: 'q_soft', answer: 'skip' }])[0].score).toBe(0);
    expect(recommend(menus, [{ questionId: 'q_soft', answer: 'yes' }])[0].score).toBe(2);
  });

  it('메뉴 점수는 태그별 선호의 합이다', () => {
    const r = recommend([menu('m', ['soup', 'soft', 'hearty'])], [
      { questionId: 'q_soup', answer: 'yes' },
      { questionId: 'q_soft', answer: 'yes' },
      { questionId: 'q_hearty', answer: 'no' },
    ]);
    expect(r[0].score).toBe(3);
  });

  it('품절 메뉴는 빼고, 메뉴가 3개 미만이면 있는 만큼 돌려준다', () => {
    const r = recommend([menu('a', []), menu('b', [], { isAvailable: false, priority: 3 })], []);
    expect(ids(r)).toEqual(['a']);
  });

  it('결과 menu에는 isAvailable 필드가 없다 (계약 MenuItem 모양)', () => {
    const r = recommend([menu('a', ['soup'])], []);
    expect(r[0].menu).not.toHaveProperty('isAvailable');
    expect(Object.keys(r[0].menu).sort()).toEqual(
      ['categoryId', 'description', 'id', 'imageUrl', 'name', 'price', 'priority', 'sortOrder', 'tags'],
    );
  });

  it('reasons는 +로 기여한 태그를 기여 큰 순으로, priority>0이면 끝에 store_pick', () => {
    const r = recommend([menu('m', ['mild', 'soup', 'soft', 'spicy'], { priority: 1 })], [
      { questionId: 'q_spicy', answer: 'no' }, // mild +1, spicy -3
      { questionId: 'q_soup', answer: 'yes' }, // soup +2
      { questionId: 'q_soft', answer: 'yes' }, // soft +2
    ]);
    expect(r[0].reasons).toEqual(['soup', 'soft', 'mild', 'store_pick']);
  });

  it('기여가 0이거나 음수인 태그는 reasons에 없다', () => {
    const r = recommend([menu('m', ['spicy', 'hearty'])], [{ questionId: 'q_spicy', answer: 'no' }]);
    expect(r[0].reasons).toEqual([]);
  });

  it('같은 입력이면 항상 같은 결과', () => {
    const menus = [menu('b', ['soup']), menu('a', ['soup']), menu('c', ['mild'], { priority: 1 })];
    const ans = [{ questionId: 'q_soup', answer: 'yes' as const }];
    expect(recommend(menus, ans)).toEqual(recommend([...menus].reverse(), ans));
  });
});
