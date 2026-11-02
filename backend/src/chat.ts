// 대화형 추천: 우루루 직원처럼 짧게 묻고 답하며 손님 조건을 채우고, 충분해지면 메뉴 3개를 고른다.
// LLM 호출은 LlmClient 뒤에 두어 테스트에서 바꾼다. 발화 원문은 로그에 남기지 않는다.
import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import type { Asking, ChatConditions, ChatRequest, ChatResponse, ConditionExtractionResponse, ContextResponse, Mood, PickReason } from './contracts.js';
import { AppError } from './errors.js';
import type { KnowledgeMenu, MenuKnowledge } from './menuKnowledge.js';

export const MAX_TURNS = 6; // 손님 발화 기준. 넘으면 강제로 추천 단계로
// Render 무료(0.1 CPU)에서 첫 호출이 8초를 넘겨 중단된 적이 있어 넉넉히 둔다 (2026-11-02 배포 로그). 프론트 대기 한도(30초)보다 짧게.
const TIMEOUT_MS = 25_000;
const MOODS: readonly Mood[] = ['tired', 'celebrate', 'quick', 'neutral'];
const ASKINGS: readonly Asking[] = ['party', 'spicy', 'kind', 'exclude', 'other'];

export interface LlmMessage { role: 'user' | 'model'; text: string }
export interface LlmClient {
  readonly model: string;
  /**
   * JSON 스키마에 맞는 문자열을 돌려준다 (파싱 전).
   * system[0]은 요청마다 똑같은 지시문(규칙·메뉴 목록)이라 Claude가 캐시하고, 뒤 칸은 매번 바뀌는 상황이다.
   */
  generateJson(system: readonly string[], messages: LlmMessage[], schema: object, signal: AbortSignal): Promise<string>;
}

/** 답 JSON(대화 1턴, 추천 3개 이유 포함)은 수백 토큰이다. 생각(thinking) 토큰도 이 한도에 들어갈 수 있어 넉넉히 둔다. */
const MAX_OUTPUT_TOKENS = 2048;
export type GeminiThinking = 'minimal' | 'low' | 'medium' | 'high';
type GenerateFn = (req: Parameters<GoogleGenAI['models']['generateContent']>[0]) => Promise<{ text?: string }>;

