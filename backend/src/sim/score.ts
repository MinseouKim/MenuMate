// 시뮬레이션 대화 자동 채점 (Byte by Yum!의 자동 채점을 규칙으로 가볍게). 사람이 문제 목록을 보고 프롬프트·서버 검사를 고칩니다.
import { partyMentioned, SEAFOOD } from '../chat.js';
import type { MenuKnowledge } from '../menuKnowledge.js';
import type { Persona } from './personas.js';
import type { SimRecord } from './run.js';

export interface Score {
  /** 직원 AI 통과 여부 (issues만 봄, 손님 역할 오류는 빼고) */
  ok: boolean;
  /** 직원 AI 문제 */
  issues: string[];
  /** 손님 역할 AI가 설정과 다르게 연기한 문제 (예: 설정 1명인데 "두 명이요"). 직원 통과율에 넣지 않음. 예전 기록에는 없음 */
  actorIssues?: string[];
  userTurns: number;
  /** 직원 AI 한 턴의 평균 응답 시간(ms) */
  avgMs: number;
  /** 손님 AI가 추천을 주문하겠다고 했는지 (추천까지 못 가면 null) */
  accepted: boolean | null;
}

/** 추천 메뉴가 손님 조건(빼는 재료, 매운 걸 못 먹음)을 어긴 내용 */
export function violations(p: Persona, picks: string[], knowledge: MenuKnowledge): string[] {
  const excluded = p.exclude.flatMap((x) => (x === '해산물' ? SEAFOOD : [x]));
  const out: string[] = [];
  for (const m of picks.map((id) => knowledge.byId(id)).filter((x) => !!x)) {
    if (m.ingredients.some((i) => excluded.includes(i) || (i === '해산물' && excluded.some((x) => SEAFOOD.includes(x))))) out.push(`빼는 재료 위반: ${m.name}`);
    if (p.spicy === '못 먹음' && m.spicy > 0) out.push(`안 맵게 원했는데 매운 메뉴: ${m.name}`);
  }
  return out;
}

export function scoreConversation(rec: Omit<SimRecord, 'error'> & { error?: string | null }, knowledge: MenuKnowledge): Score {
  const issues: string[] = [];
  const actorIssues: string[] = [];
  const { persona: p, final, steps } = rec;
  // 손님이 마지막으로 말한 인원. 설정과 다르면 손님 역할 오류이고, 직원은 손님 말 기준으로 채점한다
  const saidParty = rec.turns.filter((t) => t.role === 'user').map((t) => partyMentioned(t.text)).filter((n): n is number => n !== null).at(-1) ?? null;
  if (saidParty !== null && saidParty !== p.party) actorIssues.push(`손님 역할 오류: 인원을 ${saidParty}명으로 말함`);
  const long = steps.filter((s) => [...s.reply].length > 60).length;
  if (long) issues.push(`직원 말 60자 초과 ${long}회`);
  if (!final) issues.push('추천까지 못 감');
  else {
    if (!final.picks.some((id) => knowledge.byId(id))) issues.push('추천 메뉴 없음');
    issues.push(...violations(p, final.picks, knowledge));
    if (saidParty !== null && final.conditions.party !== saidParty) issues.push(`인원 틀림: ${final.conditions.party}명 (손님 말 ${saidParty}명)`);
    else if (saidParty === null && final.conditions.party !== p.party) issues.push(`인원 틀림: ${final.conditions.party}명 (실제 ${p.party}명)`);
    if (final.reply.includes('?')) issues.push('추천하면서 질문으로 끝남');
  }
  const userTurns = rec.turns.filter((t) => t.role === 'user').length;
  const avgMs = steps.length ? Math.round(steps.reduce((v, s) => v + s.ms, 0) / steps.length) : 0;
  return { ok: issues.length === 0, issues, actorIssues, userTurns, avgMs, accepted: rec.verdict ? rec.verdict.accept : null };
}
