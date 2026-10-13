export interface Menu { id: string; name: string; price: number; category: string; kind: string; spicy: number; texture: string[]; flavor: string[]; ingredients: string[]; quantityUnit: string; servingMin?: number; servingPeople: number; pairings: string[]; soldOut?: boolean; badge?: string; description?: string; reviews?: string[]; keywords?: string[]; aliases?: string[]; ingredientsChecked?: boolean; spicyChecked?: boolean; options?: string[] }
export interface Line { id: string; quantity: number; option?: string }
export interface Conditions { party: number; spicy: number | null; kind: string; texture: string; exclude: string[]; budget: number | null; totalBudget?: number | null; raw: string }
export interface Recommendation { main: Menu; lines: Line[]; total: number; score: number; reasons: string[]; set?: boolean; light?: boolean }
export type Screen = 'welcome' | 'menu' | 'notice' | 'input' | 'review' | 'results' | 'payment' | 'done';
