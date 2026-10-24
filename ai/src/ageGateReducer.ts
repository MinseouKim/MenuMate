// 카메라 없이 테스트할 수 있는 순수 판정 로직 (ai-output 계약 1장).
// 프로토타입 Kiosk의 FRAME 처리 규칙에 8초 타임아웃(D16)을 더했다.

import type {
  AgeGateRules,
  AgeGateState,
  AgeGateUpdate,
  AgeGroup,
  FaceObservation,
  FrameInput,
} from './types';

export function initialAgeGateState(): AgeGateState {
  return { phase: 'idle', runGroup: null, run: 0, runConfidenceSum: 0, firstSeenAt: null, lastSeenAt: null };
}

/** 여러 얼굴 중 박스 면적이 가장 큰 1개 (D18). 없으면 null. */
export function pickLargestFace(faces: readonly FaceObservation[]): FaceObservation | null {
  let best: FaceObservation | null = null;
  for (const f of faces) if (!best || f.area > best.area) best = f;
  return best;
}

export function ageGateReducer(
  state: AgeGateState,
  input: FrameInput,
  rules: AgeGateRules,
): { state: AgeGateState; update: AgeGateUpdate | null } {
  // 확정이나 타임아웃 뒤에는 reset() 전까지 판정하지 않는다 (D18).
  if (state.phase === 'decided' || state.phase === 'timeout') return { state, update: null };

  const face = pickLargestFace(input.faces);
  if (!face) {
    // 얼굴이 사라지면 연속 기록과 타이머를 처음으로. 대기 중에 계속 없으면 이벤트를 다시 보내지 않는다.
    if (state.phase === 'idle') return { state, update: null };
    // 검출이 잠깐 깜빡인 것이면 연속 기록을 유지한다. 타임아웃 시간은 계속 흐른다.
    const grace = rules.noFaceGraceMs ?? 0;
    if (grace > 0 && state.lastSeenAt !== null && input.t - state.lastSeenAt < grace) {
      const elapsed = input.t - (state.firstSeenAt ?? input.t);
      if (elapsed >= rules.decideTimeoutMs) return { state: { ...state, phase: 'timeout' }, update: { type: 'timeout' } };
      return { state, update: null };
    }
    return { state: initialAgeGateState(), update: { type: 'no_face' } };
  }

  const required = Math.max(1, Math.floor(rules.stableFrames));
  const firstSeenAt = state.firstSeenAt ?? input.t;
  const elapsedMs = Math.max(0, input.t - firstSeenAt);
  const timedOut = elapsedMs >= rules.decideTimeoutMs;

  const usable = Number.isFinite(face.age) && face.confidence >= rules.minConfidence;
  if (!usable) {
    // 신뢰도가 낮은 프레임은 버리고 연속 기록을 끊는다.
    const next: AgeGateState = { phase: 'detecting', runGroup: null, run: 0, runConfidenceSum: 0, firstSeenAt, lastSeenAt: input.t };
    if (timedOut) return { state: { ...next, phase: 'timeout' }, update: { type: 'timeout' } };
    return {
      state: next,
      update: { type: 'detecting', frameGroup: 'low_confidence', run: 0, required, elapsedMs },
    };
  }

  const group: AgeGroup = face.age >= rules.seniorAge ? 'senior' : 'non_senior';
  const continues = state.runGroup === group;
  const run = continues ? state.run + 1 : 1;
  const runConfidenceSum = (continues ? state.runConfidenceSum : 0) + face.confidence;
  const next: AgeGateState = { phase: 'detecting', runGroup: group, run, runConfidenceSum, firstSeenAt, lastSeenAt: input.t };

  // 같은 프레임에서 확정과 타임아웃이 겹치면 확정이 이긴다.
  if (run >= required) {
    const confidence = Math.round((runConfidenceSum / run) * 1000) / 1000;
    return {
      state: { ...next, phase: 'decided' },
      update: { type: 'decided', group, confidence, source: 'model' },
    };
  }
  if (timedOut) return { state: { ...next, phase: 'timeout' }, update: { type: 'timeout' } };
  return { state: next, update: { type: 'detecting', frameGroup: group, run, required, elapsedMs } };
}
