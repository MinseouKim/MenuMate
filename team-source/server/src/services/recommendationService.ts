import type { MenuWithDetails } from "../types/menu.js";
import type {
  ExtractedConditions,
  RecommendationSetType,
  RecommendedSet,
  VisionEstimate,
} from "../types/order.js";

/**
 * 추천 엔진 — 키오스크 화면(team-source/src/prototype/recommendation.ts, 팀원 작성)의 조합 추천을 서버로 옮긴 것.
 * (2026-10-28) 화면과 서버가 같은 규칙으로 추천하도록 맞췄다. 서버가 잠들어 화면 추천으로 넘어가도
 * 구성 방식·제외 재료·예산 규칙은 같고, 차이는 서버에만 있는 아래 "서버 기준" 가점뿐이다.
 *
 * 1) 하드 필터 (화면과 같음): 품절, 음료 단독 제외, 제외 재료(violatesExclusion), "안 매운 것" 요청 시 매운 메뉴 제외.
 * 2) 메뉴 하나의 점수(fit): 화면 기준 — 말한 메뉴 키워드 +10, 원한 음식 종류 +8, 맵기 일치 +4(안 매움 +2), 식감 +3
 *    서버 기준 — 리뷰 근거(직접 언급 +6 + 언급 수, 공통 근거만 +3.5), 점주 지정 +0.5, 비전 보조 +0.5
 *    가중치 순서가 "음식 키워드 > 리뷰 근거 > 맵기·식감 > 점주 지정"이 되도록 잡았다(항목 하나씩 비교 기준).
 * 3) 조합 후보 (화면과 같음): 단품, 메뉴+곁들임(2명 이상), 두 메뉴로 인원 나누기(2명 이상), 가벼운 구성(1~2명,
 *    딤섬·스프 등을 원하거나 "간단하게"), 중식 한상(2명 이상: 요리 3명당 1개 + 식사 인원수만큼 최대 3종 + 곁들임).
 *    + 서버만: 점주가 관리자 화면에서 만든 추천 세트도 같은 기준으로 후보에 들어간다(맨 앞 자리를 보장하지 않음).
 * 4) 예산 (화면과 같음): 조합 합계가 총예산(없으면 1인 예산 x 인원수)을 넘으면 그 조합은 버린다 — 무조건 지킨다.
 *    메뉴 하나의 가격으로 거르지 않는다: 3명이 나눠 먹는 35,000원 요리도 1인 2만원 x 3명 = 6만원 안이면 추천된다.
 * 5) 3개 고르기 (화면과 같음): 한상은 첫 자리, 두 번째 한상은 요리·식사 구성이 달라야 하고, 단품은 메뉴가 겹치지 않게,
 *    혼자면서 메뉴를 콕 집지 않았으면 면·밥 식사 위주로, 단품이 하나는 꼭 들어가게.
 *
 * 알레르기 안전 원칙: 이 엔진은 어떤 메뉴도 "알레르기 안전"으로 단정하지 않는다. 응답에는 항상
 * ALLERGY_SAFETY_NOTICE(컨트롤러에서 부착)를 함께 내려보낸다. 점주 지정 추천도 같은 하드 필터를 거친다.
 */

/** 추천 엔진에 넘기는, 메뉴까지 이미 resolve된 "점주 지정 추천 세트". */
export interface FeaturedSetForRecommendation {
  name: string;
  items: { menu: MenuWithDetails; quantity: number }[];
}

export interface RecommendationWeights {
  keyword: number;
  kind: number;
  spicyMatch: number;
  /** "안 매운 것"과 맵기 0이 맞을 때. 맵기 0은 '안 매움'과 '확인 안 됨'이 섞여 있어 화면처럼 절반만 준다. */
  spicyUnchecked: number;
  texture: number;
  evidenceDirect: number;
  evidencePerMention: number;
  evidenceMentionCap: number;
  evidenceCommon: number;
  owner: number;
  vision: number;
}

export const DEFAULT_WEIGHTS: RecommendationWeights = {
  keyword: 10,
  kind: 8,
  spicyMatch: 4,
  spicyUnchecked: 2,
  texture: 3,
  evidenceDirect: 6,
  evidencePerMention: 0.2,
  evidenceMentionCap: 5,
  evidenceCommon: 3.5,
  owner: 0.5,
  vision: 0.5,
};

