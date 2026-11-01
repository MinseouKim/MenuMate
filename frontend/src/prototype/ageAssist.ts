import { useEffect, useRef, useState } from 'react';
import { loadAi } from '../ai/loadAi';
import type { AgeBand, AgeGate, AgeGateUpdate } from '../ai/types';
import { config } from '../config';
import { logAge, setAgeStatus } from './ageLog';
import { mediaErrorMessage } from './media';

// 카메라로 화면 설정 맞추기: 웹캠 영상에서 연령대만 이 기기 안에서 판정해 큰 글씨·음성 안내를 켭니다.
// - 판정은 우리 AI 모듈(@menumate/ai: MediaPipe 얼굴 검출 + ONNX 나이 추정)이 합니다. 다른 비전 모델은 쓰지 않습니다.
// - 영상·사진·얼굴 정보는 저장하거나 서버로 보내지 않습니다. 화면에도 카메라 영상을 띄우지 않습니다.
// - 우리 AI는 연령대 3단계(55세 미만, 35~54세, 55세 이상)만 냅니다. 어린이 판정은 없어서 '낮은 화면'은 손님이 직접 켭니다.
// - 판정은 추정값이라, 바꾼 설정은 위쪽 버튼이나 '원래대로'로 언제든 되돌릴 수 있게 합니다.
export type FaceGroup = 'senior' | 'adult';
export type CameraState = 'off' | 'starting' | 'on' | 'error';

/** AgeGate 의 decided 결과를 화면 설정 기준으로 옮긴다. 55세 이상만 senior */
export function groupOfDecision(u: Extract<AgeGateUpdate, { type: 'decided' }>): FaceGroup {
  const band: AgeBand | string = u.ageBand ?? u.group;
  return band === '55plus' || band === 'senior' ? 'senior' : 'adult';
}

const FRAME_TEXT = { senior: '55세 이상 후보', non_senior: '55세 미만 후보', low_confidence: '신뢰도 낮음' } as const;
const GROUP_TEXT = { senior: '55세 이상', adult: '55세 미만' } as const;

// 테스트 환경에서는 카메라를 켜지 않습니다.
const enabled = import.meta.env.MODE !== 'test';
const supported = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/** active일 때만 카메라를 켜고, 지금 앞에 있는 사람의 연령대(group)를 알려 줍니다. 판정이 나면 onGroup도 부릅니다. */
export function useAgeAssist(active: boolean, onGroup?: (group: FaceGroup) => void) {
  const [phase, setPhase] = useState<{ state: 'on' | 'error'; error: string } | null>(null);
  const [group, setGroup] = useState<FaceGroup | null>(null);
  const callback = useRef(onGroup);
  useEffect(() => { callback.current = onGroup; });
  const running = active && enabled;
  useEffect(() => {
    if (!running || !supported()) return;
    let alive = true; let stream: MediaStream | null = null; let gate: AgeGate | null = null; let off: (() => void) | null = null;
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    logAge('info', '카메라를 켭니다', { camera: '켜는 중', model: '대기', decision: '판정 중' });
    let lastKind = '';
    let lastRun = -1;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        const track = stream.getVideoTracks()[0];
        const s = track?.getSettings();
        logAge('info', `사용 카메라: ${track?.label || '이름 없음'} (${s?.width ?? '?'}×${s?.height ?? '?'})`);
        // 영상은 화면에 붙이지 않고 분석에만 씁니다.
        const video = document.createElement('video');
        video.muted = true; video.playsInline = true; video.srcObject = stream;
        await video.play();
        logAge('info', '카메라 켜짐', { camera: '켜짐', model: '불러오는 중' });
        loadAi().video.current = video; // 불편 신호(useFaceSignals)가 같은 영상을 씁니다
        gate = await loadAi().ageGate;
        if (!alive) return;
        if (!gate) { logAge('error', '연령 판정 모델을 불러오지 못했어요', { model: '실패' }); setPhase({ state: 'error', error: '연령 판정 모델을 불러오지 못했어요. 화면은 직접 설정해 주세요.' }); return; }
        logAge('ok', `모델 준비됨 (${gate.backend})`, { model: `준비됨 · ${gate.backend}` });
        const g = gate;
        off = g.onUpdate(u => {
          if (!alive) return;
          if (u.type === 'no_face') { if (lastKind !== 'no_face') logAge('info', '얼굴이 보이지 않아요'); lastKind = 'no_face'; return; }
          if (u.type === 'detecting') {
            if (lastKind !== 'detecting' || u.run !== lastRun) logAge('info', `판정 중 ${u.run}/${u.required} · ${FRAME_TEXT[u.frameGroup]} · ${(u.elapsedMs / 1000).toFixed(1)}초`);
            lastKind = 'detecting'; lastRun = u.run; return;
          }
          if (u.type === 'timeout') { lastKind = 'timeout'; logAge('warn', '시간 초과: 판정하지 못했어요', { decision: '시간 초과' }); return; }
          if (u.type === 'error') { lastKind = 'error'; logAge('error', `오류 ${u.code}: ${u.message}`, { decision: '오류' }); return; }
          if (u.type !== 'decided') return;
          lastKind = 'decided';
          const decided = groupOfDecision(u);
          const text = `${GROUP_TEXT[decided]} (신뢰도 ${u.confidence.toFixed(2)}, ${u.source === 'forced' ? '단축키 강제' : '모델'})`;
          logAge('ok', `판정 완료: ${text}`, { decision: text });
          setGroup(decided);
          callback.current?.(decided);
        });
        g.reset();
        g.start(video);
        setPhase({ state: 'on', error: '' });
        // 전시장 소음·조명으로 판정이 어려울 때를 위한 시연 단축키 (VITE_DEV_SHORTCUTS)
        if (config.devShortcuts) {
          onKey = e => {
            if (!e.shiftKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'S') { logAge('warn', '단축키: 55세 이상 강제'); g.force('55plus'); }
            else if (e.key === 'N') { logAge('warn', '단축키: 55세 미만 강제'); g.force('under35'); }
          };
          window.addEventListener('keydown', onKey);
        }
      } catch (e) {
        if (!alive) return;
        stream?.getTracks().forEach(t => t.stop());
        logAge('error', `카메라 오류: ${mediaErrorMessage(e, '카메라')}`, { camera: '오류' });
        setPhase({ state: 'error', error: mediaErrorMessage(e, '카메라') });
      }
    })();
    return () => {
      alive = false;
      off?.(); gate?.stop();
      if (onKey) window.removeEventListener('keydown', onKey);
      loadAi().video.current = null;
      stream?.getTracks().forEach(t => t.stop());
      setAgeStatus({ camera: '꺼짐' }); logAge('info', '카메라를 끕니다');
      setPhase(null); setGroup(null);
    };
  }, [running]);
  const state: CameraState = !running ? 'off' : !supported() ? 'error' : phase?.state ?? 'starting';
  const error = state === 'error' ? phase?.error || mediaErrorMessage(new DOMException('', 'NotSupportedError'), '카메라') : '';
  return { state, error, group: running ? group : null };
}
