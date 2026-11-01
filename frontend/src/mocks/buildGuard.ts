// 전시용 production 빌드에 가짜 AI·가짜 API가 들어가지 않게 막는다 (PM 결정, 10/24).
// vite.config.ts 가 설정을 만들 때 부른다.
export function assertNoMocksInProduction(o: { command: 'build' | 'serve'; mode: string; mockAi: boolean; mockApi: boolean }) {
  if (o.command !== 'build' || o.mode !== 'production') return;
  const on = [o.mockAi && 'VITE_MOCK_AI', o.mockApi && 'VITE_MOCK_API'].filter(Boolean);
  if (on.length > 0) {
    throw new Error(`전시 빌드에서는 가짜 모듈을 쓸 수 없습니다: ${on.join(', ')}=true. frontend/.env 에서 false 로 바꾼 뒤 다시 빌드하세요.`);
  }
}