export interface RecommendationInput {
  conditions: ExtractedConditions;
  vision: VisionEstimate;
  menu: MenuWithDetails[];
  /** 점주가 관리자 화면에서 지정한 추천 세트 — 비어 있으면 일반 후보만으로 추천한다. */
  featuredSets?: FeaturedSetForRecommendation[];
  /** 테스트·비교용 가중치 덮어쓰기 (예: 리뷰·점주 가중치를 0으로 두면 키오스크 화면 추천과 같은 결과가 나와야 한다). */
  weights?: Partial<RecommendationWeights>;
}

// ---------------------------------------------------------------------------
// 화면(prototype/parse.ts, recommendation.ts)과 같은 문장 해석 도구
// ---------------------------------------------------------------------------
const NEGATION =
  "(?:은|는|이|가|을|를|도|랑|하고)?\\s*(?:없는|없이|없고|빼고|빼\\s*주|빼주|빼요|빼|제외|말고|알레르기|알러지|싫|못\\s*먹|안\\s*먹|넣지\\s*말)";
/** 부정한 부분("새우는 빼고")을 지운 문장 — 원하는 종류·메뉴 이름을 찾을 때 쓴다. */
const stripNegated = (text: string) => text.replace(new RegExp(`\\S+${NEGATION}\\S*`, "g"), " ");
const NOODLE = /(?:^|[\s,.])면(?=\s|$|요리|류|으로|을|이|도|요)|국수|짜장|짬뽕|누들|탕면|냉면|딴딴면|차우면/;
const KIND_WORDS: [string, RegExp][] = [
  ["베이징덕/생선", /베이징\s*덕|북경\s*오리|오리|생선/],
  ["딤섬", /딤섬|만두|교자|하가우|쇼마이|소[롱룡]포|춘권/],
  ["스프/탕", /스프|수프|산라탕/],
  ["면", NOODLE],
  ["밥", /밥/],
  ["치킨", /치킨|닭/],
  ["소고기", /소고기|우육/],
  ["돼지고기", /돼지|탕수육|동파육/],
  ["해산물", /해산물|해물|새우|전복|해삼|관자/],
  ["냉채/샐러드", /냉채|샐러드/],
  ["야채", /야채|채소|가지|두부/],
];
/** 음식 종류(kind) → 화면 메뉴 데이터의 category. 조합에서 요리/식사/곁들임을 나누는 데 쓴다. */
const KIND_GROUP: Record<string, string> = {
  "베이징덕/생선": "duck-fish",
  딤섬: "dimsum",
  야채: "vegetable",
  "냉채/샐러드": "cold",
  "스프/탕": "soup",
  치킨: "chicken",
  돼지고기: "pork",
  소고기: "beef",
  해산물: "seafood",
  면: "noodle",
  밥: "rice",
};
const YORI = ["chicken", "pork", "beef", "seafood", "duck-fish"];
const MEAL = ["noodle", "rice"];
const SIDE = ["dimsum", "soup", "cold", "vegetable"];
const MEAL_TYPES = ["짜장", "짬뽕", "볶음밥", "덮밥", "탕면", "냉면", "차우면", "딴딴면", "우육탕면", "잡탕밥", "잡채밥"];
const CLASSIC = ["짜장", "짬뽕", "볶음밥"];
/** 점수가 같을 때 혼자 드실 식사를 보여 주는 순서 — 화면과 같이 짜장 → 볶음밥 → 짬뽕. */
const CLASSIC_RANK = ["짜장", "볶음밥", "짬뽕"];

// ---------------------------------------------------------------------------
// 제외 재료 (화면과 같은 규칙)
// ---------------------------------------------------------------------------
/**
 * - "해산물"을 빼 달라고 하면 새우·생선·게·해삼·전복·관자·굴·오징어·조개도 함께 뺀다.
 * - 새우처럼 해산물 하나만 빼 달라고 해도, 재료가 "해산물"로만 적힌 메뉴는 무엇이 들었는지 모르므로 함께 뺀다.
 */
