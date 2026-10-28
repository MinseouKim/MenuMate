import reviewData from './menu/review/menu_reviews.json';

// 원본: ururu-menu/menu_reviews.json (네이버지도·카카오맵·캐치테이블에서 메뉴마다 최대 3개를 고른 인용).
// 원본이나 요약(menu/review/review_summaries.json)을 고치면 node team-source/scripts/buildMenuReviews.mjs 로 다시 만듭니다.
// date: 캡처에서 작성일이 보이지 않은 리뷰는 null (지어내지 않고 화면에서 날짜만 생략)
export interface MenuReview { platform: string; date: string | null; rating: number | null; quote: string; scope?: string; summary?: string; truncated?: boolean }
export interface MenuReviewSet { keywords: string[]; reviews: MenuReview[] }

const byId = new Map<string, MenuReviewSet>(reviewData.menus.map(m => [m.id, { keywords: m.keywords, reviews: m.reviews }]));

export const menuReviews = (id: string) => byId.get(id);
// 리뷰를 모은 날짜 (예: 2026.10.26)
export const REVIEWS_UPDATED = reviewData.updated.replaceAll('-', '.');
