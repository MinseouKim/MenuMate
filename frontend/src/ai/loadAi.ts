import { config } from '../config';
import { forcedOnlyAgeGate, silentSpeaker } from './fallback';
import type { AgeGate, AiModule, Speaker } from './types';

export interface AiServices { ageGate: AgeGate; speaker: Speaker; modelReady: boolean }

/**
 * @menumate/ai 를 불러와 판정기와 음성을 만든다. 무엇이 실패해도 reject하지 않는다.
 * 실패는 개발자 콘솔에만 남기고 화면에는 띄우지 않는다 (kiosk-flow 3장).
 */
export async function loadAi(): Promise<AiServices> {
  let mod: AiModule;
  try {
    mod = (await import('@menumate/ai')) as AiModule;
  } catch (e) {
    console.error('[ai] 모듈을 불러오지 못했습니다', e);
    return { ageGate: forcedOnlyAgeGate(), speaker: silentSpeaker, modelReady: false };
  }

  const [gate, speaker] = await Promise.all([
    mod.createAgeGate({
      faceModelUrl: config.faceModelUrl,
      ageModelUrl: config.ageModelUrl,
      mediapipeWasmUrl: config.mediapipeWasmUrl,
      ortWasmUrl: config.ortWasmUrl,
      stableFrames: config.aiStableFrames,
      minConfidence: config.aiMinConfidence,
      decideTimeoutMs: config.aiDecideTimeoutMs,
    }).catch((e: unknown) => {
      console.error('[ai] 연령 판정 모델을 불러오지 못했습니다. 터치와 단축키로만 진행합니다', e);
      return null;
    }),
    mod.createSpeaker({ lang: 'ko-KR', rate: config.ttsRate }).catch((e: unknown) => {
      console.error('[ai] 음성 안내를 쓸 수 없습니다', e);
      return silentSpeaker;
    }),
  ]);

  if (!speaker.available) console.warn('[ai] 로컬 한국어 음성이 없어 글자만 보여 줍니다');
  return { ageGate: gate ?? forcedOnlyAgeGate(), speaker, modelReady: gate !== null };
}