/** thinking: 설정했을 때만 보낸다(GEMINI_THINKING). 모델마다 받는 값이 달라 실측하며 고른다 (2026-11-03 설계 4-2). */
export function geminiClient(apiKey: string, model: string, opts: { thinking?: GeminiThinking | null; generate?: GenerateFn } = {}): LlmClient {
  const generate: GenerateFn = opts.generate ?? ((req) => new GoogleGenAI({ apiKey }).models.generateContent(req));
  return {
    model,
    async generateJson(system, messages, schema, signal) {
      const res = await generate({
        model,
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: {
          systemInstruction: system.join('\n\n'),
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          temperature: 0.3,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          ...(opts.thinking ? { thinkingConfig: { thinkingLevel: opts.thinking.toUpperCase() as ThinkingLevel } } : {}),
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
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, why: { type: 'string' }, heard: { type: ['string', 'null'] } },
        required: ['id', 'why', 'heard'],
      },
    },
    done: { type: 'boolean' },
    asking: { type: 'string', enum: [...ASKINGS] },
  },
  required: ['reply', 'conditions', 'mood', 'picks', 'done', 'asking'],
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

/** [고정 지시문(규칙·메뉴 목록), 이번 요청의 상황]. 고정 부분에 상황·턴 수를 넣으면 프롬프트 캐시가 매번 깨진다. */
export function systemPrompt(knowledge: MenuKnowledge, ctx: ChatRequest['context'], userTurns: number): [string, string] {
  const stable = [
    '당신은 중식당 "우루루 평촌본점"의 밝고 친절한 홀 직원입니다. 손님이 메뉴 80개 중에서 고르기 쉽도록 짧게 대화하며 조건을 파악합니다.',
    '',
    '말투 규칙:',
    '- 존댓말, 한 번에 문장 1~2개, 질문은 한 번에 하나만(물음표는 답변 끝에 한 번만). 글자 수 60자 이내.',
    '- asking에는 reply 끝의 질문이 묻는 것을 넣습니다: party(인원), spicy(매운맛), kind(면·밥·딤섬 같은 종류), exclude(빼야 할 재료), other(그 밖, 예/아니요로 답할 질문). 손님 화면에 이 값에 맞는 답 버튼이 뜨므로 reply 질문과 꼭 일치해야 합니다. done=true면 other.',
    '- 첫 인사("우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?")는 화면이 이미 했습니다. 다시 인사하지 말고, 날씨·시간 이야기로 대화를 시작하지 않습니다. 맨 끝의 "지금 상황"은 추천 이유에만 씁니다.',
    '- 인원은 손님이 직접 말해야 압니다. 손님이 인원을 말하지 않았으면 "혼자 오셨군요"처럼 짐작하지 말고 인원 하나만 짧게 묻습니다(done=false). 인원을 알고 손님이 "아무거나", "추천해 줘"라고 하면 더 묻지 말고 바로 done=true로 추천합니다.',
    '- 아래 메뉴 목록에 없는 음식·가격·재료는 절대 말하지 않습니다. 알레르기 안전은 보장하지 않으며 재료가 걱정되면 "직원에게 확인해 주세요"라고 안내합니다.',
    '- 손님이 말을 끊으면 직원 말 뒤에 "(끊김)"이 붙습니다. 그 질문은 손님이 다 못 들었을 수 있으니 손님 말을 먼저 따릅니다.',
    '- 손님 말에서 기분을 추정해 mood에 넣습니다: tired(지침·힘듦·위로가 필요), celebrate(기념·모임·기분 좋음), quick(바쁨·빨리), neutral(그 외). 모르면 null.',
    '',
    '조건 파악 순서(이미 알면 건너뜀): 인원 → 매운맛 가능 여부 → 종류(면/밥/딤섬/요리 등) 또는 피하고 싶은 재료. 예산은 손님이 먼저 말할 때만 반영합니다.',
    `- 인원과 (매운맛 또는 종류) 두 가지를 알면 done=true. 손님 발화가 ${MAX_TURNS}번째이면 무조건 done=true.`,
    '- done=true일 때 picks에 메뉴 1~3개를 추천 순서대로 넣습니다(목록의 id만). 손님이 대화에서 한 말에 가장 맞는 것을 1순위로 고르고, 상황·리뷰 키워드는 그다음 근거입니다. 빼 달라는 재료나 매운 메뉴(안 맵게를 원할 때)는 고르지 않습니다. done=false면 picks는 빈 배열.',
    '- picks의 각 항목: id, why(이 메뉴를 고른 이유 한 문장, 40자 이내, 물음표 없음, 예: "둘이 나눠 먹기 좋은 순한 짜장이에요"), heard(그 이유가 된 손님 말을 대화에서 그대로 옮긴 20자 이내 구절, 예: "둘이서 안 맵게". 손님이 그런 말을 안 했으면 null).',
    '- done=true일 때 reply는 고른 메뉴를 소개하는 평서문으로 끝냅니다. 질문으로 끝내지 않습니다(화면이 바로 추천 결과로 넘어가 손님이 답할 수 없음).',
    '- conditions는 지금까지 파악한 전체 값입니다. 모르는 값: spicy=null, kind="상관없음", texture="상관없음", budget=null, totalBudget=null, exclude=[]. party는 손님이 말한 인원(모르면 1). spicy는 0(안 매움)~3(아주 매움).',
    `- kind는 다음 중 하나 또는 "상관없음": ${knowledge.kinds.join(', ')}.`,
    '',
    '메뉴 목록 (id | 이름 | 종류 | 가격 | 맵기 | 인분 | 재료 | 식감 | 표시 | 리뷰 키워드):',
    ...knowledge.lines(),
  ].join('\n');
  const volatile = [`지금 상황: ${describeContext(ctx)}`, `현재 손님 발화 수: ${userTurns}.`].join('\n');
  return [stable, volatile];
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
  log?: { warn(msg: string): void; info?(msg: string): void };
}

export async function converse(deps: ChatDeps, req: ChatRequest): Promise<ChatResponse> {
  if (!deps.llm || !deps.knowledge) throw new AppError('CHAT_UNAVAILABLE', 'GEMINI_API_KEY 또는 메뉴 데이터 없음');
  const { llm, knowledge } = deps;
  const turns = (req.turns ?? []).filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string');
  const userTurns = turns.filter((t) => t.role === 'user').length;
  const prior = normalizeConditions(req.conditions, knowledge);

  // 첫 인사는 LLM 없이 가게 인사 + 인원 질문 (화면도 같은 문장을 바로 띄운다. 옛 화면이 빈 대화로 부를 때를 위해 서버도 같은 답)
  if (turns.length === 0) {
    return { reply: GREETING, conditions: prior, mood: null, picks: [], pickReasons: [], done: false, asking: 'party', heardSummary: null, partyAssumed: false, model: 'template' };
  }

  const messages: LlmMessage[] = turns.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', text: t.text.slice(0, 500) }));
  messages.push({ role: 'user', text: `[지금까지 파악한 조건: ${JSON.stringify(prior)}. 위 대화를 바탕으로 다음 답변을 JSON으로 주세요.]` });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  const startedAt = performance.now();
  let text: string;
  try {
    text = await llm.generateJson(systemPrompt(knowledge, req.context ?? {}, userTurns), messages, CHAT_SCHEMA, abort.signal);
  } catch (e) {
    const took = Math.round(performance.now() - startedAt);
    deps.log?.warn(`Gemini 호출 실패 (${llm.model}, ${took}ms): ${e instanceof Error ? e.message : String(e)}`); // 발화 내용은 적지 않는다
    throw new AppError('CHAT_UNAVAILABLE', 'gemini 실패');
  } finally {
    clearTimeout(timer);
  }
  deps.log?.info?.(`Gemini 응답 ${Math.round(performance.now() - startedAt)}ms (${llm.model})`);

  let parsed: Partial<ChatResponse>;
  try {
    parsed = JSON.parse(text) as Partial<ChatResponse>;
  } catch {
    deps.log?.warn('Gemini 응답이 JSON이 아니에요');
    throw new AppError('CHAT_UNAVAILABLE', 'json 파싱 실패');
  }

  const conditions = normalizeConditions({ ...prior, ...(parsed.conditions ?? {}) }, knowledge);
  const userTexts = turns.filter((t) => t.role === 'user').map((t) => t.text);
  const party = userTexts.map(partyMentioned).filter((n): n is number => n !== null).at(-1) ?? null;
  const forced = userTurns >= MAX_TURNS;
  const mood = MOODS.includes(parsed.mood as Mood) ? (parsed.mood as Mood) : null;
  let reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim().slice(0, 200) : '';

  // 인원을 들은 적이 없으면 추천하지 않는다. 몇 인분을 담을지 정할 수 없기 때문 (강제 종료만 1명으로 가정하고 알린다)
  if (parsed.done === true && !forced && party === null) {
    return { reply: PARTY_QUESTION, conditions, mood, picks: [], pickReasons: [], done: false, asking: 'party', heardSummary: summarize(conditions, false), partyAssumed: false, model: llm.model };
  }
  const done = forced || parsed.done === true;
  const partyAssumed = done && party === null;
  if (partyAssumed) conditions.party = 1;

  const proposed = (Array.isArray(parsed.picks) ? parsed.picks : []) as unknown[];
  const pickReasons = done ? checkPicks(proposed, conditions, knowledge, userTexts.join(' ')) : [];
  if (done) {
    const dropped = proposed.map(pickId).map((id) => knowledge.byId(id)).filter((m): m is KnowledgeMenu => !!m && !pickReasons.some((p) => p.id === m.id));
    if (!reply || reply.includes('?') || dropped.some((m) => reply.includes(m.name))) reply = recommendLine(pickReasons.map((p) => knowledge.byId(p.id)!.name));
  } else if (!reply) {
    reply = PARTY_QUESTION;
  }
  const asking = !done && ASKINGS.includes(parsed.asking as Asking) ? (parsed.asking as Asking) : null;
  return {
    reply, conditions, mood, picks: pickReasons.map((p) => p.id), pickReasons, done, asking,
    heardSummary: summarize(conditions, party !== null || partyAssumed), partyAssumed, model: llm.model,
  };
}

export const GREETING = '우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?';
const PARTY_QUESTION = '몇 분이서 드실 건가요?';
const DEFAULT_WHY = '말씀하신 조건에 맞는 메뉴예요';
const SEAFOOD = ['해산물', '새우', '생선', '게', '해삼', '전복', '관자', '굴', '오징어', '조개'];

const PARTY_WORDS: [RegExp, number][] = [
  [/혼자|한\s*(명|분|사람)/, 1], [/둘|두\s*(명|분|사람)/, 2], [/셋|세\s*(명|분|사람)/, 3],
  [/넷|네\s*(명|분|사람)/, 4], [/다섯/, 5], [/여섯/, 6],
];
/** 손님 말에서 인원. 인원 말이 없으면 null ("1인당 만오천원"의 1인은 인원이 아님) */
export function partyMentioned(text: string): number | null {
  const t = text.replace(/\d*\s*인\s*당|한\s*사람\s*당/g, ' ');
  const n = t.match(/(\d+)\s*(명|분|인)(?!분)/);
  if (n) return Math.min(8, Math.max(1, Number(n[1])));
  return PARTY_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
}

const pickId = (p: unknown): string => (typeof p === 'string' ? p : typeof p === 'object' && p && typeof (p as { id?: unknown }).id === 'string' ? (p as { id: string }).id : '');
const squash = (s: string) => s.replace(/\s+/g, '');

/** 판매 중이고 조건(빼는 재료, 안 맵게)을 지키는 메뉴만, 손님 말 인용(heard)은 실제로 한 말일 때만 */
function checkPicks(proposed: unknown[], c: ChatConditions, knowledge: MenuKnowledge, said: string): PickReason[] {
  const excluded = c.exclude.flatMap((x) => (x === '해산물' ? SEAFOOD : [x]));
  if (excluded.some((x) => SEAFOOD.includes(x))) excluded.push('해산물'); // '해물'로만 적힌 메뉴도 함께 뺀다
  const out: PickReason[] = [];
  for (const p of proposed) {
    const m = knowledge.byId(pickId(p));
    if (!m || m.soldOut || out.some((o) => o.id === m.id) || m.ingredients.some((i) => excluded.includes(i)) || (c.spicy === 0 && m.spicy > 0)) continue;
    const raw = typeof p === 'object' && p ? (p as { why?: unknown; heard?: unknown }) : {};
    const why = typeof raw.why === 'string' && raw.why.trim() && !raw.why.includes('?') ? raw.why.trim().slice(0, 40) : DEFAULT_WHY;
    const heard = typeof raw.heard === 'string' && raw.heard.trim().length <= 20 && squash(said).includes(squash(raw.heard)) && raw.heard.trim() ? raw.heard.trim() : null;
    out.push({ id: m.id, why, heard, review: m.reviewQuote });
    if (out.length === 3) break;
  }
  return out;
}

const hasBatchim = (word: string) => { const code = word.charCodeAt(word.length - 1) - 0xac00; return code >= 0 && code < 11172 && code % 28 !== 0; };
function recommendLine(names: string[]): string {
  if (!names.length) return '말씀하신 조건으로 골라 봤어요. 화면에서 확인해 주세요.';
  const last = names[names.length - 1];
  return `말씀 듣고 ${names.join(', ')}${hasBatchim(last) ? '을' : '를'} 골라 봤어요. 화면에서 확인해 주세요.`;
}

const SPICY_SUMMARY = ['안 맵게', '조금 맵게', '맵게', '아주 맵게'];
/** 지금까지 들은 조건 한 줄 (화면 칩·결과 머리말). 인원은 손님이 말했을 때만 */
function summarize(c: ChatConditions, partyKnown: boolean): string | null {
  const parts = [
    partyKnown ? `${c.party}명` : null,
    c.spicy === null ? null : SPICY_SUMMARY[c.spicy] ?? null,
    c.kind !== '상관없음' ? c.kind : null,
    c.exclude.length ? `${c.exclude.join('·')} 빼고` : null,
  ].filter((s): s is string => !!s);
  return parts.length ? parts.join(' · ').slice(0, 30) : null;
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
    const text = await deps.llm.generateJson([system], [{ role: 'user', text: utterance.slice(0, 500) }], EXTRACT_SCHEMA, abort.signal);
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