const SEAFOOD_GROUP = ["해산물", "새우", "생선", "게", "해삼", "전복", "관자", "굴", "오징어", "조개"];

export function expandExclusions(excluded: string[]): string[] {
  const out = new Set<string>();
  for (const raw of excluded) {
    const e = raw.trim();
    if (!e) continue;
    if (e === "해산물") SEAFOOD_GROUP.forEach((x) => out.add(x));
    else out.add(e);
  }
  if ([...out].some((e) => SEAFOOD_GROUP.includes(e))) out.add("해산물");
  return [...out];
}

/**
 * 이 메뉴가 (확장된) 제외 재료 요청에 걸리는지.
 * - 재료 정보가 하나도 없으면 "안 들어감"이 아니라 "아직 모름"이다 → 무엇이든 빼 달라는 요청이 있으면 추천하지 않는다.
 * - 재료 노티스는 상태(confirmed / inferred_from_menu_name / unknown)와 상관없이 이름이 겹치면 뺀다.
 */
function violatesExclusion(item: MenuWithDetails, excluded: string[]): boolean {
  if (excluded.length === 0) return false;
  if (item.ingredient_notices.length === 0) return true;
  return item.ingredient_notices.some((notice) =>
    excluded.some((ex) => notice.ingredient_name.includes(ex) || ex.includes(notice.ingredient_name)),
  );
}

// ---------------------------------------------------------------------------
// 리뷰 근거
// ---------------------------------------------------------------------------
/**
 * - 공개 리뷰 집계(manual_public_review_aggregate)의 mention_count는 "그 메뉴를 직접 언급한 리뷰 수"다
 *   (import:evidences 참고). 0이면 '딤섬' 전체 칭찬 같은 공통 근거만 있다는 뜻.
 * - 팀 시식·점주 확인·동의 후기·공식 메뉴 같은 다른 근거는 그 메뉴 자체에 대한 직접 근거로 본다.
 */
function evidenceStrength(item: MenuWithDetails): { level: 0 | 1 | 2; directMentions: number } {
  if (item.evidences.length === 0) return { level: 0, directMentions: 0 };
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
  return { level: hasDirect ? 2 : 1, directMentions };
}

// ---------------------------------------------------------------------------
interface Cond {
  party: number;
  spicy: 0 | 1 | 2 | 3 | null;
  kind: string;
  texture: string;
  budget: number | null;
  totalBudget: number | null;
  raw: string;
  said: string;
}

function normalizeConditions(c: ExtractedConditions): Cond {
  const raw = c.raw_utterance ?? "";
  const hasRaw = raw.trim().length > 0;
  // 화면과 같이 "말한 문장에서 부정한 부분을 뺀 것"으로 메뉴 이름을 찾는다. 문장이 없으면(API 직접 호출) 키워드로.
  const wanted = hasRaw ? stripNegated(raw) : c.food_keywords.join(" ");
  // 키오스크가 종류를 보냈으면("상관없음" 포함) 그대로 쓴다 — 손님이 확인 화면에서 "상관없음"으로 바꿨을 수 있다.
  // 종류를 아예 안 보낸 호출(API 직접 호출, 서버 조건 추출)만 문장·키워드에서 찾는다.
  let kind = c.kind ?? "상관없음";
  if (c.kind === undefined || c.kind === null) {
    const keywordsText = c.food_keywords.join(" ");
    kind =
      KIND_WORDS.find(([, re]) => re.test(wanted))?.[0] ??
      KIND_WORDS.find(([, re]) => re.test(keywordsText))?.[0] ??
      "상관없음";
  }
  return {
    party: Math.max(1, c.party_size),
    spicy: c.spicy_level,
    kind,
    texture: c.preferred_textures[0] ?? "상관없음",
    budget: c.budget_per_person,
    totalBudget: c.total_budget ?? null,
    raw,
    said: wanted.replace(/\s/g, ""),
  };
}

interface Item {
  m: MenuWithDetails;
  group: string;
  keywords: string[];
  servingPeople: number;
  servingMin: number;
  badge: boolean;
  /** 화면 기준 + 서버 기준(리뷰 근거·점주·비전) 전체 점수 */
  score: number;
  /** 화면(키오스크) 기준 점수만 — 한상 후보가 예산 안에 하나도 안 나올 때 화면과 같은 메뉴 묶음으로 다시 고르는 데 쓴다. */
  base: number;
  reasons: string[];
}

