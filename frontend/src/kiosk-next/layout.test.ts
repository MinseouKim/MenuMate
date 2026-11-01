import { describe, expect, it } from 'vitest';
import { askingOf, resolveRecommendLayout } from './layout';

describe('resolveRecommendLayout', () => {
  it('주소 ?rec= 가 환경 변수보다 우선하고, 둘 다 없으면 a', () => {
    expect(resolveRecommendLayout('?rec=b', 'c')).toBe('b');
    expect(resolveRecommendLayout('?x=1', 'c')).toBe('c');
    expect(resolveRecommendLayout('', undefined)).toBe('a');
    expect(resolveRecommendLayout('?rec=zzz', 'nope')).toBe('a');
    expect(resolveRecommendLayout('?rec=C', ' B ')).toBe('c');
  });
});

describe('askingOf', () => {
  it('직원 AI 질문이 무엇을 묻는지 가른다', () => {
    expect(askingOf('함께 오신 분은 몇 분이신가요?')).toBe('party');
    expect(askingOf('매운 음식도 괜찮으세요?')).toBe('spicy');
    expect(askingOf('면이 좋으세요, 밥이 좋으세요?')).toBe('kind');
    expect(askingOf('빼야 할 재료가 있을까요?')).toBe('exclude');
    expect(askingOf('어떤 종류가 좋으신가요?')).toBe('kind');
    expect(askingOf('화끈하게 매운 요리로 준비해 드릴게요, 면이나 밥 중에서 어떤 걸로 드시겠어요?')).toBe('spicy');
    expect(askingOf('네, 이런 메뉴 어떠세요?')).toBe('other');
    expect(askingOf('어서 오세요!')).toBe('other');
    expect(askingOf(null)).toBe('other');
  });
});
