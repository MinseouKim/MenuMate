import { AGE_BANDS, type AgeBand, type AgeGate, type AgeGateUpdate, type Speaker } from './types';

/**
 * 카메라나 모델을 못 쓸 때 대신 쓰는 판정기. 스스로 판정하지 않고 force()만 동작한다.
 * 그래서 모델이 없어도 시연 단축키(Shift+S/N)로 흐름을 이어 갈 수 있다 (D15, D46).
 */
export function forcedOnlyAgeGate(): AgeGate {
  const listeners = new Set<(u: AgeGateUpdate) => void>();
  return {
    backend: 'wasm',
    start() {},
    stop() {},
    reset() {},
    // force('senior' | 'non_senior') 와 force(ageBand) 를 모두 받는다 (ai-output v2)
    force(target) {
      const ageBand = (AGE_BANDS as readonly string[]).includes(target) ? (target as AgeBand)
        : target === 'senior' ? '55plus' : undefined;
      const group = ageBand ? (ageBand === '55plus' ? 'senior' : 'non_senior') : target;
      listeners.forEach(cb => cb({ type: 'decided', group, ageBand, confidence: 1, source: 'forced' }));
    },
    onUpdate(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

/** TTS를 못 쓸 때: 글자만 보여 주고 흐름은 그대로 (kiosk-flow 3장) */
export const silentSpeaker: Speaker = {
  available: false,
  voiceName: null,
  speak: () => Promise.resolve(),
  cancel() {},
};
