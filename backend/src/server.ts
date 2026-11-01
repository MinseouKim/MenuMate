// npm run dev / npm run start 진입점
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { backendDir, loadEnv } from './env.js';

loadEnv(backendDir); // .env의 TZ도 여기서 적용된다 (주문번호 날짜 기준)
const config = loadConfig(process.env, backendDir);
const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
const app = await buildApp({ prisma, config });
app.addHook('onClose', () => prisma.$disconnect());

try {
  const info = await prisma.storeInfo.findUnique({ where: { id: 1 } });
  if (!info) app.log.warn('메뉴가 비어 있어요. npm run db:seed -w backend 를 먼저 실행하세요.');
} catch {
  app.log.error('DB 테이블이 없어요. npm run db:migrate -w backend 를 먼저 실행하세요.');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

await app.listen({ port: config.port, host: config.host });
