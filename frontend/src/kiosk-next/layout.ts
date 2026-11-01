// 간편주문(말로 추천) 화면 3안 중 어느 것을 쓸지. 전시 전 비교용으로 주소 `?rec=a|b|c` 가 환경 변수보다 우선합니다 (2026-11-02, 캔버스 "간편주문 대화 화면 3안").
//  a: 직원과 마주 앉기 — 큰 말풍선, 전폭 말하기 버튼
//  b: 눌러서 답하기 — AI 질문에 맞는 큰 선택 카드, 글자 1.2배
//  c: 한눈에 정리 — "지금까지 이해한 것" 패널 + 짧은 대화
export type RecommendLayout = 'a' | 'b' | 'c';

const isLayout = (v: unknown): v is RecommendLayout => v === 'a' || v === 'b' || v === 'c';

export function resolveRecommendLayout(search: string, envValue: string | undefined): RecommendLayout {
  const fromUrl = new URLSearchParams(search).get('rec')?.toLowerCase();
  if (isLayout(fromUrl)) return fromUrl;
  const fromEnv = envValue?.trim().toLowerCase();
  return isLayout(fromEnv) ? fromEnv : 'a';
}

export const recommendLayout: RecommendLayout = resolveRecommendLayout(
  typeof location === 'undefined' ? '' : location.search,
  import.meta.env.VITE_RECOMMEND_LAYOUT,
);

/** 직원 AI의 마지막 질문이 무엇을 묻는지. 안 2의 선택 카드와 안 3의 "묻는 중" 표시가 이 값을 따릅니다. */
export type Asking = 'party' | 'spicy' | 'kind' | 'exclude' | 'other';
export function askingOf(question: string | null): Asking {
  if (!question) return 'other';
  if (/몇\s*분|몇\s*명|인원|혼자|일행/.test(question)) return 'party';
  if (/매운|맵|매콤|얼큰/.test(question)) return 'spicy';
  if (/빼|알레르기|못\s*드시|안\s*드시|재료/.test(question)) return 'exclude';
  if (/면|밥|딤섬|요리|종류|국물|고기|해산물|어떤\s*메뉴|뭐가|무엇을/.test(question)) return 'kind';
  return 'other';
}
