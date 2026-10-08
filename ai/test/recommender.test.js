// 실행: npm test
const test = require('node:test');
const assert = require('node:assert');
const { recommend } = require('../recommender/engine');
const { parseUtterance } = require('../recommender/parse');
const { menus } = require('../../backend/data/menu.json');

const names = (r) => r.recommendations.map((x) => x.name);
const byName = (n) => menus.find((m) => m.name === n);

test('매운 해물 → 매운 해물 메뉴만', () => {
  const r = recommend({ text: '매운 거 먹고 싶어요 해물 들어간 걸로', menus });
  assert.ok(r.recommendations.length > 0);
  for (const n of names(r)) {
    const m = byName(n);
    assert.ok(m.tags.includes('seafood'), `${n}은 해물이어야 함`);
    assert.ok(m.spicy >= 1, `${n}은 매워야 함`);
  }
});

test('안 매운 → 매운 메뉴(2단계 이상) 제외', () => {
  const r = recommend({ text: '안 매운 국물 있는 거요', menus });
  assert.strictEqual(r.understood.spicy, false);
  for (const n of names(r)) assert.ok(byName(n).spicy < 2, n);
});

test('"새우 빼고" → 새우 든 메뉴 없음, 해물 원함으로 오해하지 않음', () => {
  const r = recommend({ text: '새우 빼고 밥 종류로 추천해 주세요', menus });
  assert.deepStrictEqual(r.understood.excludeIngredients, ['새우']);
  assert.ok(!r.understood.tags.includes('해물'));
  for (const n of names(r)) {
    assert.ok(!byName(n).ingredients.includes('새우'), n);
    assert.ok(byName(n).tags.includes('rice'), `${n}은 밥 요리여야 함`);
  }
});

test('예산·인원 파싱', () => {
  const p = parseUtterance('두 명인데 2만 오천원 정도로', menus);
  assert.strictEqual(p.people, 2);
  assert.deepStrictEqual(p.budget, { amount: 25000, perPerson: false });
  assert.strictEqual(parseUtterance('이만원 이하', menus).budget.amount, 20000);
  assert.strictEqual(parseUtterance('만원 안쪽으로', menus).budget.amount, 10000);
  assert.strictEqual(parseUtterance('15000원', menus).budget.amount, 15000);
  assert.strictEqual(parseUtterance('3명이요', menus).people, 3);
});

test('메뉴 이름을 말하면 그 메뉴가 1순위 ("간짜장" 안의 "짜장"은 짜장면이 아님)', () => {
  const r = recommend({ text: '간짜장 주세요', menus });
  assert.strictEqual(names(r)[0], '간짜장');
  assert.deepStrictEqual(r.understood.mentionedMenuIds, [2]);
});

test('"~하면"의 "면"을 면 요리로 오해하지 않음', () => {
  const p = parseUtterance('맛있으면 좋겠어요', menus);
  assert.ok(!p.tags.includes('noodle'));
  assert.ok(parseUtterance('면', menus).tags.includes('noodle'));
  assert.ok(!parseUtterance('밥요리로 주세요', menus).tags.includes('dish'));
});

test('알아들은 게 없으면 대표 메뉴 + 질문', () => {
  const r = recommend({ text: '뭐 먹지?', menus });
  assert.strictEqual(r.fallback, true);
  assert.ok(r.question);
  for (const n of names(r)) assert.ok(byName(n).tags.includes('signature'));
});

test('같은 요리의 크기 차이(소·중)는 하나만', () => {
  const r = recommend({ text: '아이랑 먹을 만한 거', menus });
  const tang = names(r).filter((n) => n.startsWith('한돈 북경식 탕수육'));
  assert.ok(tang.length <= 1);
});

test('3명 → 3인용 요리로 조합', () => {
  const r = recommend({ text: '세 명이서 든든하게 먹고 싶어요', menus });
  assert.ok(r.combo);
  assert.strictEqual(r.combo.items[1].quantity, 3);
  const dish = menus.find((m) => m.id === r.combo.items[0].id);
  assert.strictEqual(dish.serves, 3);
});

