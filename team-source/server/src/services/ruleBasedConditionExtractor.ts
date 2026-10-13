import { emptyConditions, type ExtractedConditions } from "../types/order.js";

/**
 * 규칙/키워드 기반 한국어 조건 추출기.
 * 프론트엔드 src/services/conditionExtractor/ruleBasedExtractor.ts 와 동일한 로직을 서버로 포팅했다 —
 * API 키/네트워크 없이도 항상 동작하는 기본 추출기이자, LLM 추출 실패 시 폴백으로 쓰인다.
 */
export function extractConditionsRuleBased(utterance: string): ExtractedConditions {
  const text = utterance.trim();
  const result = emptyConditions(text);

  result.party_size = extractPartySize(text);
  result.spicy_level = extractSpicyLevel(text);
  result.preferred_textures = extractTextures(text);
  result.budget_per_person = extractBudget(text);
  result.excluded_ingredients = extractExclusions(text);
  result.food_keywords = extractFoodKeywords(text);

  return result;
}

const KOREAN_NUMBER_WORDS: Record<string, number> = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
};

function extractPartySize(text: string): number {
  const digitMatch = text.match(/(\d+)\s*(명|인|분)/);
  if (digitMatch) {
    const n = parseInt(digitMatch[1], 10);
    if (n > 0 && n <= 20) return n;
  }
  const koreanMatch = text.match(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(명|인|분)/);
  if (koreanMatch) {
    return KOREAN_NUMBER_WORDS[koreanMatch[1]];
  }
  if (/혼자/.test(text)) return 1;
  return 1;
}

const SPICY_KEYWORDS: Array<{ pattern: RegExp; level: 0 | 1 | 2 | 3 }> = [
  {
    pattern: /안\s*(맵|매워|매운|매콤)|매운\s*거\s*못|순한|하나도\s*안|맵지\s*않/,
    level: 0,
  },
  {
    pattern: /조금\s*(맵|매워|매운)|살짝\s*(맵|매워|매운)|약간\s*(맵|매워|매운)|덜\s*(맵|매워|매운)/,
    level: 1,
  },
  {
    pattern:
      /많이\s*(맵|매워|매운)|진짜\s*(맵|매워|매운)|아주\s*(맵|매워|매운)|엄청\s*(맵|매워|매운)|핵\s*(맵|매워|매운)/,
    level: 3,
  },
  { pattern: /맵|매운|매워|매콤|얼큰|칼칼/, level: 2 },
];

function extractSpicyLevel(text: string): 0 | 1 | 2 | 3 | null {
  for (const { pattern, level } of SPICY_KEYWORDS) {
    if (pattern.test(text)) return level;
  }
  return null;
}

const TEXTURE_KEYWORDS: Record<string, string> = {
  쫄깃: "쫄깃함",
  바삭: "바삭함",
  아삭: "아삭함",
  부드러: "부드러움",
  탱글: "탱글함",
  고슬: "고슬고슬함",
};

function extractTextures(text: string): string[] {
  const found: string[] = [];
  for (const [keyword, tag] of Object.entries(TEXTURE_KEYWORDS)) {
    if (text.includes(keyword) && !found.includes(tag)) {
      found.push(tag);
    }
  }
  return found;
}

function extractBudget(text: string): number | null {
  const manwonMatch = text.match(/(\d+)\s*만\s*원/);
  if (manwonMatch) {
    return parseInt(manwonMatch[1], 10) * 10000;
  }
  const wonMatch = text.match(/(\d{3,6})\s*원/);
  if (wonMatch) {
    return parseInt(wonMatch[1], 10);
  }
  return null;
}

const EXCLUSION_KEYWORDS = [
  "갑각류",
  "새우",
  "게",
  "땅콩",
  "견과류",
  "돼지고기",
  "돼지",
  "소고기",
  "닭",
  "우유",
  "유제품",
  "계란",
  "달걀",
  "밀",
  "글루텐",
  "오징어",
  "연체류",
  "해산물",
];

function extractExclusions(text: string): string[] {
  const found: string[] = [];
  const hasExclusionCue = /빼고|빼주|빼줘|제외|못\s*먹|알레르기|안\s*먹/.test(text);
  if (!hasExclusionCue) return found;

  for (const keyword of EXCLUSION_KEYWORDS) {
    if (text.includes(keyword) && !found.includes(keyword)) {
      found.push(keyword);
    }
  }
  return found;
}

const FOOD_KEYWORD_CANDIDATES = [
  "면",
  "국물",
  "탕",
  "짬뽕",
  "짜장",
  "밥",
  "볶음밥",
  "탕수육",
  "만두",
  "튀김",
  "구이",
  "찜",
  "전골",
  "해산물",
  "고기",
  "채식",
];

function extractFoodKeywords(text: string): string[] {
  const found: string[] = [];
  for (const keyword of FOOD_KEYWORD_CANDIDATES) {
    if (text.includes(keyword) && !found.includes(keyword)) {
      found.push(keyword);
    }
  }
  return found;
}
