// 대화 시뮬레이션 한 회차 (2026-11-03 팀장 요청): 다양한 손님과 직원 AI가 대화해 데이터를 모으고 자동 채점합니다.
// 1시간마다 실행하며, 무료 하루 한도가 끝나면 이번 회차를 멈추고 다음 회차에 다시 시도합니다.
// 직원 = 키오스크와 같은 converse()(이 컴퓨터의 최신 코드), 손님 = 절반은 Gemini 연기, 절반은 예시 답변(손님 쪽 토큰 0).
// 키: backend/.env 의 SIM_GEMINI_API_KEY, 없으면 GEMINI_API_KEY. 키 값은 어디에도 출력하지 않습니다.
// 출력: eval/sim/conversations/<날짜>.jsonl(대화 전체), eval/sim/summary.json(요약), eval/sim/state.json(다음 손님 번호)
// Gemini를 못 쓰면(키 없음·하루 한도·키 오류) 남은 건수를 오프라인 서버 검사 시험으로 돌립니다(2026-11-03 팀장 요청):
//   손님 = 예시 답변, 직원 LLM 자리 = 일부러 실수하는 가짜 LLM(src/sim/fuzz.ts), 요청 간격 없이 바로. 기록의 mode로 구분하고 요약도 mode별로 따로.
// --offline: 처음부터 오프라인으로. SIM_OUT: 출력 폴더를 바꿈(시험용, 기본 eval/sim)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { converse, geminiClient, GREETING, type GeminiThinking, type LlmClient } from '../src/chat.js';
import type { ContextResponse } from '../src/contracts.js';
import { loadMenuKnowledge } from '../src/menuKnowledge.js';
import { llmCustomer, scriptedCustomer } from '../src/sim/customer.js';
import { runOffline } from '../src/sim/fuzz.js';
import { makePersonas, PERSONA_SEED } from '../src/sim/personas.js';
import { offlineReason, quotaKind, type OfflineReason } from '../src/sim/quota.js';
import { runPersona } from '../src/sim/run.js';
import { scoreConversation } from '../src/sim/score.js';
import { rowsFromRecords, summarizeByMode } from '../src/sim/summary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.SIM_OUT ? path.resolve(process.env.SIM_OUT) : path.join(ROOT, 'eval/sim');
const PACE_MS = 4500;          // 무료 분당 한도에 걸리지 않게 요청 사이 간격
const MINUTE_WAIT_MS = 65_000; // 분당 한도에 걸리면 쉬는 시간
/** 회차 최대 수가 없을 때(--max 없음) 오프라인으로 돌릴 건수 */
const OFFLINE_DEFAULT = 20;
/** 한 회차 최대 대화 수 (SIM_MAX 또는 --max N, 2026-11-03 팀장: 10분마다 20건) */
const argMax = process.argv.indexOf('--max');
const MAX_PER_RUN = Number(argMax >= 0 ? process.argv[argMax + 1] : process.env.SIM_MAX) || Infinity;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[sim ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}] ${msg}`);

const envFile = path.join(ROOT, 'backend/.env');
const forceOffline = process.argv.includes('--offline');
if (!forceOffline && fs.existsSync(envFile)) process.loadEnvFile(envFile); // 오프라인이면 키를 읽지도 않음
const key = forceOffline ? '' : process.env.SIM_GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || '';
const model = process.env.SIM_GEMINI_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
const thinking = (process.env.GEMINI_THINKING?.trim() || null) as GeminiThinking | null;
const knowledge = loadMenuKnowledge(path.join(ROOT, 'frontend/src/prototype/menu'));
if (!knowledge) { log('메뉴 데이터를 읽지 못했어요.'); process.exit(1); }

fs.mkdirSync(path.join(OUT, 'conversations'), { recursive: true });
const stateFile = path.join(OUT, 'state.json');
// next: Gemini 회차의 다음 손님, offlineNext: 오프라인 회차의 다음 손님 (따로 세어 Gemini 손님 순서를 흐트러뜨리지 않음)
const state: { next: number; offlineNext?: number } = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { next: 0 };
const personas = makePersonas(1000, PERSONA_SEED);

// 모든 LLM 호출을 한 줄로 세워 간격을 두고, 마지막 오류 문장(한도 종류 판단용)과 실제 호출 시간(쉬는 시간 제외)을 기억합니다.
let lastError = '';
let callMs = 0;
const gemini = geminiClient(key, model, { thinking });
const llm: LlmClient = {
  model,
  async generateJson(...args) {
    await sleep(PACE_MS);
    const t0 = performance.now();
    try { return await gemini.generateJson(...args); } catch (e) { lastError = e instanceof Error ? e.message : String(e); throw e; } finally { callMs += performance.now() - t0; }
  },
};
const timeOfDay = (h: number): ContextResponse['timeOfDay'] => (h < 11 ? 'morning' : h < 14 ? 'lunch' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night');
const staff = async (turns: Parameters<typeof converse>[1]['turns'], conditions: Parameters<typeof converse>[1]['conditions']) => {
  callMs = 0;
  const r = await converse({ llm, knowledge, log: { warn: (m) => { lastError = m; } } }, { turns, conditions, context: { timeOfDay: timeOfDay(new Date().getHours()), crowd: 'low' } });
  return { ...r, ms: callMs };
};
const actors = { gemini: llmCustomer(llm, knowledge), script: scriptedCustomer(knowledge, PERSONA_SEED) };

const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const outFile = path.join(OUT, 'conversations', `${day}.jsonl`);
let done = 0;
let minuteHits = 0;
let offline: OfflineReason | null = offlineReason(!!key, '');
if (!offline) log(`시작: 모델 ${model}, 손님 #${state.next + 1}부터${MAX_PER_RUN < Infinity ? `, 최대 ${MAX_PER_RUN}건` : ''}`);
while (!offline && done < MAX_PER_RUN) {
  const persona = personas[state.next % personas.length];
  const actor = state.next % 2 === 0 ? 'gemini' : 'script';
  lastError = '';
  try {
    const rec = await runPersona({ persona, staff, customer: actors[actor], greeting: GREETING });
    const score = scoreConversation(rec, knowledge);
    fs.appendFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), model, mode: 'gemini', customer: actor, ...rec, score })}\n`);
    state.next++; done++; minuteHits = 0;
  } catch (e) {
    const kind = quotaKind(lastError || e);
    if (kind === 'day') { offline = 'day-quota'; log(`하루 한도 도달 — Gemini는 여기까지 (${done}건). 다음 회차에 다시 시도합니다.`); break; }
    if (kind === 'minute') {
      if (++minuteHits > 5) { log(`분당 한도가 계속 걸려 이번 회차 끝 (${done}건).`); break; }
      await sleep(MINUTE_WAIT_MS);
      continue; // 같은 손님으로 다시
    }
    // 그 밖의 오류(키 문제, JSON 형식 등)는 기록하고 다음 손님으로
    fs.appendFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), model, mode: 'gemini', customer: actor, persona, error: (lastError || String(e)).slice(0, 300) })}\n`);
    state.next++;
    if (offlineReason(true, lastError) === 'key-error') { offline = 'key-error'; log('키 또는 권한 문제로 Gemini를 멈춥니다. 키를 확인해 주세요.'); break; }
  }
  fs.writeFileSync(stateFile, JSON.stringify(state));
}
fs.writeFileSync(stateFile, JSON.stringify(state));

