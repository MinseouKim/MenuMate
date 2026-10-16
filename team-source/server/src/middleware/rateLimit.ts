import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { ApiError } from "../types/api.js";

/**
 * 비용/보안이 걸린 두 엔드포인트에만 rate limit을 건다 — 나머지 공개 API(메뉴 조회 등)는
 * 그대로 둔다. express-rate-limit 기본값(메모리 저장소)은 서버 프로세스 1개 기준으로만 동작하므로,
 * 여러 인스턴스로 수평 확장하게 되면 공유 저장소(Redis 등)로 바꿔야 한다 — 지금 규모에는 충분하다.
 *
 * NODE_ENV=test에서는 건너뛴다 — 테스트는 전부 같은(가짜) IP에서 수십 번씩 로그인을 반복 호출하므로
 * 실제 운영 때와 같은 윈도우를 적용하면 테스트끼리 서로의 한도를 갉아먹는다. 운영/개발에서는 그대로 걸린다.
 */
function limiter(windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: (_req, _res, next) => {
      next(ApiError.rateLimited(message));
    },
  });
}

/** 관리자 로그인 — 아이디/비밀번호 brute-force 방지. IP당 15분에 10회. */
export const adminLoginRateLimit = limiter(
  15 * 60 * 1000,
  10,
  "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
);

/** 조건 추출 — 호출마다 LLM 비용이 들 수 있어 악용 시 바로 비용 문제가 된다. IP당 1분에 20회. */
export const conditionExtractionRateLimit = limiter(
  60 * 1000,
  20,
  "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
);
