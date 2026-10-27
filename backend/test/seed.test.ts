import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { validateMenuFile } from '../src/seed/validate.js';
import { runSeed } from '../src/seed/seed.js';
import { dummyMenuPath, fixtureMenu, resetDb, seedFixture, testPrisma } from './helpers.js';

const TAGS = ['spicy', 'mild', 'soup', 'soft', 'hearty'];

/** JPEG SOF 마커에서 가로 픽셀 수를 읽는다 */
function jpegWidth(buf: Buffer): number {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return buf.readUInt16BE(i + 7);
    i += 2 + len;
  }
  throw new Error('JPEG 크기를 찾지 못함');
}

function errorsOf(mutate: (f: any) => void): string[] {
  const f: any = fixtureMenu();
  mutate(f);
  const r = validateMenuFile(f);
  if (r.ok) throw new Error('검증이 통과하면 안 됨');
  return r.errors;
}

describe('validateMenuFile', () => {
  it('올바른 파일은 통과한다', () => {
    expect(validateMenuFile(fixtureMenu()).ok).toBe(true);
  });

  it('없는 카테고리를 가리키면 그 메뉴의 categoryId를 알려 준다', () => {
    const e = errorsOf((f) => { f.items[2].categoryId = 'nope'; });
    expect(e.join('\n')).toMatch(/m003.*categoryId/);
  });

  it.each([[0], [-100], [9000.5], ['9000']])('price %s는 실패한다', (price) => {
    const e = errorsOf((f) => { f.items[3].price = price; });
    expect(e.join('\n')).toMatch(/m004.*price/);
  });

  it('목록에 없는 태그는 실패한다', () => {
    const e = errorsOf((f) => { f.items[0].tags = ['soup', 'sweet']; });
    expect(e.join('\n')).toMatch(/m001.*tags.*sweet/);
  });

  it('메뉴 id 중복은 실패한다', () => {
    const e = errorsOf((f) => { f.items[1].id = 'm001'; });
    expect(e.join('\n')).toMatch(/m001.*id.*중복/);
  });

  it('카테고리 id 중복과 형식 오류는 실패한다', () => {
    expect(errorsOf((f) => { f.categories[1].id = 'stew'; }).join('\n')).toMatch(/categories\[1\].*id.*중복/);
    expect(errorsOf((f) => { f.categories[0].id = 'Stew'; }).join('\n')).toMatch(/categories\[0\].*id/);
  });

  it('priority는 0~3 정수', () => {
    expect(errorsOf((f) => { f.items[0].priority = 4; }).join('\n')).toMatch(/m001.*priority/);
    expect(errorsOf((f) => { f.items[0].priority = 1.5; }).join('\n')).toMatch(/m001.*priority/);
  });

  it('필수 필드가 빠지면 실패한다', () => {
    expect(errorsOf((f) => { delete f.items[0].isAvailable; }).join('\n')).toMatch(/m001.*isAvailable/);
    expect(errorsOf((f) => { delete f.items[0].image; }).join('\n')).toMatch(/m001.*image/);
    expect(errorsOf((f) => { delete f.storeName; }).join('\n')).toMatch(/storeName/);
  });

  it('image는 menu-images/ 아래 상대 경로만 허용한다 (외부 URL 금지)', () => {
    expect(errorsOf((f) => { f.items[0].image = 'https://example.com/a.jpg'; }).join('\n')).toMatch(/m001.*image/);
    expect(errorsOf((f) => { f.items[0].image = 'menu-images/../../secret'; }).join('\n')).toMatch(/m001.*image/);
  });

  it('여러 오류를 한 번에 모두 알려 준다', () => {
    const e = errorsOf((f) => { f.items[0].price = 0; f.items[1].tags = ['x']; });
    expect(e.length).toBeGreaterThanOrEqual(2);
  });
});

