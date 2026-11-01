// 대화형 추천: 우루루 직원처럼 짧게 묻고 답하며 손님 조건을 채우고, 충분해지면 메뉴 3개를 고른다.
// LLM 호출은 LlmClient 뒤에 두어 테스트에서 바꾼다. 발화 원문은 로그에 남기지 않는다.
import { GoogleGenAI } from '@google/genai';
import type { ChatConditions, ChatRequest, ChatResponse, ConditionExtractionResponse, ContextResponse, Mood } from './contracts.js';
import { AppError } from './errors.js';
import type { MenuKnowledge } from './menuKnowledge.js';

export const MAX_TURNS = 6; // 손님 발화 기준. 넘으면 강제로 추천 단계로
const TIMEOUT_MS = 8000;
const MOODS: readonly Mood[] = ['tired', 'celebrate', 'quick', 'neutral'];

export interface LlmMessage { role: 'user' | 'model'; text: string }
export interface LlmClient {
  readonly model: string;
  /** JSON 스키마에 맞는 문자열을 돌려준다 (파싱 전) */
  generateJson(system: string, messages: LlmMessage[], schema: object, signal: AbortSignal): Promise<string>;
}

export function geminiClient(apiKey: string, model: string): LlmClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    model,
    async generateJson(system, messages, schema, signal) {
      const res = await ai.models.generateContent({
        model,
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          temperature: 0.7,
          abortSignal: signal,
        },
      });
      return res.text ?? '';
    },
  };
}

export const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    conditions: {
      type: 'object',
      properties: {
        party: { type: 'integer' },
        spicy: { type: ['integer', 'null'] },
        kind: { type: 'string' },
        texture: { type: 'string' },
        exclude: { type: 'array', items: { type: 'string' } },
        budget: { type: ['integer', 'null'] },
        totalBudget: { type: ['integer', 'null'] },
      },
      required: ['party', 'spicy', 'kind', 'texture', 'exclude', 'budget', 'totalBudget'],
    },
    mood: { type: ['string', 'null'], enum: [...MOODS, null] },
    picks: { type: 'array', items: { type: 'string' } },
    done: { type: 'boolean' },
  },
  required: ['reply', 'conditions', 'mood', 'picks', 'done'],
} as const;

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    party_size: { type: 'integer' },
    spicy_level: { type: ['integer', 'null'] },
    budget_per_person: { type: ['integer', 'null'] },
    excluded_ingredients: { type: 'array', items: { type: 'string' } },
    food_keywords: { type: 'array', items: { type: 'string' } },
  },
  required: ['party_size', 'spicy_level', 'budget_per_person', 'excluded_ingredients', 'food_keywords'],
} as const;

const TIME_KO: Record<ContextResponse['timeOfDay'], string> = {
  morning: '아침', lunch: '점심시간', afternoon: '오후', evening: '저녁', night: '늦은 밤',
};
const CROWD_KO: Record<ContextResponse['crowd'], string> = {
  low: '한산함', mid: '보통', high: '붐빔(주문이 밀려 조리가 빠른 메뉴가 유리)',
};

export function describeContext(ctx: ChatRequest['context']): string {
  const parts: string[] = [];
  if (ctx.timeOfDay) parts.push(`시간대: ${TIME_KO[ctx.timeOfDay]}`);
  if (ctx.weather) {
    const w = ctx.weather;
    parts.push(`날씨: ${w.label}, ${Math.round(w.tempC)}도${w.rainy ? ' (비·눈 오는 날)' : ''}${w.cold ? ' (쌀쌀함)' : ''}${w.hot ? ' (더움)' : ''}`);
  }
  if (ctx.crowd) parts.push(`매장 혼잡도: ${CROWD_KO[ctx.crowd]}`);
  return parts.length ? parts.join(' / ') : '상황 정보 없음';
}

