import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { backendDir, testDbFile, testDbUrl } from './db-url.js';

// 테스트 전용 SQLite 파일을 새로 만들고 커밋된 마이그레이션을 적용한다
export default function setup() {
  fs.mkdirSync(path.dirname(testDbFile), { recursive: true });
  for (const f of [testDbFile, `${testDbFile}-journal`]) fs.rmSync(f, { force: true });
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'pipe',
  });
}
