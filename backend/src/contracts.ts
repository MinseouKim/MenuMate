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

/** 4xx, 5xx 공통 */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'MENU_NOT_FOUND'
  | 'MENU_UNAVAILABLE'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_PAID'
  /** 없는 경로나 파일 (/api, /static, /models). api.md v1.1에서 추가 */
  | 'NOT_FOUND'
  | 'INTERNAL';
export interface ErrorResponse { error: { code: ErrorCode; message: string } }
