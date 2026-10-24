// 추론 루프와 이벤트 배달. 얼굴 검출기와 나이 추정기를 주입받아 브라우저 없이도 테스트할 수 있다.
// 실제 MediaPipe·ONNX 구현은 createAgeGate.ts.

import { ageGateReducer, initialAgeGateState } from './ageGateReducer';
import { frameConfidence, type Box } from './ageModels';
import type { AgeGate, AgeGateRules, AgeGateUpdate, AgeGroup, FaceObservation } from './types';

export interface FaceDetection {
  box: Box;      // 영상 픽셀 좌표
  score: number; // 0~1
}

export interface FaceDetector {
  detect(video: HTMLVideoElement, timestampMs: number): FaceDetection[];
  close(): void;
}

export interface AgeEstimator {
  readonly backend: 'webgpu' | 'wasm';
  /** 얼굴 영역의 추정 나이. 이 값은 모듈 밖으로 내보내지 않는다 (D2). */
  estimate(video: HTMLVideoElement, face: Box): Promise<number>;
  close(): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const browserClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface AgeGateCoreOptions {
  rules: AgeGateRules;
  fps: number;
  clock?: Clock;
}

function videoReady(video: HTMLVideoElement): boolean {
  return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

export function createAgeGateCore(
  detector: FaceDetector,
  estimator: AgeEstimator,
  options: AgeGateCoreOptions,
): AgeGate & { dispose(): void } {
  const clock = options.clock ?? browserClock;
  const intervalMs = 1000 / Math.max(0.5, options.fps);
  const listeners = new Set<(u: AgeGateUpdate) => void>();

  let state = initialAgeGateState();
  let video: HTMLVideoElement | null = null;
  let running = false;
  let timer: unknown = null;
  let busy = false;
  /** reset()마다 올린다. 추론 도중 reset되면 그 프레임 결과를 버린다. */
  let generation = 0;
  let failing = false;

  const emit = (u: AgeGateUpdate) => {
    for (const cb of [...listeners]) {
      try {
        cb(u);
      } catch (e) {
        console.error('[@menumate/ai] onUpdate 콜백 오류', e);
      }
    }
  };

  const schedule = (ms: number) => {
    if (!running || timer !== null) return;
    timer = clock.setTimeout(() => {
      timer = null;
      void tick();
    }, ms);
  };

  async function tick() {
    if (!running || busy) return;
    const startedAt = clock.now();
    const finished = state.phase === 'decided' || state.phase === 'timeout';
    if (video && !finished && videoReady(video)) {
      busy = true;
      const gen = generation;
      try {
        const faces = await observe(video, startedAt);
        if (gen === generation && running) {
          const r = ageGateReducer(state, { t: startedAt, faces }, options.rules);
          state = r.state;
          failing = false;
          if (r.update) emit(r.update);
        }
      } catch (e) {
        // 연속 실패 중에는 첫 번째만 알린다. 루프는 계속 돈다.
        if (!failing && gen === generation) {
          failing = true;
          emit({ type: 'error', code: 'inference_failed', message: e instanceof Error ? e.message : String(e) });
        }
      } finally {
        busy = false;
      }
    }
    schedule(Math.max(0, intervalMs - (clock.now() - startedAt)));
  }

  /** 가장 큰 얼굴 1개만 나이를 추정한다 (D18). 프레임 이미지는 여기서 끝나고 남기지 않는다 (D2). */
  async function observe(v: HTMLVideoElement, t: number): Promise<FaceObservation[]> {
    const detections = detector.detect(v, t);
    let largest: FaceDetection | null = null;
    for (const d of detections) {
      if (!largest || d.box.width * d.box.height > largest.box.width * largest.box.height) largest = d;
    }
    if (!largest) return [];
    const age = await estimator.estimate(v, largest.box);
    return [
      {
        area: largest.box.width * largest.box.height,
        age,
        confidence: frameConfidence(largest.score, largest.box.width),
      },
    ];
  }

  return {
    get backend() {
      return estimator.backend;
    },
    start(v) {
      video = v;
      if (running) return;
      running = true;
      schedule(0);
    },
    stop() {
      running = false;
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    },
    reset() {
      generation++;
      state = initialAgeGateState();
      failing = false;
    },
    force(group: AgeGroup) {
      // 시연용 (D24). 언제든 즉시 확정하고, reset() 전까지 모델 판정은 멈춘다.
      generation++;
      state = { ...initialAgeGateState(), phase: 'decided', runGroup: group };
      emit({ type: 'decided', group, confidence: 1, source: 'forced' });
    },
    onUpdate(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    dispose() {
      this.stop();
      listeners.clear();
      video = null;
      detector.close();
      estimator.close();
    },
  };
}
