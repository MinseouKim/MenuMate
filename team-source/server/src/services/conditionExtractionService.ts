import type { ExtractedConditions } from "../types/order.js";
import { llmConfigured } from "../config/env.js";
import { extractConditionsRuleBased } from "./ruleBasedConditionExtractor.js";
import { extractConditionsWithLlm } from "./llmConditionExtractor.js";

/**
 * 조건 추출 서비스. LLM 설정이 있으면 LLM을 우선 시도하고, 실패하거나 설정이 없으면
 * 규칙 기반 추출기로 폴백한다 — 항상 키 없이도 동작한다.
 */
export async function extractConditions(utterance: string): Promise<ExtractedConditions> {
  if (!llmConfigured) {
    return extractConditionsRuleBased(utterance);
  }

  try {
    return await extractConditionsWithLlm(utterance);
  } catch (err) {
    console.warn("[conditionExtractionService] LLM 추출 실패, 규칙 기반으로 폴백:", err);
    return extractConditionsRuleBased(utterance);
  }
}

/**
 * 추출 결과와 함께 어느 추출기가 응답했는지(llm | rules) 알려 준다.
 * 키오스크 화면은 LLM이 응답했을 때만 그 결과를 쓰고, 아니면 화면 쪽 규칙 해석을 그대로 쓴다.
 */
export async function extractConditionsWithSource(
  utterance: string,
): Promise<{ conditions: ExtractedConditions; source: "llm" | "rules" }> {
  if (!llmConfigured) {
    return { conditions: extractConditionsRuleBased(utterance), source: "rules" };
  }
  try {
    return { conditions: await extractConditionsWithLlm(utterance), source: "llm" };
  } catch (err) {
    console.warn("[conditionExtractionService] LLM 추출 실패, 규칙 기반으로 폴백:", err);
    return { conditions: extractConditionsRuleBased(utterance), source: "rules" };
  }
}
