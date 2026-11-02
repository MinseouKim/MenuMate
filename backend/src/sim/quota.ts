// 무료 한도 오류 구분. 하루 한도면 이번 회차를 끝내고(다음 회차에 다시 시도), 분당 한도면 잠시 쉬고 이어 갑니다.
export function quotaKind(e: unknown): 'day' | 'minute' | null {
  const m = e instanceof Error ? e.message : String(e);
  if (/PerDay/i.test(m)) return 'day';
  if (/429|RESOURCE_EXHAUSTED|Too Many Requests|PerMinute/i.test(m)) return 'minute';
  return null;
}

export type OfflineReason = 'no-key' | 'day-quota' | 'key-error';
/** Gemini를 이번 회차에 더 못 쓰는 이유 (있으면 남은 건수를 오프라인 서버 검사 시험으로 돌림). 분당 한도·그 밖의 오류는 null */
export function offlineReason(hasKey: boolean, lastError: string): OfflineReason | null {
  if (!hasKey) return 'no-key';
  if (quotaKind(lastError) === 'day') return 'day-quota';
  if (/API key|PERMISSION_DENIED|API_KEY|SERVICE_DISABLED|UNAUTHENTICATED/i.test(lastError)) return 'key-error';
  return null;
}
