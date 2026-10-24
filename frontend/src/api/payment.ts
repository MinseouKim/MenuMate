import { api } from './client';

// 결제는 이 인터페이스 뒤에 숨긴다 (D13). 지금은 서버의 시뮬레이션 결제를 부르는 구현체 하나뿐이다.
export type PayResult =
  | { result: 'success'; orderNumber: string }
  | { result: 'fail'; reason: string };

export interface PaymentPort {
  pay(orderId: string, opts?: { forceFail?: boolean }): Promise<PayResult>;
}

export const simulatedPayment: PaymentPort = {
  async pay(orderId, opts) {
    const res = await api.payOrder(orderId, opts?.forceFail ? 'fail' : undefined);
    if (res.result === 'success') return { result: 'success', orderNumber: res.order.orderNumber ?? '' };
    return { result: 'fail', reason: res.reason };
  },
};
