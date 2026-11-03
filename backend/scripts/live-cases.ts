// 실사용 대화 → 시험 케이스 (2026-11-03 팀장 요청). 로직은 src/sim/live.ts(테스트 있음), 이 파일은 읽기·쓰기·출력만 합니다.
//
//   npx tsx backend/scripts/live-cases.ts                 기록(CHAT_RECORD_DIR)을 대화 단위로 묶어 채점
//       → eval/live/cases.jsonl (케이스마다 손님 발화 목록·대화·점수), eval/live/summary.json, 콘솔 한 줄
//   npx tsx backend/scripts/live-cases.ts replay           cases.jsonl의 손님 발화를 지금 코드의 직원(converse)에 다시 넣어 채점
//       --offline: 키 없이 서버 검사만 (실수 없는 가짜 직원 LLM, src/sim/fuzz.ts). 키가 없어도 자동으로 오프라인
//       → eval/live/replay-<날짜>.jsonl, 콘솔 한 줄 (예전 통과율 → 재생 통과율)
//
// --in <폴더>: 기록 폴더 (기본 eval/live/raw, .env.example의 CHAT_RECORD_DIR 예시와 같음), --out <폴더>: 출력 폴더 (기본 eval/live)
// 기록 파일은 읽기만 합니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { converse, geminiClient, type GeminiThinking, type LlmClient } from '../src/chat.js';
import type { LiveCall } from '../src/chatRecord.js';
import { loadMenuKnowledge } from '../src/menuKnowledge.js';
import { fuzzLlm } from '../src/sim/fuzz.js';
import { groupLiveCalls, replayCase, scoreLiveCase, summarizeLive, type LiveCase } from '../src/sim/live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const IN = path.resolve(arg('--in') ?? path.join(ROOT, 'eval/live/raw'));
const OUT = path.resolve(arg('--out') ?? path.join(ROOT, 'eval/live'));
const PACE_MS = 4500; // Gemini 무료 분당 한도
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[live] ${msg}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

const knowledge = loadMenuKnowledge(path.join(ROOT, 'frontend/src/prototype/menu'));
if (!knowledge) { log('메뉴 데이터를 읽지 못했어요.'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

function readJsonl<T>(file: string): T[] {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l) as T]; } catch { return []; } });
}

if (process.argv[2] === 'replay') {
  const casesFile = path.join(OUT, 'cases.jsonl');
  if (!fs.existsSync(casesFile)) { log(`케이스가 없어요. 먼저 인자 없이 실행해 주세요: ${casesFile}`); process.exit(1); }
  const cases = readJsonl<LiveCase & { score: ReturnType<typeof scoreLiveCase> }>(casesFile);
  // 키는 backend/.env에서만 (오프라인이면 읽지도 않음). 값은 출력하지 않는다
  const offlineAsked = process.argv.includes('--offline');
  const envFile = path.join(ROOT, 'backend/.env');
  if (!offlineAsked && fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const key = offlineAsked ? '' : process.env.GEMINI_API_KEY?.trim() ?? '';
  let llm: LlmClient;
  if (key) {
    const gemini = geminiClient(key, process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite', { thinking: (process.env.GEMINI_THINKING?.trim() || null) as GeminiThinking | null });
    llm = { model: gemini.model, async generateJson(...a) { await sleep(PACE_MS); return gemini.generateJson(...a); } };
  } else {
    llm = fuzzLlm(knowledge, null);
  }
  log(`재생: ${cases.length}건, 직원 ${key ? llm.model : '오프라인(서버 검사만)'}`);
  const outFile = path.join(OUT, `replay-${today()}.jsonl`);
  const rows: { case: LiveCase; score: ReturnType<typeof scoreLiveCase> }[] = [];
  for (const c of cases) {
    try {
      const rec = await replayCase(c, (turns, conditions) => converse({ llm, knowledge }, { turns, conditions, context: {} }));
      const final = rec.final ? { reply: rec.final.reply, conditions: rec.final.conditions, picks: rec.final.picks, pickReasons: rec.final.pickReasons, asking: rec.final.asking, done: rec.final.done, heardSummary: rec.final.heardSummary, partyAssumed: rec.final.partyAssumed, model: rec.final.model } : null;
      const replayed: LiveCase = { ...c, turns: rec.turns, steps: rec.steps, final, calls: rec.steps.length, errors: 0 };
      const score = scoreLiveCase(replayed, knowledge);
      rows.push({ case: replayed, score });
      fs.appendFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), mode: key ? 'replay' : 'replay-offline', model: llm.model, caseId: c.id, turns: rec.turns, steps: rec.steps, final, score, before: c.score })}\n`);
    } catch (e) {
      log(`재생 실패 ${c.id}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
      if (key && /PerDay|API key|PERMISSION_DENIED/i.test(String(e))) break;
    }
  }
  const before = summarizeLive(cases.map((c) => ({ case: c, score: c.score })));
  const after = summarizeLive(rows);
  log(`재생 결과: 통과 ${pct(before.okRate)} → ${pct(after.okRate)}, 추천까지 ${before.finished}/${before.cases} → ${after.finished}/${after.cases} (${outFile})`);
} else {
  if (!fs.existsSync(IN)) { log(`기록 폴더가 없어요: ${IN} (backend/.env 에 CHAT_RECORD_DIR을 넣고 키오스크를 써 보세요)`); process.exit(0); }
  const calls = fs.readdirSync(IN).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl<LiveCall>(path.join(IN, f)));
  const cases = groupLiveCalls(calls);
  const rows = cases.map((c) => ({ case: c, score: scoreLiveCase(c, knowledge) }));
  fs.writeFileSync(path.join(OUT, 'cases.jsonl'), rows.map((r) => JSON.stringify({ ...r.case, score: r.score })).join('\n') + (rows.length ? '\n' : ''));
  const summary = { updated: new Date().toISOString(), calls: calls.length, ...summarizeLive(rows) };
  fs.writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  log(`호출 ${calls.length}회 → 대화 ${summary.cases}건 (추천까지 ${summary.finished}건, 실패 호출 ${summary.errorCalls}회), 문제 없음 ${pct(summary.okRate)} — ${path.join(OUT, 'cases.jsonl')}`);
}
