// AI 모듈 단독 확인용 데모. 프론트와 같은 공개 API만 쓴다.
// 실제 웹캠에서 판정 기준값(stableFrames, minConfidence)을 맞추고, 후보 모델 속도를 재는 데 쓴다.
import * as ort from 'onnxruntime-web';
import { createAgeGate, createSpeaker, DEFAULT_FPS, DEFAULT_RULES, type AgeGate, type AgeGateUpdate } from '../src';
import { AGE_MODELS } from '../src/ageModels';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const config = {
  faceModelUrl: '/models/face/blaze_face_short_range.tflite',
  ageModelUrl: q.get('ageModel') ?? '/models/age/age_estimator.onnx',
  mediapipeWasmUrl: '/models/mediapipe-wasm',
  ortWasmUrl: '/models/ort-wasm/',
  seniorAge: num('seniorAge', DEFAULT_RULES.seniorAge),
  stableFrames: num('stableFrames', DEFAULT_RULES.stableFrames),
  minConfidence: num('minConfidence', DEFAULT_RULES.minConfidence),
  decideTimeoutMs: num('decideTimeoutMs', DEFAULT_RULES.decideTimeoutMs),
  fps: num('fps', DEFAULT_FPS),
  noFaceGraceMs: num('noFaceGraceMs', DEFAULT_RULES.noFaceGraceMs),
  bandEdges: [num('bandLow', DEFAULT_RULES.bandEdges[0]), num('bandHigh', DEFAULT_RULES.bandEdges[1])] as [number, number],
};
$('config').textContent =
  `${config.ageModelUrl.split('/').pop()} · 연령대 ${config.bandEdges.join('/')} · ${config.stableFrames}프레임 · 신뢰도 ${config.minConfidence} · ` +
  `${config.decideTimeoutMs / 1000}초 · ${config.fps}fps · 유예 ${config.noFaceGraceMs}ms · ${globalThis.crossOriginIsolated ? '멀티스레드' : '1스레드'}`;

const video = $<HTMLVideoElement>('video');
let gate: AgeGate | null = null;
let lastEventAt = 0;
const intervals: number[] = [];

/** 실측 보고용 전체 기록 (오래된 것부터). 이벤트 내용만 담기므로 나이 숫자는 없다. */
const history: string[] = [];

function log(text: string, cls = '') {
  const line = `${new Date().toLocaleTimeString()}  ${text}`;
  history.push(line);
  const li = document.createElement('li');
  li.className = cls;
  li.textContent = line;
  $('log').prepend(li);
  while ($('log').childElementCount > 200) $('log').lastElementChild!.remove();
}

function show(u: AgeGateUpdate) {
  const now = performance.now();
  if (u.type === 'detecting' && lastEventAt) {
    intervals.push(now - lastEventAt);
    if (intervals.length > 30) intervals.shift();
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    $('interval').textContent = `${avg.toFixed(0)}ms (실제 ${(1000 / avg).toFixed(1)}fps)`;
  }
  lastEventAt = u.type === 'detecting' ? now : 0;

  const status = $('status');
  status.className = '';
  switch (u.type) {
    case 'no_face':
      status.textContent = '얼굴 없음';
      setBars(0, 0);
      break;
    case 'detecting':
      status.textContent = `판정 중: ${u.frameGroup === 'low_confidence' ? '신뢰도 낮음' : u.frameGroup} ${u.run}/${u.required}`;
      setBars(u.run / u.required, u.elapsedMs / config.decideTimeoutMs);
      break;
    case 'decided':
      status.textContent = `확정: ${u.group} · ${u.ageBand} (${u.source}, 신뢰도 ${u.confidence})`;
      status.className = u.group;
      setBars(1, 0);
      break;
    case 'timeout':
      status.textContent = '미확정 (타임아웃) → 일반 화면';
      status.className = 'timeout';
      break;
    case 'error':
      status.textContent = `오류: ${u.message}`;
      status.className = 'error';
      break;
  }
  const { type, ...rest } = u;
  log(`${type} ${JSON.stringify(rest)}`, type);
}

function setBars(run: number, time: number) {
  $('runBar').style.width = `${Math.min(1, run) * 100}%`;
  $('timeBar').style.width = `${Math.min(1, time) * 100}%`;
}

