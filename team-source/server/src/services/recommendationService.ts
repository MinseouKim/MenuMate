import type { MenuWithDetails } from "../types/menu.js";
import type { ExtractedConditions, RecommendedSet, VisionEstimate } from "../types/order.js";

/** 추천 엔진에 넘기는, 메뉴까지 이미 resolve된 "점주 지정 추천 세트". */
export interface FeaturedSetForRecommendation {
  name: string;
  items: { menu: MenuWithDetails; quantity: number }[];
}

export interface RecommendationInput {
  conditions: ExtractedConditions;
  vision: VisionEstimate;
  menu: MenuWithDetails[];
  /** 점주가 관리자 화면에서 지정한 추천 세트 — 비어 있으면 기존과 동일하게 동작한다. */
  featuredSets?: FeaturedSetForRecommendation[];
}

/**
 * 규칙/점수 기반 추천 엔진 (프론트엔드 src/services/recommendation/ruleBasedEngine.ts 포팅).
 *
 * 우선순위 (2026-10-27 수정):
 * 0. 점주 지정 "추천 세트" — 알레르기 등 안전 하드 필터를 통과하면 최우선으로 노출 (관리자 화면 기능)
 * 1. 하드 필터: 품절, 제외 재료(확인된/메뉴명으로 유추된 것만 — unknown은 하드 필터 근거로 쓰지 않음),
 *    맵기 "못 먹음" 제약, 그리고 예산 초과 메뉴(예산은 더 이상 소프트 가점이 아니라 "무조건" 지켜야 하는
 *    하드 제약이다 — 예산을 넘는 메뉴는 점수 계산 전에 후보에서 완전히 제외한다).
 * 2. 소프트 점수화 — 아래 순서로 우선순위가 엄격히 적용되는 다단계(tiered) 비교다. 상위 티어가 같을 때만
 *    다음 티어로 내려가서 비교하므로, 하위 티어 점수가 아무리 높아도 상위 티어를 절대 뒤집지 못한다.
 *    1) 점주 지정(단일 메뉴, is_featured) — 일반 조건 매칭을 항상 압도
 *    2) 음식 키워드 매칭 (사용자가 가장 구체적으로 말한 내용)
 *    3) 리뷰/후기 근거가 있는 메뉴(menu_evidences 1건 이상) > 근거 없는 메뉴
 *    4) 그 외: 식감 선호 > 맵기 근접도 > 비전 보조 신호(최저 가중치)
 *    5) 위 전부가 같을 때만 마지막으로 점주가 지정한 순위(featured_rank, 작을수록 먼저)로 비교
 *
 * 알레르기 안전 원칙: 이 엔진은 어떤 메뉴도 "알레르기 안전"으로 단정하지 않는다. 응답에는 항상
 * ALLERGY_SAFETY_NOTICE(컨트롤러에서 부착)를 함께 내려보내 안전을 보장하지 않음을 명시한다.
 * 점주 지정 추천(세트/단일 메뉴)도 이 원칙의 예외가 아니다 — 아래 passesHardFilters를 그대로 적용한다.
 */
