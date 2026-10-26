import type { AgeBand, AnswerInput, MenuItem, Reason, Recommendation, Tag } from './contracts.js';
import { findEngineMenu, type Engine } from './engine.js';
import { QUESTIONS } from './questions.js';

export interface MenuItemWithAvailability extends MenuItem { isAvailable: boolean }

/** 태그 순서 (menu-schema.md 표 순서). reasons에서 기여가 같을 때 이 순서를 쓴다 */
export const TAGS: readonly Tag[] = ['spicy', 'mild', 'soup', 'soft', 'hearty'];

export const AGE_BANDS: readonly AgeBand[] = ['under35', '35to54', '55plus'];

const PRIORITY_WEIGHT = 1.5;

function preferences(answers: AnswerInput[]): Map<Tag, number> {
  const prefs = new Map<Tag, number>();
  for (const a of answers) {
    if (a.answer === 'skip') continue;
    const q = QUESTIONS.find((x) => x.id === a.questionId);
    if (!q) continue;
    for (const [tag, delta] of Object.entries(q.scores[a.answer]) as [Tag, number][]) {
      prefs.set(tag, (prefs.get(tag) ?? 0) + delta);
    }
  }
  return prefs;
}

function toMenuItem({ isAvailable: _, ...item }: MenuItemWithAvailability): MenuItem {
  return item;
}

export interface RecommendOptions {
  limit?: number;
  /** 엔진 결과. 없으면 v1 점수 */
  engine?: Engine | null;
  /** 연령대. 없으면 연령대 적합 점수를 넣지 않는다 (items용) */
  band?: AgeBand;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * docs/contracts/questions.md "추천 점수 계산" + v2 엔진 (v2-changes 3·5장).
 * 엔진에 매칭된 메뉴: Σ prefs[f] × 특징값[f] + w.ageFit × (ageFit[band] − 0.5) + w.reputation × (평판 − 0.5) + priority × 1.5
 * 매칭 안 된 메뉴(또는 엔진 없음): v1 그대로 (특징값 = 태그 1/0, 연령대·평판 중립)
 */
export function recommend(menus: MenuItemWithAvailability[], answers: AnswerInput[], opts: RecommendOptions = {}): Recommendation[] {
  const { limit = 3, engine, band } = opts;
  const prefs = preferences(answers);
  return menus
    .filter((m) => m.isAvailable)
    .map((m) => {
      const em = engine ? findEngineMenu(engine, m) : undefined;
      const feature = (t: Tag) => em?.features[t] ?? (m.tags.includes(t) ? 1 : 0);
      const contributions = TAGS.map((t) => ({ tag: t, value: (prefs.get(t) ?? 0) * feature(t) }));
      let score = contributions.reduce((s, c) => s + c.value, 0) + m.priority * PRIORITY_WEIGHT;
      if (em && engine) {
        if (band) score += engine.weights.ageFit * (em.ageFit[band] - 0.5);
        score += engine.weights.reputation * (em.reputation - 0.5);
      }
      const reasons: Reason[] = contributions
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value || TAGS.indexOf(a.tag) - TAGS.indexOf(b.tag))
        .map((c) => c.tag);
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