test('대화 이어가기: 두 번째 답이 첫 번째에 더해짐', () => {
  const r1 = recommend({ text: '해물로 먹고 싶어요', menus });
  const r2 = recommend({ text: '안 매운 걸로', menus, context: r1.context });
  assert.ok(r2.understood.tags.includes('해물'));
  assert.strictEqual(r2.understood.spicy, false);
  for (const n of names(r2)) assert.ok(byName(n).spicy < 2);
});

test('고령층(senior)이면 추천 2개로 줄임', () => {
  const r = recommend({ text: '국물 있는 거', menus, ageGroup: 'senior' });
  assert.ok(r.recommendations.length <= 2);
});

test('품절 메뉴는 추천하지 않음', () => {
  const sold = menus.map((m) => (m.name === '짬뽕' ? { ...m, soldOut: true } : m));
  const r = recommend({ text: '짬뽕', menus: sold });
  assert.ok(!names(r).includes('짬뽕'));
});

test('AI는 추천만 한다: 응답에 장바구니·결제 동작 없음', () => {
  const r = recommend({ text: '탕수육', menus });
  assert.ok(!('cart' in r) && !('order' in r));
});

test('메뉴판용 matches: 조건에 맞는 메뉴만, 점수 순', () => {
  const r = recommend({ text: '안 매운 국물 있는 거요', menus });
  assert.ok(r.matches.length >= r.recommendations.length);
  for (const m of r.matches) {
    const menu = menus.find((x) => x.id === m.id);
    assert.ok(menu.spicy < 2, `${menu.name}은 맵지 않아야 함`);
    assert.ok(menu.tags.includes('soup'), `${menu.name}은 국물이 있어야 함`);
  }
  const scores = r.matches.map((m) => m.score);
  assert.deepStrictEqual(scores, [...scores].sort((a, b) => b - a));
});

test('고령층 메뉴판은 4개까지', () => {
  const r = recommend({ text: '돼지고기', menus, ageGroup: 'senior' });
  assert.ok(r.matches.length <= 4);
});

test('"탕수육"이라고 하면 메뉴판에 탕수육 종류가 모두 남음', () => {
  const r = recommend({ text: '탕수육', menus });
  const names = r.matches.map((m) => menus.find((x) => x.id === m.id).name);
  assert.ok(names.includes('찹쌀탕수육') && names.includes('생등심탕수육'));
  assert.ok(names.every((n) => n.includes('탕수육')));
});

test('매운 걸 원하면 메뉴판에 안 매운 메뉴가 남지 않음', () => {
  const r = recommend({ text: '매운 해물 요리 먹고 싶어요', menus });
  for (const m of r.matches) assert.ok(menus.find((x) => x.id === m.id).spicy >= 1);
});

test('"짜장"이라고 하면 짜장 종류만 (짬뽕·우동 제외)', () => {
  const r = recommend({ text: '짜장', menus });
  const names = r.matches.map((m) => menus.find((x) => x.id === m.id).name);
  assert.ok(names.length >= 3);
  assert.ok(names.every((n) => n.includes('짜장')), names.join(','));
});

test('문장 끝의 "밥"도 밥 요리로 인식, "~있으면"의 "면"은 무시', () => {
  assert.ok(parseUtterance('새우 빼고 밥', menus).tags.includes('rice'));
  assert.ok(parseUtterance('밥 주세요', menus).tags.includes('rice'));
  assert.ok(!parseUtterance('매운 거 있으면', menus).tags.includes('noodle'));
  const r = recommend({ text: '새우 빼고 밥', menus });
  assert.strictEqual(r.fallback, false);
  for (const m of r.matches) {
    const menu = menus.find((x) => x.id === m.id);
    assert.ok(menu.tags.includes('rice'), menu.name);
    assert.ok(!menu.ingredients.includes('새우'), menu.name);
  }
});

test('"매운 해물 요리" → 매운 해물 메뉴만, 1개로 줄어들지 않음 ("해물 요리"의 요리 = 음식)', () => {
  const r = recommend({ text: '매운 해물 요리', menus });
  assert.ok(!r.understood.tags.includes('나눠 먹는 요리'));
  assert.ok(r.matches.length >= 3, `matches ${r.matches.length}`);
  for (const m of r.matches) {
    const menu = menus.find((x) => x.id === m.id);
    assert.ok(menu.spicy >= 1 && menu.tags.includes('seafood'), menu.name);
  }
  assert.ok(parseUtterance('요리 하나 시킬게요', menus).tags.includes('dish'));
});
