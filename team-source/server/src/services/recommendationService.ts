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
 * 우선순위 (2026-10-27 수정 — 점주 지정은 "사용자 요구사항 + 실제 리뷰 근거"보다 뒤로):
 * 1. 하드 필터: 품절, 제외 재료(확인된/메뉴명으로 유추된 것만 — unknown은 하드 필터 근거로 쓰지 않음),
 *    맵기 "못 먹음" 제약, 예산 초과(예산은 "무조건" 지켜야 하는 하드 제약 — 단일 메뉴는 1인 예산,
 *    점주 추천 세트는 세트 합계가 1인 예산 x 인원수를 넘으면 제외).
 * 2. 다단계(tiered) 비교 — 상위 티어가 같을 때만 다음 티어로 내려가므로 하위 티어가 상위를 절대 못 뒤집는다.
 *    1) 음식 키워드 매칭 (사용자가 가장 구체적으로 말한 내용)
 *    2) 리뷰/후기 근거 3단계: 그 메뉴를 직접 언급한 근거 > '딤섬' 전체 칭찬 같은 공통 근거만 있음 > 근거 없음
 *       (직접 언급 근거끼리는 직접 언급 리뷰 수가 많은 메뉴가 먼저)
 *    3) 사용자가 말한 나머지 선호: 식감 선호 + 맵기 근접도
 *    4) 점주 지정(단일 메뉴 is_featured, 또는 점주 추천 세트) — 위 조건이 같을 때만 앞세운다
 *    5) 비전 보조 신호(최저 가중치)
 *    6) 위 전부가 같을 때만 featured_rank(작을수록 먼저, 미지정은 뒤)
 *
 * 점주 추천 세트도 더 이상 무조건 맨 앞 슬롯을 차지하지 않는다 — 일반 메뉴와 같은 기준으로 함께 순위를
 * 매기고(세트는 대표 메뉴 기준, 키워드는 세트 안 메뉴 중 하나라도 맞으면 인정), 이미 추천에 쓰인 메뉴가
 * 겹치는 후보는 건너뛴다. "사장님 추천" 표시(is_owner_pick/owner_set_label)는 그대로 내려준다.
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

  type Candidate = { menuIds: number[]; tiered: TieredScore; build: (score: number) => RecommendedSet };
  const pool: Candidate[] = [];

  // 점주 추천 세트 후보 — 세트 안 메뉴 하나라도 품절/하드필터 위반이면 세트 전체를 뺀다(부분 노출 없음).
  for (const set of featuredSets) {
    if (set.items.length === 0) continue;
    const allPass = set.items.every(
      ({ menu: item }) => !item.sold_out && passesHardFilters(item, conditions),
    );
    if (!allPass) continue;
    if (!setFitsBudget(set, conditions)) continue;

    const [mainItem, ...sideItems] = set.items;
    const mainTiered = scoreItem(mainItem.menu, conditions, vision);
    const keywordScore = Math.max(
      ...set.items.map(({ menu: item }) => scoreItem(item, conditions, vision).keywordScore),
    );
    pool.push({
      menuIds: set.items.map(({ menu: item }) => item.id),
      tiered: { ...mainTiered, keywordScore, isOwnerPick: true, featuredRank: null },
      build: (score) =>
        buildRecommendedSet({
          main: mainItem.menu,
          score,
          sides: sideItems.map((s) => s.menu),
          conditions,
          vision,
          isOwnerPick: true,
          ownerSetLabel: set.name,
        }),
    });
  }

  // 단일 메뉴 후보
  for (const item of mains) {
    if (!passesHardFilters(item, conditions)) continue;
    pool.push({
      menuIds: [item.id],
      tiered: scoreItem(item, conditions, vision),
      build: (score) =>
        buildRecommendedSet({
          main: item,
          score,
          sides,
          conditions,
          vision,
          isOwnerPick: item.is_featured,
          ownerSetLabel: null,
        }),
    });
  }

  // Array.prototype.sort는 안정 정렬이라, 모든 티어가 같으면 세트(repository 순위 순) → 단일 메뉴 순서가 유지된다.
  pool.sort((a, b) => compareTieredScores(a.tiered, b.tiered));

  const result: RecommendedSet[] = [];
  const usedMenuIds = new Set<number>();
  for (const candidate of pool) {
    if (result.length >= 3) break;
    if (candidate.menuIds.some((id) => usedMenuIds.has(id))) continue;
    result.push(candidate.build(toDisplayScore(candidate.tiered)));
    candidate.menuIds.forEach((id) => usedMenuIds.add(id));
  }

  return result;
}

