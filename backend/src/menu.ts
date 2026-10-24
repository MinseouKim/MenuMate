import type { PrismaClient } from '@prisma/client';
import type { Category, Tag } from './contracts.js';
import { TAGS, type MenuItemWithAvailability } from './recommend.js';

export interface Catalog {
  storeName: string;
  categories: Category[];
  /** 품절 포함 전체 메뉴. 카테고리 순 → sortOrder → id */
  items: MenuItemWithAvailability[];
}

const byTagOrder = (a: Tag, b: Tag) => TAGS.indexOf(a) - TAGS.indexOf(b);

export async function loadCatalog(prisma: PrismaClient): Promise<Catalog> {
  const [info, categories, menus] = await Promise.all([
    prisma.storeInfo.findUnique({ where: { id: 1 } }),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.menu.findMany({ include: { tags: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
  ]);
  const catIndex = new Map(categories.map((c, i) => [c.id, i]));
  const items = menus
    .map((m): MenuItemWithAvailability => ({
      id: m.id,
      name: m.name,
      price: m.price,
      categoryId: m.categoryId,
      description: m.description,
      imageUrl: m.image ? `/static/${m.image}` : null,
      tags: m.tags.map((t) => t.tagId as Tag).sort(byTagOrder),
      priority: m.priority,
      sortOrder: m.sortOrder,
      isAvailable: m.isAvailable,
    }))
    .sort((a, b) => (catIndex.get(a.categoryId) ?? 0) - (catIndex.get(b.categoryId) ?? 0));
  return {
    storeName: info?.storeName ?? '',
    categories: categories.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
    items,
  };
}
