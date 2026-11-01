// docs/contracts/api.md v1의 타입. Frontend가 그대로 import할 수 있도록 타입만 둔다 (런타임 코드 없음).

export type OrderType = 'dine_in' | 'takeout';
export type Answer = 'yes' | 'no' | 'skip';
export type Tag = 'spicy' | 'mild' | 'soup' | 'soft' | 'hearty';
/** 추천 점수에 쓰는 특징. 메뉴 태그 5개 + 엔진의 담백함 (questions v2) */
export type Feature = Tag | 'light';
/** questions v2: 특징 이유 + age_fit(또래 분들이 자주 드세요) + review_good(손님 평이 좋아요) + store_pick */
export type Reason = Feature | 'age_fit' | 'review_good' | 'store_pick';
/** v2 (D72). 서버로 보내지 않는다 (D47, D73). 서버는 세 연령대 결과를 모두 계산해 보낸다 */
export type AgeBand = 'under35' | '35to54' | '55plus';

export interface Category { id: string; name: string; sortOrder: number }
export interface MenuItem {
  id: string; name: string; price: number; categoryId: string;
  description: string | null; imageUrl: string | null;   // 예: "/static/menu-images/m001.jpg"
  tags: Tag[]; priority: number; sortOrder: number;
}
export interface Question { id: string; order: number; text: string }
export interface Recommendation { menu: MenuItem; score: number; reasons: Reason[] }
export interface OrderLine { menuId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }
export interface Order {
  orderId: string; orderType: OrderType; status: 'pending_payment' | 'paid';
  lines: OrderLine[]; totalAmount: number;
  orderNumber: string | null; paidAt: string | null;
}

// ---- 엔드포인트별 요청·응답 ----

/** GET /api/health */
export interface HealthResponse { ok: true }

/** GET /api/menu */
export interface MenuResponse { storeName: string; categories: Category[]; items: MenuItem[] }

/** GET /api/questions */
export interface QuestionsResponse { questions: Question[] }

/** POST /api/recommendations */
export interface AnswerInput { questionId: string; answer: Answer }
export interface RecommendationRequest { answers: AnswerInput[] }
export interface RecommendationResponse {
  /** 연령대 없이 계산한 결과 (판정 안 됨용, v1과 같은 자리) */
  items: Recommendation[];
  /** v2: 연령대별 결과. 브라우저가 손님 연령대 것을 고른다 */
  byAgeBand: Record<AgeBand, Recommendation[]>;
  /** v2: 점수에 쓴 엔진 결과 파일 버전. 엔진 파일이 없으면 "none" */
  engineVersion: string;
}

/** POST /api/orders → 201 Order */
export interface CreateOrderRequest { orderType: OrderType; items: { menuId: string; quantity: number }[] }

/** POST /api/orders/:orderId/payment */
export interface PaymentRequest { method: 'card_simulated'; simulate?: 'success' | 'fail' }
export type PaymentResponse =
  | { result: 'success'; order: Order }
  | { result: 'fail'; reason: string; order: Order };

// ---- v3 (2026-11-02): 상황 인식, 음성, 대화형 추천 ----

export type TimeOfDay = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night';
export type Crowd = 'low' | 'mid' | 'high';
export interface WeatherNow {
  tempC: number;
  /** WMO 날씨 코드 (Open-Meteo weather_code) */
  code: number;
  /** 손님에게 읽어 줄 한국어 표현. 예: "비", "맑음" */
  label: string;
  rainy: boolean;
  cold: boolean;
  hot: boolean;
}
/** GET /api/context — 시간대·날씨·혼잡도. 날씨는 못 받으면 null */
export interface ContextResponse {
  timeOfDay: TimeOfDay;
  /** 매장 로컬 시각 0~23 */
  hour: number;
  weather: WeatherNow | null;
  crowd: Crowd;
  /** 최근 crowdWindowMin분 결제 완료 주문 수 */
  recentOrders: number;
}

/** POST /api/tts — { text } → audio/mpeg. 키가 없으면 503 TTS_UNAVAILABLE */
export interface TtsRequest { text: string }

/** 대화에서 쓰는 손님 조건. 프론트 prototype/types.ts의 Conditions와 같은 모양 (raw 제외) */
export interface ChatConditions {
  party: number;
  spicy: number | null;
  kind: string;
  texture: string;
  exclude: string[];
  budget: number | null;
  totalBudget?: number | null;
}
export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export type Mood = 'tired' | 'celebrate' | 'quick' | 'neutral';
/** POST /api/chat */
export interface ChatRequest {
  turns: ChatTurn[];
  conditions: Partial<ChatConditions>;
  context: Partial<Pick<ContextResponse, 'timeOfDay' | 'weather' | 'crowd'>>;
}
export interface ChatResponse {
  /** 직원 말투의 짧은 답변 (TTS로 읽음) */
  reply: string;
  /** 이번 턴까지 파악한 조건. 프론트가 그대로 덮어쓴다 */
  conditions: ChatConditions;
  mood: Mood | null;
  /** 추천에 가점을 줄 메뉴 id (0~3개, 메뉴 지식 안의 id만) */
  picks: string[];
  /** true면 질문을 멈추고 추천 화면으로 */
  done: boolean;
  /** 서버가 쓴 모델. 디버그용 */
  model: string;
}

/** POST /api/condition-extraction — 기존 프론트(aiClient.ts) 계약. 단일 발화 → 조건 */
export interface ConditionExtractionRequest { utterance: string }
export interface ConditionExtractionResponse {
  conditions: {
    party_size: number;
    spicy_level: 0 | 1 | 2 | 3 | null;
    budget_per_person: number | null;
    excluded_ingredients: string[];
    food_keywords: string[];
  };
  source: 'llm';
}

/** 4xx, 5xx 공통 */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'MENU_NOT_FOUND'
  | 'MENU_UNAVAILABLE'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_PAID'
  /** 없는 경로나 파일 (/api, /static, /models). api.md v1.1에서 추가 */
  | 'NOT_FOUND'
  /** Google TTS 키가 없거나 호출 실패. 프론트는 브라우저 TTS로 */
  | 'TTS_UNAVAILABLE'
  /** Gemini 키가 없거나 호출 실패. 프론트는 규칙 해석으로 */
  | 'CHAT_UNAVAILABLE'
  | 'INTERNAL';
export interface ErrorResponse { error: { code: ErrorCode; message: string } }
