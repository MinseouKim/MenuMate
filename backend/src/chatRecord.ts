// 실사용 대화 기록 (2026-11-03 팀장 요청): 로컬 키오스크와 나눈 대화를 시뮬레이션 데이터처럼 쌓아 시험 케이스로 쓴다.
// CHAT_RECORD_DIR이 있을 때만 켜진다(기본 꺼짐, Render에는 넣지 않음). 대화 글자만 남기고 키·IP·얼굴·나이·상황 정보는 남기지 않는다.
// 쓰기에 실패해도 던지지 않는다(응답을 막지 않음). 경고에는 대화 내용을 적지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChatConditions, ChatResponse, ChatTurn } from './contracts.js';

export type LiveResponse = Pick<ChatResponse, 'reply' | 'conditions' | 'picks' | 'pickReasons' | 'asking' | 'done' | 'heardSummary' | 'partyAssumed' | 'model'>;
/** 기록 한 줄 = /api/chat 호출 한 번 */
export interface LiveCall {
  at: string;
  mode: 'live';
  turns: ChatTurn[];
  /** 요청에 온 조건 */
  conditions: Partial<ChatConditions>;
  response?: LiveResponse;
  /** 실패했을 때 오류 코드 (CHAT_UNAVAILABLE 등) */
  error?: string;
  ms: number;
}
export type RecordChat = (entry: Omit<LiveCall, 'at' | 'mode'>) => Promise<void>;

/** 응답에서 기록할 칸만 (mood 등은 빼고) */
export const liveResponse = (r: ChatResponse): LiveResponse => ({
  reply: r.reply, conditions: r.conditions, picks: r.picks, pickReasons: r.pickReasons, asking: r.asking,
  done: r.done, heardSummary: r.heardSummary, partyAssumed: r.partyAssumed, model: r.model,
});

/** dir이 없으면 null(기록 안 함). 파일은 <dir>/<KST 날짜>.jsonl */
export function chatRecorder(dir: string | null, opts: { log?: { warn(msg: string): void }; now?: () => Date } = {}): RecordChat | null {
  if (!dir) return null;
  const now = opts.now ?? (() => new Date());
  return async (entry) => {
    const at = now();
    const day = at.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    const line: LiveCall = { at: at.toISOString(), mode: 'live', turns: entry.turns, conditions: entry.conditions, ...(entry.response ? { response: entry.response } : {}), ...(entry.error ? { error: entry.error } : {}), ms: entry.ms };
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(path.join(dir, `${day}.jsonl`), `${JSON.stringify(line)}\n`);
    } catch (e) {
      opts.log?.warn(`대화 기록 실패 (CHAT_RECORD_DIR): ${e instanceof Error ? (e as NodeJS.ErrnoException).code ?? e.name : 'unknown'}`);
    }
  };
}
