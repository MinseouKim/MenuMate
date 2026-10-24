import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type {
  CreateOrderRequest, HealthResponse, MenuResponse, QuestionsResponse, RecommendationRequest, RecommendationResponse,
} from './contracts.js';
import type { Config } from './config.js';
import { AppError, errorBody } from './errors.js';
import { loadCatalog } from './menu.js';
import { createOrder, createOrderSchema } from './orders.js';
import { QUESTIONS, toQuestion } from './questions.js';
import { recommend } from './recommend.js';

export interface AppDeps {
  prisma: PrismaClient;
  config: Config;
  logger?: boolean;
}

const recommendationSchema = {
  body: {
    type: 'object',
    required: ['answers'],
    properties: {
      answers: {
        type: 'array',
        maxItems: QUESTIONS.length,
        items: {
          type: 'object',
          required: ['questionId', 'answer'],
          properties: {
            questionId: { type: 'string', enum: QUESTIONS.map((q) => q.id) },
            answer: { type: 'string', enum: ['yes', 'no', 'skip'] },
          },
        },
      },
    },
  },
} as const;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { prisma } = deps;
  const app = Fastify({
    logger: deps.logger ?? true,
    // "2" → 2 같은 형 변환을 끈다. 요청 형식이 틀리면 그대로 VALIDATION_FAILED
    ajv: { customOptions: { coerceTypes: false } },
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send(errorBody(err.code));
    if (err.validation || (err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500)) {
      return reply.status(400).send(errorBody('VALIDATION_FAILED'));
    }
    req.log.error(err);
    return reply.status(500).send(errorBody('INTERNAL'));
  });

  app.get('/api/health', async (): Promise<HealthResponse> => ({ ok: true }));

  app.get('/api/menu', async (): Promise<MenuResponse> => {
    const catalog = await loadCatalog(prisma);
    return {
      storeName: catalog.storeName,
      categories: catalog.categories,
      items: catalog.items.filter((m) => m.isAvailable).map(({ isAvailable: _, ...item }) => item),
    };
  });

  app.get('/api/questions', async (): Promise<QuestionsResponse> => ({
    questions: [...QUESTIONS].sort((a, b) => a.order - b.order).map(toQuestion),
  }));

  app.post<{ Body: RecommendationRequest }>(
    '/api/recommendations',
    { schema: recommendationSchema },
    async (req): Promise<RecommendationResponse> => {
      const ids = req.body.answers.map((a) => a.questionId);
      if (new Set(ids).size !== ids.length) throw new AppError('VALIDATION_FAILED', '같은 questionId가 두 번 있음');
      const catalog = await loadCatalog(prisma);
      return { items: recommend(catalog.items, req.body.answers) };
    },
  );

  app.post<{ Body: CreateOrderRequest }>('/api/orders', { schema: createOrderSchema }, async (req, reply) => {
    reply.status(201);
    return createOrder(prisma, req.body);
  });

  return app;
}
