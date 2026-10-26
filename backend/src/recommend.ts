import type { AgeBand, AnswerInput, MenuItem, Reason, Recommendation, Tag } from './contracts.js';
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

/** docs/contracts/questions.md "추천 점수 계산" */
export function recommend(menus: MenuItemWithAvailability[], answers: AnswerInput[], limit = 3): Recommendation[] {
  const prefs = preferences(answers);
  return menus
    .filter((m) => m.isAvailable)
    .map((m) => {
      const contributions = m.tags.map((t) => ({ tag: t, value: prefs.get(t) ?? 0 }));
      const score = contributions.reduce((s, c) => s + c.value, 0) + m.priority * PRIORITY_WEIGHT;
      const reasons: Reason[] = contributions
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value || TAGS.indexOf(a.tag) - TAGS.indexOf(b.tag))
        .map((c) => c.tag);
      if (m.priority > 0) reasons.push('store_pick');
      return { m, score, reasons };
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
