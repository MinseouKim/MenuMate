// 대화형 추천이 참고하는 우루루 메뉴 지식. 프론트의 menus.json과 review/menu_reviews.json을 그대로 읽어
// 메뉴당 한 줄로 요약한다 (LLM 프롬프트에 넣을 분량). 서버 DB(더미 26메뉴)와는 별개다 (D87 후속 전까지).
import fs from 'node:fs';
import path from 'node:path';

export interface KnowledgeMenu {
  id: string;
  name: string;
  price: number;
  category: string;
  kind: string;
  spicy: number;
  servingPeople: number;
  quantityUnit: string;
  ingredients: string[];
  texture: string[];
  description?: string;
  badge?: string;
  keywords: string[];
  aliases: string[];
  soldOut?: boolean;
  /** 재료 목록을 사람이 확인했는지. 목록이 비어 있고 이 값이 없으면 '들어간 게 없음'이 아니라 '아직 확인 안 됨' (menus.json) */
  ingredientsChecked?: boolean;
  /** 리뷰에서 뽑은 키워드 (menu_reviews.json) */
  reviewKeywords: string[];
  /** 리뷰 한 줄 (요약 우선) */
  reviewQuote: string | null;
}

export interface MenuKnowledge {
  menus: KnowledgeMenu[];
  ids: Set<string>;
  kinds: string[];
  /** 프롬프트용 한 줄 요약 목록 */
  lines(): string[];
  byId(id: string): KnowledgeMenu | undefined;
}

interface RawMenu extends Omit<KnowledgeMenu, 'reviewKeywords' | 'reviewQuote' | 'keywords' | 'aliases'> {
  keywords?: string[];
  aliases?: string[];
}
interface RawReviews {
  updated?: string;
  menus: { id: string; keywords?: string[]; reviews?: { quote: string; summary?: string }[] }[];
}

export function loadMenuKnowledge(dir: string, log?: { warn(msg: string): void }): MenuKnowledge | null {
  const menusFile = path.join(dir, 'menus.json');
  if (!fs.existsSync(menusFile)) {
    log?.warn(`메뉴 데이터가 없어 대화형 추천을 끕니다: ${menusFile}`);
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(menusFile, 'utf8')) as RawMenu[];
  const reviewsFile = path.join(dir, 'review', 'menu_reviews.json');
  const reviews = new Map<string, RawReviews['menus'][number]>();
  if (fs.existsSync(reviewsFile)) {
    for (const r of (JSON.parse(fs.readFileSync(reviewsFile, 'utf8')) as RawReviews).menus) reviews.set(r.id, r);
  }
  return fromData(raw, reviews);
}

export function fromData(raw: RawMenu[], reviews: Map<string, RawReviews['menus'][number]> = new Map()): MenuKnowledge {
  const menus: KnowledgeMenu[] = raw.map((m) => {
    const r = reviews.get(m.id);
    const first = r?.reviews?.[0];
    return {
      ...m,
      keywords: m.keywords ?? [],
      aliases: m.aliases ?? [],
      reviewKeywords: (r?.keywords ?? []).slice(0, 3),
      reviewQuote: first ? (first.summary ?? first.quote).slice(0, 80) : null,
    };
  });
  const ids = new Set(menus.map((m) => m.id));
  const kinds = [...new Set(menus.map((m) => m.kind))];
  return {
    menus,
    ids,
    kinds,
    byId: (id) => menus.find((m) => m.id === id),
    lines: () =>
      menus
        .filter((m) => !m.soldOut)
        .map((m) => {
          const parts = [
            `${m.id} | ${m.name} | ${m.kind} | ${m.price.toLocaleString('ko-KR')}원`,
            `맵기 ${m.spicy}/3`,
            `${m.servingPeople}인분(${m.quantityUnit})`,
          ];
          if (m.ingredients.length) parts.push(`재료: ${m.ingredients.join(',')}`);
          else if (!m.ingredientsChecked) parts.push('재료: 확인 안 됨');
          if (m.texture.length) parts.push(`식감: ${m.texture.join(',')}`);
          if (m.badge) parts.push(m.badge);
          if (m.reviewKeywords.length) parts.push(`리뷰: ${m.reviewKeywords.join(',')}`);
          return parts.join(' | ');
        }),
  };
}
