// 개발용 가짜 @menumate/ai (docs/contracts/ai-output.md 인터페이스).
// VITE_MOCK_AI=true 이면 vite.config.ts 가 '@menumate/ai' 를 이 파일로 연결한다. 운영 코드에서 직접 import하지 않는다.
import { forcedOnlyAgeGate } from '../ai/fallback';
import type { AgeGate, AgeGateConfig, FaceSignals, FaceSignalsConfig, Speaker, SpeakerConfig } from '../ai/types';

export async function createAgeGate(_config: AgeGateConfig): Promise<AgeGate> {
  // 실제 추론은 없다. Shift+S / Shift+N 단축키(force)로만 판정한다.
  return forcedOnlyAgeGate();
}

/** 가짜 불편 신호: 실제 판정은 없다. 개발 중 Shift+A(가까워짐)/Shift+Q(찌푸림)로 흉내 낸다. */
export async function createFaceSignals(_config: FaceSignalsConfig): Promise<FaceSignals> {
  const listeners = new Set<(s: 'approach' | 'squint') => void>();
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  return {
    start() {
      onKey = e => { if (e.shiftKey && !e.ctrlKey) { if (e.key === 'A') listeners.forEach(cb => cb('approach')); if (e.key === 'Q') listeners.forEach(cb => cb('squint')); } };
      window.addEventListener('keydown', onKey);
    },
    stop() { if (onKey) window.removeEventListener('keydown', onKey); onKey = null; },
    onSignal(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
}

export async function createSpeaker(config: SpeakerConfig = {}): Promise<Speaker> {
  const lang = config.lang ?? 'ko-KR';
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  const voices = synth ? await loadVoices(synth) : [];
  const voice = voices.find(v => v.localService && v.lang.replace('_', '-').startsWith(lang.slice(0, 2))) ?? null;
  return {
    available: voice !== null,
    voiceName: voice?.name ?? null,
    speak(text) {
      if (!synth || !voice) return Promise.resolve();
      synth.cancel();
      return new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = config.rate ?? 0.85;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.speak(u);
      });
    },
    cancel() {
      synth?.cancel();
    },
  };
}

function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise(resolve => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}
