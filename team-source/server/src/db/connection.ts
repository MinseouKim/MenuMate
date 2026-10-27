import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ConnectionOptions, SslOptions } from "mysql2/promise";
import { env } from "../config/env.js";

/**
 * 서버(커넥션 풀)와 스크립트(migrate / import / seed)가 함께 쓰는 DB 접속 설정.
 *
 * 로컬 MySQL은 그대로 접속하고, 클라우드 MySQL(Aiven 등)은 DB_SSL=true로 TLS 접속한다.
 * 서버 인증서는 항상 검증한다(rejectUnauthorized: true) — Aiven처럼 자체 CA를 쓰는 곳은 그 CA 인증서를
 *   - DB_SSL_CA      : PEM 내용 그대로 (Render 같은 배포 환경변수용, 줄바꿈을 \n 으로 적어도 됨)
 *   - DB_SSL_CA_FILE : PEM 파일 경로 (내 PC에서 스크립트 돌릴 때용, server 폴더 기준 상대경로 가능)
 * 중 하나로 넘긴다. 둘 다 없으면 시스템 기본 CA로 검증한다(공인 CA를 쓰는 DB용).
 */
export function dbSslOptions(): SslOptions | undefined {
  if (!env.DB_SSL) return undefined;
  let ca: string | undefined;
  if (env.DB_SSL_CA.trim()) {
    ca = env.DB_SSL_CA.replace(/\\n/g, "\n");
  } else if (env.DB_SSL_CA_FILE.trim()) {
    const file = path.resolve(env.DB_SSL_CA_FILE.trim());
    if (!existsSync(file)) {
      throw new Error(`DB_SSL_CA_FILE 경로에 CA 인증서가 없습니다: ${file}`);
    }
    ca = readFileSync(file, "utf-8");
  }
  return { rejectUnauthorized: true, minVersion: "TLSv1.2", ...(ca ? { ca } : {}) };
}

export function dbConnectionOptions(): ConnectionOptions {
  const ssl = dbSslOptions();
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: "utf8mb4_unicode_ci",
    ...(ssl ? { ssl } : {}),
  };
}