/** 점주 추천 세트의 합계 금액이 (1인 예산 x 인원수)를 넘지 않는지. 예산 미지정이면 항상 통과. */
function setFitsBudget(set: FeaturedSetForRecommendation, conditions: ExtractedConditions): boolean {
  if (conditions.budget_per_person === null) return true;
  const total = set.items.reduce((sum, { menu: item, quantity }) => sum + item.price * quantity, 0);
  return total <= conditions.budget_per_person * Math.max(1, conditions.party_size);
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
 * 비교에 쓰는 다단계 점수. 절대 하나의 숫자로 합산해서 비교하지 않는다 — 합산하면 하위 티어 점수가 쌓여서
 * 상위 티어를 뒤집어버릴 수 있기 때문에, 반드시 compareTieredScores로 티어 순서대로만 비교한다.
 */
interface TieredScore {
  /** 1순위: 음식 키워드 매칭 */
  keywordScore: number;
  /** 2순위: 리뷰/후기 근거 단계 — 2: 직접 언급 근거 있음, 1: 공통 근거만 있음, 0: 근거 없음 */
  evidenceLevel: 0 | 1 | 2;
  /** 2순위 안에서: 직접 언급 리뷰 수 (많을수록 먼저) */
  directMentions: number;
  /** 3순위: 사용자가 말한 나머지 선호(식감 + 맵기 근접도) */
  preferenceScore: number;
  /** 4순위: 점주 지정(단일 메뉴 is_featured 또는 점주 추천 세트) */
  isOwnerPick: boolean;
  /** 5순위: 비전 보조 신호 */
  visionScore: number;
  /** 최후 타이브레이커: 점주 지정 순위(작을수록 먼저, null은 항상 뒤) */
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

  let preferenceScore = 0;
  for (const texture of conditions.preferred_textures) {
    if (item.texture_tags.includes(texture)) preferenceScore += 3;
  }
  if (conditions.spicy_level !== null && item.spicy_level === conditions.spicy_level) {
    preferenceScore += 2;
  }

  let visionScore = 0;
  if (
    vision.status === "ok" &&
    conditions.spicy_level === null &&
    (vision.age_bracket === "senior" || vision.age_bracket === "child")
  ) {
    if (item.spicy_level <= 1) visionScore += 1;
  }

  return {
    keywordScore,
    ...evidenceStrength(item),
    preferenceScore,
    isOwnerPick: item.is_featured,
    visionScore,
    featuredRank: item.featured_rank,
  };
}

/** 티어 순서대로 비교: 키워드 → 리뷰 근거 → 식감/맵기 → 점주 지정 → 비전 → featured_rank. */
/**
 * 리뷰/후기 근거의 세기.
 * - 공개 리뷰 집계(manual_public_review_aggregate)는 mention_count가 "그 메뉴를 직접 언급한 리뷰 수"다
 *   (import:evidences 참고). 0이면 '딤섬' 전체 칭찬 같은 공통 근거만 있다는 뜻.
 * - 팀 시식·점주 확인·동의 후기·공식 메뉴 같은 다른 근거는 그 메뉴 자체에 대한 근거이므로 직접 근거로 본다.
 */
function evidenceStrength(item: MenuWithDetails): Pick<TieredScore, "evidenceLevel" | "directMentions"> {
  if (item.evidences.length === 0) return { evidenceLevel: 0, directMentions: 0 };
  let directMentions = 0;
  let hasDirect = false;
  for (const e of item.evidences) {
    if (e.source_type === "manual_public_review_aggregate") {
      const n = e.mention_count ?? 0;
      if (n > 0) {
        hasDirect = true;
        directMentions += n;
      }
    } else {
      hasDirect = true;
      directMentions += 1;
    }
  }
  return { evidenceLevel: hasDirect ? 2 : 1, directMentions };
}

function compareTieredScores(a: TieredScore, b: TieredScore): number {
  if (a.keywordScore !== b.keywordScore) return b.keywordScore - a.keywordScore;
  if (a.evidenceLevel !== b.evidenceLevel) return b.evidenceLevel - a.evidenceLevel;
  if (a.directMentions !== b.directMentions) return b.directMentions - a.directMentions;
  if (a.preferenceScore !== b.preferenceScore) return b.preferenceScore - a.preferenceScore;
  if (a.isOwnerPick !== b.isOwnerPick) return a.isOwnerPick ? -1 : 1;
  if (a.visionScore !== b.visionScore) return b.visionScore - a.visionScore;

  const rankA = a.featuredRank;
  const rankB = b.featuredRank;
  if (rankA === rankB) return 0;
  if (rankA === null) return 1;
  if (rankB === null) return -1;
  return rankA - rankB;
}

/** RecommendedSet.score(단일 숫자)로 내려주기 위한 표시용 점수. 티어마다 자릿수를 크게 벌려서
 *  숫자 크기 순서가 compareTieredScores 순서와 같게 한다. */
function toDisplayScore(t: TieredScore): number {
  return (
    t.keywordScore * 1e13 +
    t.evidenceLevel * 1e11 +
    Math.min(t.directMentions, 9999) * 1e7 +
    t.preferenceScore * 1e4 +
    (t.isOwnerPick ? 1 : 0) * 1e3 +
    t.visionScore * 10
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

  // 점수 계산(scoreItem)과 같은 기준으로 맞춘다 — kind(음식 종류)로 매칭된 메뉴에도 "요청하신 … 관련 메뉴"가 붙어야 한다.
  const mainHaystack = [main.name, main.kind ?? "", ...main.flavor_tags, ...main.keyword_tags, ...main.synonym_tags];
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
