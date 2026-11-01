import { describe, expect, it } from 'vitest';
import { assertNoMocksInProduction } from './buildGuard';

describe('전시 빌드에 가짜 모듈이 들어가지 않게 막는다', () => {
  it('production 빌드에서 가짜 AI나 가짜 API가 켜져 있으면 실패', () => {
    expect(() => assertNoMocksInProduction({ command: 'build', mode: 'production', mockAi: true, mockApi: false }))
      .toThrow(/VITE_MOCK_AI/);
    expect(() => assertNoMocksInProduction({ command: 'build', mode: 'production', mockAi: false, mockApi: true }))
      .toThrow(/VITE_MOCK_API/);
  });

  it('둘 다 꺼져 있으면 통과', () => {
    expect(() => assertNoMocksInProduction({ command: 'build', mode: 'production', mockAi: false, mockApi: false })).not.toThrow();
  });

  it('개발 서버와 테스트에서는 켜져 있어도 된다', () => {
    expect(() => assertNoMocksInProduction({ command: 'serve', mode: 'development', mockAi: true, mockApi: true })).not.toThrow();
    expect(() => assertNoMocksInProduction({ command: 'serve', mode: 'test', mockAi: true, mockApi: true })).not.toThrow();
  });
});
