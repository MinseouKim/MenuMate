import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker, pickLocalVoice } from './createSpeaker';

const voice = (name: string, lang: string, localService: boolean) =>
  ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

const YUNA = voice('Yuna', 'ko-KR', true);
const GOOGLE_KO = voice('Google 한국의', 'ko-KR', false);
const HEAMI = voice('Microsoft Heami - Korean (Korean)', 'ko-KR', true);
const SAMANTHA = voice('Samantha', 'en-US', true);

class FakeUtterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function installSynth(voices: SpeechSynthesisVoice[], opts: { lateVoices?: boolean } = {}) {
  let list = opts.lateVoices ? [] : voices;
  const listeners = new Set<() => void>();
  const spoken: FakeUtterance[] = [];
  const synth = {
    getVoices: () => list,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
    cancel: vi.fn(() => {
      // 실제 브라우저처럼 읽던 문장에 error(interrupted)를 보낸다
      const u = spoken.at(-1);
      u?.onerror?.();
    }),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return {
    synth,
    spoken,
    fireVoicesChanged() {
      list = voices;
      for (const cb of [...listeners]) cb();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('pickLocalVoice', () => {
  it('네트워크 음성은 고르지 않는다 (D28)', () => {
    expect(pickLocalVoice([GOOGLE_KO, SAMANTHA], 'ko-KR')).toBeNull();
  });
  it('macOS Yuna를 고른다', () => {
    expect(pickLocalVoice([SAMANTHA, GOOGLE_KO, YUNA], 'ko-KR')).toBe(YUNA);
  });
  it('한국어 이름(유나)으로 나와도 우선 고른다', () => {
    const yunaKo = voice('유나', 'ko-KR', true);
    const other = voice('Some Korean', 'ko-KR', true);
    expect(pickLocalVoice([other, yunaKo], 'ko-KR')).toBe(yunaKo);
  });
  it('Windows Heami를 고른다', () => {
    expect(pickLocalVoice([GOOGLE_KO, HEAMI], 'ko-KR')).toBe(HEAMI);
  });
  it('모르는 이름이어도 로컬 한국어 음성이면 쓴다', () => {
    const other = voice('Some Korean', 'ko_KR', true);
    expect(pickLocalVoice([SAMANTHA, other], 'ko-KR')).toBe(other);
  });
});

describe('createSpeaker', () => {
  it('로컬 한국어 음성이 없으면 available=false이고 speak는 바로 끝난다', async () => {
    installSynth([GOOGLE_KO, SAMANTHA]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await createSpeaker();
    expect(s.available).toBe(false);
    expect(s.voiceName).toBeNull();
    await expect(s.speak('안녕하세요')).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('speechSynthesis가 없으면 available=false', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect((await createSpeaker()).available).toBe(false);
  });

  it('음성 목록이 늦게 와도 기다렸다가 고른다', async () => {
    const env = installSynth([YUNA], { lateVoices: true });
    const p = createSpeaker();
    env.fireVoicesChanged();
    const s = await p;
    expect(s.voiceName).toBe('Yuna');
  });

  it('느린 속도로 읽고, 다 읽으면 resolve한다', async () => {
    const env = installSynth([YUNA]);
    const s = await createSpeaker({ rate: 0.8 });
    const p = s.speak('매운 음식도 괜찮으세요?');
    const u = env.spoken[0]!;
    expect(u.text).toBe('매운 음식도 괜찮으세요?');
    expect(u.voice).toBe(YUNA);
    expect(u.rate).toBe(0.8);
    u.onend?.();
    await expect(p).resolves.toBeUndefined();
  });

  it('기본 속도는 0.85', async () => {
    const env = installSynth([YUNA]);
    const s = await createSpeaker();
    void s.speak('네');
    expect(env.spoken[0]!.rate).toBe(0.85);
  });

  it('cancel하면 읽던 speak가 resolve된다', async () => {
    installSynth([YUNA]);
    const s = await createSpeaker();
    const p = s.speak('든든하게 드시고 싶으세요?');
    s.cancel();
    await expect(p).resolves.toBeUndefined();
  });

  it('새로 speak하면 이전 문장을 끊고 이전 Promise도 resolve한다', async () => {
    const env = installSynth([YUNA]);
    const s = await createSpeaker();
    const first = s.speak('첫 번째');
    const second = s.speak('두 번째');
    await expect(first).resolves.toBeUndefined();
    expect(env.synth.cancel).toHaveBeenCalled();
    env.spoken[1]!.onend?.();
    await expect(second).resolves.toBeUndefined();
  });

  it('빈 문장은 읽지 않는다', async () => {
    const env = installSynth([YUNA]);
    const s = await createSpeaker();
    await s.speak('  ');
    expect(env.synth.speak).not.toHaveBeenCalled();
  });
});
