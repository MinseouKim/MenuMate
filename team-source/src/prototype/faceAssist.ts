import { useEffect, useRef, useState } from 'react';
import { mediaErrorMessage } from './media';

// 카메라로 화면 설정 맞추기: 웹캠 영상에서 얼굴 나이대만 이 기기 안에서 추정해 큰 글씨·음성 안내·낮은 화면을 켭니다.
// - 영상·사진·얼굴 정보는 저장하거나 서버로 보내지 않습니다. 화면에도 카메라 영상을 띄우지 않습니다.
// - 모델(얼굴 찾기 + 나이 추정)은 public/models/face/에 들어 있어 인터넷 없이 동작합니다.
// - 나이는 추정값이라, 바꾼 설정은 위쪽 버튼이나 '원래대로'로 언제든 되돌릴 수 있게 합니다.
export type FaceGroup = 'senior' | 'child' | 'adult';
export type CameraState = 'off' | 'starting' | 'on' | 'error';

const SENIOR_AGE = 60;
const CHILD_AGE = 12;
const INTERVAL_MS = 700;
const WINDOW_MS = 4000; // 최근 4초 안의 추정값만 씁니다(지나간 사람의 얼굴은 버림).
const MIN_SAMPLES = 3;

export function groupOf(ages: number[]): FaceGroup | null {
  if (ages.length < MIN_SAMPLES) return null;
  const sorted = [...ages].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return median >= SENIOR_AGE ? 'senior' : median <= CHILD_AGE ? 'child' : 'adult';
}

// 테스트 환경에서는 카메라를 켜지 않습니다.
const enabled = import.meta.env.MODE !== 'test';
const supported = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/** active일 때만 카메라를 켜고, 지금 앞에 있는 사람의 나이대(group)를 알려 줍니다. 나이대를 알 때마다 onGroup도 부릅니다. */
export function useFaceAssist(active: boolean, onGroup?: (group: FaceGroup) => void) {
  const [phase, setPhase] = useState<{ state: 'on' | 'error'; error: string } | null>(null);
  const [group, setGroup] = useState<FaceGroup | null>(null);
  const samples = useRef<{ at: number; age: number }[]>([]);
  const callback = useRef(onGroup);
  useEffect(() => { callback.current = onGroup; });
  const running = active && enabled;
  useEffect(() => {
    if (!running || !supported()) return;
    let alive = true; let stream: MediaStream | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
    samples.current = [];
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        // 영상은 화면에 붙이지 않고 분석에만 씁니다.
        const video = document.createElement('video');
        video.muted = true; video.playsInline = true; video.srcObject = stream;
        await video.play();
        const faceapi = await import('@vladmandic/face-api');
        const uri = `${import.meta.env.BASE_URL}models/face`;
        await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(uri), faceapi.nets.ageGenderNet.loadFromUri(uri)]);
        if (!alive) return;
        setPhase({ state: 'on', error: '' });
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
        const tick = async () => {
          if (!alive) return;
          try {
            const face = await faceapi.detectSingleFace(video, options).withAgeAndGender();
            const now = Date.now();
            samples.current = samples.current.filter(s => now - s.at < WINDOW_MS);
            if (face) samples.current.push({ at: now, age: face.age });
            const g = groupOf(samples.current.map(s => s.age));
            if (alive) { setGroup(g); if (g) callback.current?.(g); }
          } catch { /* 한 장 분석이 실패해도 다음 장에서 이어 갑니다. */ }
          if (alive) timer = setTimeout(() => void tick(), INTERVAL_MS);
        };
        void tick();
      } catch (e) {
        if (!alive) return;
        stream?.getTracks().forEach(t => t.stop());
        setPhase({ state: 'error', error: mediaErrorMessage(e, '카메라') });
      }
    })();
    return () => { alive = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); samples.current = []; setPhase(null); setGroup(null); };
  }, [running]);
  const state: CameraState = !running ? 'off' : !supported() ? 'error' : phase?.state ?? 'starting';
  const error = state === 'error' ? phase?.error || mediaErrorMessage(new DOMException('', 'NotSupportedError'), '카메라') : '';
  return { state, error, group: running ? group : null };
}
