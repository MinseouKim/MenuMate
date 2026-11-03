// 실사용 대화(CHAT_RECORD_DIR 기록) → 대화 단위 케이스 → 채점·재생. scripts/live-cases.ts가 부른다.
// 실사용에는 손님 설정(persona)이 없으므로, 손님이 대화에서 말한 조건(인원·빼는 재료·안 맵게)을 채점 기준으로 삼는다.
import { excludeFromSpeech, GREETING, partyMentioned } from '../chat.js';
import type { LiveCall, LiveResponse } from '../chatRecord.js';
import type { ChatConditions, ChatResponse, ChatTurn } from '../contracts.js';
import type { MenuKnowledge } from '../menuKnowledge.js';
import type { Staff, Step } from './run.js';
import { scoreConversation, type Score, type ScorePersona } from './score.js';
import { summarize } from './summary.js';

export interface LiveCase {
  id: string;
  startedAt: string;
  endedAt: string;
  /** 이 대화의 /api/chat 호출 수 (실패·다시 시도 포함) */
  calls: number;
  errors: number;
  /** 마지막 호출까지의 대화 + 마지막 답 */
  turns: ChatTurn[];
  /** 손님 발화 목록 (재생할 때 이 순서대로 다시 넣음) */
  userSays: string[];
  steps: Step[];
  /** 추천(done) 응답. 추천까지 못 갔으면 null */
  final: LiveResponse | null;
}

const MAX_GAP_MS = 30 * 60 * 1000;
const sameTurn = (a: ChatTurn, b: ChatTurn) => a.role === b.role && a.text === b.text;
const isPrefix = (a: ChatTurn[], b: ChatTurn[]) => a.length <= b.length && a.every((t, i) => sameTurn(t, b[i]));

/** next가 prev 다음 호출인가: prev.turns로 시작하고, 더 길면 그다음 칸이 prev의 답(끊김 표시가 붙어도 됨). 같은 길이면 다시 시도 */
function continues(prev: LiveCall, next: LiveCall): boolean {
  if (Date.parse(next.at) - Date.parse(prev.at) > MAX_GAP_MS || !isPrefix(prev.turns, next.turns)) return false;
  if (next.turns.length === prev.turns.length) return true;
  if (!prev.response) return true;
  const after = next.turns[prev.turns.length];
  return after.role === 'assistant' && after.text.trim().startsWith(prev.response.reply.trim());
}

function toCase(chain: LiveCall[]): LiveCase {
  const last = chain[chain.length - 1];
  // 같은 대화 길이의 호출이 여럿이면(실패 뒤 다시 시도) 마지막 답만 단계로 친다
  const byLength = new Map<number, LiveCall>();
  for (const c of chain) if (c.response) byLength.set(c.turns.length, c);
  const answered = [...byLength.values()];
  const lastAnswer = answered.at(-1);
  const turns = lastAnswer && lastAnswer === last ? [...last.turns, { role: 'assistant' as const, text: last.response!.reply }] : [...last.turns];
  const final = last.response?.done ? last.response : null;
  return {
    id: `live-${chain[0].at}`,
    startedAt: chain[0].at,
    endedAt: last.at,
    calls: chain.length,
    errors: chain.filter((c) => c.error).length,
    turns,
    userSays: last.turns.filter((t) => t.role === 'user').map((t) => t.text),
    steps: answered.map((c) => ({ reply: c.response!.reply, asking: c.response!.asking, done: c.response!.done, ms: c.ms })),
    final,
  };
}

/** 시간순 기록을 대화 단위로 묶는다. 첫인사만 있는 호출(turns 비어 있음)은 대화가 아니라서 뺀다 */
export function groupLiveCalls(calls: readonly LiveCall[]): LiveCase[] {
  const chains: LiveCall[][] = [];
  for (const c of [...calls].filter((x) => Array.isArray(x.turns) && x.turns.length > 0).sort((x, y) => Date.parse(x.at) - Date.parse(y.at))) {
    // 가장 최근에 이어진 대화부터 찾는다 (처음 말이 같은 두 손님이 섞이지 않게)
    const chain = [...chains].reverse().find((ch) => continues(ch[ch.length - 1], c));
    if (chain) chain.push(c);
    else chains.push([c]);
  }
  return chains.map(toCase);
}

const SAID_NOT_SPICY = /(매운|맵|매콤)[^,.!?]*(못|안)\s*먹|안\s*맵|안\s*매|맵지\s*않|순한/;
/** 손님이 말한 조건 → 채점 기준. 인원을 말하지 않았으면 직원이 정한 인원(fallbackParty, 없으면 1)으로 둬 인원 문제를 만들지 않는다 */
export function livePersona(userSays: readonly string[], fallbackParty: number | null): ScorePersona {
  const party = userSays.map(partyMentioned).filter((n): n is number => n !== null).at(-1) ?? fallbackParty ?? 1;
  return {
    party,
    exclude: [...new Set(userSays.flatMap(excludeFromSpeech))],
    spicy: userSays.some((t) => SAID_NOT_SPICY.test(t)) ? '못 먹음' : '상관없음',
  };
}

const asChatResponse = (r: LiveResponse | null): ChatResponse | null => (r ? { ...r, mood: null } : null);

/** 기존 채점기(score.ts)로 채점. 손님 평가(주문하겠는가)는 없음 */
export function scoreLiveCase(c: Pick<LiveCase, 'turns' | 'steps' | 'final' | 'userSays'>, knowledge: MenuKnowledge): Score {
  const persona = livePersona(c.userSays, c.final?.conditions.party ?? null);
  return scoreConversation({ persona, turns: c.turns, steps: c.steps, final: asChatResponse(c.final), verdict: null }, knowledge);
}

export function summarizeLive(rows: readonly { case: LiveCase; score: Score }[]) {
  const s = summarize(rows.map((r) => ({ persona: { background: '실사용' }, score: r.score })));
  return {
    cases: rows.length,
    finished: rows.filter((r) => r.case.final).length,
    errorCalls: rows.reduce((v, r) => v + r.case.errors, 0),
    ...s,
  };
}

/**
 * 재생: 손님 발화를 같은 순서로 새 직원(staff, 예: 지금 코드의 converse)에게 다시 넣는다. 추천이 나오거나 발화가 끝나면 멈춘다.
 * 직원 질문이 예전과 달라지면 손님 답이 어긋날 수 있다(기록된 말을 그대로 넣기 때문).
 */
export async function replayCase(c: LiveCase, staff: (turns: ChatTurn[], conditions: Partial<ChatConditions>) => ReturnType<Staff>) {
  const turns: ChatTurn[] = [c.turns[0]?.role === 'assistant' ? c.turns[0] : { role: 'assistant', text: GREETING }];
  const steps: Step[] = [];
  let conditions: Partial<ChatConditions> = {};
  let final: ChatResponse | null = null;
  for (const say of c.userSays) {
    turns.push({ role: 'user', text: say });
    const t0 = performance.now();
    const { ms, ...r } = await staff([...turns], conditions);
    steps.push({ reply: r.reply, asking: r.asking, done: r.done, ms: Math.round(ms ?? performance.now() - t0) });
    turns.push({ role: 'assistant', text: r.reply });
    conditions = r.conditions;
    if (r.done) { final = r; break; }
  }
  return { turns, steps, final };
}
