// 브라우저 구현: MediaPipe Face Detector + ONNX Runtime Web 나이 추정 (D27, D35).
// 모델과 WASM은 config의 로컬 URL에서만 받는다 (D32).

import { FaceDetector as MpFaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
import { createAgeGateCore, type AgeEstimator, type FaceDetector } from './ageGateCore';
import { findAgeModel, rgbaToTensor, squareCrop, type AgeModelSpec, type Box } from './ageModels';
import { resolveFps, resolveRules } from './resolveRules';
import { AgeGateError, type AgeGate, type AgeGateConfig } from './types';

export async function createAgeGate(config: AgeGateConfig): Promise<AgeGate> {
  if (typeof WebAssembly !== 'object') {
    throw new AgeGateError('backend_unsupported', '이 브라우저는 WebAssembly를 지원하지 않습니다');
  }
  const [detector, estimator] = await Promise.all([
    loadFaceDetector(config),
    loadAgeEstimator(config),
  ]).catch((e: unknown) => {
    throw e instanceof AgeGateError ? e : new AgeGateError('model_load_failed', String(e), { cause: e });
  });

  return createAgeGateCore(detector, estimator, { rules: resolveRules(config), fps: resolveFps(config) });
}

async function loadFaceDetector(config: AgeGateConfig): Promise<FaceDetector> {
  let detector: MpFaceDetector;
  try {
    const fileset = await FilesetResolver.forVisionTasks(config.mediapipeWasmUrl.replace(/\/$/, ''));
    const create = (delegate: 'GPU' | 'CPU') =>
      MpFaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: config.faceModelUrl, delegate },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
    // GPU(WebGL) 위임이 안 되는 기기(gram 등)에서는 CPU로 (D22)
    detector = await create('GPU').catch(() => create('CPU'));
    // 첫 검출에서 셰이더 준비로 몇 초 걸리므로 손님이 오기 전에 빈 화면으로 한 번 돌려 둔다.
    detector.detectForVideo(new OffscreenCanvas(320, 240) as unknown as HTMLCanvasElement, 0);
  } catch (e) {
    throw new AgeGateError('model_load_failed', `얼굴 검출 모델을 불러오지 못했습니다: ${errorText(e)}`, { cause: e });
  }

  let lastTs = 0; // 준비 실행이 타임스탬프 0을 썼다
  return {
    detect(video, timestampMs) {
      // VIDEO 모드는 타임스탬프가 계속 커져야 한다.
      const ts = Math.max(timestampMs, lastTs + 1);
      lastTs = ts;
      return detector.detectForVideo(video, ts).detections.flatMap((d) => {
        const b = d.boundingBox;
        if (!b || b.width <= 0 || b.height <= 0) return [];
        return [{ box: { x: b.originX, y: b.originY, width: b.width, height: b.height }, score: d.categories[0]?.score ?? 0 }];
      });
    },
    close: () => detector.close(),
  };
}

async function loadAgeEstimator(config: AgeGateConfig): Promise<AgeEstimator> {
  ort.env.wasm.wasmPaths = config.ortWasmUrl.endsWith('/') ? config.ortWasmUrl : `${config.ortWasmUrl}/`;
  // 멀티스레드는 crossOriginIsolated(COOP/COEP 헤더)일 때만 된다. 아니면 1스레드.
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated
    ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1))
    : 1;
  ort.env.logLevel = 'error';

  let model: Uint8Array;
  try {
    const res = await fetch(config.ageModelUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    model = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    throw new AgeGateError('model_load_failed', `나이 추정 모델을 받지 못했습니다 (${config.ageModelUrl}): ${errorText(e)}`, { cause: e });
  }

  // WebGPU를 먼저 쓰고, 없거나 실패하면 WASM(CPU) (D22, D27)
  const attempts: ('webgpu' | 'wasm')[] = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm'];
  let lastError: unknown = null;
  for (const backend of attempts) {
    let session: ort.InferenceSession | null = null;
    try {
      session = await ort.InferenceSession.create(model, {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3, // 노드 배치 경고가 콘솔에 error로 찍히지 않게
      });
      const spec = findAgeModel(session.inputNames);
      if (!spec) {
        await session.release();
        throw new AgeGateError('model_load_failed', `알 수 없는 나이 모델입니다 (입력: ${session.inputNames.join(', ')})`);
      }
      const estimator = createOrtEstimator(session, spec, backend);
      await estimator.warmUp(); // 첫 실행에서 실패하는 GPU가 있어 미리 돌려 본다
      return estimator;
    } catch (e) {
      if (e instanceof AgeGateError) throw e;
      lastError = e;
      await session?.release().catch(() => {});
    }
  }
  throw new AgeGateError('model_load_failed', `나이 추정 모델을 실행할 수 없습니다: ${errorText(lastError)}`, { cause: lastError });
}

function createOrtEstimator(session: ort.InferenceSession, spec: AgeModelSpec, backend: 'webgpu' | 'wasm') {
  const size = spec.inputSize;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없습니다');
  const input = new Float32Array(3 * size * size);
  const outputName = session.outputNames[0]!;

  async function run(): Promise<number> {
    const feeds = { [spec.inputName]: new ort.Tensor('float32', input, [1, 3, size, size]) };
    const out = await session.run(feeds);
    const data = out[outputName]!.data as Float32Array;
    return spec.readAge(data);
  }

  return {
    backend,
    async warmUp() {
      input.fill(0);
      await run();
    },
    async estimate(video: HTMLVideoElement, face: Box) {
      const c = squareCrop(face, spec.cropScale);
      try {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size); // 영상 밖 영역은 검정 (학습 때의 패딩과 같게)
        ctx.drawImage(video, c.x, c.y, c.width, c.height, 0, 0, size, size);
        rgbaToTensor(ctx.getImageData(0, 0, size, size).data, spec, input);
        return await run();
      } finally {
        // 얼굴 픽셀을 메모리에 남기지 않는다 (D2)
        ctx.clearRect(0, 0, size, size);
        input.fill(0);
      }
    },
    close() {
      void session.release();
    },
  };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