export function recommend(input: RecommendationInput): RecommendedSet[] {
  const { conditions, vision, menu, featuredSets = [] } = input;

  const candidates = menu.filter((item) => !item.sold_out);
  const mains = candidates.filter((item) => item.category === "main");
  const sides = candidates.filter((item) => item.category === "side");

  const result: RecommendedSet[] = [];
  const usedMenuIds = new Set<number>();

  // 0. 점주 지정 추천 세트 우선 — 랭크 순(이미 repository에서 정렬됨). 세트 안의 메뉴 중 품절/하드필터
  //    위반이 하나라도 있으면 이번 추천에서는 그 세트를 건너뛴다(부분적으로 보여주지 않음).
  for (const set of featuredSets) {
    if (result.length >= 3) break;
    const allPass = set.items.every(
      ({ menu: item }) => !item.sold_out && passesHardFilters(item, conditions),
    );
    if (!allPass || set.items.length === 0) continue;

    const [mainItem, ...sideItems] = set.items;
    result.push(
      buildRecommendedSet({
        main: mainItem.menu,
        score: toDisplayScore({ isOwnerPick: true, keywordScore: 0, hasEvidence: mainItem.menu.evidences.length > 0, restScore: 0, featuredRank: null }),
        sides: sideItems.map((s) => s.menu),
        conditions,
        vision,
        isOwnerPick: true,
        ownerSetLabel: set.name,
      }),
    );
    set.items.forEach(({ menu: item }) => usedMenuIds.add(item.id));
  }

  // 1~2. 일반 추천 — 이미 세트로 노출된 메뉴는 중복되지 않게 제외한다.
  const remainingSlots = 3 - result.length;
  if (remainingSlots > 0) {
    const hardFiltered = mains.filter(
      (item) => !usedMenuIds.has(item.id) && passesHardFilters(item, conditions),
    );

    const scored = hardFiltered
      .map((item) => ({ item, tiered: scoreItem(item, conditions, vision) }))
      .sort((a, b) => compareTieredScores(a.tiered, b.tiered));

    for (const { item: main, tiered } of scored.slice(0, remainingSlots)) {
      result.push(
        buildRecommendedSet({
          main,
          score: toDisplayScore(tiered),
          sides,
          conditions,
          vision,
          isOwnerPick: main.is_featured,
          ownerSetLabel: null,
        }),
      );
    }
  }

  return result;
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

  // 예산은 "무조건" 지켜야 하는 제약이다 — 예산을 넘는 메뉴는 점수와 상관없이 결과에 나오면 안 되므로
  // 소프트 가점/감점이 아니라 하드 필터로 처리한다. budget_per_person이 없으면(사용자가 예산을 말하지
  // 않은 경우) 이 조건은 적용하지 않는다. 점주 지정 추천(세트/단일 메뉴)도 이 제약의 예외가 아니다.
  if (conditions.budget_per_person !== null && item.price > conditions.budget_per_person) {
    return false;
  }

  return true;
}

/**
 * 비교에 쓰는 다단계 점수. 절대 하나의 숫자로 합산하지 않는다 — 합산하면 하위 티어 점수가 쌓여서
 * 상위 티어(점주 지정, 키워드 매칭, 리뷰 근거 유무)를 뒤집어버릴 수 있기 때문에, 반드시
 * compareTieredScores로 티어 순서대로만 비교한다.
 */
interface TieredScore {
  /** 1순위: 점주가 단일 메뉴로 지정했는지(is_featured) */
  isOwnerPick: boolean;
  /** 2순위: 음식 키워드 매칭 */
  keywordScore: number;
  /** 3순위: 리뷰/후기 근거(menu_evidences)가 1건이라도 있는지 */
  hasEvidence: boolean;
  /** 4순위: 식감 선호 + 맵기 근접도 + 비전 보조 신호 */
  restScore: number;
  /** 최후 타이브레이커: 위 전부가 같을 때만 쓰는 점주 지정 순위(작을수록 먼저, null은 항상 뒤) */
  featuredRank: number | null;
}

function scoreItem(
  item: MenuWithDetails,
  conditions: ExtractedConditions,
  vision: VisionEstimate,
): TieredScore {
  let keywordScore = 0;

  const haystack = [
    item.name,
    item.category,
    item.kind ?? "",
    ...item.flavor_tags,
    ...item.keyword_tags,
    ...item.synonym_tags,
  ].join(" ");
  for (const keyword of conditions.food_keywords) {
    if (haystack.includes(keyword)) keywordScore += 5;
  }

  const hasEvidence = item.evidences.length > 0;

  let restScore = 0;

  for (const texture of conditions.preferred_textures) {
    if (item.texture_tags.includes(texture)) restScore += 3;
  }

  if (conditions.spicy_level !== null && item.spicy_level === conditions.spicy_level) {
    restScore += 2;
  }

  if (
    vision.status === "ok" &&
    conditions.spicy_level === null &&
    (vision.age_bracket === "senior" || vision.age_bracket === "child")
  ) {
    if (item.spicy_level <= 1) restScore += 1;
  }

  return {
    isOwnerPick: item.is_featured,
    keywordScore,
    hasEvidence,
    restScore,
    featuredRank: item.featured_rank,
  };
}

/** 티어 순서대로 비교: 점주 지정 → 키워드 매칭 → 리뷰 근거 유무 → 나머지 → (전부 같을 때만) featured_rank.
 *  상위 티어가 다르면 거기서 바로 끝난다. */
