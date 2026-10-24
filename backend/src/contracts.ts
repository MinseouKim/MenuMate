// docs/contracts/api.md v1의 타입. Frontend가 그대로 import할 수 있도록 타입만 둔다 (런타임 코드 없음).

export type OrderType = 'dine_in' | 'takeout';
export type Answer = 'yes' | 'no' | 'skip';
export type Tag = 'spicy' | 'mild' | 'soup' | 'soft' | 'hearty';
export type Reason = Tag | 'store_pick';

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
export interface RecommendationResponse { items: Recommendation[] }

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
  | 'INTERNAL';
export interface ErrorResponse { error: { code: ErrorCode; message: string } }
