// 키오스크 로컬 시간대(프로세스 TZ, 기본 Asia/Seoul) 기준 날짜·시각

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** 주문번호 날짜 기준. 예: "2026-10-24" */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** api.md "시간은 ISO 8601 문자열, 키오스크 로컬 시간대 기준". 예: "2026-10-24T16:38:05+09:00" */
export function toLocalIso(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${localDateKey(d)}T${time}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
