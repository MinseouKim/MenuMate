import type { Answer, Feature, Question } from './contracts.js';

export interface QuestionDef extends Question {
  /** 답별 태그 점수. skip은 점수 없음 */
  scores: Record<Exclude<Answer, 'skip'>, Partial<Record<Feature, number>>>;
}

/** docs/contracts/questions.md v2 (D82). 질문 데이터의 원본은 여기 한 곳이다. */
export const QUESTIONS: readonly QuestionDef[] = [
  { id: 'q_spicy', order: 1, text: '매운 음식도 괜찮으세요?', scores: { yes: { spicy: 2, mild: -1 }, no: { spicy: -3, mild: 1 } } },
  { id: 'q_soup', order: 2, text: '따뜻한 국물 요리가 좋으세요?', scores: { yes: { soup: 2 }, no: { soup: -1 } } },
  { id: 'q_soft', order: 3, text: '부드러운 음식이 좋으세요?', scores: { yes: { soft: 2 }, no: {} } },
  { id: 'q_hearty', order: 4, text: '든든하게 드시고 싶으세요?', scores: { yes: { hearty: 2 }, no: { hearty: -1 } } },
  { id: 'q_light', order: 5, text: '담백한 맛이 좋으세요?', scores: { yes: { light: 2 }, no: { light: -1 } } },
];

export function toQuestion(q: QuestionDef): Question {
  return { id: q.id, order: q.order, text: q.text };
}
