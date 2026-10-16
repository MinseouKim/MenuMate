import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../types/api.js";

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

  console.error("[errorHandler] 처리되지 않은 오류:", err);
  const internal = ApiError.internal();
  res.status(internal.statusCode).json(internal.toBody());
}

export function notFoundHandler(req: Request, res: Response): void {
  const notFound = ApiError.notFound(`경로를 찾을 수 없습니다: ${req.method} ${req.path}`);
  res.status(notFound.statusCode).json(notFound.toBody());
}
