import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSpeechSttProvider } from './webSpeechSttProvider';

afterEach(() => { vi.unstubAllGlobals(); });

describe('WebSpeechSttProvider 중간 결과의 확정 여부', () => {
  it('들은 말이 모두 확정(isFinal)이면 onInterim 둘째 값으로 true, 아직 말하는 중인 조각이 있으면 false', () => {
    let rec!: { onresult: (e: unknown) => void };
    vi.stubGlobal('SpeechRecognition', class { lang = ''; continuous = false; interimResults = false; onresult = null; onerror = null; onend = null; constructor() { rec = this as never; } start() {} stop() {} abort() {} });
    const seen: [string, boolean | undefined][] = [];
    new WebSpeechSttProvider().start({ onResult: () => {}, onInterim: (t, final) => seen.push([t, final]), onError: () => {}, onEnd: () => {} });
    const r = (t: string, isFinal: boolean) => Object.assign([{ transcript: t }], { isFinal });
    rec.onresult({ results: [r('두 명', false)] });
    rec.onresult({ results: [r('두 명이에요', true)] });
    rec.onresult({ results: [r('두 명이에요', true), r(' 아이', false)] });
    expect(seen).toEqual([['두 명', false], ['두 명이에요', true], ['두 명이에요 아이', false]]);
  });
});
