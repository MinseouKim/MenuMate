// isFeatured: 서버(team-source/server) 관리자 화면에서 점주가 "추천 메뉴"로 지정했는지.
// 서버가 연결돼 있을 때만 menuLive.ts가 external_id로 짝을 맞춰 덮어쓴다 — 서버가 없으면 항상 비워 둔다.
export interface Menu { id: string; name: string; price: number; category: string; kind: string; spicy: number; texture: string[]; flavor: string[]; ingredients: string[]; quantityUnit: string; servingMin?: number; servingPeople: number; pairings: string[]; soldOut?: boolean; badge?: string; description?: string; reviews?: string[]; keywords?: string[]; aliases?: string[]; ingredientsChecked?: boolean; spicyChecked?: boolean; options?: string[]; isFeatured?: boolean }
export interface Line { id: string; quantity: number; option?: string }
export interface Conditions { party: number; spicy: number | null; kind: string; texture: string; exclude: string[]; budget: number | null; totalBudget?: number | null; raw: string }
export interface Recommendation { main: Menu; lines: Line[]; total: number; score: number; reasons: string[]; set?: boolean; light?: boolean }
export type Screen = 'welcome' | 'menu' | 'notice' | 'input' | 'review' | 'results' | 'payment' | 'done';