// Gemini를 못 쓰면 이번 회차의 남은 건수를 오프라인 서버 검사 시험으로 (API 키 0, 요청 간격 없음)
if (offline) {
  const left = MAX_PER_RUN < Infinity ? MAX_PER_RUN - done : OFFLINE_DEFAULT;
  const why = { 'no-key': '키 없음', 'day-quota': '하루 한도', 'key-error': '키 오류' }[offline];
  log(`오프라인 서버 검사 시험으로 전환 (${why}${forceOffline ? ', --offline' : ''}): ${left}건, 손님 #${(state.offlineNext ?? 0) + 1}부터`);
  for (let i = 0; i < left; i++) {
    const index = state.offlineNext ?? 0;
    const rec = await runOffline({ persona: personas[index % personas.length], index, knowledge });
    fs.appendFileSync(outFile, `${JSON.stringify(rec)}\n`);
    state.offlineNext = index + 1;
  }
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

// 지금까지 모인 모든 대화로 요약을 다시 만듭니다. 저장된 score 대신 지금 채점기로 다시 채점하고(기록은 그대로), mode별로 따로 셉니다
const records: unknown[] = [];
for (const f of fs.readdirSync(path.join(OUT, 'conversations')).filter((f) => f.endsWith('.jsonl'))) {
  for (const line of fs.readFileSync(path.join(OUT, 'conversations', f), 'utf8').split('\n')) {
    if (line.trim()) records.push(JSON.parse(line));
  }
}
const modes = summarizeByMode(rowsFromRecords(records, knowledge));
fs.writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify({ updated: new Date().toISOString(), model, modes }, null, 2)}\n`);
for (const [mode, s] of Object.entries(modes)) {
  log(`요약 [${mode}]: 대화 ${s.conversations}건, 문제 없음 ${Math.round(s.okRate * 100)}%, 손님 주문 수락 ${Math.round(s.acceptRate * 100)}%`);
}