interface Candidate {
  mainId: number;
  lines: { id: number; quantity: number }[];
  total: number;
  score: number;
  reasons: string[];
  set?: boolean;
  light?: boolean;
  type: RecommendationSetType;
  ownerSetLabel?: string;
}

const combos = <T>(arr: T[], k: number): T[][] =>
  k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((rest) => [x, ...rest]));

export function recommend(input: RecommendationInput): RecommendedSet[] {
  const { conditions, vision, menu, featuredSets = [] } = input;
  const W: RecommendationWeights = { ...DEFAULT_WEIGHTS, ...input.weights };
  const c = normalizeConditions(conditions);
  const excluded = expandExclusions(conditions.excluded_ingredients);
  const menuById = new Map(menu.map((m) => [m.id, m]));
  const kindOf = (id: number) => menuById.get(id)?.kind ?? "";
  const groupOf = (id: number) => KIND_GROUP[kindOf(id)] ?? "";

  const allowed = (m: MenuWithDetails) =>
    !m.sold_out &&
    m.category !== "drink" &&
    !violatesExclusion(m, excluded) &&
    (c.spicy !== 0 || m.spicy_level === 0);

  const fit = (m: MenuWithDetails): Pick<Item, "score" | "base" | "reasons"> => {
    let score = 0;
    const reasons: string[] = [];
    if (m.is_featured) {
      score += W.owner;
      reasons.push("사장님이 추천하는 메뉴예요");
    }
    const kw = m.keyword_tags.filter((k) => k !== "신규").find((k) => c.said.includes(k));
    if (kw) {
      score += W.keyword;
      reasons.push(`말씀하신 ‘${kw}’ 메뉴예요`);
    }
    if (c.kind !== "상관없음" && (m.kind ?? "").includes(c.kind)) {
      score += W.kind;
      reasons.push(`${c.kind} 메뉴를 원하셨어요`);
    }
    // 화면 데이터에 매장 확인 여부(spicyChecked)가 없으므로 맵기 0은 화면과 같이 '맵다는 표시가 없는 메뉴'로 본다.
    if (c.spicy !== null && m.spicy_level === c.spicy) {
      if (c.spicy === 0) {
        score += W.spicyUnchecked;
        reasons.push("맵다는 표시가 없는 메뉴예요");
      } else {
        score += W.spicyMatch;
        reasons.push("원하신 맵기와 맞아요");
      }
    }
    if (c.texture !== "상관없음" && m.texture_tags.includes(c.texture)) {
      score += W.texture;
      reasons.push(`${c.texture} 식감 태그가 있어요`);
    }
    const base = score - (m.is_featured ? W.owner : 0);
    const ev = evidenceStrength(m);
    if (ev.level === 2) score += W.evidenceDirect + W.evidencePerMention * Math.min(ev.directMentions, W.evidenceMentionCap);
    else if (ev.level === 1) score += W.evidenceCommon;
    if (
      vision.status === "ok" &&
      c.spicy === null &&
      (vision.age_bracket === "senior" || vision.age_bracket === "child") &&
      m.spicy_level <= 1
    ) {
      score += W.vision;
    }
    return { score, base, reasons };
  };

  const toItem = (m: MenuWithDetails): Item => {
    const servingPeople = m.serving_people && m.serving_people > 0 ? m.serving_people : 1;
    return {
      m,
      group: KIND_GROUP[m.kind ?? ""] ?? "",
      keywords: m.keyword_tags.filter((k) => k !== "신규"),
      servingPeople,
      servingMin: m.serving_min && m.serving_min > 0 ? m.serving_min : servingPeople,
      badge: m.is_featured || m.keyword_tags.includes("신규"),
      ...fit(m),
    };
  };

  // 점수가 같으면 점주가 정한 순위(featured_rank, 작을수록 먼저), 그다음은 원래 순서 (화면 데이터엔 순위가 없어 영향 없음)
  const rankCmp = (a: Item, b: Item) => {
    const ra = a.m.featured_rank;
    const rb = b.m.featured_rank;
    if (ra === rb) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb;
  };
  const pool = menu
    .filter(allowed)
    .map(toItem)
    .sort((a, b) => b.score - a.score || rankCmp(a, b));
  const itemById = new Map(pool.map((p) => [p.m.id, p]));
  const limit = c.totalBudget ?? (c.budget ? c.budget * c.party : Infinity);
  const budgetReason = c.totalBudget ? "확인한 총예산 이내예요" : "확인한 1인당 예산 이내예요";
  const budgetFit = (total: number) => (limit < Infinity ? 2 * Math.max(0, 1 - Math.abs(total / limit - 0.8) / 0.8) : 0);
  const candidates: Candidate[] = [];

  // parts: [메뉴, 그 메뉴로 채울 인원]. 인원을 메뉴의 인분으로 나눠 수량을 정한다.
  const build = (parts: (Item & { people: number })[], bonus: number, extra: string[], type: RecommendationSetType) => {
    const lines = parts.map((p) => ({ id: p.m.id, quantity: Math.ceil(p.people / p.servingPeople) }));
    const total = lines.reduce((v, l, i) => v + parts[i].m.price * l.quantity, 0);
    if (total > limit) return;
    // 최소 인분 기준으로 인원보다 훨씬 많은 양이면 빼고, 조금 많으면 점수를 낮춘다.
    const over = lines.reduce((v, l, i) => v + l.quantity * parts[i].servingMin, 0) - c.party;
    if (over > c.party) return;
    let score = parts.reduce((v, p) => v + p.score, 0) / parts.length + bonus - Math.max(0, over) * 1.5;
    score += budgetFit(total);
    const reasons = [...new Set([...parts.flatMap((p) => p.reasons), ...extra])];
    if (limit < Infinity) reasons.push(budgetReason);
    if (!reasons.length) reasons.push("현재 조건으로 선택할 수 있는 메뉴예요");
    candidates.push({ mainId: parts[0].m.id, lines, total, score, reasons, type });
  };

  for (const p of pool) {
    const side = pool.find((s) => p.m.pairing_menu_ids.includes(s.m.id));
    build([{ ...p, people: c.party }], 0, [], "single");
    // 곁들임은 인원 전체 분량이 아니라 다 같이 나눠 먹는 1개만 더한다.
    if (side && c.party >= 2) {
      build([{ ...p, people: c.party }, { ...side, people: side.servingPeople }], 0.5, [`${side.m.name}와 곁들이기 좋아요`], "with_side");
    }
  }
  // 인원이 2명 이상이면 서로 다른 메뉴 2개로 인원을 나눠 채우는 조합도 후보에 넣는다.
  if (c.party >= 2) {
    const half = Math.ceil(c.party / 2);
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++)
        build([{ ...pool[i], people: half }, { ...pool[j], people: c.party - half }], 1, ["여러 메뉴를 나눠 드실 수 있어요"], "split");
  }

  // 중식 한상 / 가벼운 구성 (화면과 같은 구성 규칙)
  const ofKind = (cats: string[]) => c.kind !== "상관없음" && pool.some((p) => cats.includes(p.group) && (p.m.kind ?? "").includes(c.kind));
  const mealType = (p: Item) => p.keywords.map((k) => (k === "간짜장" ? "짜장" : k)).find((k) => MEAL_TYPES.includes(k)) ?? p.m.name;
  const yoriCount = c.party >= 2 ? Math.ceil(c.party / 3) : 0;
  const mealKinds = Math.min(c.party, 3);
  const namedSides = pool.filter((p) => SIDE.includes(p.group) && p.keywords.some((k) => c.said.includes(k)));
  const wantsLight = /간단|가볍|가벼운|출출/.test(c.raw);
  const light = c.party <= 2 && (ofKind(SIDE) || namedSides.length > 0 || wantsLight);
  const classicCount = (ms: Item[]) => new Set(ms.map(mealType).filter((t) => CLASSIC.includes(t))).size;

  /**
   * 한상·가벼운 구성에 넣을 메뉴 묶음(요리 6·식사 7·곁들임 4개)을 key 점수 순으로 골라 조합을 만든다.
   * 먼저 리뷰 근거까지 반영한 점수("score")로 고르고, 그러면 예산 안에 드는 조합이 하나도 없을 때만
   * 화면과 같은 점수("base")로 다시 고른다 — 리뷰 좋은 메뉴를 먼저 넣어 보되, 비싼 메뉴만 몰려서
   * 화면이라면 보여 줬을 한상이 사라지는 일은 없게 한다. (리뷰 가중치가 0이면 두 번 모두 화면과 똑같다.)
   */
  const buildSets = (key: "score" | "base", want: { light: boolean; full: boolean }) => {
    let lightCount = 0;
    let fullCount = 0;
    const pick = (cats: string[], extra: (p: Item) => boolean, n: number) =>
      pool
        .filter((p) => cats.includes(p.group) && extra(p) && (!ofKind(cats) || (p.m.kind ?? "").includes(c.kind)))
        .sort((a, b) => b[key] - a[key] || a.m.price - b.m.price)
        .slice(0, n);
    const allMeals = pick(MEAL, () => true, 99);
    const meals = [...new Map(allMeals.map((p) => [mealType(p), p])).values()]
      .map((p) => allMeals.find((x) => mealType(x) === mealType(p))!)
      .slice(0, 7);
    const yori = pick(YORI, (p) => p.servingPeople >= 2, 6);
    const sides = pick(SIDE, (p) => p.m.price <= 20000, 4);
    const sideOptions: (Item | null)[] = c.party >= 3 || ofKind(SIDE) ? sides : [null];
    const lightSides = ofKind(SIDE) ? sides : namedSides.length ? namedSides.slice(0, 4) : sides;

    if (want.light && light && meals.length >= c.party) {
      for (const ms of combos(meals, c.party))
        for (const sd of lightSides) {
          const parts = [...ms.map((p) => ({ p, q: 1 })), { p: sd, q: 1 }];
          const total = parts.reduce((v, x) => v + x.p.m.price * x.q, 0);
          if (total > limit) continue;
          let score =
            parts.reduce((v, x) => v + x.p.score, 0) / parts.length +
            3 +
            0.7 * classicCount(ms) +
            (namedSides.includes(sd) || (sd.m.kind ?? "").includes(c.kind) ? 1 : 0);
          score += budgetFit(total);
          const mealNames = ms.map((p) => p.m.name).join("·");
          const reasons = [
            ...new Set([
              c.party === 1
                ? `${mealNames}에 ${sd.m.name}를 곁들이는 가벼운 구성이에요`
                : `${mealNames}에 ${sd.m.name}를 함께 나눠 먹는 가벼운 구성이에요`,
              ...parts.flatMap((x) => x.p.reasons),
            ]),
          ];
          if (limit < Infinity) reasons.push(budgetReason);
          candidates.push({
            mainId: sd.m.id,
            lines: parts.map((x) => ({ id: x.p.m.id, quantity: x.q })),
            total,
            score,
            reasons,
            set: true,
            light: true,
            type: "light",
          });
          lightCount++;
        }
    }
    // 혼자일 때는 한상 구성 없이 식사 위주로. 가벼운 구성을 원하면 요리가 든 한상도 만들지 않는다.
    if (want.full && c.party >= 2 && !light && meals.length >= mealKinds) {
      for (const ys of combos(yori, yoriCount))
        for (const ms of combos(meals, mealKinds))
          for (const sd of sideOptions) {
            const parts = [
              ...ys.map((p) => ({ p, q: 1 })),
              ...ms.map((p, i) => ({ p, q: Math.floor(c.party / mealKinds) + (i < c.party % mealKinds ? 1 : 0) })),
              ...(sd ? [{ p: sd, q: 1 }] : []),
            ];
            const lines = parts.map((x) => ({ id: x.p.m.id, quantity: x.q }));
            const total = parts.reduce((v, x) => v + x.p.m.price * x.q, 0);
            if (total > limit) continue;
            const types = new Set(ms.map(mealType)).size;
            let score =
              parts.reduce((v, x) => v + x.p.score, 0) / parts.length +
              3 +
              0.6 * types +
              0.7 * classicCount(ms) +
              0.4 * parts.filter((x) => x.p.badge).length;
            score += budgetFit(total);
            const names = (ps: Item[]) => ps.map((p) => p.m.name).join("·");
            const what = ys.length ? `${names(ys)}에 ${names(ms)}` : `${names(ms)}에 ${sd ? sd.m.name : ""}`;
            const reasons = [...new Set([`${what}처럼 여러 가지를 나눠 먹는 중식 한상 구성이에요`, ...parts.flatMap((x) => x.p.reasons)])];
            if (limit < Infinity) reasons.push(budgetReason);
            candidates.push({ mainId: (ys[0] ?? ms[0]).m.id, lines, total, score, reasons, set: true, type: "full_set" });
            fullCount++;
          }
    }
    return { lightCount, fullCount };
  };
  const first = buildSets("score", { light: true, full: true });
  if (first.lightCount === 0 || first.fullCount === 0) {
    buildSets("base", { light: first.lightCount === 0, full: first.fullCount === 0 });
  }

  // 서버만: 점주 추천 세트 — 세트 안 메뉴 하나라도 하드 필터에 걸리면 세트 전체를 뺀다(부분 노출 없음).
  for (const set of featuredSets) {
    if (set.items.length === 0 || !set.items.every(({ menu: m }) => allowed(m))) continue;
    const parts = set.items.map(({ menu: m, quantity }) => ({ item: itemById.get(m.id) ?? toItem(m), quantity }));
    const total = parts.reduce((v, x) => v + x.item.m.price * x.quantity, 0);
    if (total > limit) continue;
    const score = parts.reduce((v, x) => v + x.item.score, 0) / parts.length + W.owner + budgetFit(total);
    const reasons = [...new Set([`사장님이 추천하는 "${set.name}" 구성이에요`, ...parts.flatMap((x) => x.item.reasons)])];
    if (limit < Infinity) reasons.push(budgetReason);
    candidates.push({
      mainId: parts[0].item.m.id,
      lines: parts.map((x) => ({ id: x.item.m.id, quantity: x.quantity })),
      total,
      score,
      reasons,
      type: "owner_set",
      ownerSetLabel: set.name,
    });
  }

  // ---- 3개 고르기 (화면과 같은 규칙) ----
  const picked: Candidate[] = [];
  const used = new Set<number>();
  const usedMain = new Set<number>();
  // 원하는 종류가 있고 그 종류가 들어간 조합이 하나라도 있으면, 종류와 상관없는 조합은 보여 주지 않는다.
  const wantsKind = (r: Candidate) => c.kind === "상관없음" || r.lines.some((l) => kindOf(l.id).includes(c.kind));
  const kindPool = candidates.some(wantsKind) ? candidates.filter(wantsKind) : candidates;
  const named = pool.some((p) => p.keywords.some((k) => c.said.includes(k)));
  const meal = (r: Candidate) => r.lines.every((l) => MEAL.includes(groupOf(l.id)));
  const soloMeals = c.party === 1 && c.kind === "상관없음" && !named && !light && kindPool.some(meal);
  const mainItem = (r: Candidate) => itemById.get(r.mainId)!;
  const classicRank = (r: Candidate) => {
    const i = CLASSIC_RANK.indexOf(mealType(mainItem(r)));
    return i < 0 ? 9 : i;
  };
  const soloSorted = kindPool.filter(meal).sort((a, b) => b.score - a.score || classicRank(a) - classicRank(b));
  const lightPool = light ? kindPool.filter((r) => r.light) : [];
  const pool2 = lightPool.length
    ? lightPool
    : soloMeals
      ? [...new Map(soloSorted.map((r) => [mealType(mainItem(r)), r] as const).reverse()).values()]
          .reverse()
          .sort((a, b) => b.score - a.score || classicRank(a) - classicRank(b))
      : kindPool;
  const sorted = pool2.sort((a, b) => b.score - a.score);
  const firstSet = sorted.find((r) => r.set);
  if (firstSet) {
    picked.push(firstSet);
    usedMain.add(firstSet.mainId);
  }
  // 두 번째 구성은 첫 번째와 식사 구성 방식(면+밥, 면 2종, 밥 2종)이 다른 것이 먼저 오게 한다.
  const pattern = (r: Candidate) => r.lines.map((l) => groupOf(l.id)).filter((g) => MEAL.includes(g)).sort().join();
  if (firstSet) {
    const diff = sorted.filter((r) => r.set && pattern(r) !== pattern(firstSet));
    const rest = sorted.filter((r) => !diff.includes(r));
    sorted.splice(0, sorted.length, ...diff, ...rest);
  }
  const mealIds = (x: Candidate) => x.lines.filter((l) => MEAL.includes(groupOf(l.id))).map((l) => l.id).sort().join();
  for (const r of sorted) {
    if (picked.length === 3) break;
    if (picked.includes(r)) continue;
    if (r.set) {
      // 두 번째 한상은 요리도 식사 구성도 첫 번째와 달라야 한다.
      if (usedMain.has(r.mainId) || (!r.light && picked.filter((x) => x.set).length >= 2) || picked.some((x) => x.set && mealIds(x) === mealIds(r))) continue;
      picked.push(r);
      usedMain.add(r.mainId);
    } else {
      if (r.lines.some((l) => used.has(l.id))) continue;
      picked.push(r);
      r.lines.forEach((l) => used.add(l.id));
    }
  }
  // 혼자 드실 식사는 면만, 밥만 나오지 않게 면과 밥을 하나 이상씩 넣는다(요청 조건에 똑같이 맞을 때만).
  if (soloMeals) {
    for (const cat of MEAL) {
      const isCat = (r: Candidate) => groupOf(r.lines[0].id) === cat;
      const alt = pool2.find((r) => isCat(r) && !picked.includes(r));
      if (alt && !picked.some(isCat) && alt.score >= Math.min(...picked.map((r) => r.score))) {
        if (picked.length === 3) picked.pop();
        picked.push(alt);
      }
    }
  }
  // 한상 구성만 3개가 되지 않도록, 단품·두 메뉴 조합이 있으면 하나는 꼭 넣는다.
  const simple = sorted.find((r) => !r.set);
  if (!lightPool.length && simple && !picked.some((r) => !r.set)) {
    if (picked.length === 3) picked.pop();
    picked.push(simple);
  }

  return picked.map((r) => toRecommendedSet(r, menuById, vision, c));
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

