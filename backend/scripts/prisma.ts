// backend/.env를 읽고 DATABASE_URL을 backend/ 기준 경로로 바꾼 뒤 prisma CLI를 실행한다.
// DATABASE_URL의 상대 경로는 backend/ 폴더 기준이다. (Prisma는 원래 prisma/ 폴더 기준으로 해석하므로 이 래퍼가 맞춘다)
// 사용: tsx scripts/prisma.ts migrate deploy
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { backendDir, loadEnv } from '../src/env.js';

loadEnv(backendDir);
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const r = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: backendDir,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