function compareTieredScores(a: TieredScore, b: TieredScore): number {
  if (a.isOwnerPick !== b.isOwnerPick) return a.isOwnerPick ? -1 : 1;
  if (a.keywordScore !== b.keywordScore) return b.keywordScore - a.keywordScore;
  if (a.hasEvidence !== b.hasEvidence) return a.hasEvidence ? -1 : 1;
  if (a.restScore !== b.restScore) return b.restScore - a.restScore;

  const rankA = a.featuredRank;
  const rankB = b.featuredRank;
  if (rankA === rankB) return 0;
  if (rankA === null) return 1;
  if (rankB === null) return -1;
  return rankA - rankB;
}

/** RecommendedSet.score(단일 숫자)로 내려주기 위한 표시용 점수. 큰 자릿수 차이를 둬서 티어 우선순위가
 *  그대로 숫자 크기에도 반영되게 한다(상위 티어 1점 차이가 하위 티어 전체보다 항상 크다). */
function toDisplayScore(tiered: TieredScore): number {
  return (
    (tiered.isOwnerPick ? 1 : 0) * 100_000_000 +
    tiered.keywordScore * 1_000_000 +
    (tiered.hasEvidence ? 1 : 0) * 10_000 +
    tiered.restScore
  );
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

function buildRecommendedSet(args: {
  main: MenuWithDetails;
  score: number;
  sides: MenuWithDetails[];
  conditions: ExtractedConditions;
  vision: VisionEstimate;
  isOwnerPick: boolean;
  ownerSetLabel: string | null;
}): RecommendedSet {
  const { main, score, sides, conditions, vision, isOwnerPick, ownerSetLabel } = args;

  // 점주 지정 세트는 이미 자신의 사이드 목록을 들고 있으므로 그대로 쓰고, 일반 추천은 pairing으로 찾는다.
  const pairedSide =
    ownerSetLabel !== null
      ? sides[0] ?? null
      : (sides.find(
          (s) =>
            main.pairing_menu_ids.includes(s.id) &&
            !s.sold_out &&
            !hasConfidentExcludedIngredient(s, conditions.excluded_ingredients),
        ) ?? null);
  const resolvedSides = ownerSetLabel !== null ? sides : pairedSide ? [pairedSide] : [];

  const matchedConditions: string[] = [];
  const matchedAttributes: string[] = [];

  if (ownerSetLabel !== null) {
    matchedConditions.push(`사장님이 추천하는 "${ownerSetLabel}" 구성이에요`);
  } else if (isOwnerPick) {
    matchedConditions.push("사장님이 추천하는 메뉴예요");
  }

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
    // 예산 초과 메뉴는 하드 필터에서 이미 제거되므로, 여기 도달한 메뉴는 항상 예산 이내다.
    matchedConditions.push(`1인당 예산(${conditions.budget_per_person.toLocaleString()}원) 이내`);
  }
  if (
    vision.status === "ok" &&
    conditions.spicy_level === null &&
    (vision.age_bracket === "senior" || vision.age_bracket === "child")
  ) {
    matchedAttributes.push("비전 보조 신호: 순한 맛 위주로 가점 (보조 신호일 뿐, 참고용)");
  }

  matchedAttributes.push(main.evidences.length > 0 ? "리뷰/후기 근거 있음" : "아직 리뷰/후기 근거 없음 (참고용)");

  matchedAttributes.push(...main.flavor_tags, ...main.texture_tags);

  const noticesForCautions = [
    ...main.ingredient_notices,
    ...resolvedSides.flatMap((s) => s.ingredient_notices),
  ];
  const cautions = noticesForCautions.map(
    (n) => `${n.ingredient_name} (${ingredientNoticeLabel(n.status)})`,
  );

  const evidenceSources = [
    ...main.evidences.map((e) => e.source_summary),
    ...resolvedSides.flatMap((s) => s.evidences.map((e) => e.source_summary)),
  ];

  const allVerifiedDates = [...main.evidences, ...resolvedSides.flatMap((s) => s.evidences)]
    .map((e) => e.verified_at ?? e.collected_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .reverse();

  return {
    main,
    sides: resolvedSides,
    matched_conditions: matchedConditions,
    matched_attributes: Array.from(new Set(matchedAttributes)),
    cautions: Array.from(new Set(cautions)),
    evidence_sources: Array.from(new Set(evidenceSources)),
    last_verified_at: allVerifiedDates[0] ?? null,
    score,
    is_owner_pick: isOwnerPick,
    owner_set_label: ownerSetLabel,
  };
}
