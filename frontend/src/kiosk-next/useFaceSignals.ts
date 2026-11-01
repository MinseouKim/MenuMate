// 카메라 불편 신호: 얼굴이 화면에 가까워지거나(글씨가 작아 다가옴) 눈을 찌푸리면 큰 글씨를 제안하기 위한 훅.
// 판정은 @menumate/ai 의 createFaceSignals(MediaPipe Face Landmarker 블렌드셰이프)가 브라우저 안에서 하고,
// 여기로는 'approach' | 'squint' 신호만 옵니다. 좌표·이미지·수치는 모듈 밖으로 나오지 않습니다 (D2 확장, 2026-11-02).
// 카메라 영상은 연령 판정(ageAssist)이 연 것을 같이 씁니다 (loadAi().video).
import { useEffect, useRef, useState } from 'react';
import { loadAi } from '../ai/loadAi';
import { logAge } from '../prototype/ageLog';
import type { ComfortSignal } from './types';

const enabled = import.meta.env.MODE !== 'test';
const WAIT_VIDEO_MS = 500;
const WAIT_VIDEO_LIMIT_MS = 30_000;

export function useFaceSignals(active: boolean) {
  const [signal, setSignal] = useState<ComfortSignal | null>(null);
  const fired = useRef(false);
  useEffect(() => {
    if (!active || !enabled) return;
    fired.current = false;
    let alive = true;
    let off: (() => void) | null = null;
    let stop: (() => void) | null = null;
    let waiter: ReturnType<typeof setInterval> | null = null;
    void (async () => {
      const ai = loadAi();
      const signals = await ai.faceSignals;
      if (!alive || !signals) return;
      off = signals.onSignal(s => {
        if (!alive || fired.current) return;
        fired.current = true;
        logAge('info', s === 'approach' ? '불편 신호: 얼굴이 화면에 가까워짐' : '불편 신호: 눈 찌푸림');
        setSignal(s);
      });
      // 연령 판정이 카메라를 열어 둘 때까지 기다렸다가 같은 영상으로 시작합니다.
      const startedAt = Date.now();
      const tryStart = () => {
        const video = ai.video.current;
        if (video) { signals.start(video); stop = () => signals.stop(); logAge('info', '불편 신호 관찰 시작'); return true; }
        return Date.now() - startedAt > WAIT_VIDEO_LIMIT_MS;
      };
      if (!tryStart()) waiter = setInterval(() => { if (!alive || tryStart()) { if (waiter) clearInterval(waiter); waiter = null; } }, WAIT_VIDEO_MS);
    })();
    return () => { alive = false; if (waiter) clearInterval(waiter); off?.(); stop?.(); setSignal(null); };
  }, [active]);
  return { signal };
}
