/** 공통 에러 응답 형식. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } };
  }

  static validation(message: string): ApiError {
    return new ApiError("VALIDATION_ERROR", message, 400);
  }

  static notFound(message: string): ApiError {
    return new ApiError("NOT_FOUND", message, 404);
  }

  static unauthorized(message = "로그인이 필요합니다."): ApiError {
    return new ApiError("UNAUTHORIZED", message, 401);
  }

  static internal(message = "서버 내부 오류가 발생했습니다."): ApiError {
    return new ApiError("INTERNAL_ERROR", message, 500);
  }

  static rateLimited(message: string): ApiError {
    return new ApiError("RATE_LIMITED", message, 429);
  }
}
