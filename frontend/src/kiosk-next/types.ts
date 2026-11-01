import type { Conditions, Line, Menu, Recommendation } from '../prototype/types';
import type { Order } from '../prototype/Receipt';

export type { Conditions, Line, Menu, Recommendation, Order };

export type Screen = 'welcome' | 'menu' | 'notice' | 'input' | 'review' | 'results' | 'payment' | 'done';
/** order: 메뉴를 직접 고르는 길, recommend: 말로 추천받는 길 */
export type Mode = 'order' | 'recommend';

export interface Prefs { large: boolean; voice: boolean; contrast: boolean; low: boolean }

export type Dine = '매장' | '포장';
export interface PaymentResult { method: string; amount: number; dine: Dine }

export type Dialog =
  | { kind: 'info'; menu: Menu; tab: 'info' | 'reviews' }
  | { kind: 'home' | 'help' | 'idle' | 'settings' | 'confirm' }
  | { kind: 'spoken' | 'option'; menu: Menu; quantity: number };

export const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;
