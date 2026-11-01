// 얼굴 연령대 판정 로그 (개발·점검용). 화면의 AI 로그 창이 읽는다. 메모리에만 두고 새로고침하면 사라진다.
// 기록하는 것: 단계, 판정 결과(연령대 3단계), 신뢰도, 경과 시간. 얼굴 이미지와 나이 숫자는 기록하지 않는다 (D2).
export interface AgeLogEntry { id: number; at: number; kind: 'info' | 'ok' | 'warn' | 'error'; text: string }
export interface AgeLogStatus { camera: string; model: string; decision: string }

const MAX = 200;
let entries: AgeLogEntry[] = [];
let status: AgeLogStatus = { camera: '꺼짐', model: '대기', decision: '아직 없음' };
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function logAge(kind: AgeLogEntry['kind'], text: string, patch?: Partial<AgeLogStatus>): void {
  entries = [...entries.slice(-(MAX - 1)), { id: ++seq, at: Date.now(), kind, text }];
  if (patch) status = { ...status, ...patch };
  console[kind === 'error' ? 'error' : kind === 'warn' ? 'warn' : 'log'](`[age] ${text}`);
  emit();
}
export function setAgeStatus(patch: Partial<AgeLogStatus>): void { status = { ...status, ...patch }; emit(); }
export function clearAgeLog(): void { entries = []; emit(); }

export const subscribeAgeLog = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getAgeLog = () => entries;
export const getAgeStatus = () => status;
