export interface Menu { id: string; name: string; price: number; category: string; kind: string; spicy: number; texture: string[]; flavor: string[]; ingredients: string[]; quantityUnit: string; servingMin?: number; servingPeople: number; pairings: string[]; soldOut?: boolean; badge?: string; description?: string; reviews?: string[]; keywords?: string[]; aliases?: string[]; ingredientsChecked?: boolean; spicyChecked?: boolean; options?: string[] }
export interface Line { id: string; quantity: number; option?: string }
export interface Conditions { party: number; spicy: number | null; kind: string; texture: string; exclude: string[]; budget: number | null; totalBudget?: number | null; raw: string }
/** talk: 직원 AI가 대화로 골랐을 때 그 근거(손님 말 인용, 이유, 리뷰 한 줄) */
export interface Recommendation { main: Menu; lines: Line[]; total: number; score: number; reasons: string[]; set?: boolean; light?: boolean; talk?: { heard: string | null; why: string; review: string | null } }
export type Screen = 'welcome' | 'menu' | 'notice' | 'input' | 'review' | 'results' | 'payment' | 'done';
