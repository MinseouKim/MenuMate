import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Tag } from '../src/contracts.js';
import { loadEngine, parseEngine, type Engine } from '../src/engine.js';
import { recommend, type MenuItemWithAvailability } from '../src/recommend.js';
import { backendDir } from './setup/db-url.js';

function menu(id: string, tags: Tag[], opts: Partial<MenuItemWithAvailability> = {}): MenuItemWithAvailability {
  return {
    id, name: `${id}-이름`, price: 9000, categoryId: 'c', description: null, imageUrl: null,
    tags, priority: 0, sortOrder: 1, isAvailable: true, ...opts,
  };
}

function engineFile(menus: unknown[], extra: object = {}) {
  return { engineVersion: 'test-v1', generatedAt: '2026-10-30T12:00:00+09:00', weights: { ageFit: 2, reputation: 2 }, menus, ...extra };
}

function engineMenu(over: object = {}) {
  return {
    menuName: 'a-이름',
    features: { spicy: 0, mild: 0, soup: 0, soft: 0, hearty: 0 },
    ageFit: { under35: 0.5, '35to54': 0.5, '55plus': 0.5 },
    reputation: 0.5, reviewCount: 10, adFilteredCount: 1,
    ...over,
  };
}

function mustParse(json: unknown): Engine {
  const r = parseEngine(json);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.engine;
}

describe('parseEngine', () => {
  it('올바른 파일을 읽는다', () => {
    const e = mustParse(engineFile([engineMenu()]));
    expect(e.version).toBe('test-v1');
    expect(e.weights).toEqual({ ageFit: 2, reputation: 2 });
  });

  it('예시 파일(engine/menu-features.example.json)은 형식에 맞다', () => {
    const json = JSON.parse(fs.readFileSync(path.join(backendDir, 'engine', 'menu-features.example.json'), 'utf8'));
    expect(parseEngine(json).ok).toBe(true);
  });

  it.each([
    ['engineVersion 없음', (f: any) => { delete f.engineVersion; }, /engineVersion/],
    ['menus가 배열이 아님', (f: any) => { f.menus = {}; }, /menus/],
    ['weights 없음', (f: any) => { delete f.weights; }, /weights/],
    ['특징값이 0~1 밖', (f: any) => { f.menus[0].features.soup = 1.2; }, /menus\[0\].*features\.soup/],
    ['연령대 점수 빠짐', (f: any) => { delete f.menus[0].ageFit['55plus']; }, /menus\[0\].*ageFit\.55plus/],
    ['평판이 숫자가 아님', (f: any) => { f.menus[0].reputation = 'good'; }, /menus\[0\].*reputation/],
    ['메뉴 이름 없음', (f: any) => { delete f.menus[0].menuName; }, /menus\[0\].*menuName/],
  ])('%s → 실패와 이유', (_, mutate, pattern) => {
    const f: any = engineFile([engineMenu()]);
    mutate(f);
    const r = parseEngine(f);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.errors.join('\n')).toMatch(pattern);
  });

  it('출처 표시용 sources 배열과 아직 안 쓰는 weights 키가 있어도 읽는다 (AI 합의)', () => {
    const e = mustParse(engineFile([engineMenu({ menuId: 'a' })], {
      sources: [{ name: 'KR3', url: 'https://example.org/kr3', license: 'CC BY-NC-SA 4.0' }],
      weights: { ageFit: 2, reputation: 2, preference: 1 },
    }));
    expect(e.weights).toEqual({ ageFit: 2, reputation: 2 });
    expect(e.byId.get('a')).toBeDefined();
  });

  it('모르는 특징 키는 무시한다 (질문 v2 대비)', () => {
    const e = mustParse(engineFile([engineMenu({ features: { soup: 1, sweet: 0.8 } })]));
    expect(e.menus[0].features).toEqual({ soup: 1 });
  });
});

describe('loadEngine', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menumate-engine-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const warnings: string[] = [];
  const log = { info: () => {}, warn: (m: string) => { warnings.push(m); } };

  it('파일이 없으면 null (v1 점수로 동작)', () => {
    expect(loadEngine(path.join(tmp, 'none.json'), log)).toBeNull();
  });

  it('JSON이 깨졌거나 형식이 틀리면 null과 경고', () => {
    fs.writeFileSync(path.join(tmp, 'broken.json'), '{ "menus": [');
    fs.writeFileSync(path.join(tmp, 'bad.json'), JSON.stringify({ engineVersion: 'x' }));
    expect(loadEngine(path.join(tmp, 'broken.json'), log)).toBeNull();
    expect(loadEngine(path.join(tmp, 'bad.json'), log)).toBeNull();
    expect(warnings.length).toBe(2);
  });

  it('올바른 파일은 Engine', () => {
    fs.writeFileSync(path.join(tmp, 'ok.json'), JSON.stringify(engineFile([engineMenu()])));
    expect(loadEngine(path.join(tmp, 'ok.json'), log)?.version).toBe('test-v1');
  });
});

