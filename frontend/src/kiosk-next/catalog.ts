// 메뉴판. 메뉴 데이터·사진·리뷰·초성 검색이 어디서 오는지는 이 모듈 안에 숨깁니다.
// 화면은 이 인터페이스만 알면 됩니다. 테스트에서는 createCatalog 에 가짜 메뉴를 넣습니다.
import menuData from '../prototype/menu/menus.json';
import { matchesChosung } from '../prototype/hangul';
import { menuImage, menuImageFocus } from '../prototype/menuImages';
import { menuReviews, type MenuReviewSet } from '../prototype/menuReviews';
import type { Menu } from './types';

export interface Category { id: string; label: string }

// 매장 메뉴판(네이버 플레이스 메뉴 사진, 2026-11-01) 순서와 이름을 따릅니다: DIMSUM → APPETIZER → SOUP → VEGETABLE → SEAFOOD → BEEF → PORK → CHICKEN → NOODLE → RICE.
// 베이징덕은 메뉴판 사진에 따로 없어 대표 메뉴로 맨 앞에 둡니다. 분류 id(cold, vegetable 등)는 영수증 QR 이 쓰므로 바꾸지 않고 이름만 메뉴판대로 씁니다.
export const CATEGORIES: readonly Category[] = [
  { id: 'duck-fish', label: '베이징덕' },
  { id: 'dimsum', label: '딤섬' },
  { id: 'cold', label: '애피타이저' },
  { id: 'soup', label: '스프' },
  { id: 'vegetable', label: '야채' },
  { id: 'seafood', label: '해산물' },
  { id: 'beef', label: '소고기' },
  { id: 'pork', label: '돼지고기' },
  { id: 'chicken', label: '치킨' },
  { id: 'noodle', label: '면' },
  { id: 'rice', label: '밥' },
];

export interface Catalog {
  readonly menus: readonly Menu[];
  readonly categories: readonly Category[];
  /** 없는 id 는 프로그램 오류이므로 던집니다. */
  get(id: string): Menu;
  inCategory(categoryId: string): Menu[];
  /** 메뉴 이름의 초성으로 찾습니다. 빈 문자열이면 아무것도 돌려주지 않습니다. */
  search(chosung: string): Menu[];
  photo(id: string): string | undefined;
  /** 사진을 잘라 보여 줄 때 음식이 가운데 오게 하는 기준점(CSS object-position). 없으면 가운데. */
  focus(id: string): string | undefined;
  reviews(id: string): MenuReviewSet | undefined;
}

export interface CatalogExtras {
  photo?: (id: string) => string | undefined;
  focus?: (id: string) => string | undefined;
  reviews?: (id: string) => MenuReviewSet | undefined;
}

export function createCatalog(menus: readonly Menu[], extras: CatalogExtras = {}): Catalog {
  const byId = new Map(menus.map(m => [m.id, m]));
  return {
    menus,
    categories: CATEGORIES,
    get(id) {
      const menu = byId.get(id);
      if (!menu) throw new Error(`알 수 없는 메뉴: ${id}`);
      return menu;
    },
    inCategory: categoryId => menus.filter(m => m.category === categoryId),
    search: query => (query ? menus.filter(m => matchesChosung(m.name, query)) : []),
    photo: id => extras.photo?.(id),
    focus: id => extras.focus?.(id),
    reviews: id => extras.reviews?.(id),
  };
}

export const catalog: Catalog = createCatalog(menuData as Menu[], { photo: menuImage, focus: menuImageFocus, reviews: menuReviews });
