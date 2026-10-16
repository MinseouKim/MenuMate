import "dotenv/config";
import { z } from "zod";

/**
 * 서버 환경변수 검증.
 * DB 계정/LLM API 키 등 비밀값은 전부 여기(.env)에서만 읽는다 — 프론트엔드로는 절대 전달하지 않는다.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DB_HOST: z.string().min(1).default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1).default("kiosk_app"),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().min(1).default("kiosk_dev"),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

  // LLM 설정은 선택사항 — 비어 있으면 조건 추출기가 규칙 기반으로만 동작한다.
  LLM_API_BASE: z.string().optional().default(""),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().optional().default(""),

  // 점주 관리자 로그인 토큰 서명 비밀값. 개발 기본값을 두지만, 실제 배포/전시 전에는
  // 반드시 .env에서 고유한 값으로 덮어써야 한다 (안 그러면 누구나 토큰을 위조할 수 있음).
  ADMIN_JWT_SECRET: z
    .string()
    .min(16, "ADMIN_JWT_SECRET은 16자 이상이어야 합니다.")
    .default("dev-only-change-me-before-exhibition"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("환경변수 검증 실패:", parsed.error.flatten().fieldErrors);
  throw new Error("환경변수 설정이 올바르지 않습니다. .env.example을 참고하세요.");
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export const llmConfigured =
  env.LLM_API_BASE.length > 0 && env.LLM_API_KEY.length > 0 && env.LLM_MODEL.length > 0;
