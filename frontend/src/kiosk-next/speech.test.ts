import { afterEach, describe, expect, it, vi } from 'vitest';
import { onSpeakingChange, speak, speakingText, stopSpeaking } from './speech';

afterEach(() => { stopSpeaking(); vi.restoreAllMocks(); });

describe('onSpeakingChange (화면의 "직원이 말하는 중" 표시)', () => {
  it('직원 음성이 시작될 때와 멈출 때 알리고, 지금 읽는 문장을 돌려준다', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const seen: string[] = [];
    const off = onSpeakingChange(() => seen.push(speakingText()));
    void speak('몇 분이서 오셨어요?');
    expect(speakingText()).toBe('몇 분이서 오셨어요?');
    stopSpeaking();
    off();
    void speak('네!');
    expect(seen).toEqual(['몇 분이서 오셨어요?', '']);
  });
});
