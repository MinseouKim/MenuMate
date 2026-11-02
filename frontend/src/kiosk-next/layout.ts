// 간편주문(말로 추천) 화면을 어느 안으로 그릴지. 주소 `?rec=board|a|b|c` 가 환경 변수보다 우선합니다 (2026-11-02, 캔버스 "간편주문 대화 화면 3안").
//  board(기본): 주문 확인 보드 — 2026-11-03 팀장이 고른 1안. 흑칠 보드에 들은 조건을 채우고, 핸즈프리라 말하기 버튼이 없음
//  아래 a/b/c 는 비교용으로 남겨 둡니다.
//  a: 직원과 마주 앉기 — 큰 말풍선, 전폭 말하기 버튼
//  b: 눌러서 답하기 — AI 질문에 맞는 큰 선택 카드, 글자 1.2배
//  c: 한눈에 정리 — "지금까지 이해한 것" 패널 + 짧은 대화
import type { Asking } from './types';

export type RecommendLayout = 'board' | 'a' | 'b' | 'c';

const isLayout = (v: unknown): v is RecommendLayout => v === 'board' || v === 'a' || v === 'b' || v === 'c';

export function resolveRecommendLayout(search: string, envValue: string | undefined): RecommendLayout {
  const fromUrl = new URLSearchParams(search).get('rec')?.toLowerCase();
  if (isLayout(fromUrl)) return fromUrl;
  const fromEnv = envValue?.trim().toLowerCase();
  return isLayout(fromEnv) ? fromEnv : 'board';
}

export const recommendLayout: RecommendLayout = resolveRecommendLayout(
  typeof location === 'undefined' ? '' : location.search,
  import.meta.env.VITE_RECOMMEND_LAYOUT,
);

export type { Asking };

// '면'은 앞에 글자가 붙으면("드시면", "그러면") 종류가 아닙니다.
const ASK_WORDS: [Exclude<Asking, 'other'>, RegExp][] = [
  ['party', /몇\s*분|몇\s*명|인원|혼자|일행/g],
  ['spicy', /매운|맵|매콤|얼큰/g],
  ['exclude', /빼|알레르기|재료|못\s*드시|안\s*드시/g],
  ['kind', /(?<![가-힣])면|밥|딤섬|요리|종류|국물|고기|해산물|어떤\s*메뉴|뭐가|무엇을/g],
];
const lastIndex = (text: string, re: RegExp) => Math.max(-1, ...[...text.matchAll(re)].map(m => m.index));

/**
 * 직원 AI의 마지막 질문이 무엇을 묻는지. 서버가 asking을 보내지 않을 때(옛 서버)만 씁니다.
 * 맞장구·상황 문장("화끈하게 매운 요리로 준비해 드릴게요")에 끌려가지 않도록 마지막 물음 문장에서, 가장 뒤에 나온 낱말을 고릅니다.
 */
export function askingOf(question: string | null): Asking {
  if (!question) return 'other';
  const sentences = question.match(/[^.!?。]+[.!?。]?/g)?.map(s => s.trim()) ?? [];
  const asked = sentences.filter(s => s.endsWith('?')).at(-1) ?? question;
  // "매운 거 못 드시는 분 있나요?"의 '못 드시'는 재료가 아니라 매운맛을 묻는 말입니다.
  const spicyOnly = /매운|맵|매콤|얼큰/.test(asked) && !/빼|알레르기|재료/.test(asked);
  const found = ASK_WORDS
    .filter(([key]) => !(spicyOnly && key === 'exclude'))
    .map(([key, re]) => [key, lastIndex(asked, re)] as const)
    .filter(([, i]) => i >= 0);
  return found.length ? found.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : 'other';
}
