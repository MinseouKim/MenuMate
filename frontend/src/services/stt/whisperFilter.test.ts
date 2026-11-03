import { describe, expect, it } from 'vitest';
import { isHallucination, speechLike } from './whisperFilter';

const RATE = 16000;
/** 초 단위 길이의 소리. f(t)가 각 샘플 값 */
const sound = (seconds: number, f: (t: number, i: number) => number) => Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => f(i / RATE, i));
const voice = (amp: number) => (t: number) => amp * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t));
const join = (...parts: Float32Array[]) => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };

describe('speechLike (녹음에 말소리가 있었는지, 2026-11-03 Whisper 환각 버그)', () => {
  it('아주 조용하거나 낮은 잡음뿐이면 말소리가 아니다', () => {
    expect(speechLike(sound(2, () => 0))).toBe(false);
    expect(speechLike(sound(2, (_, i) => ((i * 7919) % 13 - 6) / 2000))).toBe(false); // ±0.003 잡음
  });
  it('딸깍 한 번(짧고 센 소리)은 말소리가 아니다', () => {
    expect(speechLike(join(sound(1, () => 0), sound(0.01, () => 0.6), sound(1, () => 0)))).toBe(false);
  });
  it('짧은 답("네" 정도 0.25초)도 조용한 앞뒤 사이에 있으면 말소리로 본다', () => {
    expect(speechLike(join(sound(0.8, () => 0), sound(0.25, voice(0.08)), sound(0.8, () => 0)))).toBe(true);
    expect(speechLike(sound(1.2, voice(0.15)))).toBe(true);
  });
});

describe('isHallucination (소리 없을 때 Whisper가 지어내는 문장)', () => {
  it('영상·시청·구독·자막·방송 인사, 혼자 나온 "감사합니다", 같은 말 되풀이는 지어낸 문장', () => {
    for (const t of [
      '이 영상은 이 영상에서 영상에서 만나요!', '다음 영상에서 만나요', '시청해 주셔서 감사합니다', '시청해주셔서 감사합니다.',
      '구독과 좋아요 부탁드립니다', '자막 제공 및 자막 편집', 'MBC 뉴스 김철수입니다', '감사합니다.', '고맙습니다',
      '그래서 그래서 그래서 그래서', '네 네 네 네 네', '여러분 안녕하세요 채널에 오신 걸 환영합니다',
    ]) expect(isHallucination(t), t).toBe(true);
  });
  it('실제 짧은 답이나 주문 문장은 버리지 않는다', () => {
    for (const t of ['네', '두 명', '두 명이에요', '혼자 왔어요', '아니요', '네 감사합니다 두 명이요', '짬뽕 두 개랑 탕수육 하나 주세요', '매운 건 못 먹어요', '네 네', '짜장 짜장면 주세요', '짬뽕 하나 짜장 하나 탕수육 하나', '매운 거 하나 안 매운 거 하나 덜 매운 거 하나'])
      expect(isHallucination(t), t).toBe(false);
  });
});
