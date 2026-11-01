// 말로 추천: 손님의 말을 조건으로 바꾸고 조합을 추천합니다.
// 이음새(seam)가 실제로 갈리는 곳입니다: 규칙 해석(항상 됨)과 서버 LLM 해석(되면 더 정확)이 같은 인터페이스를 채웁니다.
// 해석 규칙과 추천 점수는 기존 엔진(prototype/recommendation, parse)을 그대로 씁니다. 이미 테스트로 묶여 있습니다.
import { extractWithServer, mergeConditions } from '../prototype/aiClient';
import { KioskAI } from '../prototype/recommendation';
import type { Conditions, Menu, Recommendation } from './types';

export interface Recommender {
  /** 규칙으로 바로 읽습니다. 빈 문장이면 빈 조건(blank)입니다. */
  understand(text: string): Conditions;
  /** 서버 AI 로 더 정확히 읽습니다. 못 쓰거나 늦으면 null 이고, 화면은 규칙 결과를 그대로 씁니다. */
  refine(text: string, local: Conditions): Promise<Conditions | null>;
  recommend(conditions: Conditions, menus: readonly Menu[]): Recommendation[];
}

export const defaultRecommender: Recommender = {
  understand: text => KioskAI.extract(text),
  refine: async (text, local) => {
    const ai = await extractWithServer(text);
    return ai ? mergeConditions(local, ai) : null;
  },
  recommend: (conditions, menus) => KioskAI.recommend(conditions, [...menus]),
};