export function systemPrompt(knowledge: MenuKnowledge, ctx: ChatRequest['context'], userTurns: number): string {
  return [
    '당신은 중식당 "우루루 평촌본점"의 밝고 친절한 홀 직원입니다. 손님이 메뉴 80개 중에서 고르기 쉽도록 짧게 대화하며 조건을 파악합니다.',
    '',
    '말투 규칙:',
    '- 존댓말, 한 번에 문장 1~2개, 질문은 한 번에 하나만. 글자 수 60자 이내.',
    '- 첫 인사(대화 기록이 비어 있을 때)에는 아래 "지금 상황"을 자연스럽게 한 번만 녹입니다. 예: "비 오는 저녁이네요, 따뜻한 국물 어떠세요?" 이후 턴에서는 상황을 반복하지 않습니다.',
    '- 아래 메뉴 목록에 없는 음식·가격·재료는 절대 말하지 않습니다. 알레르기 안전은 보장하지 않으며 재료가 걱정되면 "직원에게 확인해 주세요"라고 안내합니다.',
    '- 손님이 "아무거나", "추천해 줘"라고 하면 더 묻지 말고 바로 done=true로 추천합니다.',
    '- 손님 말에서 기분을 추정해 mood에 넣습니다: tired(지침·힘듦·위로가 필요), celebrate(기념·모임·기분 좋음), quick(바쁨·빨리), neutral(그 외). 모르면 null.',
    '',
    '조건 파악 순서(이미 알면 건너뜀): 인원 → 매운맛 가능 여부 → 종류(면/밥/딤섬/요리 등) 또는 피하고 싶은 재료. 예산은 손님이 먼저 말할 때만 반영합니다.',
    `- 인원과 (매운맛 또는 종류) 두 가지를 알면 done=true. 손님 발화가 ${MAX_TURNS}번째이면 무조건 done=true.`,
    '- done=true일 때 picks에 메뉴 id를 1~3개 넣습니다(목록의 id만, 손님 조건·상황·리뷰 키워드에 가장 맞는 것). done=false면 picks는 빈 배열.',
    '- conditions는 지금까지 파악한 전체 값입니다. 모르는 값: spicy=null, kind="상관없음", texture="상관없음", budget=null, totalBudget=null, exclude=[]. party 기본 1. spicy는 0(안 매움)~3(아주 매움).',
    `- kind는 다음 중 하나 또는 "상관없음": ${knowledge.kinds.join(', ')}.`,
    `- 현재 손님 발화 수: ${userTurns}.`,
    '',
    `지금 상황: ${describeContext(ctx)}`,
    '',
    '메뉴 목록 (id | 이름 | 종류 | 가격 | 맵기 | 인분 | 재료 | 식감 | 표시 | 리뷰 키워드):',
    ...knowledge.lines(),
  ].join('\n');
}

const BLANK: ChatConditions = { party: 1, spicy: null, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null };

function normalizeConditions(input: Partial<ChatConditions> | undefined, knowledge: MenuKnowledge): ChatConditions {
  const c = { ...BLANK, ...(input ?? {}) };
  const party = Number.isInteger(c.party) ? Math.min(8, Math.max(1, c.party)) : 1;
  const spicy = c.spicy === null || c.spicy === undefined ? null : Math.min(3, Math.max(0, Math.round(c.spicy)));
  const kind = knowledge.kinds.includes(c.kind) ? c.kind : '상관없음';
  const posInt = (v: number | null | undefined) => (typeof v === 'number' && v > 0 ? Math.round(v) : null);
  return {
    party,
    spicy,
    kind,
    texture: typeof c.texture === 'string' && c.texture ? c.texture : '상관없음',
    exclude: Array.isArray(c.exclude) ? [...new Set(c.exclude.filter((s): s is string => typeof s === 'string' && s.trim() !== ''))] : [],
    budget: posInt(c.budget),
    totalBudget: posInt(c.totalBudget),
  };
}

export interface ChatDeps {
  llm: LlmClient | null;
  knowledge: MenuKnowledge | null;
  log?: { warn(msg: string): void };
}

