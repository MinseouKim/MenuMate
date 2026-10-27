import { config } from '../config';
import type {
  AnswerInput, ApiErrorBody, MenuResponse, Order, OrderType, PaymentResponse, Question, RecommendationsResponse,
} from './contracts';

const FALLBACK_MESSAGE = '잠시 문제가 생겼어요. 다시 시도해 주세요.';

/** 화면에 그대로 띄울 수 있는 한국어 message를 가진 오류 (api.md 공통 에러 형식) */
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : FALLBACK_MESSAGE);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(config.apiBaseUrl + path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', FALLBACK_MESSAGE);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(err?.code ?? 'INTERNAL', err?.message ?? FALLBACK_MESSAGE);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(data) });

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),
  menu: () => request<MenuResponse>('/api/menu'),
  questions: () => request<{ questions: Question[] }>('/api/questions').then(r => r.questions),
  // 요청에는 답만 보낸다. 연령대는 보내지 않는다 (D47, D73)
  recommendations: (answers: AnswerInput[]) => post<RecommendationsResponse>('/api/recommendations', { answers }),
  createOrder: (orderType: OrderType, items: { menuId: string; quantity: number }[]) =>
    post<Order>('/api/orders', { orderType, items }),
  payOrder: (orderId: string, simulate?: 'success' | 'fail') =>
    post<PaymentResponse>(`/api/orders/${encodeURIComponent(orderId)}/payment`,
      simulate ? { method: 'card_simulated', simulate } : { method: 'card_simulated' }),
};
