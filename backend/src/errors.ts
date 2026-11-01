import type { ErrorCode, ErrorResponse } from './contracts.js';

/** api.md 에러 코드 표. message는 화면에 그대로 띄우는 손님용 문장 (design/copy.md 5장, D69) */
export const ERROR_DEFS: Record<ErrorCode, { status: number; message: string }> = {
  VALIDATION_FAILED: { status: 400, message: '주문 내용을 확인하지 못했어요. 처음부터 다시 해 주세요.' },
  MENU_NOT_FOUND: { status: 400, message: '메뉴 정보가 바뀌었어요. 메뉴를 다시 골라 주세요.' },
  MENU_UNAVAILABLE: { status: 409, message: '다 팔린 메뉴가 있어요. 담은 메뉴에서 빼고 다시 주문해 주세요.' },
  ORDER_NOT_FOUND: { status: 404, message: '주문을 찾을 수 없어요. 처음부터 다시 해 주세요.' },
  ORDER_ALREADY_PAID: { status: 409, message: '이미 결제가 끝난 주문이에요.' },
  NOT_FOUND: { status: 404, message: '잠시 문제가 생겼어요. 직원을 불러 주세요.' },
  TTS_UNAVAILABLE: { status: 503, message: '음성 안내를 준비하지 못했어요. 화면 안내로 계속할게요.' },
  CHAT_UNAVAILABLE: { status: 503, message: 'AI 연결이 안 돼 간단한 질문으로 진행할게요.' },
  INTERNAL: { status: 500, message: '잠시 문제가 생겼어요. 다시 시도해 주세요.' },
};

export class AppError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, detail?: string) {
    super(detail ?? code);
    this.status = ERROR_DEFS[code].status;
  }
}

export function errorBody(code: ErrorCode): ErrorResponse {
  return { error: { code, message: ERROR_DEFS[code].message } };
}
