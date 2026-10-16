import { ApiError } from "../types/api.js";

/** 경로 파라미터를 양의 정수로 파싱한다. 관리자 라우트에서 menuId/setId 공용으로 사용. */
export function parsePositiveInt(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.validation(`${label}는 양의 정수여야 합니다.`);
  }
  return n;
}
