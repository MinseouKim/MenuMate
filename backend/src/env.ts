import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** backend/ 폴더. 설정의 상대 경로는 모두 이 폴더 기준이다 (env-guide 1장) */
export const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const toSlash = (p: string) => p.split(path.sep).join('/');

/**
 * Prisma는 SQLite 상대 경로를 prisma/ 폴더 기준으로 해석한다.
 * env-guide의 뜻대로 backend/ 기준이 되도록 절대 경로로 바꾼다.
 */
export function resolveDatabaseUrl(url: string, baseDir: string): string {
  if (!url.startsWith('file:')) return url;
  const p = url.slice('file:'.length);
  if (path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) return url;
  return `file:${toSlash(path.resolve(baseDir, p))}`;
}

/** backend/.env를 읽고 DATABASE_URL을 정리한다. SQLite 파일의 폴더가 없으면 만든다. */
export function loadEnv(baseDir: string = backendDir): void {
  const envFile = path.join(baseDir, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL ?? 'file:./data/menumate.db', baseDir);
  const url = process.env.DATABASE_URL;
  if (url.startsWith('file:')) fs.mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });
}
