// Claude 자체 대화 시험 (2026-11-03 팀장 요청): Claude 팀원이 손님과 직원을 직접 연기하고, 직원 답은 우리 서버 검사(converse)를 거친다.
// scripts/sim-step.ts는 이 순수 함수들을 부르고 세션 파일을 읽고 쓰기만 한다.
import { chatInput, converse, GREETING, type LlmClient } from '../chat.js';
import type { ChatConditions, ChatRequest, ChatResponse, ChatTurn } from '../contracts.js';
import type { MenuKnowledge } from '../menuKnowledge.js';
import type { Persona } from './personas.js';
import type { Step } from './run.js';
import { scoreConversation } from './score.js';

export interface ClaudeSession {
  id: string;
  /** 손님 번호 (1부터, 시뮬레이터와 같은 손님 묶음) */
  personaNo: number;
  persona: Persona;
  context: ChatRequest['context'];
  turns: ChatTurn[];
  conditions: Partial<ChatConditions>;
  steps: Step[];
  final: ChatResponse | null;
  createdAt: string;
}

/** 세션 id는 파일 이름이 되므로 글자·숫자·-·_ 만 (경로 이동 막기) */
export const isSessionId = (id: string) => /^[\w-]{1,64}$/.test(id);

export function startSession(id: string, personaNo: number, personas: readonly Persona[], opts: { context?: ChatRequest['context']; now?: string } = {}): ClaudeSession {
  if (!isSessionId(id)) throw new Error(`세션 id는 글자·숫자·-·_ 만 쓸 수 있어요: ${id}`);
  if (!Number.isInteger(personaNo) || personaNo < 1 || personaNo > personas.length) throw new Error(`손님 번호는 1~${personas.length} 사이여야 해요: ${personaNo}`);
  return {
    id, personaNo, persona: personas[personaNo - 1], context: opts.context ?? {},
    turns: [{ role: 'assistant', text: GREETING }], conditions: {}, steps: [], final: null, createdAt: opts.now ?? new Date().toISOString(),
  };
}

/** 직원 LLM이 이번에 받을 시스템 프롬프트와 메시지 (converse가 보내는 것과 똑같음) */
export function staffPrompt(s: ClaudeSession, knowledge: MenuKnowledge) {
  const { system, messages } = chatInput(knowledge, { turns: s.turns, conditions: s.conditions, context: s.context });
  return { system, messages };
}

export function addCustomerTurn(s: ClaudeSession, text: string): ClaudeSession {
  if (s.final) throw new Error('이미 추천이 끝났어요. finish로 마무리해 주세요.');
  if (s.turns.at(-1)?.role !== 'assistant') throw new Error('지금은 직원 차례예요 (staff).');
  if (!text.trim()) throw new Error('손님 말이 비어 있어요.');
  return { ...s, turns: [...s.turns, { role: 'user', text: text.trim() }] };
}

/** 받은 원시 문자열을 그대로 돌려주는 대리 LLM (Claude가 직원으로서 쓴 JSON) */
export function relayLlm(raw: string): LlmClient {
  return { model: 'claude', async generateJson() { return raw; } };
}

/** Claude가 쓴 직원 원시 JSON을 서버 검사(converse)에 통과시키고 세션에 쌓는다. 실패하면 오류를 던지고 세션은 그대로 */
export async function applyStaff(s: ClaudeSession, raw: string, knowledge: MenuKnowledge): Promise<{ session: ClaudeSession; response: ChatResponse }> {
  if (s.final) throw new Error('이미 추천이 끝났어요.');
  if (s.turns.at(-1)?.role !== 'user') throw new Error('지금은 손님 차례예요 (customer).');
  const t0 = performance.now();
  const response = await converse({ llm: relayLlm(raw), knowledge }, { turns: s.turns, conditions: s.conditions, context: s.context });
  const step: Step = { reply: response.reply, asking: response.asking, done: response.done, ms: Math.round(performance.now() - t0) };
  return {
    response,
    session: { ...s, turns: [...s.turns, { role: 'assistant', text: response.reply }], conditions: response.conditions, steps: [...s.steps, step], final: response.done ? response : null },
  };
}

/** 채점해 대화 기록 한 줄을 만든다 (mode=claude). 손님 평가(verdict)는 추천을 받았을 때만 */
export function finishRecord(s: ClaudeSession, accept: boolean, why: string, knowledge: MenuKnowledge, at = new Date().toISOString()) {
  const verdict = s.final ? { accept, why } : null;
  const rec = { persona: s.persona, turns: s.turns, steps: s.steps, final: s.final, verdict, error: null };
  return { at, model: 'claude', mode: 'claude' as const, customer: 'claude', session: s.id, personaNo: s.personaNo, ...rec, score: scoreConversation(rec, knowledge) };
}
