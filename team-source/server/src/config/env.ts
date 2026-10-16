import "dotenv/config";
import { z } from "zod";

/**
 * 서버 환경변수 검증.
 * DB 계정/LLM API 키 등 비밀값은 전부 여기(.env)에서만 읽는다 — 프론트엔드로는 절대 전달하지 않는다.
 */
const DEV_ONLY_ADMIN_JWT_SECRET = "dev-only-change-me-before-exhibition";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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

  // 점주 관리자 로그인 토큰 서명 비밀값. 개발/테스트에서는 비워 둬도 되지만(아래에서 알려진 개발용
  // 기본값으로 채움), NODE_ENV=production에서는 반드시 .env에서 고유한 값으로 채워야 한다 — 안 그러면
  // 누구나 이 공개된 기본값으로 관리자 토큰을 위조할 수 있다. 그래서 여기서는 기본값을 두지 않는다
  // (운영 환경에서 값이 없으면 아래 검증에서 서버가 바로 멈춘다).
  ADMIN_JWT_SECRET: z
    .string()
    .min(16, "ADMIN_JWT_SECRET은 16자 이상이어야 합니다.")
    .optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("환경변수 검증 실패:", parsed.error.flatten().fieldErrors);
  throw new Error("환경변수 설정이 올바르지 않습니다. .env.example을 참고하세요.");
}

const isProduction = parsed.data.NODE_ENV === "production";

if (!parsed.data.ADMIN_JWT_SECRET && isProduction) {
  // eslint-disable-next-line no-console
  console.error(
    "[env] ADMIN_JWT_SECRET이 설정되지 않았습니다. 운영 환경(NODE_ENV=production)에서는 반드시 " +
      ".env에 고유한 값을 넣어야 합니다 (예: openssl rand -hex 32). 누구나 알고 있는 개발용 기본값을 " +
      "그대로 쓰면 관리자 토큰을 위조당할 수 있어 서버를 시작하지 않습니다.",
  );
  throw new Error("운영 환경에서는 ADMIN_JWT_SECRET을 반드시 설정해야 합니다.");
}

if (isProduction && /localhost|127\.0\.0\.1/.test(parsed.data.CORS_ORIGIN)) {
  // eslint-disable-next-line no-console
  console.warn(
    "[env] CORS_ORIGIN이 아직 개발용 주소(localhost)로 되어 있습니다. 운영 환경에서는 실제 " +
      "키오스크/관리자 화면 배포 도메인만 쉼표로 넣어야 다른 사이트에서 이 API를 함부로 호출할 수 없습니다.",
  );
}

export const env = {
  ...parsed.data,
  ADMIN_JWT_SECRET: parsed.data.ADMIN_JWT_SECRET ?? DEV_ONLY_ADMIN_JWT_SECRET,
};

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export const llmConfigured =
  env.LLM_API_BASE.length > 0 && env.LLM_API_KEY.length > 0 && env.LLM_MODEL.length > 0;
