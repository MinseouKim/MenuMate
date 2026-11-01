import { config } from '../config';
import { silentSpeaker } from './fallback';
import type { AgeGate, AiModule, FaceSignals, Speaker } from './types';

/** 음성과 판정기는 따로 준비된다. 나이 추정 모델을 기다리는 동안에도 음성과 화면은 쓸 수 있어야 한다 (D46) */
export interface AiLoad {
  speaker: Promise<Speaker>;              // 실패해도 reject하지 않고 silentSpeaker
  ageGate: Promise<AgeGate | null>;       // 실패하면 null. 그동안 화면은 터치와 단축키로 진행한다
  /** 불편 신호(얼굴 접근·찌푸림). 실패하거나 꺼져 있으면 null — 큰 글씨 제안만 없어진다 */
  faceSignals: Promise<FaceSignals | null>;
  /** 연령 판정과 불편 신호가 같은 카메라 영상을 쓰도록 공유한다 */
  video: { current: HTMLVideoElement | null };
}

/**
 * @menumate/ai 를 불러와 판정기와 음성을 만든다. 무엇이 실패해도 reject하지 않는다.
 * 실패는 개발자 콘솔에만 남기고 화면에는 띄우지 않는다 (kiosk-flow 3장).
 */
let loading: AiLoad | null = null;

/** 앱이 살아 있는 동안 한 번만 불러온다. 개발 모드(StrictMode)에서 effect 가 두 번 돌아도 큰 모델을 두 번 받지 않는다 */
export function loadAi(): AiLoad {
  loading ??= startLoading();
  return loading;
}

function startLoading(): AiLoad {
  const mod = (import('@menumate/ai') as Promise<AiModule>).catch((e: unknown) => {
    console.error('[ai] 모듈을 불러오지 못했습니다', e);
    return null;
  });

  const speaker = mod.then(m => m?.createSpeaker({ lang: 'ko-KR', rate: config.ttsRate }) ?? silentSpeaker)
    .catch((e: unknown) => {
      console.error('[ai] 음성 안내를 쓸 수 없습니다', e);
      return silentSpeaker;
    })
    .then(s => {
      if (!s.available) console.warn('[ai] 로컬 한국어 음성이 없어 글자만 보여 줍니다');
      return s;
    });

  const ageGate = mod.then(m => m?.createAgeGate({
    faceModelUrl: config.faceModelUrl,
    ageModelUrl: config.ageModelUrl,
    mediapipeWasmUrl: config.mediapipeWasmUrl,
    ortWasmUrl: config.ortWasmUrl,
    stableFrames: config.aiStableFrames,
    minConfidence: config.aiMinConfidence,
    decideTimeoutMs: config.aiDecideTimeoutMs,
    noFaceGraceMs: config.aiNoFaceGraceMs,
  }) ?? null).catch((e: unknown) => {
    console.error('[ai] 연령 판정 모델을 불러오지 못했습니다. 터치와 단축키로만 진행합니다', e);
    return null;
  });

  const faceSignals: Promise<FaceSignals | null> = !config.faceSignals
    ? Promise.resolve(null)
    : mod.then(m => m?.createFaceSignals({ landmarkerModelUrl: config.landmarkerModelUrl, mediapipeWasmUrl: config.mediapipeWasmUrl, fps: 2 }) ?? null)
      .catch((e: unknown) => {
        console.warn('[ai] 불편 신호 모델을 불러오지 못했습니다. 큰 글씨 제안 없이 진행합니다', e);
        return null;
      });

  return { speaker, ageGate, faceSignals, video: { current: null } };
}
