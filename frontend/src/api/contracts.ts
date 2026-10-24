// docs/contracts/api.md 의 타입과 같은 모양. 통합 후 backend/src/contracts.ts 를 import하도록 바꿀 수 있다.
// 필드를 임의로 추가하거나 바꾸지 않는다 (D37).

export type OrderType = 'dine_in' | 'takeout';
export type Answer = 'yes' | 'no' | 'skip';
export type Tag = 'spicy' | 'mild' | 'soup' | 'soft' | 'hearty';
export type Reason = Tag | 'store_pick';

export interface Category { id: string; name: string; sortOrder: number }
export interface MenuItem {
  id: string; name: string; price: number; categoryId: string;
  description: string | null; imageUrl: string | null;
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

export interface MenuResponse { storeName: string; categories: Category[]; items: MenuItem[] }
export interface AnswerInput { questionId: string; answer: Answer }
export interface ApiErrorBody { error: { code: string; message: string } }

export type PaymentResponse =
  | { result: 'success'; order: Order }
  | { result: 'fail'; reason: string; order: Order };
