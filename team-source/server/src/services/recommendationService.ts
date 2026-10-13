import type { MenuWithDetails } from "../types/menu.js";
import type { ExtractedConditions, RecommendedSet, VisionEstimate } from "../types/order.js";

export interface RecommendationInput {
  conditions: ExtractedConditions;
  vision: VisionEstimate;
  menu: MenuWithDetails[];
}

/**
 * 규칙/점수 기반 추천 엔진 (프론트엔드 src/services/recommendation/ruleBasedEngine.ts 포팅).
 *
 * 우선순위:
 * 1. 하드 필터: 품절, 제외 재료(확인된/메뉴명으로 유추된 것만 — unknown은 하드 필터 근거로 쓰지 않음),
 *    맵기 "못 먹음" 제약
 * 2. 소프트 점수화: 음식 키워드 매칭 > 예산 적합 > 식감 선호 > 맵기 근접도 > 비전 보조 신호(최저 가중치)
 *
 * 알레르기 안전 원칙: 이 엔진은 어떤 메뉴도 "알레르기 안전"으로 단정하지 않는다. 응답에는 항상
 * ALLERGY_SAFETY_NOTICE(컨트롤러에서 부착)를 함께 내려보내 안전을 보장하지 않음을 명시한다.
 */
export function recommend(input: RecommendationInput): RecommendedSet[] {
  const { conditions, vision, menu } = input;

  const candidates = menu.filter((item) => !item.sold_out);
  const mains = candidates.filter((item) => item.category === "main");
  const sides = candidates.filter((item) => item.category === "side");

  const hardFiltered = mains.filter((item) => passesHardFilters(item, conditions));

  const scored = hardFiltered
    .map((item) => ({ item, score: scoreItem(item, conditions, vision) }))
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 3);

  return top.map(({ item: main, score }) => buildRecommendedSet(main, score, sides, conditions, vision));
}

/** 제외 재료 요청이 이 메뉴의 "확실한" 재료 정보와 겹치는지. unknown 노티스는 절대 하드 필터 근거로 쓰지 않는다. */
function hasConfidentExcludedIngredient(item: MenuWithDetails, excluded: string[]): boolean {
  if (excluded.length === 0) return false;
  return item.ingredient_notices.some((notice) => {
    if (notice.status === "unknown") return false; // confirmed / inferred_from_menu_name 만 근거로 인정
    return excluded.some(
      (ex) => notice.ingredient_name.includes(ex) || ex.includes(notice.ingredient_name),
    );
  });
}

function passesHardFilters(item: MenuWithDetails, conditions: ExtractedConditions): boolean {
  if (hasConfidentExcludedIngredient(item, conditions.excluded_ingredients)) return false;

  if (conditions.spicy_level === 0 && item.spicy_level > 0) return false;
  if (conditions.spicy_level !== null && conditions.spicy_level > 0 && item.spicy_level === 0) {
    return false;
  }

  return true;
}

function scoreItem(
  item: MenuWithDetails,
  conditions: ExtractedConditions,
  vision: VisionEstimate,
): number {
  let score = 0;

  const haystack = [
    item.name,
    item.category,
    ...item.flavor_tags,
    ...item.keyword_tags,
    ...item.synonym_tags,
  ].join(" ");
  for (const keyword of conditions.food_keywords) {
    if (haystack.includes(keyword)) score += 5;
  }

  if (conditions.budget_per_person !== null) {
    if (item.price <= conditions.budget_per_person) {
      score += 2;
    } else {
      score -= 3;
    }
  }

  for (const texture of conditions.preferred_textures) {
    if (item.texture_tags.includes(texture)) score += 3;
  }

  if (conditions.spicy_level !== null && item.spicy_level === conditions.spicy_level) {
    score += 2;
  }

  if (
    vision.status === "ok" &&
    conditions.spicy_level === null &&
    (vision.age_bracket === "senior" || vision.age_bracket === "child")
  ) {
    if (item.spicy_level <= 1) score += 1;
  }

  return score;
}

function ingredientNoticeLabel(status: MenuWithDetails["ingredient_notices"][number]["status"]): string {
  switch (status) {
    case "confirmed":
      return "확인됨";
    case "inferred_from_menu_name":
      return "메뉴명으로 유추";
    case "unknown":
      return "확인 불가";
  }
}

function buildRecommendedSet(
  main: MenuWithDetails,
  score: number,
  sides: MenuWithDetails[],
  conditions: ExtractedConditions,
  vision: VisionEstimate,
): RecommendedSet {
  const pairedSide =
    sides.find(
      (s) =>
        main.pairing_menu_ids.includes(s.id) &&
        !s.sold_out &&
        !hasConfidentExcludedIngredient(s, conditions.excluded_ingredients),
    ) ?? null;

  const matchedConditions: string[] = [];
  const matchedAttributes: string[] = [];

  const mainHaystack = [main.name, ...main.flavor_tags, ...main.keyword_tags, ...main.synonym_tags];
  if (conditions.food_keywords.some((k) => mainHaystack.some((h) => h.includes(k)))) {
    matchedConditions.push(`요청하신 "${conditions.food_keywords.join(", ")}" 관련 메뉴`);
  }
  if (conditions.spicy_level !== null) {
    matchedConditions.push(`맵기 선호(레벨 ${conditions.spicy_level})`);
  }
  if (conditions.preferred_textures.length > 0) {
    const matched = conditions.preferred_textures.filter((t) => main.texture_tags.includes(t));
    if (matched.length > 0) matchedConditions.push(`선호 식감: ${matched.join(", ")}`);
  }
  if (conditions.budget_per_person !== null) {
    matchedConditions.push(
      main.price <= conditions.budget_per_person
        ? `1인당 예산(${conditions.budget_per_person.toLocaleString()}원) 이내`
        : "예산보다 다소 비쌈 (참고용으로만 추천)",
    );
  }
  if (
    vision.status === "ok" &&
    conditions.spicy_level === null &&
    (vision.age_bracket === "senior" || vision.age_bracket === "child")
  ) {
    matchedAttributes.push("비전 보조 신호: 순한 맛 위주로 가점 (보조 신호일 뿐, 참고용)");
  }

  matchedAttributes.push(...main.flavor_tags, ...main.texture_tags);

  const noticesForCautions = [...main.ingredient_notices, ...(pairedSide?.ingredient_notices ?? [])];
  const cautions = noticesForCautions.map(
    (n) => `${n.ingredient_name} (${ingredientNoticeLabel(n.status)})`,
  );

  const evidenceSources = [
    ...main.evidences.map((e) => e.source_summary),
    ...(pairedSide?.evidences.map((e) => e.source_summary) ?? []),
  ];

  const allVerifiedDates = [...main.evidences, ...(pairedSide?.evidences ?? [])]
    .map((e) => e.verified_at ?? e.collected_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .reverse();

  return {
    main,
    sides: pairedSide ? [pairedSide] : [],
    matched_conditions: matchedConditions,
    matched_attributes: Array.from(new Set(matchedAttributes)),
    cautions: Array.from(new Set(cautions)),
    evidence_sources: Array.from(new Set(evidenceSources)),
    last_verified_at: allVerifiedDates[0] ?? null,
    score,
  };
}
