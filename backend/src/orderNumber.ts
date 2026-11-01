import type { Prisma } from '@prisma/client';

export const MAX_ORDER_NUMBER = 999;

/** 그날 카운터를 1 올리고 3자리 번호를 돌려준다. 999 다음은 001 (D43). 결제 트랜잭션 안에서 부른다. */
export async function nextOrderNumber(tx: Prisma.TransactionClient, dateKey: string): Promise<string> {
  const current = await tx.dailyOrderCounter.findUnique({ where: { dateKey } });
  const next = !current || current.lastNumber >= MAX_ORDER_NUMBER ? 1 : current.lastNumber + 1;
  await tx.dailyOrderCounter.upsert({
    where: { dateKey },
    create: { dateKey, lastNumber: next },
    update: { lastNumber: next },
  });
  return String(next).padStart(3, '0');
}
