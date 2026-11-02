// 쌓인 시뮬레이션 대화를 요약합니다. 자주 나온 문제가 다음에 고칠 대화 규칙(프롬프트)·서버 검사의 후보입니다.
import type { Persona } from './personas.js';
import type { Score } from './score.js';

export interface SimRow { persona: Persona; score: Score }
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const rate = (part: number, all: number) => (all ? round(part / all) : 0);

export function summarize(rows: SimRow[]) {
  const n = rows.length;
  const judged = rows.filter((r) => r.score.accepted !== null);
  // 문제 종류별로 몇 건의 대화에서 나왔는지 (메뉴 이름·횟수는 빼고 묶음)
  const tally = (pick: (s: Score) => string[] | undefined) => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const issue of new Set((pick(r.score) ?? []).map((i) => i.split(':')[0].replace(/\s*\d+회$/, '')))) counts.set(issue, (counts.get(issue) ?? 0) + 1);
    return [...counts].map(([issue, count]) => ({ issue, count })).sort((a, b) => b.count - a.count);
  };
  const byBackground: Record<string, { conversations: number; okRate: number }> = {};
  for (const bg of new Set(rows.map((r) => r.persona.background))) {
    const mine = rows.filter((r) => r.persona.background === bg);
    byBackground[bg] = { conversations: mine.length, okRate: rate(mine.filter((r) => r.score.ok).length, mine.length) };
  }
  return {
    conversations: n,
    okRate: rate(rows.filter((r) => r.score.ok).length, n),
    acceptRate: rate(judged.filter((r) => r.score.accepted).length, judged.length),
    avgUserTurns: n ? round(rows.reduce((v, r) => v + r.score.userTurns, 0) / n) : 0,
    avgMs: n ? Math.round(rows.reduce((v, r) => v + r.score.avgMs, 0) / n) : 0,
    topIssues: tally((s) => s.issues),
    /** 손님 역할 AI 연기 오류 (직원 통과율과 무관). 고칠 곳은 시뮬레이터 손님 설정·프롬프트 */
    actorIssues: tally((s) => s.actorIssues),
    byBackground,
  };
}
