import type { AgeBand, AnswerInput, Feature, MenuItem, Reason, Recommendation, Tag } from './contracts.js';
import { findEngineMenu, type Engine } from './engine.js';
import { QUESTIONS } from './questions.js';

export interface MenuItemWithAvailability extends MenuItem { isAvailable: boolean }

/** 태그 순서 (menu-schema.md 표 순서) */
export const TAGS: readonly Tag[] = ['spicy', 'mild', 'soup', 'soft', 'hearty'];
/** 특징 순서 (questions v2 이유 표 순서). reasons에서 기여가 같을 때 이 순서를 쓴다 */
export const FEATURES: readonly Feature[] = [...TAGS, 'light'];
export const AGE_BANDS: readonly AgeBand[] = ['under35', '35to54', '55plus'];

/** questions v2 (D82): priority 계수 1.5 → 0.5 */
const PRIORITY_WEIGHT = 0.5;
/** 특징 이유는 특징값이 이 값 이상일 때만 붙인다 */
const FEATURE_REASON_MIN = 0.5;
const AGE_FIT_REASON_MIN = 0.6;
const REVIEW_GOOD_MIN_REPUTATION = 0.7;
const REVIEW_GOOD_MIN_REVIEWS = 100;

function preferences(answers: AnswerInput[]): Map<Feature, number> {
  const prefs = new Map<Feature, number>();
  for (const a of answers) {
    if (a.answer === 'skip') continue;
    const q = QUESTIONS.find((x) => x.id === a.questionId);
    if (!q) continue;
    for (const [f, delta] of Object.entries(q.scores[a.answer]) as [Feature, number][]) {
      prefs.set(f, (prefs.get(f) ?? 0) + delta);
    }
  }
  return prefs;
}

function toMenuItem({ isAvailable: _, ...item }: MenuItemWithAvailability): MenuItem {
  return item;
}

export interface RecommendOptions {
  limit?: number;
  /** 엔진 결과. 없으면 v1 방식 (특징값 = 태그 1/0) */
  engine?: Engine | null;
  /** 연령대. 없으면 연령대 적합 점수와 age_fit 이유를 넣지 않는다 (items용) */
  band?: AgeBand;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * docs/contracts/questions.md v2 "추천 점수 계산"과 "추천 이유".
 * score = Σ prefs[f] × feature[f] + W_age × (ageFit[band] − 0.5) + W_rep × (평판 − 0.5) + priority × 0.5
 * 엔진에 없는 메뉴(또는 엔진 없음): feature = 태그 1/0 (light는 0), 연령대·평판 항은 0
 */
export function recommend(menus: MenuItemWithAvailability[], answers: AnswerInput[], opts: RecommendOptions = {}): Recommendation[] {
  const { limit = 3, engine, band } = opts;
  const prefs = preferences(answers);
  return menus
    .filter((m) => m.isAvailable)
    .map((m) => {
      const em = engine ? findEngineMenu(engine, m) : undefined;
      const feature = (f: Feature) => em?.features[f] ?? ((m.tags as Feature[]).includes(f) ? 1 : 0);
      const parts = FEATURES.map((f) => ({ f, feature: feature(f), value: (prefs.get(f) ?? 0) * feature(f) }));
      let score = parts.reduce((s, p) => s + p.value, 0) + m.priority * PRIORITY_WEIGHT;
      const reasons: Reason[] = parts
        .filter((p) => (prefs.get(p.f) ?? 0) > 0 && p.feature >= FEATURE_REASON_MIN)
        .sort((a, b) => b.value - a.value || FEATURES.indexOf(a.f) - FEATURES.indexOf(b.f))
        .map((p) => p.f);
      if (em && engine) {
        if (band) score += engine.weights.ageFit * (em.ageFit[band] - 0.5);
        score += engine.weights.reputation * (em.reputation - 0.5);
        if (band && em.ageFitBasis === 'stats' && em.ageFit[band] >= AGE_FIT_REASON_MIN) reasons.push('age_fit');
        if (em.reputation >= REVIEW_GOOD_MIN_REPUTATION && em.reviewCount >= REVIEW_GOOD_MIN_REVIEWS) reasons.push('review_good');
      }
      if (m.priority > 0) reasons.push('store_pick');
      return { m, score: round3(score), reasons };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.m.priority - a.m.priority ||
        a.m.sortOrder - b.m.sortOrder ||
        (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0),
    )
    .slice(0, limit)
    .map(({ m, score, reasons }) => ({ menu: toMenuItem(m), score, reasons }));
}
