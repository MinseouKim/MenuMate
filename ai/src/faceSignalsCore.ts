// 불편 신호 판정 (순수 로직, 브라우저 없이 테스트). 입력은 프레임마다의 얼굴 크기 비율과 블렌드셰이프 몇 개,
// 출력은 'approach'(얼굴이 화면에 가까워짐) | 'squint'(눈 찌푸림) 신호뿐이다. 좌표·이미지는 받지도 내보내지도 않는다 (D2 확장, 2026-11-02).

export type FaceSignal = 'approach' | 'squint';

export interface SignalFrame {
  /** ms */
  t: number;
  /** 얼굴 박스 면적 / 영상 면적 (0~1). 얼굴이 없으면 null */
  faceRatio: number | null;
  /** MediaPipe 블렌드셰이프 eyeSquintLeft/Right 평균 (0~1). 없으면 null */
  squint: number | null;
}

export interface SignalRules {
  /** 기준 얼굴 크기를 잡는 데 필요한 시간. 이 동안의 중앙값이 기준 */
  baselineMs: number;
  /** 기준 대비 이 배수 이상 커지면 '가까워짐' 후보 */
  approachRatio: number;
  /** 후보 상태가 이 시간 이상 이어지면 신호 */
  holdMs: number;
  /** eyeSquint 평균이 이 값 이상이면 '찌푸림' 후보 */
  squintLevel: number;
  /** 같은 신호를 다시 내기까지의 최소 간격 */
  cooldownMs: number;
}

export const DEFAULT_SIGNAL_RULES: Readonly<SignalRules> = Object.freeze({
  baselineMs: 3000,
  approachRatio: 1.6,
  holdMs: 2500,
  squintLevel: 0.5,
  cooldownMs: 30_000,
});

export interface SignalState {
  startedAt: number | null;
  baselineSamples: number[];
  baseline: number | null;
  approachSince: number | null;
  squintSince: number | null;
  lastSignalAt: number | null;
}

export const initialSignalState = (): SignalState => ({
  startedAt: null, baselineSamples: [], baseline: null, approachSince: null, squintSince: null, lastSignalAt: null,
});

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** 프레임 하나를 반영하고, 신호가 나면 돌려준다. */
export function signalReducer(
  state: SignalState,
  frame: SignalFrame,
  rules: SignalRules = DEFAULT_SIGNAL_RULES,
): { state: SignalState; signal: FaceSignal | null } {
  const next: SignalState = { ...state, startedAt: state.startedAt ?? frame.t };
  const inCooldown = next.lastSignalAt !== null && frame.t - next.lastSignalAt < rules.cooldownMs;

  if (frame.faceRatio === null) {
    // 얼굴이 사라지면 진행 중이던 후보는 버린다 (지나가는 사람 때문에 생긴 신호 방지)
    return { state: { ...next, approachSince: null, squintSince: null }, signal: null };
  }

  // 기준 얼굴 크기: 처음 baselineMs 동안의 중앙값. 그 전에는 '가까워짐'을 판단하지 않는다.
  if (next.baseline === null) {
    next.baselineSamples = [...next.baselineSamples, frame.faceRatio];
    if (frame.t - next.startedAt! >= rules.baselineMs) next.baseline = median(next.baselineSamples);
  }

  let signal: FaceSignal | null = null;

  if (next.baseline !== null && frame.faceRatio >= next.baseline * rules.approachRatio) {
    next.approachSince ??= frame.t;
    if (!inCooldown && frame.t - next.approachSince >= rules.holdMs) signal = 'approach';
  } else {
    next.approachSince = null;
  }

  if (frame.squint !== null && frame.squint >= rules.squintLevel) {
    next.squintSince ??= frame.t;
    if (!signal && !inCooldown && frame.t - next.squintSince >= rules.holdMs) signal = 'squint';
  } else {
    next.squintSince = null;
  }

  if (signal) {
    next.lastSignalAt = frame.t;
    next.approachSince = null;
    next.squintSince = null;
    // 가까이 온 상태가 새 기준이 되지 않도록 기준은 유지한다
  }
  return { state: next, signal };
}
