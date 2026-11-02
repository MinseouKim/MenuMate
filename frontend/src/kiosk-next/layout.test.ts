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
    expect(askingOf('네, 이런 메뉴 어떠세요?')).toBe('other');
    expect(askingOf('어서 오세요!')).toBe('other');
    expect(askingOf(null)).toBe('other');
  });

  // 2026-11-02 배포 서버 Gemini가 실제로 한 말. 앞 문장(맞장구·상황)이 아니라 마지막 질문을 보고 골라야 한다.
  it('앞 문장이나 꾸밈말에 끌려가지 않고 마지막으로 묻는 것을 고른다', () => {
    expect(askingOf('화끈하게 매운 요리로 준비해 드릴게요, 면이나 밥 중에서 어떤 걸로 드시겠어요?')).toBe('kind');
    expect(askingOf('얼마나 매운 걸로 드릴까요? 면이나 밥 중 어떤 걸로 원하세요?')).toBe('kind');
    expect(askingOf('그럼 안 매운 국물 요리로 원하시는 면이나 밥 종류가 있으실까요?')).toBe('kind');
    expect(askingOf('아이와 함께 드시기 좋은 안 매운 요리로 골라드릴게요. 어떤 종류가 좋으신가요?')).toBe('kind');
    expect(askingOf('비 오는 저녁이네요, 따뜻한 국물 어떠세요? 몇 분이서 오셨나요?')).toBe('party');
    expect(askingOf('두 분이시군요! 매운 음식도 잘 드시나요?')).toBe('spicy');
    expect(askingOf('일행분 중에 매운 거 못 드시는 분 있나요?')).toBe('spicy');
    expect(askingOf('매운 걸 드시면 괜찮으세요?')).toBe('spicy');
    expect(askingOf('혹시 못 드시는 재료 있으세요?')).toBe('exclude');
    expect(askingOf('돼지고기는 빼 드릴까요?')).toBe('exclude');
  });
});
