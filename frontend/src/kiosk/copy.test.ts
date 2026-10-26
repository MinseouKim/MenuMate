import { describe, expect, it } from 'vitest';
import { questionLines, reasonsText } from './copy';

describe('질문 줄 끊기 (design/copy.md 3장)', () => {
  it('정한 낱말 뒤에서 두 줄로', () => {
    expect(questionLines({ id: 'q_spicy', text: '매운 음식도 괜찮으세요?' })).toEqual(['매운 음식도', '괜찮으세요?']);
    expect(questionLines({ id: 'q_soup', text: '따뜻한 국물이 있는 음식이 좋으세요?' })).toEqual(['따뜻한 국물이 있는', '음식이 좋으세요?']);
    expect(questionLines({ id: 'q_hearty', text: '든든하게 드시고 싶으세요?' })).toEqual(['든든하게', '드시고 싶으세요?']);
  });

  it('모르는 질문이나 낱말이 모자라면 끊지 않는다', () => {
    expect(questionLines({ id: 'q_new', text: '새 질문이에요?' })).toEqual(['새 질문이에요?']);
    expect(questionLines({ id: 'q_soup', text: '짧은 질문?' })).toEqual(['짧은 질문?']);
  });
});

describe('추천 이유', () => {
  it('앞에서 2개까지 쉼표로', () => {
    expect(reasonsText(['soft', 'spicy', 'store_pick'])).toBe('부드러운 식감, 매콤한 맛');
    expect(reasonsText([])).toBe('');
  });
});
