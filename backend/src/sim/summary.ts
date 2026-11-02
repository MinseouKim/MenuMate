// 쌓인 시뮬레이션 대화를 요약합니다. 자주 나온 문제가 다음에 고칠 대화 규칙(프롬프트)·서버 검사의 후보입니다.
import type { MenuKnowledge } from '../menuKnowledge.js';
import type { Persona } from './personas.js';
import type { SimRecord } from './run.js';
import { scoreConversation, type Score } from './score.js';

/** 직원 쪽이 누구였나: Gemini(실제 서비스와 같은 LLM), 오프라인 fuzz(일부러 실수하는 가짜 LLM, 서버 검사 시험), Claude(팀원이 직접 연기) */
export type SimMode = 'gemini' | 'offline-fuzz' | 'claude';
export const SIM_MODES: readonly SimMode[] = ['gemini', 'offline-fuzz', 'claude'];
export interface SimRow { persona: Persona; score: Score; mode?: SimMode; fuzz?: string }
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const rate = (part: number, all: number) => (all ? round(part / all) : 0);

export function summarize(rows: readonly SimRow[]) {
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

/**
 * 저장된 대화 기록 → 요약용 줄. 저장된 score는 쓰지 않고 지금 채점기로 다시 채점한다(채점 규칙을 고치면 옛 기록에도 반영).
 * 기록 파일과 저장된 score는 건드리지 않는다. 오류로 끝난 기록(turns 없음)은 뺀다. mode가 없는 옛 기록은 Gemini 직원.
 */
export function rowsFromRecords(records: readonly unknown[], knowledge: MenuKnowledge): SimRow[] {
  const rows: SimRow[] = [];
  for (const raw of records) {
    const r = raw as Partial<SimRecord> & { mode?: SimMode; fuzz?: string };
    if (!r || !r.persona || !Array.isArray(r.turns) || !Array.isArray(r.steps) || r.final === undefined) continue;
    const score = scoreConversation({ persona: r.persona, turns: r.turns, steps: r.steps, final: r.final ?? null, verdict: r.verdict ?? null }, knowledge);
    rows.push({ persona: r.persona, score, mode: SIM_MODES.includes(r.mode as SimMode) ? r.mode : 'gemini', ...(r.fuzz ? { fuzz: r.fuzz } : {}) });
  }
  return rows;
}

/** mode별로 따로 요약 (오프라인·Claude 결과가 Gemini 통과율에 섞이지 않게). 오프라인은 실수 종류별로도: 통과율이 1보다 낮은 실수가 서버 검사 구멍 */
export function summarizeByMode(rows: readonly SimRow[]) {
  const out: Partial<Record<SimMode, ReturnType<typeof summarize> & { byMistake?: Record<string, { conversations: number; okRate: number; topIssues: { issue: string; count: number }[] }> }>> = {};
  for (const mode of SIM_MODES) {
    const mine = rows.filter((r) => (r.mode ?? 'gemini') === mode);
    if (!mine.length) continue;
    const s: NonNullable<(typeof out)[SimMode]> = summarize(mine);
    if (mode === 'offline-fuzz') {
      s.byMistake = {};
      for (const m of new Set(mine.map((r) => r.fuzz ?? '없음'))) {
        const sub = summarize(mine.filter((r) => (r.fuzz ?? '없음') === m));
        s.byMistake[m] = { conversations: sub.conversations, okRate: sub.okRate, topIssues: sub.topIssues };
      }
    }
    out[mode] = s;
  }
  return out;
}
