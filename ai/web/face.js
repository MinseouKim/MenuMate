// [AI 담당] 얼굴 인식 → 손님 접근 감지 + 연령대 추정 (브라우저 안에서만 처리)
// - 영상·사진·얼굴 특징값을 저장하거나 서버로 보내지 않는다 (명세서 NFR-07)
// - 누구인지 알아보는 '식별'은 하지 않고, 연령대만 추정한다 (FR-03, FR-27 제외)
import * as faceapi from '/vendor/face-api/face-api.esm.js';

const CONFIG = {
  intervalMs: 400,          // 인식 주기
  minFaceRatio: 0.12,       // 얼굴 폭 / 화면 폭: 이보다 작으면 멀리 지나가는 사람으로 보고 무시
  samplesForDecision: 6,    // 연령대 판단에 쓰는 측정 횟수 (한 번 측정은 흔들림이 큼)
  seniorAge: 55,            // 이 나이 이상 → 'senior' (쉬운 화면·간소화 절차)
  youngAge: 19,
  levels: [55, 70],         // 글자 크기 단계 기준: 55세 미만 0(보통), 55~69세 1(크게), 70세 이상 2(아주 크게)
  leaveAfterMs: 4000        // 얼굴이 이 시간 이상 안 보이면 손님이 떠난 것으로 본다
};

let stream = null;
let timer = null;

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function pickCamera() {
  // 로지텍 BRIO 500이 있으면 그것을 쓴다 (이름은 권한 허용 후에만 보임)
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const brio = cams.find((d) => /brio/i.test(d.label));
  return (brio || cams[0] || {}).deviceId;
}

export async function loadModels(onStatus = () => {}) {
  onStatus('얼굴 인식 모델 불러오는 중…');
  // 키오스크 PC의 그래픽(WebGL)을 쓰면 빠르다. 안 되면 CPU로 (느리지만 동작)
  // setBackend는 실패해도 예외 대신 false를 돌려주므로 결과를 직접 확인한다
  const gpuOk = await faceapi.tf.setBackend('webgl').catch(() => false);
  if (!gpuOk) {
    await faceapi.tf.setBackend('cpu');
    CONFIG.intervalMs = 1000; // CPU에서는 측정 간격을 늘린다
  }
  await faceapi.tf.ready();
  onStatus(`모델 준비 중 (${faceapi.tf.getBackend()})`);
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  await faceapi.nets.ageGenderNet.loadFromUri('/models');
  onStatus('모델 준비 완료');
}

/**
 * @param {HTMLVideoElement} video
 * @param {object} handlers
 *   onArrive()                  손님이 다가옴 → 화면 깨우기 (FR-02)
 *   onAgeGroup(group, medianAge) 'senior' | 'adult' | 'young' 한 손님당 한 번
 *   onLeave()                   손님이 떠남 → 다음 손님을 위해 초기화
 *   onDebug(info)               개발용: 매 측정값
 */
export async function startFace(video, handlers = {}) {
  const { onArrive = () => {}, onAgeGroup = () => {}, onLeave = () => {}, onDebug = () => {} } = handlers;
  const constraints = { video: { width: 640, height: 480 }, audio: false };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  const brioId = await pickCamera();
  const current = stream.getVideoTracks()[0].getSettings().deviceId;
  if (brioId && brioId !== current) {
    stream.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: brioId }, width: 640, height: 480 }, audio: false });
  }
  video.srcObject = stream;
  await video.play();

  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
  let present = false;
  let lastSeen = 0;
  let ages = [];
  let decided = false;

  const tick = async () => {
    if (!stream) return;
    let result = null;
    try {
      result = await faceapi.detectSingleFace(video, options).withAgeAndGender();
    } catch (e) {
      onDebug({ error: e.message });
    }
    const now = Date.now();
    const close = result && result.detection.box.width / video.videoWidth >= CONFIG.minFaceRatio;

    if (close) {
      lastSeen = now;
      if (!present) { present = true; ages = []; decided = false; onArrive(); }
      if (!decided) {
        ages.push(result.age);
        if (ages.length >= CONFIG.samplesForDecision) {
          const m = median(ages);
          const group = m >= CONFIG.seniorAge ? 'senior' : m <= CONFIG.youngAge ? 'young' : 'adult';
          decided = true;
          ages = []; // 판단이 끝나면 측정값도 바로 버린다
          onAgeGroup(group, Math.round(m));
        }
      }
      onDebug({ face: true, age: Math.round(result.age), samples: ages.length, decided });
    } else {
      onDebug({ face: false });
      if (present && now - lastSeen > CONFIG.leaveAfterMs) {
        present = false; ages = []; decided = false;
        onLeave();
      }
    }
    timer = setTimeout(tick, CONFIG.intervalMs);
  };
  tick();
}

// '카메라 끄고 주문' (FR-01, FR-04): 카메라를 완전히 끈다
export function stopFace(video) {
  clearTimeout(timer);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) video.srcObject = null;
}

// 추정 나이 → 글자 크기 단계 (0 보통, 1 크게, 2 아주 크게)
// 추정 나이는 ±몇 살씩 틀릴 수 있으므로 기준값은 실제 측정으로 조정한다
export function ageToLevel(age) {
  if (age >= CONFIG.levels[1]) return 2;
  if (age >= CONFIG.levels[0]) return 1;
  return 0;
}

export const faceConfig = CONFIG;
