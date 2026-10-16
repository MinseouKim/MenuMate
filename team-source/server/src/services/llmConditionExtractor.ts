import { emptyConditions, type ExtractedConditions } from "../types/order.js";
import { env, llmConfigured } from "../config/env.js";

/**
 * LLM 기반 조건 추출 (선택).
 *
 * 안전 규칙:
 * - 발화 → 구조화된 조건 JSON 변환만 수행한다. 메뉴 이름/가격/알레르기/재고 등은 절대 생성하지 않는다
 *   (추천은 recommendationService의 몫 — 메뉴 DB와만 대조한다).
 * - LLM API 호출은 반드시 이 서버에서만 수행한다 (키는 .env에만 있고 프론트엔드로 전달되지 않음).
 * - 설정이 없거나 호출이 실패하면 예외를 던지고, 호출부(conditionExtractionService)가
 *   규칙 기반 추출기로 자동 폴백한다.
 */
export async function extractConditionsWithLlm(utterance: string): Promise<ExtractedConditions> {
  if (!llmConfigured) {
    throw new Error("LLM 설정(LLM_API_BASE/LLM_API_KEY/LLM_MODEL)이 없습니다.");
  }

  const systemPrompt = [
    "너는 음식 주문 키오스크의 조건 추출기다.",
    "사용자 발화에서 인원수, 맵기(0~3 또는 null), 선호 식감, 1인당 예산(원), 제외 재료,",
    "그리고 음식 종류/조리방식/메뉴명 관련 키워드(food_keywords)만 뽑아",
    "아래 JSON 스키마로만 응답해라. 다른 설명, 메뉴 설명, 가격, 알레르기 정보, 추천 문구는 절대 포함하지 마라.",
    "food_keywords는 발화에 등장한 단어 그대로의 후보일 뿐, 실제 메뉴 존재 여부는 추천 엔진이 메뉴 DB와 대조해서 판단한다 — 네가 메뉴를 만들어내면 안 된다.",
    '{"party_size": number, "spicy_level": 0|1|2|3|null, "preferred_textures": string[], "budget_per_person": number|null, "excluded_ingredients": string[], "food_keywords": string[]}',
  ].join("\n");

  const response = await fetch(`${env.LLM_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: utterance },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM 조건 추출 호출 실패: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM 응답에 content가 없습니다.");
  }

  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("LLM 응답이 JSON 객체가 아닙니다.");
  }
  const p = parsed as Record<string, unknown>;

  const result = emptyConditions(utterance);

  if (typeof p.party_size === "number" && p.party_size > 0) {
    result.party_size = Math.min(p.party_size, 20);
  }
  if ([0, 1, 2, 3].includes(p.spicy_level as number)) {
    result.spicy_level = p.spicy_level as 0 | 1 | 2 | 3;
  }
  if (Array.isArray(p.preferred_textures)) {
    result.preferred_textures = p.preferred_textures.filter((t): t is string => typeof t === "string");
  }
  if (typeof p.budget_per_person === "number") {
    result.budget_per_person = p.budget_per_person;
  }
  if (Array.isArray(p.excluded_ingredients)) {
    result.excluded_ingredients = p.excluded_ingredients.filter(
      (t): t is string => typeof t === "string",
    );
  }
  if (Array.isArray(p.food_keywords)) {
    result.food_keywords = p.food_keywords.filter((t): t is string => typeof t === "string");
  }

  return result;
}
