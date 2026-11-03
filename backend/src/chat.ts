// 대화형 추천: 우루루 직원처럼 짧게 묻고 답하며 손님 조건을 채우고, 충분해지면 메뉴 3개를 고른다.
// LLM 호출은 LlmClient 뒤에 두어 테스트에서 바꾼다. 발화 원문은 로그에 남기지 않는다.
import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import type { Asking, ChatConditions, ChatRequest, ChatResponse, ChatTurn, ConditionExtractionResponse, ContextResponse, Mood, PickReason } from './contracts.js';
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
    '당신은 중식당 "우루루 평촌본점"의 다정하고 센스 있는 홀 직원입니다. 손님과 함께 메뉴 80개 중에서 고르는 짧은 대화를 하며, 손님 말에 공감하고 반응해 마음이 따뜻해지도록 이끌어 갑니다.',
    '',
    '말투 규칙:',
    '- 존댓말, 한 번에 문장 1~2개, 질문은 한 번에 하나만(물음표는 답변 끝에 한 번만). 글자 수 60자 이내.',
    '- asking에는 reply 끝의 질문이 묻는 것을 넣습니다: party(인원), spicy(매운맛), kind(면·밥·딤섬 같은 종류), exclude(못 드시는·빼야 할 재료), other(그 밖, 예/아니요로 답할 질문). 손님 화면에 이 값에 맞는 답 버튼이 뜨므로 reply 질문과 꼭 일치해야 합니다. done=true면 other.',
    '- 첫 인사("우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?")는 화면이 이미 했습니다. 다시 인사하지 말고, 날씨·시간 이야기로 대화를 시작하지 않습니다. 맨 끝의 "지금 상황"은 추천 이유에만 씁니다.',
    '- 인원은 손님이 직접 말해야 압니다. 손님이 인원을 말하지 않았으면 "혼자 오셨군요"처럼 짐작하지 말고 인원 하나만 짧게 묻습니다(done=false). 인원을 알고 손님이 "아무거나", "추천해 줘"라고 하면 종류는 묻지 않습니다(못 드시는 재료를 아직 안 물었으면 그것만 묻고 추천).',
    '- 자리 안내·서비스·할인처럼 가게가 정하지 않은 약속은 하지 않습니다. done=true일 때 reply에는 picks에 넣은 메뉴 이름만 말합니다.',
    '- 아래 메뉴 목록에 없는 음식·가격·재료는 절대 말하지 않습니다. 알레르기 안전은 보장하지 않으며 재료가 걱정되면 "직원에게 확인해 주세요"라고 안내합니다.',
    '- reply의 첫머리는 손님이 방금 한 말의 내용을 받은 짧은 반응·공감입니다. 예: "두 분이 오셨군요, 반가워요!", 손님이 피곤하다면 "오늘 고생 많으셨어요. 속 편한 걸로 골라 볼게요", 생일·기념일이면 "생일 축하드려요!". 그다음에 질문 하나를 합니다(60자 안에서).',
    '- 함께 고르는 느낌을 줍니다(예: "같이 골라 볼까요", "제가 딱 맞는 걸 찾아 드릴게요"). 과장·아부·반말은 하지 않고, 같은 표현(반가워요, 좋아요 등)을 대화에서 되풀이하지 않습니다.',
    '- mood를 읽었으면 그에 맞는 따뜻한 한마디를 먼저 합니다: tired면 위로, celebrate면 축하, quick이면 "빨리 나오는 걸로 볼게요"처럼.',
    '- 손님이 한 번에 여러 조건을 말하면 들은 것을 짧게 되짚고(예: "두 분이 안 맵게요, 좋아요.") 남은 것만 묻습니다.',
    '- 손님이 말을 끊으면 직원 말 뒤에 "(끊김)"이 붙습니다. 그 질문은 손님이 다 못 들었을 수 있으니 손님 말을 먼저 따릅니다.',
    '- 손님 말에서 기분을 추정해 mood에 넣습니다: tired(지침·힘듦·위로가 필요), celebrate(기념·모임·기분 좋음), quick(바쁨·빨리), neutral(그 외). 모르면 null.',
    '',
    '조건 파악 순서(손님이 이미 말한 것은 건너뛰고, 한 번에 여러 개 말하면 모두 반영): 인원 → 매운맛 → 못 드시는 재료 → 종류(면/밥/딤섬/요리 등). 예산은 손님이 먼저 말할 때만 반영합니다.',
    `- 못 드시는 재료: 추천 전에 "알레르기나 채식으로 못 드시는 재료 있으세요?"처럼 한 번 묻습니다(asking=exclude). 반응 한마디와 합쳐 60자를 넘지 않게 짧게 묻습니다. 손님이 이미 재료를 말했거나, 이미 물어서 손님이 답했으면("없어요" 포함) 다시 묻지 않습니다.`,
    `- done=true 조건: 인원을 알고, 매운맛을 물었거나 손님이 말했고, 못 드시는 재료를 물었거나 손님이 말했고, 종류를 알거나 손님이 "아무거나", "추천해 줘"라고 했을 때만 done=true. 종류를 모르면 추천하지 말고 종류를 묻습니다. 손님 발화가 ${MAX_TURNS}번째이면 무조건 done=true.`,
    '- done=true일 때 picks에 메뉴 1~3개를 추천 순서대로 넣습니다(목록의 id만). 손님이 대화에서 한 말에 가장 맞는 것을 1순위로 고르고, 상황·리뷰 키워드는 그다음 근거입니다. 빼 달라는 재료나 매운 메뉴(안 맵게를 원할 때)는 고르지 않습니다. 손님이 빼야 할 재료를 말했으면 재료가 "확인 안 됨"인 메뉴도 고르지 않습니다. 손님이 예산을 말하지 않았으면 3개를 비슷한 가격으로만 고르지 말고 저렴한 메뉴를 하나 이상 섞습니다(예산을 말했으면 1인 예산 안에서). done=false면 picks는 빈 배열.',
    '- picks의 각 항목: id, why(이 메뉴를 고른 이유 한 문장, 40자 이내, 물음표 없음, 예: "둘이 나눠 먹기 좋은 순한 짜장이에요"), heard(그 이유가 된 손님 말을 대화에서 그대로 옮긴 20자 이내 구절, 예: "둘이서 안 맵게". 손님이 그런 말을 안 했으면 null).',
    '- done=true일 때 reply는 손님이 한 말을 짚어 고른 메뉴를 소개하고 따뜻하게 마무리하는 평서문입니다(예: "안 맵고 든든한 유니짜장으로 골라 봤어요. 맛있게 드세요!"). 질문으로 끝내지 않습니다(화면이 바로 추천 결과로 넘어가 손님이 답할 수 없음).',
    '- conditions는 지금까지 파악한 전체 값입니다. 모르는 값: spicy=null, kind="상관없음", texture="상관없음", budget=null, totalBudget=null, exclude=[]. party는 손님이 말한 인원(모르면 1).',
    '- spicy 값: 못 먹음·안 맵게=0, 조금·약간=1, 좋아함·매운 거=2, 아주 매운 거=3, "상관없어요"=null(물어본 것으로 치고 다시 묻지 않음).',
    `- kind는 다음 중 하나 또는 "상관없음": ${knowledge.kinds.join(', ')}. "따뜻한 국물", "나눠 먹을 요리"처럼 종류가 아닌 요구는 kind를 억지로 정하지 말고 "상관없음"으로 두되 picks를 고를 때 반영합니다.`,
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