describe('더미 메뉴 (seed/menu.dummy.json)', () => {
  const dummy = JSON.parse(fs.readFileSync(dummyMenuPath, 'utf8'));

  it('검증을 통과한다', () => {
    const r = validateMenuFile(dummy);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it('한식 20~30개, 카테고리 4~6개', () => {
    expect(dummy.items.length).toBeGreaterThanOrEqual(20);
    expect(dummy.items.length).toBeLessThanOrEqual(30);
    expect(dummy.categories.length).toBeGreaterThanOrEqual(4);
    expect(dummy.categories.length).toBeLessThanOrEqual(6);
  });

  describe('예시 사진 (D77)', () => {
    const imageDir = path.join(path.dirname(dummyMenuPath), 'menu-images');
    const withImage = dummy.items.filter((i: any) => i.image !== null);
    const credits = fs.readFileSync(path.join(imageDir, 'CREDITS.md'), 'utf8');

    it('사진이 있는 메뉴는 seed/menu-images/ 안의 실제 JPEG 파일을 가리킨다', () => {
      expect(withImage.length).toBeGreaterThan(0);
      for (const item of withImage) {
        const file = path.join(imageDir, item.image.replace(/^menu-images\//, ''));
        expect(fs.existsSync(file), `${item.id} ${item.image}`).toBe(true);
        expect(fs.readFileSync(file).subarray(0, 3).toString('hex'), item.id).toBe('ffd8ff');
      }
    });

    it('사진마다 CREDITS.md에 출처 URL과 라이선스가 있다', () => {
      for (const item of withImage) {
        const name = path.basename(item.image);
        const row = credits.split('\n').find((l) => l.includes(`| ${name} |`));
        expect(row, `${name} 행 없음`).toBeDefined();
        expect(row).toMatch(/https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
        expect(row).toMatch(/CC0|Public domain|CC BY \d/);
        expect(row).not.toMatch(/BY-SA/);
      }
    });

    it('사진 하나는 300KB 이하, 가로 800px 이하', () => {
      for (const item of withImage) {
        const buf = fs.readFileSync(path.join(imageDir, path.basename(item.image)));
        expect(buf.length, item.id).toBeLessThanOrEqual(300 * 1024);
        expect(jpegWidth(buf), item.id).toBeLessThanOrEqual(800);
      }
    });
  });

  it('태그 5개가 골고루 쓰이고 priority≥1 메뉴가 2~3개', () => {
    for (const t of TAGS) {
      const n = dummy.items.filter((i: any) => i.tags.includes(t)).length;
      expect(n, t).toBeGreaterThanOrEqual(4);
    }
    const picks = dummy.items.filter((i: any) => i.priority >= 1).length;
    expect(picks).toBeGreaterThanOrEqual(2);
    expect(picks).toBeLessThanOrEqual(3);
  });
});

describe('runSeed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menumate-seed-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const write = (name: string, body: unknown) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body));
    return p;
  };

  beforeEach(() => resetDb());

  it('메뉴, 카테고리, 태그, 가게 이름을 DB에 넣는다', async () => {
    const r = await runSeed(testPrisma, write('ok.json', fixtureMenu()));
    expect(r).toEqual({ ok: true, categories: 3, items: 7 });
    expect(await testPrisma.menu.count()).toBe(7);
    expect((await testPrisma.tag.findMany()).map((t) => t.id).sort()).toEqual([...TAGS].sort());
    expect((await testPrisma.storeInfo.findUnique({ where: { id: 1 } }))?.storeName).toBe('테스트 식당');
    const m1 = await testPrisma.menu.findUnique({ where: { id: 'm001' }, include: { tags: true } });
    expect(m1?.tags.map((t) => t.tagId).sort()).toEqual(['mild', 'soft', 'soup']);
  });

  it('검증에 실패하면 오류를 돌려주고 DB를 바꾸지 않는다', async () => {
    await seedFixture();
    const bad: any = fixtureMenu();
    bad.storeName = '바뀐 이름';
    bad.items = bad.items.slice(0, 2);
    bad.items[1].price = 0;
    const r = await runSeed(testPrisma, write('bad.json', bad));
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.errors.join('\n')).toMatch(/m002.*price/);
    expect(await testPrisma.menu.count()).toBe(7);
    expect((await testPrisma.storeInfo.findUnique({ where: { id: 1 } }))?.storeName).toBe('테스트 식당');
  });

  it('JSON 문법 오류도 DB를 바꾸지 않는다', async () => {
    await seedFixture();
    const r = await runSeed(testPrisma, write('broken.json', '{ "items": ['));
    expect(r.ok).toBe(false);
    expect(await testPrisma.menu.count()).toBe(7);
  });

  it('파일이 없으면 실패를 돌려준다', async () => {
    const r = await runSeed(testPrisma, path.join(tmp, 'none.json'));
    expect(r.ok).toBe(false);
  });

  it('다시 시드하면 메뉴를 교체하고, 지난 주문은 그대로 남는다', async () => {
    await seedFixture();
    await testPrisma.order.create({
      data: {
        id: 'o1', orderType: 'dine_in', status: 'pending_payment', totalAmount: 9000,
        items: { create: [{ lineNo: 1, menuId: 'm001', name: '된장찌개', unitPrice: 9000, quantity: 1, lineTotal: 9000 }] },
      },
    });
    const next: any = fixtureMenu();
    next.items = next.items.filter((i: any) => i.id !== 'm001');
    const r = await runSeed(testPrisma, write('next.json', next));
    expect(r.ok).toBe(true);
    expect(await testPrisma.menu.findUnique({ where: { id: 'm001' } })).toBeNull();
    expect(await testPrisma.orderItem.count({ where: { orderId: 'o1' } })).toBe(1);
  });
});
