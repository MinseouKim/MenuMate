import fs from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { TAGS } from '../recommend.js';
import { validateMenuFile, type MenuFile } from './validate.js';

/**
 * 메뉴 쪽 테이블(StoreInfo, Category, Menu, MenuTag, Tag)을 한 트랜잭션에서 교체한다.
 * 주문·결제·주문번호 테이블은 건드리지 않는다.
 */
export async function seedMenu(prisma: PrismaClient, data: MenuFile): Promise<{ categories: number; items: number }> {
  await prisma.$transaction(async (tx) => {
    await tx.menuTag.deleteMany();
    await tx.menu.deleteMany();
    await tx.category.deleteMany();
    for (const id of TAGS) await tx.tag.upsert({ where: { id }, create: { id }, update: {} });
    await tx.category.createMany({ data: data.categories.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })) });
    await tx.menu.createMany({
      data: data.items.map((m) => ({
        id: m.id, name: m.name, price: m.price, categoryId: m.categoryId, description: m.description,
        image: m.image, priority: m.priority, isAvailable: m.isAvailable, sortOrder: m.sortOrder,
      })),
    });
    await tx.menuTag.createMany({ data: data.items.flatMap((m) => m.tags.map((tagId) => ({ menuId: m.id, tagId }))) });
    const info = { storeName: data.storeName, menuVersion: data.version, seededAt: new Date() };
    await tx.storeInfo.upsert({ where: { id: 1 }, create: { id: 1, ...info }, update: info });
  });
  return { categories: data.categories.length, items: data.items.length };
}

export type SeedResult = { ok: true; categories: number; items: number } | { ok: false; errors: string[] };

/** 파일을 읽어 검증하고, 통과하면 시드한다. 실패하면 DB를 바꾸지 않는다. */
export async function runSeed(prisma: PrismaClient, filePath: string): Promise<SeedResult> {
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { ok: false, errors: [`${filePath}: 파일을 읽지 못했어요 (${(e as Error).message})`] };
  }
  const v = validateMenuFile(json);
  if (!v.ok) return v;
  return { ok: true, ...(await seedMenu(prisma, v.data)) };
}
