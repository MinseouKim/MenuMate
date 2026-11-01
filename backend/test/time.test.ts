import { describe, expect, it } from 'vitest';
import { localDateKey, toLocalIso } from '../src/time.js';

// vitest.config.ts에서 TZ=Asia/Seoul
describe('localDateKey', () => {
  it('키오스크 로컬 날짜(YYYY-MM-DD)를 돌려준다', () => {
    expect(localDateKey(new Date('2026-10-24T14:59:59Z'))).toBe('2026-10-24');
    expect(localDateKey(new Date('2026-10-24T15:00:00Z'))).toBe('2026-10-25');
    expect(localDateKey(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05');
  });
});

describe('toLocalIso', () => {
  it('로컬 시간대 오프셋이 붙은 ISO 8601 문자열', () => {
    expect(toLocalIso(new Date('2026-10-24T07:38:05.123Z'))).toBe('2026-10-24T16:38:05+09:00');
    expect(toLocalIso(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01T00:00:00+09:00');
  });
});
