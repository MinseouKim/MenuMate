import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../types/api.js";
import { safeErrorLog } from "../utils/safeErrorLog.js";

/** express.json()(body-parser)이 요청 본문을 읽다 실패했을 때 붙이는 type 값. */
const BODY_ERROR_TYPES = new Set(["entity.parse.failed", "entity.too.large", "encoding.unsupported", "charset.unsupported"]);

/** 모든 라우트 핸들러 에러가 여기로 모인다 — 응답 형식을 하나로 통일한다. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json(err.toBody());
    return;
  }

  // 손님 정보가 로그에 남지 않도록 에러 객체를 통째로 찍지 않는다 (utils/safeErrorLog.ts).
  // 잘못된 JSON 등 요청 본문 문제는 손님 쪽 입력 오류라 400으로 답하고, 본문 내용은 로그에 남기지 않는다.
  const type = (err as { type?: unknown } | null)?.type;
  if (typeof type === "string" && BODY_ERROR_TYPES.has(type)) {
    const status = type === "entity.too.large" ? 413 : 400;
    res.status(status).json(new ApiError("VALIDATION_ERROR", "요청 본문을 읽을 수 없습니다.", status).toBody());
    return;
  }

  console.error("[errorHandler] 처리되지 않은 오류:", safeErrorLog(err, true));
  const internal = ApiError.internal();
  res.status(internal.statusCode).json(internal.toBody());
}

export function notFoundHandler(req: Request, res: Response): void {
  const notFound = ApiError.notFound(`경로를 찾을 수 없습니다: ${req.method} ${req.path}`);
  res.status(notFound.statusCode).json(notFound.toBody());
}
