// npm run db:seed → MENU_SEED_FILE을 검증하고 DB에 넣는다.
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../config.js';
import { backendDir, loadEnv } from '../env.js';
import { runSeed } from './seed.js';

loadEnv(backendDir);
const config = loadConfig(process.env, backendDir);
const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
try {
  const r = await runSeed(prisma, config.menuSeedFile);
  if (r.ok) {
    console.log(`시드 완료: ${config.menuSeedFile} (카테고리 ${r.categories}개, 메뉴 ${r.items}개)`);
  } else {
    console.error(`시드 실패: DB는 바뀌지 않았어요. ${config.menuSeedFile}`);
    for (const e of r.errors) console.error(`  - ${e}`);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
