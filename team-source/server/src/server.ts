import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { getPool } from "./db/pool.js";
import { createMysqlStoreRepository } from "./repositories/mysqlStoreRepository.js";
import { createMysqlMenuRepository } from "./repositories/mysqlMenuRepository.js";
import { createMysqlStoreOwnerRepository } from "./repositories/mysqlStoreOwnerRepository.js";
import { createMysqlFeaturedSetRepository } from "./repositories/mysqlFeaturedSetRepository.js";
import { createMysqlOrderRepository } from "./repositories/mysqlOrderRepository.js";

const pool = getPool();
const app = createApp({
  storeRepository: createMysqlStoreRepository(pool),
  menuRepository: createMysqlMenuRepository(pool),
  storeOwnerRepository: createMysqlStoreOwnerRepository(pool),
  featuredSetRepository: createMysqlFeaturedSetRepository(pool),
  orderRepository: createMysqlOrderRepository(pool),
});

app.listen(env.PORT, () => {
  console.log(`[server] kiosk-server listening on port ${env.PORT}`);
});
