// 음성 안내 (ai-output 계약 2장, D28). 기기 안에서 도는 한국어 음성(localService)만 쓴다.
// "Google 한국의"처럼 네트워크를 쓰는 음성은 고르지 않는다 (D32).

import type { Speaker, SpeakerConfig } from './types';

/** 알려진 OS 내장 한국어 음성. 앞에 있을수록 먼저 고른다. */
const PREFERRED_VOICES = [
  'yuna', '유나', // macOS (시스템 언어가 한국어면 '유나'로 나온다)
  'heami', '해미', // Windows (Microsoft Heami)
  'sora', '소라', // macOS 추가 음성
];

const VOICES_WAIT_MS = 1500;

export function pickLocalVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const prefix = lang.toLowerCase().split(/[-_]/)[0]!;
  const candidates = voices.filter(
    (v) => v.localService && v.lang.toLowerCase().replace('_', '-').split('-')[0] === prefix,
  );
  if (candidates.length === 0) return null;
  const rank = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    const i = PREFERRED_VOICES.findIndex((p) => name.includes(p));
    const preferred = i === -1 ? PREFERRED_VOICES.length : i;
    const exactLang = v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase() ? 0 : 1;
    return preferred * 2 + exactLang;
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b))[0]!;
}

/** Chrome은 처음에 빈 목록을 주고 voiceschanged 뒤에 채운다. */
async function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length > 0) return now;
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, VOICES_WAIT_MS);
    synth.addEventListener('voiceschanged', done);
  });
}

const silentSpeaker = (): Speaker => ({
  available: false,
  voiceName: null,
  speak: () => Promise.resolve(),
  cancel: () => {},
});

export async function createSpeaker(config: SpeakerConfig = {}): Promise<Speaker> {
  const lang = config.lang ?? 'ko-KR';
  const rate = config.rate ?? 0.85;
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return silentSpeaker();

  const voice = pickLocalVoice(await loadVoices(synth), lang);
  if (!voice) {
    console.warn(`[@menumate/ai] 기기 내장 ${lang} 음성이 없어 음성 안내를 끕니다. PM에게 알려 주세요.`);
    return silentSpeaker();
  }

  // 읽는 중인 문장의 resolve. utterance 참조도 들고 있어야 Chrome이 중간에 GC해서 end를 빠뜨리지 않는다.
  let current: { utterance: SpeechSynthesisUtterance; finish: () => void } | null = null;

  const finishCurrent = () => {
    const c = current;
    current = null;
    c?.finish();
  };

  return {
    available: true,
    voiceName: voice.name,
    speak(text) {
      finishCurrent();
      synth.cancel();
      if (!text.trim()) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = rate;
        const entry = { utterance, finish: resolve };
        const end = () => {
          if (current === entry) current = null;
          resolve();
        };
        utterance.onend = end;
        utterance.onerror = end; // cancel 때의 'interrupted'/'canceled'도 여기로 온다
        current = entry;
        synth.speak(utterance);
      });
    },
    cancel() {
      finishCurrent();
      synth.cancel();
    },
  };
}
