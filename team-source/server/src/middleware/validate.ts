import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { ApiError } from "../types/api.js";

/**
 * 요청 body를 zod 스키마로 검증하는 공통 미들웨어.
 * 실패하면 공통 에러 포맷({ error: { code: "VALIDATION_ERROR", message } })으로 응답한다.
 */
export function validateBody<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue
        ? `${firstIssue.path.join(".") || "body"}: ${firstIssue.message}`
        : "입력값이 올바르지 않습니다.";
      next(ApiError.validation(message));
      return;
    }
    req.body = result.data as z.infer<TSchema>;
    next();
  };
}

/** async 라우트 핸들러의 예외를 errorHandler로 전달하기 위한 래퍼. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
