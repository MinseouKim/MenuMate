// 서버의 상황(/api/context)과 대화형 추천(/api/chat)을 부릅니다. 키는 서버에만 있습니다.
// 서버가 없거나 늦거나 503이면 null을 돌려주고, 화면은 규칙 해석으로 이어 갑니다 (D46: 흐름이 멈추지 않게).
import { apiUrl, config } from '../config';
import type { ChatReply, ChatTurn, Conditions, KioskContext } from './types';

// Render 무료 서버는 잠에서 깨는 데 1분 가까이 걸릴 수 있어 넉넉히 둔다. 서버 쪽 Gemini 대기(25초)보다 길게.
const CONTEXT_TIMEOUT_MS = 8000;
const CHAT_TIMEOUT_MS = 30000;

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  if (typeof fetch !== 'function') return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 가게 첫인사. 서버를 기다리지 않고 화면이 바로 말합니다 (서버 backend/src/chat.ts GREETING과 같은 문장, 2026-11-03 설계 4-1) */
export const GREETING = '우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?';
/** 손님 말이 끝나자마자 내는 짧은 맞장구. 직원 AI가 생각하는 동안 조용하지 않게 합니다 (음성은 미리 받아 둠).
 *  기계적인 "네, 알겠어요."와 어색한 "아, 그러시군요."는 뺐습니다(2026-11-03 팀장). 직원이 잠깐 생각하는 동안 하는 말 */
export const ACKS = ['네!', '네, 잠시만요!'];
/** 이번 손님 말 직전까지의 대화로 맞장구를 고릅니다. 첫 질문(인원)에 답한 뒤에는 직원 답이 바로 반겨 주므로 맞장구 없이 null */
export function ackFor(turns: readonly { role: string; text: string }[]): string | null {
  // 손님 답 수로 돌린다 (대화 길이는 손님이 답할 때마다 늘 홀수라 같은 맞장구만 나왔음)
  const answered = turns.filter(t => t.role === 'user').length;
  return answered ? ACKS[answered % ACKS.length] : null;
}

export const fetchContext = (): Promise<KioskContext | null> =>
  config.chatServer ? post<KioskContext>('/api/context', undefined, CONTEXT_TIMEOUT_MS) : Promise.resolve(null);

/** 무료 서버는 15분 동안 요청이 없으면 잠듭니다. 손님이 오기 전에 미리 깨웁니다 */
export function wakeServer(): void {
  if (config.chatServer) void post('/api/health', undefined, CONTEXT_TIMEOUT_MS);
}

/** 손님이 끊은 직원 말에는 "(끊김)"을 붙여, 다 못 들은 질문으로 다루게 합니다 */
export const toServerTurns = (turns: ChatTurn[]) => turns.map(t => ({ role: t.role, text: t.interrupted ? `${t.text} (끊김)` : t.text }));

export async function chatWithServer(turns: ChatTurn[], conditions: Conditions, context: KioskContext | null): Promise<ChatReply | null> {
  if (!config.chatServer) return null;
  const { raw: _raw, ...rest } = conditions;
  const ctx = context ? { timeOfDay: context.timeOfDay, weather: context.weather, crowd: context.crowd } : {};
  const reply = await post<ChatReply>('/api/chat', { turns: toServerTurns(turns), conditions: rest, context: ctx }, CHAT_TIMEOUT_MS);
  return reply && typeof reply.reply === 'string' && reply.conditions ? reply : null;
}