/** 직원 LLM이 받는 입력 그대로 (시스템 프롬프트, 대화 메시지). converse와 Claude 시험 도구(sim-step)가 같이 쓴다 */
export function chatInput(knowledge: MenuKnowledge, req: ChatRequest) {
  const turns = (req.turns ?? []).filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string');
  const userTurns = turns.filter((t) => t.role === 'user').length;
  const prior = normalizeConditions(req.conditions, knowledge);
  const messages: LlmMessage[] = turns.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', text: t.text.slice(0, 500) }));
  messages.push({ role: 'user', text: `[지금까지 파악한 조건: ${JSON.stringify(prior)}. 위 대화를 바탕으로 다음 답변을 JSON으로 주세요.]` });
  return { turns, userTurns, prior, system: systemPrompt(knowledge, req.context ?? {}, userTurns), messages };
}

export async function converse(deps: ChatDeps, req: ChatRequest): Promise<ChatResponse> {
  if (!deps.llm || !deps.knowledge) throw new AppError('CHAT_UNAVAILABLE', 'GEMINI_API_KEY 또는 메뉴 데이터 없음');
  const { llm, knowledge } = deps;
  const { turns, userTurns, prior, system, messages } = chatInput(knowledge, req);

  // 첫 인사는 LLM 없이 가게 인사 + 인원 질문 (화면도 같은 문장을 바로 띄운다. 옛 화면이 빈 대화로 부를 때를 위해 서버도 같은 답)
  if (turns.length === 0) {
    return { reply: GREETING, conditions: prior, mood: null, picks: [], pickReasons: [], done: false, asking: 'party', heardSummary: null, partyAssumed: false, model: 'template' };
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  const startedAt = performance.now();
  let text: string;
  try {
    text = await llm.generateJson(system, messages, CHAT_SCHEMA, abort.signal);
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
  // 알레르기 안전: LLM이 빠뜨려도 손님이 직접 말한 빼야 할 재료는 서버가 합친다 (LLM 값은 지우지 않음)
  conditions.exclude = [...new Set([...conditions.exclude, ...userTexts.flatMap(excludeFromSpeech)])];
  const mentions = userTexts.map(partyMention);
  const lastAt = mentions.findLastIndex((m) => m !== null);
  const party = lastAt >= 0 ? mentions[lastAt]!.n : null;
  if (party !== null) conditions.party = party; // 손님이 말한 인원이 LLM이 적은 값보다 우선 (오프라인 시험: LLM이 틀린 인원을 그대로 내보냄)
  const forced = userTurns >= MAX_TURNS;
  const mood = MOODS.includes(parsed.mood as Mood) ? (parsed.mood as Mood) : null;

  // "네 명 이상이에요"(7명 미만): 인원을 확정하지 않고 정확히 몇 분인지 한 번만 다시 묻는다 (팀장 요청 2026-11-03).
  // 이번 손님 말이 "N명 이상"이고 앞에서 "이상"이라고 한 적이 없을 때만. 다시 물은 뒤에는 숫자를 말하면 그 숫자, 아니면 N으로 확정
  const atLeastBefore = mentions.slice(0, lastAt).some((m) => m?.atLeast && m.n < 7);
  if (!forced && party !== null && lastAt === userTexts.length - 1 && mentions[lastAt]!.atLeast && party < 7 && !atLeastBefore) {
    return { reply: exactPartyQuestion(party), conditions, mood, picks: [], pickReasons: [], done: false, asking: 'party', heardSummary: summarize(conditions, false), partyAssumed: false, model: llm.model };
  }
  let reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim().slice(0, 200) : '';

  // 추천(done) 전에 꼭 알아야 할 것을 정한 순서(인원 → 매운맛 → 못 드시는 재료 → 종류)로 확인하고, 빠졌으면 그 질문으로 되돌린다. 강제 종료는 예외
  if (parsed.done === true && !forced) {
    const missing = missingBeforeRecommend(turns, conditions, party !== null);
    if (missing) {
      return { reply: QUESTION[missing], conditions, mood, picks: [], pickReasons: [], done: false, asking: missing, heardSummary: summarize(conditions, party !== null), partyAssumed: false, model: llm.model };
    }
  }
  const done = forced || parsed.done === true;
  const partyAssumed = done && party === null;
  if (partyAssumed) conditions.party = 1;

  const proposed = (Array.isArray(parsed.picks) ? parsed.picks : []) as unknown[];
  const pickReasons = done ? checkPicks(proposed, conditions, knowledge, userTexts.join(' ')) : [];
  if (done) {
    const dropped = proposed.map(pickId).map((id) => knowledge.byId(id)).filter((m): m is KnowledgeMenu => !!m && !pickReasons.some((p) => p.id === m.id));
    const tooLong = [...reply].length > MAX_REPLY_CHARS;
    const picked = pickReasons.map((p) => knowledge.byId(p.id)!);
    if (!reply || tooLong || reply.includes('?') || dropped.some((m) => reply.includes(m.name)) || mentionsUnpicked(reply, picked, knowledge)) reply = recommendLine(pickReasons.map((p) => knowledge.byId(p.id)!.name), { spicy: conditions.spicy, mood });
  } else if (!reply) {
    reply = PARTY_QUESTION;
  }
  // LLM이 asking을 빠뜨리거나 모르는 값을 주면 reply의 마지막 물음으로 추정 (화면 답 버튼이 맞게 뜨도록)
  const asking = done ? null : ASKINGS.includes(parsed.asking as Asking) ? (parsed.asking as Asking) : askingOf(reply);
  if (!done && [...reply].length > MAX_REPLY_CHARS) reply = shortenQuestion(reply, asking);
  return {
    reply, conditions, mood, picks: pickReasons.map((p) => p.id), pickReasons, done, asking,
    heardSummary: summarize(conditions, party !== null || partyAssumed), partyAssumed, model: llm.model,
  };
}

export const GREETING = '우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?';
// 서버가 대신 쓰는 질문 (2026-11-03 팀장: 친근하고 상호적으로, 마음이 따뜻해지게). 짧은 반응 한마디 뒤에 묻는다.
// askingOf·askedSpicy·askedExclude·askedKind와 시뮬레이션 채점이 이 문장의 낱말(몇 분·매운·재료·종류)로 판단하므로 낱말은 지킨다 (chat.test.ts)
const PARTY_QUESTION = '제가 딱 맞는 걸 찾아 드릴게요. 몇 분이서 오셨어요?';
const NUM_KO = ['', '한', '두', '세', '네', '다섯', '여섯'];
/** "네 분 이상이시군요, 반가워요! 정확히 몇 분이세요?" (숫자는 TTS가 "4분"을 시간으로 읽지 않게 우리말로) */
const exactPartyQuestion = (n: number) => `${NUM_KO[n] ?? n} 분 이상이시군요, 반가워요! 정확히 몇 분이세요?`;
const SPICY_QUESTION = '좋아요, 같이 골라 볼게요. 매운 음식은 괜찮으세요?';
const EXCLUDE_QUESTION = '알레르기나 채식·종교 때문에 못 드시는 재료가 있으면 편하게 말씀해 주실래요?';
const KIND_QUESTION = '맛있는 거 같이 찾아봐요. 면, 밥, 딤섬, 요리 중 어떤 종류가 좋으세요?';
const QUESTION = { party: PARTY_QUESTION, spicy: SPICY_QUESTION, exclude: EXCLUDE_QUESTION, kind: KIND_QUESTION } as const;
/** 직원 말 한 번의 글자 수 한도 (TTS로 읽기 좋게, 시뮬레이션 채점 기준과 같음) */
const MAX_REPLY_CHARS = 60;

const SPICY_TALK = /맵|매운|매콤|spicy/i;
const ANY_STRONG = /아무\s*거나|아무거|추천|알아서|골라\s*(주|줘)|뭐든|무엇이든|anything|recommend|whatever/i;
const ANY_SOFT = /상관\s*없|모르겠|못\s*정했|다\s*좋아/;
/** 손님이 종류는 상관없다고 했는지 ("아무거나", "추천해 줘"). "맵기는 상관없어요"처럼 매운맛·재료 이야기의 "상관없어요"는 빼고 */
export function wantsAnything(text: string): boolean {
  return ANY_STRONG.test(text) || (ANY_SOFT.test(text) && !SPICY_TALK.test(text) && !/재료|알레르기|빼/.test(text));
}

const DIET_TALK = /알레르기|알러지|채식|비건|베지|할랄|무슬림|종교|가리는|못\s*먹는\s*(거|것|게|재료|음식)|빼는\s*(거|것|재료)|allerg|vegan|vegetarian|halal/i;
const INGREDIENT_TALK = /고기|돼지|닭|오리|해산물|해물|새우|게살|생선|오징어|조개|전복|해삼|관자|계란|달걀|땅콩|견과|우유|밀가루|글루텐|고수|마늘|오이|pork|beef|chicken|shrimp|seafood|peanut|nuts?\b|egg/i;
const REFUSE_TALK = /빼|안\s*먹|못\s*먹|없이|싫|제외|without|don'?t eat|can'?t eat/i;
/**
 * 손님이 못 먹는 재료 이야기를 스스로 했는지 ("새우 빼 주세요", "채식해요", "못 먹는 거 없어요"도 말한 것).
 * "매운 건 못 먹어요"는 매운맛 이야기라 아님. 재료 질문에 "없어요"라고 답한 것은 이 함수가 아니라 askedExclude(직원이 이미 물음)로 판단한다.
 */
export function excludeMentioned(text: string): boolean {
  return DIET_TALK.test(text) || (INGREDIENT_TALK.test(text) && REFUSE_TALK.test(text)) || (/빼\s*(주|줘|고|서|면)/.test(text) && !SPICY_TALK.test(text));
}

// ── 손님 말에서 빼야 할 재료 읽기. 프론트 prototype/parse.ts의 NEGATION·negatedTerms, recommendation.ts의 EXCLUDE_WORDS와 같은 규칙 (프론트와 따로 둠)
const EXCLUDE_WORDS = ['해산물', '새우', '돼지고기', '소고기', '닭고기', '계란', '견과류', '오리', '생선', '굴', '전복', '해삼', '관자', '땅콩'];
const NEGATION = '(?:은|는|이|가|을|를|도|랑|하고)?\\s*(?:없는|없이|없고|빼고|빼\\s*주|빼주|빼요|빼|제외|말고|알레르기|알러지|싫|못\\s*먹|안\\s*먹|넣지\\s*말)';
/** 재료 이름과 줄임말 → 정식 이름. "닭(고기)?"처럼 한 패턴이라 "닭고기"를 "닭"으로 한 번 더 세지 않는다 */
const ALIASES: Record<string, string> = { 돼지고기: '돼지(?:고기)?', 소고기: '[소쇠]고기', 닭고기: '닭(?:고기)?', 계란: '계란|달걀', 견과류: '견과(?:류)?' };
const TERMS = EXCLUDE_WORDS.map((w) => [w, new RegExp(`^(?:${ALIASES[w] ?? w})$`)] as const);
const TERM = `(?:${EXCLUDE_WORDS.map((w) => ALIASES[w] ?? w).join('|')})`;
/** "오리랑 생선 빼 주세요"처럼 랑·이랑·하고·와·과·쉼표로 이은 재료 목록 + 부정 표현이면 목록 전체 */
const NEGATED_LIST = new RegExp(`(${TERM}(?:\\s*(?:이랑|랑|하고|와|과|,)\\s*${TERM})*)${NEGATION}`, 'g');
const canonical = (word: string) => TERMS.find(([, re]) => re.test(word))?.[0] ?? null;
const MEAT_AND_SEAFOOD = ['돼지고기', '소고기', '닭고기', '오리', '해산물'];
/** "돼지고기 안 먹어요"의 고기는 채식이 아니므로 낱말 앞에 다른 글자가 붙은 고기는 세지 않는다 */
const VEGETARIAN = /채식|비건|베지|vegan|vegetarian|(?<![가-힣])고기\s*(?:는|를|도)?\s*(?:안|못)\s*먹/i;
const NO_PORK = /할랄|무슬림|이슬람|halal|muslim/i;
/**
 * 손님 말 한 마디에서 빼야 할 재료. 부정 표현이 바로 붙은 재료만 ("새우는 빼고 소고기는 좋아요"의 소고기는 아님).
 * 생활 표현: 채식·비건·고기 안 먹음 → 고기·해산물 전부, 할랄·무슬림 → 돼지고기, 견과류나 땅콩 하나를 피하면 둘 다.
 */
export function excludeFromSpeech(text: string): string[] {
  const out = new Set<string>();
  for (const [, list] of text.matchAll(NEGATED_LIST)) {
    for (const [word] of list.matchAll(new RegExp(TERM, 'g'))) { const w = canonical(word); if (w) out.add(w); }
  }
  if (VEGETARIAN.test(text)) MEAT_AND_SEAFOOD.forEach((w) => out.add(w));
  if (NO_PORK.test(text)) out.add('돼지고기');
  if (out.has('견과류') || out.has('땅콩')) { out.add('견과류'); out.add('땅콩'); }
  return [...out];
}

/** 직원 말이 못 드시는 재료를 물었는지 ("매운 거 못 드시는 분"은 매운맛 질문이라 아님) */
export function askedExclude(text: string): boolean {
  return /재료|알레르기|알러지|채식|가리시는|못\s*드시는\s*(거|것|게|음식)|빼\s*(드릴|야|실)/.test(text);
}
/** 직원 말이 종류(면·밥·딤섬·요리)를 물었는지. "드시면,"의 면처럼 낱말 안의 글자는 세지 않는다 */
export function askedKind(text: string): boolean {
  return /종류|딤섬|어떤\s*메뉴|드시고\s*싶은|(?<![가-힣])(면|밥)\s*(이나|이랑|하고|과|요리|,|·|\/)|요리\s*(중|로|나)/.test(text);
}

/** 손님이 매운맛 이야기를 했는지 ("안 맵게", "매운 거 좋아요", "맵기는 상관없어요", "순한 거") */
const spicyMentioned = (text: string) => /매운|맵|매콤|얼큰|순한|spicy/i.test(text);
/** 직원 말이 매운맛을 물었는지 (손님이 "상관없어요·아무거나"로 답했어도 물은 것) */
const askedSpicy = (text: string) => /매운|맵|매콤|얼큰/.test(text);

// 직원 질문이 무엇을 묻는지 추정: 프론트 kiosk-next/layout.ts askingOf와 같은 규칙 (프론트와 따로 둠). '면'은 앞에 글자가 붙으면("드시면") 종류가 아님
const ASK_WORDS: [Exclude<Asking, 'other'>, RegExp][] = [
  ['party', /몇\s*분|몇\s*명|인원|혼자|일행/g],
  ['spicy', /매운|맵|매콤|얼큰/g],
  ['exclude', /빼|알레르기|재료|못\s*드시|안\s*드시/g],
  ['kind', /(?<![가-힣])면|밥|딤섬|요리|종류|국물|고기|해산물|어떤\s*메뉴|뭐가|무엇을/g],
];
const lastIndex = (text: string, re: RegExp) => Math.max(-1, ...[...text.matchAll(re)].map((m) => m.index));
/**
 * 직원 말의 마지막 물음 문장이 무엇을 묻는지. 맞장구·상황 문장("화끈하게 매운 요리로 준비해 드릴게요")에 끌려가지 않도록
 * 마지막 물음 문장에서 가장 뒤에 나온 낱말을 고른다. "매운 거 못 드시는 분"의 '못 드시'는 재료가 아니라 매운맛.
 */
export function askingOf(question: string | null): Asking {
  if (!question) return 'other';
  const sentences = question.match(/[^.!?。]+[.!?。]?/g)?.map((x) => x.trim()) ?? [];
  const asked = sentences.filter((x) => x.endsWith('?')).at(-1) ?? question;
  const spicyOnly = /매운|맵|매콤|얼큰/.test(asked) && !/빼|알레르기|재료/.test(asked);
  const found = ASK_WORDS
    .filter(([key]) => !(spicyOnly && key === 'exclude'))
    .map(([key, re]) => [key, lastIndex(asked, re)] as const)
    .filter(([, i]) => i >= 0);
  return found.length ? found.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : 'other';
}

/**
 * 추천 전에 빠진 것 (없으면 null). 순서: 인원 → 매운맛 → 못 드시는 재료 → 종류.
 * - 매운맛: 조건에 들어 있거나, 손님이 매운맛 이야기를 했거나, 직원이 이미 물었으면 됨 (답이 "상관없어요"여도 물었으니 됨)
 * - 재료: 조건에 들어 있거나, 손님이 말했거나, 직원이 이미 물었으면 됨 (손님 답이 "없어요"·"아니요"여도 물었으니 됨)
 * - 종류: 조건에 들어 있거나, 손님이 "아무거나"류로 말했거나, 직원이 이미 물었으면 됨 (답이 종류로 안 잡혀도 같은 질문을 되풀이하지 않게)
 * - 손님이 말을 끊은 직원 말("(끊김)")은 다 못 들었을 수 있어 물은 것으로 치지 않는다
 */
function missingBeforeRecommend(turns: readonly ChatTurn[], c: ChatConditions, partyKnown: boolean): 'party' | 'spicy' | 'exclude' | 'kind' | null {
  if (!partyKnown) return 'party';
  const userTexts = turns.filter((t) => t.role === 'user').map((t) => t.text);
  const asked = turns.filter((t) => t.role === 'assistant' && !t.text.includes('(끊김)')).map((t) => t.text);
  if (c.spicy === null && !userTexts.some(spicyMentioned) && !asked.some(askedSpicy)) return 'spicy';
  if (!c.exclude.length && !userTexts.some(excludeMentioned) && !asked.some(askedExclude)) return 'exclude';
  if (c.kind === '상관없음' && !userTexts.some(wantsAnything) && !asked.some(askedKind)) return 'kind';
  return null;
}
const DEFAULT_WHY = '말씀하신 조건에 맞는 메뉴예요';
export const SEAFOOD = ['해산물', '새우', '생선', '게', '해삼', '전복', '관자', '굴', '오징어', '조개'];

const PARTY_WORDS: [RegExp, number][] = [
  [/혼자|한\s*(명|분|사람)/, 1], [/둘|두\s*(명|분|사람)/, 2], [/셋|세\s*(명|분|사람)/, 3],
  [/넷|네\s*(명|분|사람)/, 4], [/다섯/, 5], [/여섯/, 6], [/일곱/, 7], [/여덟/, 8],
  // 한자어 수사는 뒤에 '명'이 붙을 때만 ("이 사람"·"이분"은 this, "오 분"은 5분일 수 있음). '일'은 다른 뜻이 많아 "일 명"을 띄어 말할 때만
  [/(?<![가-힣])일\s+명/, 1], [/(?<![가-힣])이\s*명/, 2], [/(?<![가-힣])삼\s*명/, 3], [/(?<![가-힣])오\s*명/, 5],
  [/(?<![가-힣])육\s*명/, 6], [/(?<![가-힣])칠\s*명/, 7], [/(?<![가-힣])팔\s*명/, 8],
  // 영어 (관광객). one은 "this one"과 겹쳐 person/people이 붙을 때만
  [/\bjust\s+me\b|\bonly\s+me\b|\bby\s+myself\b|\balone\b|\bone\s+(person|people)\b/i, 1],
  [/\btwo\b/i, 2], [/\bthree\b/i, 3], [/\bfour\b/i, 4], [/\bfive\b/i, 5], [/\bsix\b/i, 6], [/\bseven\b/i, 7], [/\beight\b/i, 8],
];
/** 손님 말에서 인원. 인원 말이 없으면 null ("1인당 만오천원"의 1인은 인원이 아님). 고쳐 말하면("한 명, 아니 두 명") 마지막에 말한 인원 */
export function partyMentioned(text: string): number | null {
  return partyMention(text)?.n ?? null;
}
/** 인원 말 바로 뒤의 "이상·넘어요·넘게·보다 많아요" ("네 명 이상이에요", "넷 넘게", "네 명이 넘어요") */
const AT_LEAST = /^\s*(?:명|분|사람)?\s*(?:이|은|는|가)?\s*(?:이상|넘|보다\s*(?:많|더))/;
/** 손님 말에서 마지막으로 말한 인원과 그게 "N명 이상" 꼴인지. 인원 말이 없으면 null */
export function partyMention(text: string): { n: number; atLeast: boolean } | null {
  const t = text.replace(/\d*\s*인\s*당|한\s*사람\s*당/g, ' ');
  const found: { at: number; end: number; n: number }[] = [];
  for (const m of t.matchAll(/(\d+)\s*(명|분|인(?!분)|people\b|persons?\b|ppl\b)/gi)) found.push({ at: m.index, end: m.index + m[0].length, n: Number(m[1]) });
  for (const [re, n] of PARTY_WORDS) for (const m of t.matchAll(new RegExp(re.source, `${re.flags}g`))) found.push({ at: m.index, end: m.index + m[0].length, n });
  if (!found.length) return null;
  const last = found.reduce((a, b) => (b.at > a.at ? b : a));
  return { n: Math.min(8, Math.max(1, last.n)), atLeast: AT_LEAST.test(t.slice(last.end)) };
}

const pickId = (p: unknown): string => (typeof p === 'string' ? p : typeof p === 'object' && p && typeof (p as { id?: unknown }).id === 'string' ? (p as { id: string }).id : '');
const squash = (s: string) => s.replace(/\s+/g, '');

/** 판매 중이고 조건(빼는 재료, 안 맵게)을 지키는 메뉴만. 빼는 재료가 있으면 재료가 확인 안 된 메뉴(빈 목록, 확인 표시 없음)도 뺀다 (프론트 recommendation.ts unknown()과 같음), 손님 말 인용(heard)은 실제로 한 말일 때만 */
function checkPicks(proposed: unknown[], c: ChatConditions, knowledge: MenuKnowledge, said: string): PickReason[] {
  const excluded = c.exclude.flatMap((x) => (x === '해산물' ? SEAFOOD : [x]));
  if (excluded.some((x) => SEAFOOD.includes(x))) excluded.push('해산물'); // '해물'로만 적힌 메뉴도 함께 뺀다
  const out: PickReason[] = [];
  for (const p of proposed) {
    const m = knowledge.byId(pickId(p));
    const unknown = m && m.ingredients.length === 0 && !m.ingredientsChecked;
    if (!m || m.soldOut || out.some((o) => o.id === m.id) || m.ingredients.some((i) => excluded.includes(i)) || (excluded.length && unknown) || (c.spicy === 0 && m.spicy > 0)) continue;
    const raw = typeof p === 'object' && p ? (p as { why?: unknown; heard?: unknown }) : {};
    const why = typeof raw.why === 'string' && raw.why.trim() && !raw.why.includes('?') ? raw.why.trim().slice(0, 40) : DEFAULT_WHY;
    const heard = typeof raw.heard === 'string' && raw.heard.trim().length <= 20 && squash(said).includes(squash(raw.heard)) && raw.heard.trim() ? raw.heard.trim() : null;
    out.push({ id: m.id, why, heard, review: m.reviewQuote });
    if (out.length === 3) break;
  }
  return out;
}

const hasBatchim = (word: string) => { const code = word.charCodeAt(word.length - 1) - 0xac00; return code >= 0 && code < 11172 && code % 28 !== 0; };
/** 메뉴를 부르는 말: 전체 이름, 별칭, 3글자 이상인 마지막 낱말("소고기 우육탕면"의 우육탕면) */
const menuWords = (m: KnowledgeMenu) => [m.name, ...m.aliases, ...[m.name.split(/\s+/).at(-1) ?? ''].filter((w) => [...w].length >= 3 && w !== m.name)];
/** 추천 답이 고르지 않은 메뉴를 이름으로 말하는지 (고른 메뉴와 겹치는 낱말은 제외). 실측: 게살스프를 고르고 "우육탕면으로 골라 봤어요" */
function mentionsUnpicked(reply: string, picked: readonly KnowledgeMenu[], knowledge: MenuKnowledge): boolean {
  const pickedWords = picked.flatMap(menuWords);
  return knowledge.menus.some((m) => !picked.includes(m) && menuWords(m).some((w) => reply.includes(w) && !pickedWords.some((p) => p.includes(w))));
}

/**
 * 60자를 넘는 질문 답: 앞쪽 반응 문장부터 덜어 내고 마지막 질문은 남긴다 (반응 + 긴 질문이 붙어 80자가 된 적이 있음, 2026-11-03 실측).
 * 질문 한 문장만으로도 넘으면 같은 걸 묻는 서버 질문으로 바꾼다
 */
function shortenQuestion(reply: string, asking: Asking | null): string {
  const sentences = reply.match(/[^.!?。]+[.!?。]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [reply];
  while (sentences.length > 1 && [...sentences.join(' ')].length > MAX_REPLY_CHARS) sentences.shift();
  const out = sentences.join(' ');
  if ([...out].length <= MAX_REPLY_CHARS) return out;
  return asking && asking !== 'other' ? QUESTION[asking] : out;
}

const PLAIN_RECOMMEND = '말씀하신 대로 골라 봤어요. 화면에서 천천히 보세요.';
const MOOD_LEAD: Partial<Record<Mood, string>> = { tired: '오늘 고생 많으셨어요. ', celebrate: '축하드려요! ' };
/**
 * 추천할 때 직원이 하는 말. 손님 기분(지침·축하)과 "안 맵게"를 짚고 "맛있게 드세요!"로 따뜻하게 마무리한다.
 * 60자를 넘으면 앞 1~2개 이름 + "등"으로 줄이고, 그래도 길면 기분 한마디를 뺀다
 */
export function recommendLine(names: string[], opts: { spicy?: number | null; mood?: Mood | null } = {}): string {
  const moodLead = (opts.mood && MOOD_LEAD[opts.mood]) || '';
  const spicyLead = opts.spicy === 0 ? '안 맵게 ' : '';
  for (const lead of moodLead ? [moodLead, ''] : ['']) {
    const start = lead + (spicyLead || (lead ? '' : '말씀 듣고 '));
    for (let n = names.length; n >= 1; n--) {
      const more = n < names.length;
      const head = names.slice(0, n).join(', ') + (more ? ' 등' : '');
      const line = `${start}${head}${hasBatchim(more ? '등' : names[n - 1]) ? '을' : '를'} 골라 봤어요. 맛있게 드세요!`;
      if ([...line].length <= MAX_REPLY_CHARS) return line;
    }
  }
  return PLAIN_RECOMMEND;
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