$('startCam').onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    log(`카메라 ${video.videoWidth}x${video.videoHeight}`);
    if (!gate) {
      const t = performance.now();
      gate = await createAgeGate(config);
      $('backend').textContent = `${gate.backend} (로드 ${(performance.now() - t).toFixed(0)}ms)`;
      gate.onUpdate(show);
    }
    gate.start(video);
  } catch (e) {
    log(`시작 실패: ${(e as Error).name} ${(e as Error).message}`, 'error');
  }
};
$('copyLog').onclick = async () => {
  const text = [
    `설정: ${$('config').textContent}`,
    `백엔드: ${$('backend').textContent}`,
    `추론 간격: ${$('interval').textContent}`,
    `브라우저: ${navigator.userAgent}`,
    '',
    ...history,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    $('copyLog').textContent = `복사됨 (${history.length}줄)`;
  } catch {
    $<HTMLTextAreaElement>('logText').value = text; // 복사가 막히면 아래 칸에서 직접 복사
    $('logText').hidden = false;
  }
};
$('reset').onclick = () => {
  gate?.reset();
  log('reset()');
};
$('forceS').onclick = () => gate?.force('55plus');
$('forceN').onclick = () => gate?.force('35to54');
$('forceY').onclick = () => gate?.force('under35');
addEventListener('keydown', (e) => {
  if (!e.shiftKey || !gate) return;
  if (e.code === 'KeyS') gate.force('55plus');
  if (e.code === 'KeyN') gate.force('35to54');
  if (e.code === 'KeyY') gate.force('under35');
  if (e.code === 'KeyR') gate.reset();
});

// ---------------------------------------------------------------- TTS
const speakerReady = createSpeaker({ rate: num('rate', 0.85) });
speakerReady.then((s) => {
  $('voice').textContent = s.available ? s.voiceName! : '없음 (기기 내장 한국어 음성이 없습니다)';
});
$('speak').onclick = async () => (await speakerReady).speak($<HTMLTextAreaElement>('ttsText').value);
$('cancel').onclick = async () => (await speakerReady).cancel();
function listVoices() {
  const rows = speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('ko'))
    .map((v) => `<tr><td>${v.name}</td><td>${v.lang}</td><td>${v.localService ? '기기 내장' : '네트워크 (사용 안 함)'}</td></tr>`);
  $('voices').innerHTML = rows.length ? rows.join('') : '<tr><td>한국어 음성 없음</td></tr>';
}
speechSynthesis.addEventListener('voiceschanged', listVoices);
listVoices();

// ---------------------------------------------------------------- 속도 비교
$('bench').onclick = async () => {
  const out = $<HTMLTableElement>('benchOut');
  out.innerHTML = '<tr><th>후보</th><th>백엔드</th><th>로드</th><th>중앙값</th><th>p90</th></tr>';
  ort.env.wasm.wasmPaths = config.ortWasmUrl;
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency - 1) : 1;
  const files = ['insightface-genderage', 'vit-age-gender-int8', 'vit-age-gender'];
  for (const file of files) {
    for (const ep of ['webgpu', 'wasm'] as const) {
      if (ep === 'webgpu' && !('gpu' in navigator)) continue;
      const row = out.insertRow();
      row.innerHTML = `<td>${file}</td><td>${ep}</td><td colspan=3>측정 중…</td>`;
      try {
        const t0 = performance.now();
        const session = await ort.InferenceSession.create(`/models/age/candidates/${file}.onnx`, {
          executionProviders: [ep],
          graphOptimizationLevel: 'all',
        });
        const load = performance.now() - t0;
        const spec = AGE_MODELS.find((m) => session.inputNames.includes(m.inputName))!;
        const n = spec.inputSize;
        const input = new ort.Tensor('float32', new Float32Array(3 * n * n).map(() => Math.random()), [1, 3, n, n]);
        for (let i = 0; i < 3; i++) await session.run({ [spec.inputName]: input });
        const times: number[] = [];
        for (let i = 0; i < 30; i++) {
          const t = performance.now();
          await session.run({ [spec.inputName]: input });
          times.push(performance.now() - t);
        }
        await session.release();
        times.sort((a, b) => a - b);
        row.innerHTML = `<td>${file}</td><td>${ep}</td><td>${load.toFixed(0)}ms</td><td>${times[15]!.toFixed(1)}ms</td><td>${times[27]!.toFixed(1)}ms</td>`;
      } catch (e) {
        row.innerHTML = `<td>${file}</td><td>${ep}</td><td colspan=3>실패: ${(e as Error).message.slice(0, 80)}</td>`;
      }
    }
  }
};
