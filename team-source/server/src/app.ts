import express, { type Express } from "express";
import cors from "cors";
import { corsOrigins } from "./config/env.js";
import { createApiRouter, type AppRepositories } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/**
 * Express 앱을 repositories 의존성을 주입받아 생성한다 (의존성 주입 패턴).
 * 이렇게 하면 테스트에서 실제 MySQL 없이 인메모리 레포지토리로 같은 앱을 띄워 supertest로 검증할 수 있다.
 */
export function createApp(repositories: AppRepositories): Express {
  const app = express();

  app.use(
    cors({
      origin: corsOrigins,
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", createApiRouter(repositories));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
