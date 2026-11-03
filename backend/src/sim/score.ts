// 시뮬레이션 대화 자동 채점 (Byte by Yum!의 자동 채점을 규칙으로 가볍게). 사람이 문제 목록을 보고 프롬프트·서버 검사를 고칩니다.
import { askedExclude, askedKind, excludeMentioned, MAX_TURNS, menuWords, partyMention, SEAFOOD, sharesSingle, wantsAnything } from '../chat.js';
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
/** 채점에 쓰는 손님 조건 (시뮬레이션 손님 설정, 또는 실사용 대화에서 손님이 말한 조건) */
export type ScorePersona = Pick<Persona, 'party' | 'exclude' | 'spicy'>;

export function violations(p: ScorePersona, picks: string[], knowledge: MenuKnowledge): string[] {
  const excluded = p.exclude.flatMap((x) => (x === '해산물' ? SEAFOOD : [x]));
  const out: string[] = [];
  for (const m of picks.map((id) => knowledge.byId(id)).filter((x) => !!x)) {
    if (m.ingredients.some((i) => excluded.includes(i) || (i === '해산물' && excluded.some((x) => SEAFOOD.includes(x))))) out.push(`빼는 재료 위반: ${m.name}`);
    if (p.spicy === '못 먹음' && m.spicy > 0) out.push(`안 맵게 원했는데 매운 메뉴: ${m.name}`);
  }
  return out;
}

export function scoreConversation(rec: Omit<SimRecord, 'error' | 'persona'> & { persona: ScorePersona; error?: string | null }, knowledge: MenuKnowledge): Score {
  const issues: string[] = [];
  const actorIssues: string[] = [];
  const { persona: p, final, steps } = rec;
  // 손님이 마지막으로 말한 인원. 설정과 다르면 손님 역할 오류이고, 직원은 손님 말 기준으로 채점한다
  const said = rec.turns.filter((t) => t.role === 'user').map((t) => partyMention(t.text)).filter((m) => m !== null).at(-1) ?? null;
  const saidParty = said?.n ?? null;
  // "N명 이상"이라고 했으면 실제 인원이 N 이상이면 맞게 말한 것
  if (said && (said.atLeast ? p.party < said.n : p.party !== said.n)) actorIssues.push(`손님 역할 오류: 인원을 ${said.n}명${said.atLeast ? ' 이상' : ''}으로 말함`);
  const long = steps.filter((s) => [...s.reply].length > 60).length;
  if (long) issues.push(`직원 말 60자 초과 ${long}회`);
  if (!final) issues.push('추천까지 못 감');
  else {
    if (!final.picks.some((id) => knowledge.byId(id))) issues.push('추천 메뉴 없음');
    issues.push(...violations(p, final.picks, knowledge));
    if (saidParty !== null && final.conditions.party !== saidParty) issues.push(`인원 틀림: ${final.conditions.party}명 (손님 말 ${saidParty}명)`);
    else if (saidParty === null && final.conditions.party !== p.party) issues.push(`인원 틀림: ${final.conditions.party}명 (실제 ${p.party}명)`);
    if (final.reply.includes('?')) issues.push('추천하면서 질문으로 끝남');
    // 1인분 메뉴(면·밥 한 그릇)를 "나눠 먹기"로 소개 (2026-11-03 팀장 지적: 2명에게 1인분 유니짜장을 "둘이 나눠 먹기 좋은")
    const shared = new Set<string>();
    for (const pr of final.pickReasons ?? []) { const m = knowledge.byId(pr.id); if (m && sharesSingle(pr.why, [m])) shared.add(m.name); }
    for (const m of final.picks.map((id) => knowledge.byId(id)).filter((x) => !!x)) if (menuWords(m).some((w) => final.reply.includes(w)) && sharesSingle(final.reply, [m])) shared.add(m.name);
    for (const name of shared) issues.push(`1인분 메뉴를 나눠 먹기로 소개: ${name}`);
    // PM 결정(2026-11-03): 강제 종료가 아니면 추천 전에 못 드시는 재료와 종류를 확인한다. 손님이 먼저 말했거나 직원이 물었으면 됨
    const userTexts = rec.turns.filter((t) => t.role === 'user').map((t) => t.text);
    const asked = rec.turns.filter((t) => t.role === 'assistant' && t.text !== final.reply && !t.text.includes('(끊김)')).map((t) => t.text);
    if (userTexts.length < MAX_TURNS) {
      if (!final.conditions.exclude.length && !userTexts.some(excludeMentioned) && !asked.some(askedExclude)) issues.push('재료 확인 없이 추천');
      if (final.conditions.kind === '상관없음' && !userTexts.some(wantsAnything) && !asked.some(askedKind)) issues.push('종류 확인 없이 추천');
    }
  }
  // 질문인데 무엇을 묻는지(asking)가 없으면 화면 답 버튼이 추정으로 돌아간다
  const noAsking = steps.filter((s) => !s.done && !s.asking).length;
  if (noAsking) issues.push(`질문 종류(asking) 없음 ${noAsking}회`);
  const userTurns = rec.turns.filter((t) => t.role === 'user').length;
  const avgMs = steps.length ? Math.round(steps.reduce((v, s) => v + s.ms, 0) / steps.length) : 0;
  return { ok: issues.length === 0, issues, actorIssues, userTurns, avgMs, accepted: rec.verdict ? rec.verdict.accept : null };
}
