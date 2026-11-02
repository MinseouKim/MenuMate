// 대화 시뮬레이션 한 회차 (2026-11-03 팀장 요청): 다양한 손님과 직원 AI가 대화해 데이터를 모으고 자동 채점합니다.
// 1시간마다 실행하며, 무료 하루 한도가 끝나면 이번 회차를 멈추고 다음 회차에 다시 시도합니다.
// 직원 = 키오스크와 같은 converse()(이 컴퓨터의 최신 코드), 손님 = 절반은 Gemini 연기, 절반은 예시 답변(손님 쪽 토큰 0).
// 키: backend/.env 의 SIM_GEMINI_API_KEY, 없으면 GEMINI_API_KEY. 키 값은 어디에도 출력하지 않습니다.
// 출력: eval/sim/conversations/<날짜>.jsonl(대화 전체), eval/sim/summary.json(요약), eval/sim/state.json(다음 손님 번호)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { converse, geminiClient, GREETING, type GeminiThinking, type LlmClient } from '../src/chat.js';
import type { ContextResponse } from '../src/contracts.js';
import { loadMenuKnowledge } from '../src/menuKnowledge.js';
import { llmCustomer, scriptedCustomer } from '../src/sim/customer.js';
import { makePersonas } from '../src/sim/personas.js';
import { quotaKind } from '../src/sim/quota.js';
import { runPersona } from '../src/sim/run.js';
import { scoreConversation } from '../src/sim/score.js';
import { summarize, type SimRow } from '../src/sim/summary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'eval/sim');
const PACE_MS = 4500;          // 무료 분당 한도에 걸리지 않게 요청 사이 간격
const MINUTE_WAIT_MS = 65_000; // 분당 한도에 걸리면 쉬는 시간
const PERSONA_SEED = 2026;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[sim ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}] ${msg}`);

const envFile = path.join(ROOT, 'backend/.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const key = process.env.SIM_GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
if (!key) {
  log('키가 없어 이번 회차를 건너뜁니다. backend/.env 에 GEMINI_API_KEY(또는 SIM_GEMINI_API_KEY)를 넣어 주세요.');
  process.exit(0);
}
const model = process.env.SIM_GEMINI_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
const thinking = (process.env.GEMINI_THINKING?.trim() || null) as GeminiThinking | null;
const knowledge = loadMenuKnowledge(path.join(ROOT, 'frontend/src/prototype/menu'));
if (!knowledge) { log('메뉴 데이터를 읽지 못했어요.'); process.exit(1); }

fs.mkdirSync(path.join(OUT, 'conversations'), { recursive: true });
const stateFile = path.join(OUT, 'state.json');
const state: { next: number } = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { next: 0 };
const personas = makePersonas(1000, PERSONA_SEED);

// 모든 LLM 호출을 한 줄로 세워 간격을 두고, 마지막 오류 문장(한도 종류 판단용)을 기억합니다.
let lastError = '';
const gemini = geminiClient(key, model, { thinking });
const llm: LlmClient = {
  model,
  async generateJson(...args) {
    await sleep(PACE_MS);
    try { return await gemini.generateJson(...args); } catch (e) { lastError = e instanceof Error ? e.message : String(e); throw e; }
  },
};
const timeOfDay = (h: number): ContextResponse['timeOfDay'] => (h < 11 ? 'morning' : h < 14 ? 'lunch' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night');
const staff = (turns: Parameters<typeof converse>[1]['turns'], conditions: Parameters<typeof converse>[1]['conditions']) =>
  converse({ llm, knowledge, log: { warn: (m) => { lastError = m; } } }, { turns, conditions, context: { timeOfDay: timeOfDay(new Date().getHours()), crowd: 'low' } });
const actors = { gemini: llmCustomer(llm, knowledge), script: scriptedCustomer(knowledge, PERSONA_SEED) };

const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const outFile = path.join(OUT, 'conversations', `${day}.jsonl`);
let done = 0;
let minuteHits = 0;
log(`시작: 모델 ${model}, 손님 #${state.next + 1}부터`);
for (;;) {
  const persona = personas[state.next % personas.length];
  const actor = state.next % 2 === 0 ? 'gemini' : 'script';
  lastError = '';
  try {
    const rec = await runPersona({ persona, staff, customer: actors[actor], greeting: GREETING });
    const score = scoreConversation(rec, knowledge);
    fs.appendFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), model, customer: actor, ...rec, score })}\n`);
    state.next++; done++; minuteHits = 0;
  } catch (e) {
    const kind = quotaKind(lastError || e);
    if (kind === 'day') { log(`하루 한도 도달 — 이번 회차 끝 (${done}건). 다음 회차에 다시 시도합니다.`); break; }
    if (kind === 'minute') {
      if (++minuteHits > 5) { log(`분당 한도가 계속 걸려 이번 회차 끝 (${done}건).`); break; }
      await sleep(MINUTE_WAIT_MS);
      continue; // 같은 손님으로 다시
    }
    // 그 밖의 오류(키 문제, JSON 형식 등)는 기록하고 다음 손님으로
    fs.appendFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), model, customer: actor, persona, error: (lastError || String(e)).slice(0, 300) })}\n`);
    state.next++;
    if (/API key|PERMISSION_DENIED|API_KEY|SERVICE_DISABLED/i.test(lastError)) { log('키 또는 권한 문제로 멈춥니다. 키를 확인해 주세요.'); break; }
  }
  fs.writeFileSync(stateFile, JSON.stringify(state));
}
fs.writeFileSync(stateFile, JSON.stringify(state));

// 지금까지 모인 모든 대화로 요약을 다시 만듭니다
const rows: SimRow[] = [];
for (const f of fs.readdirSync(path.join(OUT, 'conversations')).filter((f) => f.endsWith('.jsonl'))) {
  for (const line of fs.readFileSync(path.join(OUT, 'conversations', f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.score) rows.push({ persona: r.persona, score: r.score });
  }
}
const summary = { updated: new Date().toISOString(), model, ...summarize(rows) };
fs.writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
log(`요약: 대화 ${summary.conversations}건, 문제 없음 ${Math.round(summary.okRate * 100)}%, 손님 주문 수락 ${Math.round(summary.acceptRate * 100)}%`);
