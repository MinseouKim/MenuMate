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
  | { kind: 'spoken' | 'option'; menu: Menu; quantity: number }
  /** 카메라가 본 불편 신호(얼굴이 가까워짐·눈 찌푸림)로 큰 글씨를 제안 */
  | { kind: 'comfort'; signal: ComfortSignal };

export type ComfortSignal = 'approach' | 'squint';

export const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;

// ---- 대화형 추천 (서버 /api/chat, /api/context. 모양은 backend/src/contracts.ts v3와 같음) ----
export type TimeOfDay = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night';
export interface WeatherNow { tempC: number; code: number; label: string; rainy: boolean; cold: boolean; hot: boolean }
export interface KioskContext { timeOfDay: TimeOfDay; hour: number; weather: WeatherNow | null; crowd: 'low' | 'mid' | 'high'; recentOrders: number }
export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export type Mood = 'tired' | 'celebrate' | 'quick' | 'neutral';
export interface ChatReply {
  reply: string;
  conditions: Omit<Conditions, 'raw'>;
  mood: Mood | null;
  picks: string[];
  done: boolean;
}
/** 추천 점수에 더해 주는 바깥 정보: 직원 AI가 고른 메뉴, 날씨·시간대 */
export interface RecommendExtra { picks?: string[]; context?: KioskContext | null }
