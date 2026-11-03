// Claude 자체 대화 시험 도구 (2026-11-03 팀장 요청): Claude 팀원이 손님과 직원을 한 턴씩 직접 연기합니다.
// 직원 답(원시 JSON)은 키오스크와 같은 converse() 서버 검사를 거칩니다. API 키를 쓰지 않습니다.
// 로직은 src/sim/session.ts(테스트 있음), 이 파일은 세션 파일 읽기·쓰기와 출력만 합니다.
//
//   npx tsx backend/scripts/sim-step.ts start <손님번호>              세션을 만들고 손님 설정 카드와 첫인사 출력
//   npx tsx backend/scripts/sim-step.ts staff-prompt <id>             직원 LLM이 받을 시스템 프롬프트·메시지·응답 형식 출력
//   npx tsx backend/scripts/sim-step.ts customer <id> "<손님 말>"      손님 턴 추가
//   npx tsx backend/scripts/sim-step.ts staff <id> '<직원 원시 JSON>'   서버 검사를 거친 직원 답 출력·저장
//   npx tsx backend/scripts/sim-step.ts show <id>                     지금까지 대화 출력
//   npx tsx backend/scripts/sim-step.ts finish <id> <true|false> "<이유>"  채점해 conversations/<날짜>.jsonl에 mode=claude로 추가
//
// 세션: eval/sim/claude-sessions/<id>.json. SIM_OUT으로 출력 폴더를 바꿀 수 있습니다(시험용, 기본 eval/sim).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_SCHEMA } from '../src/chat.js';
import type { ContextResponse } from '../src/contracts.js';
import { loadMenuKnowledge } from '../src/menuKnowledge.js';
import { card } from '../src/sim/customer.js';
import { makePersonas, PERSONA_SEED } from '../src/sim/personas.js';
import { addCustomerTurn, applyStaff, finishRecord, isSessionId, staffPrompt, startSession, type ClaudeSession } from '../src/sim/session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.SIM_OUT ? path.resolve(process.env.SIM_OUT) : path.join(ROOT, 'eval/sim');
const SESSIONS = path.join(OUT, 'claude-sessions');
const knowledge = loadMenuKnowledge(path.join(ROOT, 'frontend/src/prototype/menu'));
if (!knowledge) fail('메뉴 데이터를 읽지 못했어요.');
const personas = makePersonas(1000, PERSONA_SEED);

function fail(msg: string): never {
  console.error(`오류: ${msg}`);
  process.exit(1);
}
const sessionFile = (id: string) => {
  if (!isSessionId(id)) fail(`세션 id가 올바르지 않아요: ${id}`);
  return path.join(SESSIONS, `${id}.json`);
};
type Saved = ClaudeSession & { finishedAt?: string };
function load(id: string, opts: { finished?: boolean } = {}): Saved {
  const f = sessionFile(id);
  if (!fs.existsSync(f)) fail(`세션이 없어요: ${id}`);
  const s = JSON.parse(fs.readFileSync(f, 'utf8')) as Saved;
  if (s.finishedAt && !opts.finished) fail(`이미 finish한 세션이에요: ${id}`);
  return s;
}
const save = (s: Saved) => { fs.mkdirSync(SESSIONS, { recursive: true }); fs.writeFileSync(sessionFile(s.id), `${JSON.stringify(s, null, 2)}\n`); };
const timeOfDay = (h: number): ContextResponse['timeOfDay'] => (h < 11 ? 'morning' : h < 14 ? 'lunch' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night');
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const printTalk = (s: ClaudeSession) => { for (const t of s.turns) console.log(`${t.role === 'assistant' ? '직원' : '손님'}: ${t.text}`); };

const [cmd, id, ...rest] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'start': {
      const no = Number(id);
      const sid = `${today()}-p${no}-${Math.random().toString(36).slice(2, 6)}`;
      const s = startSession(sid, no, personas, { context: { timeOfDay: timeOfDay(new Date().getHours()), crowd: 'low' } });
      if (fs.existsSync(sessionFile(sid))) fail(`같은 id의 세션이 있어요: ${sid}`);
      save(s);
      console.log(`세션: ${sid}\n\n[손님 #${no} 설정]\n${card(s.persona)}\n\n직원: ${s.turns[0].text}`);
      break;
    }
    case 'staff-prompt': {
      const s = load(id);
      const { system, messages } = staffPrompt(s, knowledge);
      console.log('=== 시스템 프롬프트 1 (고정: 규칙·메뉴 목록) ===');
      console.log(system[0]);
      console.log('\n=== 시스템 프롬프트 2 (이번 상황) ===');
      console.log(system[1]);
      console.log('\n=== 메시지 (user=손님, model=직원) ===');
      for (const m of messages) console.log(`[${m.role}] ${m.text}`);
      console.log('\n=== 응답 JSON 형식 ===');
      console.log(JSON.stringify(CHAT_SCHEMA));
      break;
    }
    case 'customer': {
      const s = addCustomerTurn(load(id), rest.join(' '));
      save(s);
      printTalk(s);
      break;
    }
    case 'staff': {
      const { session, response } = await applyStaff(load(id), rest.join(' '), knowledge);
      save(session);
      const { reply, asking, done, picks, pickReasons } = response;
      console.log(JSON.stringify({ reply, asking, done, picks, pickReasons }, null, 2));
      break;
    }
    case 'show': {
      const s = load(id, { finished: true });
      printTalk(s);
      console.log(`\n추천 완료: ${s.final ? `예 (${s.final.picks.join(', ') || '메뉴 없음'})` : '아니요'}`);
      break;
    }
    case 'finish': {
      const s = load(id);
      const [accept, ...why] = rest;
      if (accept !== 'true' && accept !== 'false') fail('finish <id> <true|false> "<이유>"');
      const rec = finishRecord(s, accept === 'true', why.join(' '), knowledge);
      fs.mkdirSync(path.join(OUT, 'conversations'), { recursive: true });
      fs.appendFileSync(path.join(OUT, 'conversations', `${today()}.jsonl`), `${JSON.stringify(rec)}\n`);
      save({ ...s, finishedAt: rec.at });
      console.log(JSON.stringify(rec.score, null, 2));
      break;
    }
    default:
      fail('명령: start | staff-prompt | customer | staff | show | finish (파일 맨 위 설명 참고)');
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
