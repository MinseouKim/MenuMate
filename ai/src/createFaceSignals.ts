// 브라우저 구현: MediaPipe Face Landmarker(블렌드셰이프)로 얼굴 크기 비율과 눈 찌푸림 값을 2fps로 읽어
// faceSignalsCore 에 넘긴다. 랜드마크 좌표·이미지는 이 파일 밖으로 나가지 않는다 (D2 확장, 2026-11-02).
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { DEFAULT_SIGNAL_RULES, initialSignalState, signalReducer, type FaceSignal, type SignalRules, type SignalState } from './faceSignalsCore';
import { AgeGateError } from './types';

export interface FaceSignalsConfig {
  /** 예: "/models/face/face_landmarker.task" */
  landmarkerModelUrl: string;
  mediapipeWasmUrl: string;
  fps?: number;
  rules?: Partial<SignalRules>;
}

export interface FaceSignals {
  start(video: HTMLVideoElement): void;
  stop(): void;
  onSignal(cb: (s: FaceSignal) => void): () => void;
}

const SQUINT_NAMES = new Set(['eyeSquintLeft', 'eyeSquintRight']);

export async function createFaceSignals(config: FaceSignalsConfig): Promise<FaceSignals> {
  let landmarker: FaceLandmarker;
  try {
    const fileset = await FilesetResolver.forVisionTasks(config.mediapipeWasmUrl.replace(/\/$/, ''));
    const create = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: config.landmarkerModelUrl, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });
    landmarker = await create('GPU').catch(() => create('CPU'));
  } catch (e) {
    throw new AgeGateError('model_load_failed', `얼굴 신호 모델을 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }

  const rules: SignalRules = { ...DEFAULT_SIGNAL_RULES, ...(config.rules ?? {}) };
  const intervalMs = 1000 / Math.max(0.5, config.fps ?? 2);
  const listeners = new Set<(s: FaceSignal) => void>();
  let state: SignalState = initialSignalState();
  let video: HTMLVideoElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastTs = 0;

  function observe(v: HTMLVideoElement, t: number) {
    if (v.readyState < 2 || !v.videoWidth) return;
    const ts = Math.max(Math.round(t), lastTs + 1);
    lastTs = ts;
    const res = landmarker.detectForVideo(v, ts);
    const lm = res.faceLandmarks[0];
    if (!lm || lm.length === 0) {
      ({ state } = signalReducer(state, { t, faceRatio: null, squint: null }, rules));
      return;
    }
    // 랜드마크 바운딩 박스 → 영상 대비 면적 비율만 남긴다
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of lm) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const faceRatio = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    const shapes = res.faceBlendshapes?.[0]?.categories ?? [];
    const squints = shapes.filter((c) => SQUINT_NAMES.has(c.categoryName)).map((c) => c.score);
    const squint = squints.length ? squints.reduce((a, b) => a + b, 0) / squints.length : null;
    const out = signalReducer(state, { t, faceRatio, squint }, rules);
    state = out.state;
    if (out.signal) listeners.forEach((cb) => cb(out.signal!));
  }

  function tick() {
    if (!video) return;
    const started = performance.now();
    try {
      observe(video, started);
    } catch {
      // 한 프레임 실패는 넘어간다
    }
    timer = setTimeout(tick, Math.max(0, intervalMs - (performance.now() - started)));
  }

  return {
    start(v) {
      video = v;
      state = initialSignalState();
      if (timer === null) tick();
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      video = null;
    },
    onSignal(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
