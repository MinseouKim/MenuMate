import type { ErrorCode, ErrorResponse } from './contracts.js';

/** api.md 에러 코드 표. message는 화면에 그대로 띄울 수 있는 한국어 문장 */
export const ERROR_DEFS: Record<ErrorCode, { status: number; message: string }> = {
  VALIDATION_FAILED: { status: 400, message: '요청 내용을 확인하지 못했어요. 다시 시도해 주세요.' },
  MENU_NOT_FOUND: { status: 400, message: '메뉴 정보가 바뀌었어요. 메뉴를 다시 골라 주세요.' },
  MENU_UNAVAILABLE: { status: 409, message: '품절된 메뉴가 있어요. 장바구니에서 빼고 다시 주문해 주세요.' },
  ORDER_NOT_FOUND: { status: 404, message: '주문을 찾을 수 없어요. 처음부터 다시 해 주세요.' },
  ORDER_ALREADY_PAID: { status: 409, message: '이미 결제가 끝난 주문이에요.' },
  NOT_FOUND: { status: 404, message: '요청한 내용을 찾을 수 없어요.' },
  INTERNAL: { status: 500, message: '잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' },
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
