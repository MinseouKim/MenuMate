// 결제 인터페이스 (D13). 지금 구현체는 시뮬레이션 하나이고, 나중에 PG나 단말기 구현체로 바꾼다.

export interface PayRequest {
  orderId: string;
  amount: number;
  /** 시뮬레이션 전용. 실제 PG 구현체는 무시한다 */
  simulate?: 'success' | 'fail';
}

export type PayResult = { result: 'success' } | { result: 'fail'; reason: string };

export interface PaymentGateway {
  pay(req: PayRequest): Promise<PayResult>;
}

export const FAIL_REASON = '카드 승인이 되지 않았어요.';

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SimulatedPaymentGateway implements PaymentGateway {
  constructor(
    private readonly opts: {
      defaultResult: 'success' | 'fail';
      delayMs: number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  async pay(req: PayRequest): Promise<PayResult> {
    if (this.opts.delayMs > 0) await (this.opts.sleep ?? defaultSleep)(this.opts.delayMs);
    const result = req.simulate ?? this.opts.defaultResult;
    return result === 'success' ? { result: 'success' } : { result: 'fail', reason: FAIL_REASON };
  }
}