export async function converse(deps: ChatDeps, req: ChatRequest): Promise<ChatResponse> {
  if (!deps.llm || !deps.knowledge) throw new AppError('CHAT_UNAVAILABLE', 'GEMINI_API_KEY 또는 메뉴 데이터 없음');
  const { llm, knowledge } = deps;
  const turns = (req.turns ?? []).filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string');
  const userTurns = turns.filter((t) => t.role === 'user').length;
  const prior = normalizeConditions(req.conditions, knowledge);

  const messages: LlmMessage[] = turns.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', text: t.text.slice(0, 500) }));
  // 첫 인사: 대화 기록이 없으면 손님 역할로 "시작" 신호만 준다
  messages.push({
    role: 'user',
    text: turns.length === 0
      ? '[대화 시작. 손님이 키오스크 앞에 섰습니다. 첫 인사를 해 주세요.]'
      : `[지금까지 파악한 조건: ${JSON.stringify(prior)}. 위 대화를 바탕으로 다음 답변을 JSON으로 주세요.]`,
  });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let text: string;
  try {
    text = await llm.generateJson(systemPrompt(knowledge, req.context ?? {}, userTurns), messages, CHAT_SCHEMA, abort.signal);
  } catch (e) {
    deps.log?.warn(`Gemini 호출 실패: ${e instanceof Error ? e.message : String(e)}`); // 발화 내용은 적지 않는다
    throw new AppError('CHAT_UNAVAILABLE', 'gemini 실패');
  } finally {
    clearTimeout(timer);
  }

  let parsed: Partial<ChatResponse>;
  try {
    parsed = JSON.parse(text) as Partial<ChatResponse>;
  } catch {
    deps.log?.warn('Gemini 응답이 JSON이 아니에요');
    throw new AppError('CHAT_UNAVAILABLE', 'json 파싱 실패');
  }

  const conditions = normalizeConditions({ ...prior, ...(parsed.conditions ?? {}) }, knowledge);
  const forced = userTurns >= MAX_TURNS;
  const done = forced || parsed.done === true;
  const picks = (Array.isArray(parsed.picks) ? parsed.picks : []).filter((id): id is string => typeof id === 'string' && knowledge.ids.has(id)).slice(0, 3);
  const mood = MOODS.includes(parsed.mood as Mood) ? (parsed.mood as Mood) : null;
  const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim().slice(0, 200) : (done ? '네, 이런 메뉴 어떠세요?' : '몇 분이서 오셨어요?');
  return { reply, conditions, mood, picks: done ? picks : [], done, model: llm.model };
}

/** 기존 프론트(aiClient.ts) 계약: 발화 한 문장 → 조건 */
export async function extractConditions(deps: ChatDeps, utterance: string): Promise<ConditionExtractionResponse> {
  if (!deps.llm || !deps.knowledge) throw new AppError('CHAT_UNAVAILABLE', 'GEMINI_API_KEY 또는 메뉴 데이터 없음');
  const system = [
    '중식당 키오스크 손님의 한 문장에서 주문 조건만 뽑아 JSON으로 답합니다. 모르는 값은 null 또는 빈 배열. party_size 기본 1.',
    'spicy_level: 0 안 매움, 1 약간, 2 매움, 3 아주 매움. excluded_ingredients: 빼 달라는 재료. food_keywords: 언급한 음식 종류나 메뉴 이름.',
    `종류 후보: ${deps.knowledge.kinds.join(', ')}`,
  ].join('\n');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const text = await deps.llm.generateJson(system, [{ role: 'user', text: utterance.slice(0, 500) }], EXTRACT_SCHEMA, abort.signal);
    const p = JSON.parse(text) as Partial<ConditionExtractionResponse['conditions']>;
    const spicy = p.spicy_level === null || p.spicy_level === undefined ? null : (Math.min(3, Math.max(0, Math.round(p.spicy_level))) as 0 | 1 | 2 | 3);
    return {
      source: 'llm',
      conditions: {
        party_size: Number.isInteger(p.party_size) && (p.party_size as number) > 0 ? (p.party_size as number) : 1,
        spicy_level: spicy,
        budget_per_person: typeof p.budget_per_person === 'number' && p.budget_per_person > 0 ? Math.round(p.budget_per_person) : null,
        excluded_ingredients: Array.isArray(p.excluded_ingredients) ? p.excluded_ingredients.filter((s): s is string => typeof s === 'string') : [],
        food_keywords: Array.isArray(p.food_keywords) ? p.food_keywords.filter((s): s is string => typeof s === 'string') : [],
      },
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    deps.log?.warn(`조건 추출 실패: ${e instanceof Error ? e.message : String(e)}`);
    throw new AppError('CHAT_UNAVAILABLE', 'gemini 실패');
  } finally {
    clearTimeout(timer);
  }
}
