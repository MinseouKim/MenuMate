import type { Tag } from '../contracts.js';
import { TAGS } from '../recommend.js';

/** docs/contracts/menu-schema.md 파일 형태 */
export interface MenuFile {
  storeName: string;
  version: string;
  categories: { id: string; name: string; sortOrder: number }[];
  items: {
    id: string; name: string; price: number; categoryId: string;
    description: string | null; image: string | null; tags: Tag[];
    priority: number; isAvailable: boolean; sortOrder: number;
  }[];
}

export type ValidationResult = { ok: true; data: MenuFile } | { ok: false; errors: string[] };

const CATEGORY_ID = /^[a-z0-9-]+$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const show = (v: unknown) => (v === undefined ? '없음' : JSON.stringify(v));

/** menu-images/ 아래 상대 경로만 허용 (외부 URL, 절대 경로, .. 금지) */
function isImagePath(v: string): boolean {
  if (!v.startsWith('menu-images/') || v.includes('\\')) return false;
  return v.split('/').slice(1).every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/**
 * menu-schema.md의 검증 규칙. 문제가 있으면 "어떤 항목의 어떤 필드"인지 모두 모아 돌려준다.
 * 예: "items[3](m004).price: 0보다 큰 정수여야 해요 (받은 값: 0)"
 */
export function validateMenuFile(json: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(json)) return { ok: false, errors: ['파일 전체가 JSON 객체여야 해요'] };

  if (!isText(json.storeName)) errors.push(`storeName: 비어 있지 않은 문자열이어야 해요 (받은 값: ${show(json.storeName)})`);
  if (typeof json.version !== 'string') errors.push(`version: 문자열이어야 해요 (받은 값: ${show(json.version)})`);

  const categoryIds = new Set<string>();
  if (!Array.isArray(json.categories)) {
    errors.push('categories: 배열이어야 해요');
  } else {
    json.categories.forEach((c: unknown, i: number) => {
      const at = `categories[${i}]`;
      if (!isObj(c)) return void errors.push(`${at}: 객체여야 해요`);
      const label = `${at}(${String(c.id)})`;
      if (typeof c.id !== 'string' || !CATEGORY_ID.test(c.id)) {
        errors.push(`${label}.id: 영문 소문자, 숫자, -만 쓸 수 있어요 (받은 값: ${show(c.id)})`);
      } else if (categoryIds.has(c.id)) {
        errors.push(`${label}.id: 중복된 id예요`);
      } else {
        categoryIds.add(c.id);
      }
      if (!isText(c.name)) errors.push(`${label}.name: 비어 있지 않은 문자열이어야 해요`);
      if (!isInt(c.sortOrder)) errors.push(`${label}.sortOrder: 정수여야 해요 (받은 값: ${show(c.sortOrder)})`);
    });
  }

  const itemIds = new Set<string>();
  if (!Array.isArray(json.items)) {
    errors.push('items: 배열이어야 해요');
  } else {
    json.items.forEach((m: unknown, i: number) => {
      const at = `items[${i}]`;
      if (!isObj(m)) return void errors.push(`${at}: 객체여야 해요`);
      const label = `${at}(${String(m.id)})`;
      if (!isText(m.id)) errors.push(`${label}.id: 비어 있지 않은 문자열이어야 해요`);
      else if (itemIds.has(m.id)) errors.push(`${label}.id: 중복된 id예요`);
      else itemIds.add(m.id);
      if (!isText(m.name)) errors.push(`${label}.name: 비어 있지 않은 문자열이어야 해요`);
      if (!isInt(m.price) || m.price <= 0) errors.push(`${label}.price: 0보다 큰 정수여야 해요 (받은 값: ${show(m.price)})`);
      if (typeof m.categoryId !== 'string' || !categoryIds.has(m.categoryId)) {
        errors.push(`${label}.categoryId: categories에 없는 카테고리예요 (받은 값: ${show(m.categoryId)})`);
      }
      if (m.description !== undefined && m.description !== null && typeof m.description !== 'string') {
        errors.push(`${label}.description: 문자열이나 null이어야 해요`);
      }
      if (m.image === undefined) errors.push(`${label}.image: 필수 필드예요 (사진이 없으면 null)`);
      else if (m.image !== null && (typeof m.image !== 'string' || !isImagePath(m.image))) {
        errors.push(`${label}.image: menu-images/ 로 시작하는 상대 경로나 null이어야 해요 (받은 값: ${show(m.image)})`);
      }
      if (!Array.isArray(m.tags)) {
        errors.push(`${label}.tags: 배열이어야 해요`);
      } else {
        const bad = m.tags.filter((t: unknown) => !TAGS.includes(t as Tag));
        if (bad.length) errors.push(`${label}.tags: 목록에 없는 태그예요 ${bad.map(show).join(', ')} (가능: ${TAGS.join(', ')})`);
        if (new Set(m.tags).size !== m.tags.length) errors.push(`${label}.tags: 같은 태그가 두 번 있어요`);
      }
      if (!isInt(m.priority) || m.priority < 0 || m.priority > 3) {
        errors.push(`${label}.priority: 0~3 정수여야 해요 (받은 값: ${show(m.priority)})`);
      }
      if (typeof m.isAvailable !== 'boolean') errors.push(`${label}.isAvailable: true나 false여야 해요 (받은 값: ${show(m.isAvailable)})`);
      if (!isInt(m.sortOrder)) errors.push(`${label}.sortOrder: 정수여야 해요 (받은 값: ${show(m.sortOrder)})`);
    });
  }

  if (errors.length) return { ok: false, errors };
  const file = json as unknown as MenuFile;
  return {
    ok: true,
    data: { ...file, items: file.items.map((m) => ({ ...m, description: m.description ?? null })) },
  };
}
