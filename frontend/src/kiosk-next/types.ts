import type { Conditions, Line, Menu, Recommendation } from '../prototype/types';
import type { Order } from '../prototype/Receipt';
import type { PickReason } from '../prototype/recommendation';
export type { PickReason };

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
/** interrupted: 손님이 직원 말을 끊었음. 서버에는 "(끊김)"을 붙여 보내 다 못 들은 질문으로 다룹니다 */
export interface ChatTurn { role: 'user' | 'assistant'; text: string; interrupted?: boolean }
export type Mood = 'tired' | 'celebrate' | 'quick' | 'neutral';
/** 직원 AI 질문이 묻는 것: 인원, 매운맛, 종류, 빼는 재료, 그 밖(예/아니요). 서버 contracts.ts 와 같은 값입니다. */
export type Asking = 'party' | 'spicy' | 'kind' | 'exclude' | 'other';
export interface ChatReply {
  reply: string;
  conditions: Omit<Conditions, 'raw'>;
  mood: Mood | null;
  picks: string[];
  done: boolean;
  /** 서버가 알려 준 질문 종류. 2026-11-02 이전 서버는 보내지 않아 화면이 문장으로 추정합니다(layout.ts askingOf). */
  asking?: Asking | null;
  /** 2026-11-03부터: 대화로 고른 메뉴의 이유(순서 = 순위), 들은 조건 한 줄, 1명 가정 여부. 옛 서버는 없음 */
  pickReasons?: PickReason[];
  heardSummary?: string | null;
  partyAssumed?: boolean;
}
/** 추천 점수에 더해 주는 바깥 정보: 직원 AI가 고른 메뉴, 날씨·시간대 */
export interface RecommendExtra { picks?: string[]; pickReasons?: PickReason[]; context?: KioskContext | null }
