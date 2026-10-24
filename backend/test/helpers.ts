import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { MenuFile } from '../src/seed/validate.js';
import { seedMenu } from '../src/seed/seed.js';
import { backendDir, testDbUrl } from './setup/db-url.js';

export const testPrisma = new PrismaClient({ datasourceUrl: testDbUrl });

export async function resetDb(prisma: PrismaClient = testPrisma): Promise<void> {
  await prisma.$transaction([
    prisma.paymentAttempt.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.dailyOrderCounter.deleteMany(),
    prisma.menuTag.deleteMany(),
    prisma.menu.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.category.deleteMany(),
    prisma.storeInfo.deleteMany(),
  ]);
}

export function fixtureMenu(): MenuFile {
  return {
    storeName: '테스트 식당',
    version: 'test-1',
    categories: [
      { id: 'stew', name: '찌개', sortOrder: 1 },
      { id: 'rice', name: '밥', sortOrder: 2 },
      { id: 'noodle', name: '면', sortOrder: 3 },
    ],
    items: [
      { id: 'm001', name: '된장찌개', price: 9000, categoryId: 'stew', description: '구수한 찌개', image: null, tags: ['soup', 'mild', 'soft'], priority: 0, isAvailable: true, sortOrder: 1 },
      { id: 'm002', name: '김치찌개', price: 9000, categoryId: 'stew', description: null, image: null, tags: ['soup', 'spicy'], priority: 1, isAvailable: true, sortOrder: 2 },
      { id: 'm003', name: '비빔밥', price: 10000, categoryId: 'rice', description: null, image: null, tags: ['mild', 'hearty'], priority: 0, isAvailable: true, sortOrder: 1 },
      { id: 'm004', name: '제육덮밥', price: 11000, categoryId: 'rice', description: null, image: null, tags: ['spicy', 'hearty'], priority: 0, isAvailable: true, sortOrder: 2 },
      { id: 'm005', name: '잔치국수', price: 8000, categoryId: 'noodle', description: null, image: null, tags: ['soup', 'mild', 'soft'], priority: 0, isAvailable: true, sortOrder: 1 },
      { id: 'm006', name: '냉면', price: 9500, categoryId: 'noodle', description: null, image: null, tags: [], priority: 2, isAvailable: false, sortOrder: 2 },
      { id: 'm007', name: '칼국수', price: 12000, categoryId: 'noodle', description: null, image: 'menu-images/m007.jpg', tags: ['hearty'], priority: 0, isAvailable: true, sortOrder: 3 },
    ],
  };
}

export async function seedFixture(file: MenuFile = fixtureMenu()): Promise<void> {
  await seedMenu(testPrisma, file);
}

export const dummyMenuPath = path.join(backendDir, 'seed', 'menu.dummy.json');
