import { describe, expect, it } from 'vitest';
import menuData from './menu/menus.json';
import { KioskAI } from './recommendation';
import type { Menu } from './types';
const menus: Menu[] = menuData;
describe('KioskAI', () => {
  it('reads the wanted kind, ignoring excluded ingredients', () => {
    expect(KioskAI.extract('두 명이고 베이징덕 먹고 싶어요').kind).toBe('베이징덕/생선');
    expect(KioskAI.extract('딤섬 먹고 싶어요. 새우는 빼주세요')).toMatchObject({kind:'딤섬',exclude:['새우']});
    expect(KioskAI.extract('새우는 빼주세요').kind).toBe('상관없음');
    expect(KioskAI.extract('맛있으면 좋겠어요').kind).toBe('상관없음');
  });
  it('orders enough portions for the party', () => {
    const duck = menus.find(m => m.name === '베이징덕 한 마리')!;
    const pick = (party: number) => KioskAI.recommend({...KioskAI.extract(''),party,kind:'베이징덕/생선'}, [duck])[0].lines[0].quantity;
    expect(pick(4)).toBe(1);
    expect(pick(6)).toBe(2);
  });
  it('splits a large party across two different menus within budget', () => {
    const results = KioskAI.recommend({...KioskAI.extract(''),party:6,kind:'면',budget:30000}, menus);
    const split = results.find(r => !r.set)!;
    expect(split.lines).toHaveLength(2);
    expect(split.lines.reduce((n,l)=>n+l.quantity,0)).toBe(6);
    for (const r of results) expect(r.total).toBeLessThanOrEqual(30000*6);
    const ids = results.filter(r => !r.set).flatMap(r => r.lines.map(l => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('reads the sentences from the review documents', () => {
    expect(KioskAI.extract('1인당 2만원으로 네 명이요')).toMatchObject({party:4,budget:20000});
    expect(KioskAI.extract('1인당 15,000원')).toMatchObject({budget:15000,totalBudget:null});
    expect(KioskAI.extract('2명 총 3만원')).toMatchObject({party:2,totalBudget:30000,budget:15000});
    expect(KioskAI.extract('면 먹고 싶어요').kind).toBe('면');
    expect(KioskAI.extract('새우 없는 딤섬')).toMatchObject({kind:'딤섬',exclude:['새우']});
    expect(KioskAI.extract('새우는 빼고 소고기는 좋아요').exclude).toEqual(['새우']);
    expect(KioskAI.extract('오리 말고 다른 거')).toMatchObject({kind:'상관없음',exclude:['오리']});
    expect(KioskAI.extract('매운 거 못 먹어요').spicy).toBe(0);
  });
  it('keeps a total budget as the limit for the whole order', () => {
    for (const r of KioskAI.recommend(KioskAI.extract('2명 총 3만원'), menus)) expect(r.total).toBeLessThanOrEqual(30000);
  });
  it('does not treat menus with unchecked ingredients as safe when something is excluded', () => {
    const results = KioskAI.recommend(KioskAI.extract('세 명이에요 해산물은 빼주세요'), menus);
    for (const r of results) for (const l of r.lines) expect(menus.find(m => m.id === l.id)!.ingredients.length).toBeGreaterThan(0);
    const anything = KioskAI.recommend(KioskAI.extract('두 명이요'), menus).flatMap(r => r.lines);
    expect(anything.some(l => menus.find(m => m.id === l.id)!.ingredients.length === 0)).toBe(true);
  });
  it('ranks menus named in the request first', () => {
    const all = KioskAI.recommend(KioskAI.extract('짬뽕 먹고 싶어요'), menus);
    // 메뉴판의 짬뽕은 두 가지라 1·2순위가 짬뽕입니다.
    for (const r of all.slice(0, 2)) expect(r.lines.every(l => menus.find(m => m.id === l.id)!.name.includes('짬뽕'))).toBe(true);
    const group = KioskAI.recommend(KioskAI.extract('두 명이서 짬뽕 먹고 싶어요'), menus);
    for (const r of group) expect(r.lines.some(l => menus.find(m => m.id === l.id)!.name.includes('짬뽕'))).toBe(true);
    const duckless = KioskAI.recommend(KioskAI.extract('오리 말고 다른 거'), menus).flatMap(r => r.lines);
    expect(duckless.some(l => menus.find(m => m.id === l.id)!.ingredients.includes('오리'))).toBe(false);
  });
  it('treats generic seafood dishes as possibly containing shrimp', () => {
    for (const r of KioskAI.recommend(KioskAI.extract('두 명이고 새우는 빼고 먹고 싶어요'), menus)) for (const l of r.lines) expect(menus.find(m => m.id === l.id)!.ingredients).not.toContain('해산물');
  });
  it('shows only the requested kind when such menus exist', () => {
    const results = KioskAI.recommend(KioskAI.extract('혼자 왔어요. 만원 이하로 면 요리 부탁해요'), menus);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.lines.some(l => menus.find(m => m.id === l.id)!.kind === '면')).toBe(true);
  });
  it('builds a Chinese-restaurant style table set for a group', () => {
    const name = (id: string) => menus.find(m => m.id === id)!;
    const two = KioskAI.recommend(KioskAI.extract('두 명이요'), menus);
    const set2 = two[0];
    expect(set2.set).toBe(true);
    const cats = set2.lines.map(l => name(l.id).category);
    expect(cats.filter(c => ['chicken','pork','beef','seafood','duck-fish'].includes(c))).toHaveLength(1);
    const meals = set2.lines.filter(l => ['noodle','rice'].includes(name(l.id).category));
    expect(meals).toHaveLength(2);
    expect(new Set(meals.map(l => l.id)).size).toBe(2);
    // 2명 한상은 면 하나와 밥 하나로 섞어서, 짜장·짬뽕이 각각 한상에 들어갑니다.
    expect(two.some(r => r.set && r.lines.some(l => name(l.id).name.includes('짜장')))).toBe(true);
    expect(two.some(r => r.set && r.lines.some(l => name(l.id).name.includes('짬뽕')))).toBe(true);
    expect(two.some(r => !r.set)).toBe(true);
    const four = KioskAI.recommend(KioskAI.extract('네 명이서 먹을래요'), menus).find(r => r.set)!;
    expect(four.lines.filter(l => ['noodle','rice'].includes(name(l.id).category)).reduce((n, l) => n + l.quantity, 0)).toBe(4);
    expect(four.lines.filter(l => ['chicken','pork','beef','seafood','duck-fish'].includes(name(l.id).category))).toHaveLength(2);
  });
  it('recommends just one meal for a single guest', () => {
    const solo = KioskAI.recommend(KioskAI.extract('혼자 왔어요'), menus);
    expect(solo.length).toBe(3);
    for (const r of solo) {
      expect(r.set).toBeFalsy();
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0].quantity).toBe(1);
      expect(['noodle', 'rice']).toContain(menus.find(m => m.id === r.lines[0].id)!.category);
    }
    const types = solo.map(r => menus.find(m => m.id === r.lines[0].id)!.name.replace('간짜장', '짜장'));
    expect(types.filter(n => n.includes('짜장')).length).toBeLessThanOrEqual(1);
    const cats = solo.map(r => menus.find(m => m.id === r.lines[0].id)!.category);
    expect(cats).toContain('noodle');
    expect(cats).toContain('rice');
    const mild = KioskAI.recommend(KioskAI.extract('혼자인데 안 매운 거'), menus).map(r => menus.find(m => m.id === r.lines[0].id)!.category);
    expect(mild).toContain('rice');
    const dimsum = KioskAI.recommend(KioskAI.extract('혼자인데 딤섬 먹고 싶어요'), menus);
    expect(dimsum.every(r => r.lines.some(l => menus.find(m => m.id === l.id)!.category === 'dimsum'))).toBe(true);
    // 혼자 딤섬만 먹는 경우는 드물어서, 식사(면·밥)와 함께 추천합니다.
    expect(dimsum).toHaveLength(3);
    expect(dimsum.every(r => r.light && r.lines.some(l => ['noodle','rice'].includes(menus.find(m => m.id === l.id)!.category)))).toBe(true);
  });
  it('mixes noodles and rice in group sets and offers light sets for 1-2 people', () => {
    const cat = (id: string) => menus.find(m => m.id === id)!.category;
    // 2명 한상 두 개는 면+밥 하나, 면 2종 하나처럼 서로 다른 방식으로 구성합니다.
    const patterns = KioskAI.recommend(KioskAI.extract('두 명이요'), menus).filter(r => r.set).map(r => r.lines.map(l => cat(l.id)).filter(c => ['noodle','rice'].includes(c)).sort().join());
    expect(patterns).toHaveLength(2);
    expect(new Set(patterns).size).toBe(2);
    expect(patterns).toContain('noodle,rice');
    const light = KioskAI.recommend(KioskAI.extract('두 명이고 딤섬 먹고 싶어요'), menus);
    for (const r of light) {
      expect(r.light).toBe(true);
      const cats = r.lines.map(l => cat(l.id));
      expect(cats.filter(c => ['noodle','rice'].includes(c))).toHaveLength(2);
      expect(cats).toContain('dimsum');
      expect(cats.some(c => ['chicken','pork','beef','seafood','duck-fish'].includes(c))).toBe(false);
    }
    expect(KioskAI.recommend(KioskAI.extract('혼자 간단하게 먹을래요'), menus).every(r => r.light && r.lines.length === 2)).toBe(true);
  });
  it('keeps exclusions and budget inside table sets', () => {
    const results = KioskAI.recommend(KioskAI.extract('세 명이고 1인당 3만원, 새우는 빼 주세요'), menus);
    expect(results.some(r => r.set)).toBe(true);
    for (const r of results) {
      expect(r.total).toBeLessThanOrEqual(90000);
      for (const l of r.lines) expect(menus.find(m => m.id === l.id)!.ingredients).not.toContain('새우');
    }
  });
  it('drops every seafood item when seafood is excluded', () => {
    const results = KioskAI.recommend(KioskAI.extract('해산물은 빼주세요'), menus);
    const seafood = ['해산물','새우','생선','게','해삼','전복','관자','굴'];
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.main.ingredients.some(i => seafood.includes(i))).toBe(false);
  });
});
