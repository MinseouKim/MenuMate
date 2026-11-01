// 서버의 상황(/api/context)과 대화형 추천(/api/chat)을 부릅니다. 키는 서버에만 있습니다.
// 서버가 없거나 늦거나 503이면 null을 돌려주고, 화면은 규칙 해석으로 이어 갑니다 (D46: 흐름이 멈추지 않게).
import { apiUrl, config } from '../config';
import type { ChatReply, ChatTurn, Conditions, KioskContext } from './types';

const CONTEXT_TIMEOUT_MS = 3000;
const CHAT_TIMEOUT_MS = 10000;

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

export const fetchContext = (): Promise<KioskContext | null> =>
  config.chatServer ? post<KioskContext>('/api/context', undefined, CONTEXT_TIMEOUT_MS) : Promise.resolve(null);

export async function chatWithServer(turns: ChatTurn[], conditions: Conditions, context: KioskContext | null): Promise<ChatReply | null> {
  if (!config.chatServer) return null;
  const { raw: _raw, ...rest } = conditions;
  const ctx = context ? { timeOfDay: context.timeOfDay, weather: context.weather, crowd: context.crowd } : {};
  const reply = await post<ChatReply>('/api/chat', { turns, conditions: rest, context: ctx }, CHAT_TIMEOUT_MS);
  return reply && typeof reply.reply === 'string' && reply.conditions ? reply : null;
}
