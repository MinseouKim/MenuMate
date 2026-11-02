// 무료 한도 오류 구분. 하루 한도면 이번 회차를 끝내고(다음 회차에 다시 시도), 분당 한도면 잠시 쉬고 이어 갑니다.
export function quotaKind(e: unknown): 'day' | 'minute' | null {
  const m = e instanceof Error ? e.message : String(e);
  if (/PerDay/i.test(m)) return 'day';
  if (/429|RESOURCE_EXHAUSTED|Too Many Requests|PerMinute/i.test(m)) return 'minute';
  return null;
}