describe('recommend + 엔진', () => {
  const soupYes = [{ questionId: 'q_soup', answer: 'yes' as const }];

  it('매칭된 메뉴는 태그 대신 엔진 특징값으로 취향 점수를 낸다', () => {
    const e = mustParse(engineFile([engineMenu({ features: { soup: 0.5 } })]));
    // a는 soup 태그가 있지만 엔진 특징 0.5 → 2 × 0.5 = 1
    expect(recommend([menu('a', ['soup'])], soupYes, { engine: e })[0].score).toBe(1);
  });

  it('엔진에 없는 특징 키는 그 메뉴의 태그(1/0)로 채운다', () => {
    const e = mustParse(engineFile([engineMenu({ features: {} })]));
    expect(recommend([menu('a', ['soup'])], soupYes, { engine: e })[0].score).toBe(2);
  });

  it('연령대 적합 점수: weights.ageFit × (ageFit[band] − 0.5), items(연령대 없음)는 0', () => {
    const e = mustParse(engineFile([engineMenu({ ageFit: { under35: 0, '35to54': 0.5, '55plus': 1 } })]));
    const m = [menu('a', [])];
    expect(recommend(m, [], { engine: e })[0].score).toBe(0);
    expect(recommend(m, [], { engine: e, band: 'under35' })[0].score).toBe(-1);
    expect(recommend(m, [], { engine: e, band: '35to54' })[0].score).toBe(0);
    expect(recommend(m, [], { engine: e, band: '55plus' })[0].score).toBe(1);
  });

  it('리뷰 평판: weights.reputation × (reputation − 0.5)', () => {
    const e = mustParse(engineFile([engineMenu({ reputation: 0.75 })]));
    expect(recommend([menu('a', [], { priority: 1 })], [], { engine: e })[0].score).toBe(2); // 0.5 + 1.5
  });

  it('매칭 안 된 메뉴는 v1 점수 그대로', () => {
    const e = mustParse(engineFile([engineMenu({ reputation: 1 })]));
    const ans = [{ questionId: 'q_spicy', answer: 'no' as const }, { questionId: 'q_soup', answer: 'yes' as const }];
    const menus = [menu('b', ['soup', 'mild'], { priority: 1 }), menu('c', ['spicy'])];
    expect(recommend(menus, ans, { engine: e, band: '55plus' })).toEqual(recommend(menus, ans));
  });

  it('menuId가 있으면 id로, 없으면 이름으로 매칭한다', () => {
    const e = mustParse(engineFile([
      engineMenu({ menuName: 'x-이름', menuId: 'a', reputation: 1 }),   // id로 a에 매칭 (+1)
      engineMenu({ menuName: 'b-이름', reputation: 0 }),                // 이름으로 b에 매칭 (−1)
    ]));
    const r = recommend([menu('a', []), menu('b', []), menu('x', [])], [], { engine: e, limit: 3 });
    expect(r.map((x) => [x.menu.id, x.score])).toEqual([['a', 1], ['x', 0], ['b', -1]]);
  });

  it('점수는 소수 셋째 자리까지 (부동소수점 잡음 없음)', () => {
    const e = mustParse(engineFile([engineMenu({ features: { soup: 0.1 }, reputation: 0.6 })]));
    // 2 × 0.1 + 2 × 0.1 = 0.4 (부동소수점으로는 0.4000000000000001)
    expect(recommend([menu('a', [])], soupYes, { engine: e })[0].score).toBe(0.4);
  });

  it('reasons는 엔진 특징값 기여 기준, store_pick은 맨 끝', () => {
    const e = mustParse(engineFile([engineMenu({ features: { soup: 0.9, soft: 0.2, spicy: 0 }, ageFit: { under35: 0.5, '35to54': 0.5, '55plus': 1 } })]));
    const r = recommend([menu('a', ['spicy'], { priority: 1 })], [
      { questionId: 'q_soup', answer: 'yes' },
      { questionId: 'q_soft', answer: 'yes' },
    ], { engine: e, band: '55plus' });
    expect(r[0].reasons).toEqual(['soup', 'soft', 'store_pick']);
  });
});