function toRecommendedSet(
  r: Candidate,
  menuById: Map<number, MenuWithDetails>,
  vision: VisionEstimate,
  c: Cond,
): RecommendedSet {
  const main = menuById.get(r.mainId)!;
  const lines = r.lines.map((l) => ({ menu: menuById.get(l.id)!, quantity: l.quantity }));
  const others = lines.filter((l) => l.menu.id !== main.id).map((l) => l.menu);
  const all = lines.map((l) => l.menu);

  const matchedAttributes: string[] = [];
  if (
    vision.status === "ok" &&
    c.spicy === null &&
    (vision.age_bracket === "senior" || vision.age_bracket === "child")
  ) {
    matchedAttributes.push("비전 보조 신호: 순한 맛 위주로 가점 (보조 신호일 뿐, 참고용)");
  }
  const ev = evidenceStrength(main);
  matchedAttributes.push(
    ev.level === 2
      ? "리뷰/후기 근거 있음"
      : ev.level === 1
        ? "같은 종류 메뉴 전체에 대한 리뷰 근거만 있음"
        : "아직 리뷰/후기 근거 없음 (참고용)",
  );
  matchedAttributes.push(...main.flavor_tags, ...main.texture_tags);

  const cautions = all.flatMap((m) => m.ingredient_notices).map((n) => `${n.ingredient_name} (${ingredientNoticeLabel(n.status)})`);
  const evidences = all.flatMap((m) => m.evidences);
  const lastVerified = evidences
    .map((e) => e.verified_at ?? e.collected_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .reverse();

  return {
    main,
    sides: others,
    lines,
    total_price: r.total,
    set_type: r.type,
    matched_conditions: r.reasons,
    matched_attributes: Array.from(new Set(matchedAttributes)),
    cautions: Array.from(new Set(cautions)),
    evidence_sources: Array.from(new Set(evidences.map((e) => e.source_summary))),
    last_verified_at: lastVerified[0] ?? null,
    score: r.score,
    is_owner_pick: r.type === "owner_set" || main.is_featured,
    owner_set_label: r.ownerSetLabel ?? null,
  };
}
