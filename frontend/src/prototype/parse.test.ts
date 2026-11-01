import { describe, expect, it } from 'vitest';
import { matchMenus, negatedTerms, NOODLE, parseAmount, parseBudget, parseCount, parseParty, stripNegated } from './parse';

describe('parse', () => {
  it('reads amounts in digits and Korean', () => {
    expect(parseAmount('15,000원 이내로')).toBe(15000);
    expect(parseAmount('15000원')).toBe(15000);
    expect(parseAmount('1만5천원')).toBe(15000);
    expect(parseAmount('만 오천 원')).toBe(15000);
    expect(parseAmount('만원 이하로 먹고 싶어요')).toBe(10000);
    expect(parseAmount('이만원으로')).toBe(20000);
    expect(parseAmount('오천원')).toBe(5000);
    expect(parseAmount('총 3만원')).toBe(30000);
    expect(parseAmount('만두 먹고 싶어요')).toBeNull();
  });
  it('tells per-person budget from total budget', () => {
    expect(parseBudget('1인당 15,000원')).toEqual({ perPerson: 15000, total: null });
    expect(parseBudget('2명 총 3만원')).toEqual({ perPerson: null, total: 30000 });
    expect(parseBudget('다 해서 5만원 정도')).toEqual({ perPerson: null, total: 50000 });
    expect(parseBudget('만두 먹고 싶어요')).toEqual({ perPerson: null, total: null });
  });
  it('reads party size without mistaking "1인당" for one person', () => {
    expect(parseParty('1인당 2만원으로 네 명이요')).toBe(4);
    expect(parseParty('세 명이에요 해산물은 빼주세요')).toBe(3);
    expect(parseParty('2명이요')).toBe(2);
    expect(parseParty('둘이 왔어요')).toBe(2);
    expect(parseParty('면 먹고 싶어요')).toBe(1);
  });
  it('reads counts for spoken orders', () => {
    expect(parseCount('하가우 네 개 주세요')).toBe(4);
    expect(parseCount('소롱포 두 개')).toBe(2);
    expect(parseCount('홍게살 소롱포 2개')).toBe(2);
    expect(parseCount('트러플 쇼마이 하나')).toBe(1);
    expect(parseCount('베이징덕 한 마리')).toBe(1);
    expect(parseCount('하가우 다섯 개요')).toBe(5);
    expect(parseCount('하가우 주세요')).toBe(1);
    expect(parseCount('하가우 여러 개')).toBeNull();
  });
  it('links negation to the right ingredient only', () => {
    const terms = ['새우', '소고기', '돼지고기', '해산물', '오리'];
    expect(negatedTerms('새우 없는 딤섬', terms)).toEqual(['새우']);
    expect(negatedTerms('새우는 빼고 소고기는 좋아요', terms)).toEqual(['새우']);
    expect(negatedTerms('돼지고기 알레르기가 있어요 면 먹고 싶어요', terms)).toEqual(['돼지고기']);
    expect(negatedTerms('세 명이에요 해산물은 빼주세요', terms)).toEqual(['해산물']);
    expect(negatedTerms('오리 말고 다른 거', terms)).toEqual(['오리']);
    expect(negatedTerms('소고기 요리 좋아요', terms)).toEqual([]);
  });
  it('finds noodles without matching "~으면"', () => {
    expect(NOODLE.test('면 먹고 싶어요')).toBe(true);
    expect(NOODLE.test('짬뽕 먹고 싶어요')).toBe(true);
    expect(NOODLE.test('맛있으면 좋겠어요')).toBe(false);
    expect(NOODLE.test(stripNegated('짜장 말고 밥'))).toBe(false);
  });
  it('picks the longest overlapping menu name', () => {
    const menus = [{ name: '소롱포', aliases: ['소룡포'] }, { name: '홍게살 소롱포' }, { name: '쇼마이' }, { name: '트러플 쇼마이' }];
    expect(matchMenus('홍게살 소롱포 2개', menus).map(m => m.name)).toEqual(['홍게살 소롱포']);
    expect(matchMenus('소룡포 두 개', menus).map(m => m.name)).toEqual(['소롱포']);
    expect(matchMenus('트러플 쇼마이 하나', menus).map(m => m.name)).toEqual(['트러플 쇼마이']);
    expect(matchMenus('짬뽕 하나요', menus)).toEqual([]);
  });
});
