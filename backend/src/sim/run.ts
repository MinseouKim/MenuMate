// 직원 AI ↔ 손님 AI 대화 한 번. 직원은 키오스크와 같은 converse(), 손님은 Persona를 연기하는 LLM.
import type { Asking, ChatConditions, ChatResponse, ChatTurn } from '../contracts.js';
import type { Persona } from './personas.js';

export interface CustomerTurn { say: string; accept?: boolean | null; why?: string | null }
/** final이 있으면 추천을 받은 뒤의 평가(주문하겠는가). asking: 직원의 마지막 질문이 묻는 것(예시 답변 손님이 씀) */
export type Customer = (persona: Persona, turns: ChatTurn[], final: ChatResponse | null, asking: Asking | null) => Promise<CustomerTurn>;
/** ms: 직원 AI가 실제로 걸린 시간(요청 사이 쉬는 시간 제외). 없으면 runPersona가 잰 시간 */
export type Staff = (turns: ChatTurn[], conditions: Partial<ChatConditions>) => Promise<ChatResponse & { ms?: number }>;
export interface Step { reply: string; asking: Asking | null; done: boolean; ms: number }
export interface SimRecord {
  persona: Persona;
  turns: ChatTurn[];
  steps: Step[];
  final: ChatResponse | null;
  verdict: { accept: boolean; why: string } | null;
  error: string | null;
}

export async function runPersona(opts: {
  persona: Persona; staff: Staff; customer: Customer; greeting: string; maxUserTurns?: number; now?: () => number;
}): Promise<SimRecord> {
  const { persona, staff, customer, greeting, maxUserTurns = 6, now = () => performance.now() } = opts;
  const turns: ChatTurn[] = [{ role: 'assistant', text: greeting }];
  const steps: Step[] = [];
  let conditions: Partial<ChatConditions> = {};
  let final: ChatResponse | null = null;
  for (let i = 0; i < maxUserTurns && !final; i++) {
    const c = await customer(persona, turns, null, steps.length ? steps[steps.length - 1].asking ?? 'other' : 'party'); // 첫인사는 인원 질문
    turns.push({ role: 'user', text: c.say });
    const t0 = now();
    const { ms, ...r } = await staff(turns, conditions);
    steps.push({ reply: r.reply, asking: r.asking, done: r.done, ms: Math.round(ms ?? now() - t0) });
    turns.push({ role: 'assistant', text: r.reply });
    conditions = r.conditions;
    if (r.done) final = r;
  }
  const v = final ? await customer(persona, turns, final, null) : null;
  return { persona, turns, steps, final, verdict: v ? { accept: v.accept === true, why: v.why ?? '' } : null, error: null };
}
