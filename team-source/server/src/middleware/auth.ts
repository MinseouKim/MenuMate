import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../types/api.js";

export interface AuthedStoreOwner {
  id: number;
  storeId: number;
  username: string;
}

interface AdminTokenPayload {
  sub: number;
  storeId: number;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      storeOwner?: AuthedStoreOwner;
    }
  }
}

/** 관리자 API 보호 미들웨어 — `Authorization: Bearer <token>` 헤더의 JWT를 검증한다. */
export function requireStoreOwner(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    next(ApiError.unauthorized("로그인이 필요합니다."));
    return;
  }
  try {
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as unknown as AdminTokenPayload;
    req.storeOwner = { id: payload.sub, storeId: payload.storeId, username: payload.username };
    next();
  } catch {
    next(ApiError.unauthorized("세션이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요."));
  }
}

export function signStoreOwnerToken(owner: { id: number; store_id: number; username: string }): string {
  const payload: AdminTokenPayload = { sub: owner.id, storeId: owner.store_id, username: owner.username };
  return jwt.sign(payload, env.ADMIN_JWT_SECRET, { expiresIn: "12h" });
}

/** 로그인한 점주가 요청 경로의 매장(slug로 resolve된 store.id)과 실제로 일치하는지 확인한다. */
export function ensureOwnerMatchesStore(req: Request, storeId: number): void {
  if (!req.storeOwner || req.storeOwner.storeId !== storeId) {
    throw ApiError.unauthorized("이 매장에 대한 권한이 없습니다.");
  }
}
