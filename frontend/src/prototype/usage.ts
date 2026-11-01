// 전시 기간 익명 사용 기록. 이 기기 브라우저(localStorage)에만 저장하며 이름·얼굴·음성 같은 개인정보는 남기지 않습니다.
export interface Session {
  start: number; end: number;
  path: 'menu' | 'recommend' | 'none';
  outcome: 'ordered' | 'abandoned';
  total: number; items: number;
  voiceTries: number; voiceOk: number;
  large: boolean; voiceGuide: boolean;
  ai: 'llm' | 'rules' | 'none';
  demo?: boolean;
}
const KEY = 'menumate.usage.v1';
let current: Session | null = null;

function load(): Session[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Session[]; } catch { return []; } }
function save(list: Session[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-5000))); } catch { /* 저장 공간이 없으면 기록만 건너뜁니다. */ } }

export const usage = {
  begin() { if (!current) current = { start: Date.now(), end: 0, path: 'none', outcome: 'abandoned', total: 0, items: 0, voiceTries: 0, voiceOk: 0, large: false, voiceGuide: false, ai: 'none' }; },
  path(path: 'menu' | 'recommend') { if (current && current.path === 'none') current.path = path; },
  count(field: 'voiceTries' | 'voiceOk') { if (current) current[field]++; },
  flag(field: 'large' | 'voiceGuide' | 'demo') { if (current) current[field] = true; },
  ai(source: 'llm' | 'rules') { if (current) current.ai = source; },
  finish(outcome: Session['outcome'], order?: { total: number; items: number }) {
    if (!current) return;
    save([...load(), { ...current, outcome, end: Date.now(), total: order?.total ?? 0, items: order?.items ?? 0 }]);
    current = null;
  },
  all: load,
  clear() { try { localStorage.removeItem(KEY); } catch { /* 무시 */ } },
};

export function summarize(all: Session[]) {
  // 운영자 시연(demo)은 관람객 통계에서 뺍니다.
  const list = all.filter(s => !s.demo);
  const ordered = list.filter(s => s.outcome === 'ordered');
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  const avgSec = ordered.length ? Math.round(ordered.reduce((n, s) => n + (s.end - s.start), 0) / ordered.length / 1000) : 0;
  const tries = list.reduce((n, s) => n + s.voiceTries, 0), ok = list.reduce((n, s) => n + s.voiceOk, 0);
  return {
    sessions: list.length,
    demos: all.length - list.length,
    ordered: ordered.length,
    orderRate: pct(ordered.length, list.length),
    avgSec,
    recommendRate: pct(list.filter(s => s.path === 'recommend').length, list.length),
    voiceTries: tries,
    voiceRate: pct(ok, tries),
    largeRate: pct(list.filter(s => s.large).length, list.length),
    llmRate: pct(list.filter(s => s.ai === 'llm').length, list.filter(s => s.ai !== 'none').length),
  };
}

export function toCsv(list: Session[]): string {
  const head = ['시작', '소요(초)', '경로', '결과', '합계', '수량', '음성 시도', '음성 성공', '큰 글씨', '음성 안내', '조건 해석', '시연'];
  const rows = list.map(s => [new Date(s.start).toISOString(), Math.round((s.end - s.start) / 1000), s.path, s.outcome, s.total, s.items, s.voiceTries, s.voiceOk, s.large ? 1 : 0, s.voiceGuide ? 1 : 0, s.ai, s.demo ? 1 : 0]);
  return '﻿' + [head, ...rows].map(r => r.join(',')).join('\n');
}
