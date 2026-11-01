import type { PrismaClient } from '@prisma/client';
import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type {
  ChatRequest, ChatResponse, ConditionExtractionRequest, ConditionExtractionResponse, ContextResponse,
  CreateOrderRequest, HealthResponse, PaymentRequest, MenuResponse, QuestionsResponse, RecommendationRequest, RecommendationResponse, TtsRequest,
} from './contracts.js';
import { converse, extractConditions, geminiClient, type LlmClient } from './chat.js';
import type { Config } from './config.js';
import { buildContext, openMeteo, type WeatherSource } from './context.js';
import { loadEngine, type Engine } from './engine.js';
import { AppError, errorBody } from './errors.js';
import { loadCatalog } from './menu.js';
import { loadMenuKnowledge, type MenuKnowledge } from './menuKnowledge.js';
import { createSynthesizer, TTS_MAX_CHARS, type Synthesizer } from './tts.js';
import { createOrder, createOrderSchema } from './orders.js';
import { SimulatedPaymentGateway, type PaymentGateway } from './payment/gateway.js';
import { payOrder, paymentSchema } from './payment/pay.js';
import { QUESTIONS, toQuestion } from './questions.js';
import { AGE_BANDS, recommend } from './recommend.js';
import { registerStatic } from './static.js';

export interface AppDeps {
  prisma: PrismaClient;
  config: Config;
  /** 기본값: config의 PAYMENT_SIM_RESULT, PAYMENT_SIM_DELAY_MS로 만든 시뮬레이션 */
  gateway?: PaymentGateway;
  /** 주문번호 날짜와 paidAt에 쓰는 시계 (테스트에서 바꿈) */
  now?: () => Date;
  /** 엔진 결과. 생략하면 config.engineFile에서 읽고, 없거나 틀리면 null (v1 점수) */
  engine?: Engine | null;
  logger?: boolean;
  /** v3: 테스트에서 외부 호출을 바꾸기 위한 주입점. 생략하면 config로 실제 클라이언트를 만든다 */
  weather?: WeatherSource;
  synthesizer?: Synthesizer;
  llm?: LlmClient | null;
  knowledge?: MenuKnowledge | null;
}

const chatSchema = {
  body: {
    type: 'object',
    required: ['turns'],
    properties: {
      turns: {
        type: 'array',
        maxItems: 24,
        items: {
          type: 'object',
          required: ['role', 'text'],
          properties: { role: { type: 'string', enum: ['user', 'assistant'] }, text: { type: 'string', maxLength: 500 } },
        },
      },
      conditions: { type: 'object' },
      context: { type: 'object' },
    },
  },
} as const;

const ttsSchema = {
  body: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 1, maxLength: TTS_MAX_CHARS } } },
} as const;

const extractionSchema = {
  body: { type: 'object', required: ['utterance'], properties: { utterance: { type: 'string', minLength: 1, maxLength: 500 } } },
} as const;

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
  const { prisma, config } = deps;
  const gateway =
    deps.gateway ??
    new SimulatedPaymentGateway({ defaultResult: config.paymentSimResult, delayMs: config.paymentSimDelayMs });
  const now = deps.now ?? (() => new Date());
  const app = Fastify({
    logger: deps.logger ?? true,
    // "2" → 2 같은 형 변환을 끈다. 요청 형식이 틀리면 그대로 VALIDATION_FAILED
    ajv: { customOptions: { coerceTypes: false } },
  });

  const engine = deps.engine !== undefined ? deps.engine : loadEngine(config.engineFile, app.log);

  // v3 외부 연동. 키가 없으면 해당 기능만 503으로 답하고 서버는 그대로 뜬다
  await app.register(cors, { origin: config.corsOrigins, methods: ['GET', 'POST', 'HEAD', 'OPTIONS'] });
  const weather = deps.weather ?? openMeteo(config.weatherLat, config.weatherLon, (url, init) => fetch(url, init));
  const synthesizer =
    deps.synthesizer ??
    createSynthesizer({ apiKey: config.googleTtsApiKey, voice: config.ttsVoice, fetchImpl: (url, init) => fetch(url, init), log: app.log });
  const knowledge = deps.knowledge !== undefined ? deps.knowledge : loadMenuKnowledge(config.menuDataDir, app.log);
  const llm = deps.llm !== undefined ? deps.llm : config.geminiApiKey ? geminiClient(config.geminiApiKey, config.geminiModel) : null;
  if (!llm) app.log.warn('GEMINI_API_KEY가 없어 대화형 추천(/api/chat)은 503으로 답합니다.');
  if (!synthesizer.available) app.log.warn('GOOGLE_TTS_API_KEY가 없어 음성 합성(/api/tts)은 503으로 답합니다.');
  const chatDeps = { llm, knowledge, log: app.log };

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
      const { answers } = req.body;
      const byAgeBand = Object.fromEntries(
        AGE_BANDS.map((band) => [band, recommend(catalog.items, answers, { engine, band })]),
      ) as RecommendationResponse['byAgeBand'];
      return { items: recommend(catalog.items, answers, { engine }), byAgeBand, engineVersion: engine?.version ?? 'none' };
    },
  );

  app.post<{ Body: CreateOrderRequest }>('/api/orders', { schema: createOrderSchema }, async (req, reply) => {
    reply.status(201);
    return createOrder(prisma, req.body);
  });

  app.post<{ Params: { orderId: string }; Body: PaymentRequest }>(
    '/api/orders/:orderId/payment',
    { schema: paymentSchema },
    async (req) => payOrder({ prisma, gateway, now }, req.params.orderId, req.body),
  );

  // ---- v3 ----
  app.get('/api/context', async (): Promise<ContextResponse> =>
    buildContext({ prisma, weather, crowdWindowMin: config.crowdWindowMin, now }),
  );

  app.post<{ Body: TtsRequest }>('/api/tts', { schema: ttsSchema }, async (req, reply) => {
    const audio = await synthesizer.speak(req.body.text);
    reply.header('content-type', 'audio/mpeg').header('cache-control', 'private, max-age=3600');
    return reply.send(audio);
  });

  app.post<{ Body: ChatRequest }>('/api/chat', { schema: chatSchema }, async (req): Promise<ChatResponse> =>
    converse(chatDeps, { turns: req.body.turns, conditions: req.body.conditions ?? {}, context: req.body.context ?? {} }),
  );

  app.post<{ Body: ConditionExtractionRequest }>(
    '/api/condition-extraction',
    { schema: extractionSchema },
    async (req): Promise<ConditionExtractionResponse> => extractConditions(chatDeps, req.body.utterance),
  );

  await registerStatic(app, config);

  return app;
}
