// backend/.env를 읽고 DATABASE_URL을 backend/ 기준 경로로 바꾼 뒤 prisma CLI를 실행한다.
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
