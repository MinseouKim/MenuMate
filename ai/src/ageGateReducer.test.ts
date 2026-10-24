import { describe, expect, it } from 'vitest';
import { ageGateReducer, initialAgeGateState, pickLargestFace } from './ageGateReducer';
import { DEFAULT_RULES, type AgeGateRules, type AgeGateState, type AgeGateUpdate, type FrameInput } from './types';

const face = (age: number, confidence = 0.9, area = 10_000) => ({ age, confidence, area });
const frame = (t: number, ...faces: ReturnType<typeof face>[]): FrameInput => ({ t, faces });

/** 프레임들을 차례로 넣고 마지막 상태와 모든 이벤트를 돌려준다. */
function run(frames: FrameInput[], rules: AgeGateRules = DEFAULT_RULES, start: AgeGateState = initialAgeGateState()) {
  let state = start;
  const updates: (AgeGateUpdate | null)[] = [];
  for (const f of frames) {
    const r = ageGateReducer(state, f, rules);
    state = r.state;
    updates.push(r.update);
  }
  return { state, updates, last: updates[updates.length - 1] };
}

describe('ageGateReducer', () => {
  it('55세 이상이 연속 5프레임이면 senior로 확정한다', () => {
    const { updates, state } = run([0, 1, 2, 3, 4].map((i) => frame(i * 166, face(62))));
    expect(updates.slice(0, 4).map((u) => u?.type)).toEqual(['detecting', 'detecting', 'detecting', 'detecting']);
    expect(updates[3]).toMatchObject({ frameGroup: 'senior', run: 4, required: 5 });
    expect(updates[4]).toEqual({ type: 'decided', group: 'senior', confidence: 0.9, source: 'model' });
    expect(state.phase).toBe('decided');
  });

  it('55세 미만이 연속 5프레임이면 non_senior로 확정한다', () => {
    const { last } = run([0, 1, 2, 3, 4].map((i) => frame(i * 166, face(30))));
    expect(last).toMatchObject({ type: 'decided', group: 'non_senior', source: 'model' });
  });

  it('정확히 55세는 senior다 (D3)', () => {
    const { last } = run([0, 1, 2, 3, 4].map((i) => frame(i, face(55))));
    expect(last).toMatchObject({ type: 'decided', group: 'senior' });
  });

  it('확정 신뢰도는 연속 프레임 신뢰도의 평균이다', () => {
    const confs = [0.7, 0.8, 0.9, 1.0, 0.75];
    const { last } = run(confs.map((c, i) => frame(i, face(60, c))));
    expect(last).toMatchObject({ type: 'decided', confidence: 0.83 });
  });

  it('판정이 바뀌면 연속 기록을 1부터 다시 센다', () => {
    const { updates } = run([frame(0, face(62)), frame(1, face(62)), frame(2, face(40)), frame(3, face(62))]);
    expect(updates[1]).toMatchObject({ frameGroup: 'senior', run: 2 });
    expect(updates[2]).toMatchObject({ frameGroup: 'non_senior', run: 1 });
    expect(updates[3]).toMatchObject({ frameGroup: 'senior', run: 1 });
  });

  it('신뢰도가 기준 미만인 프레임은 버리고 연속 기록을 끊는다', () => {
    const { updates, state } = run([frame(0, face(62)), frame(1, face(62)), frame(2, face(62, 0.4)), frame(3, face(62))]);
    expect(updates[2]).toEqual({ type: 'detecting', frameGroup: 'low_confidence', run: 0, required: 5, elapsedMs: 2 });
    expect(updates[3]).toMatchObject({ frameGroup: 'senior', run: 1 });
    expect(state.run).toBe(1);
  });

  it('나이가 숫자가 아니면 신뢰도 낮은 프레임처럼 버린다', () => {
    const { last } = run([frame(0, face(Number.NaN))]);
    expect(last).toMatchObject({ type: 'detecting', frameGroup: 'low_confidence' });
  });

  it('여러 얼굴이면 가장 크게 잡힌 얼굴만 판정한다 (D18)', () => {
    const frames = [0, 1, 2, 3, 4].map((i) => frame(i, face(25, 0.95, 2_000), face(68, 0.9, 30_000), face(35, 0.9, 5_000)));
    expect(run(frames).last).toMatchObject({ type: 'decided', group: 'senior' });
  });

  it('얼굴이 사라지면 no_face를 보내고 연속 기록과 타이머를 초기화한다', () => {
    const { updates, state } = run([frame(0, face(62)), frame(100, face(62)), frame(200)]);
    expect(updates[2]).toEqual({ type: 'no_face' });
    expect(state).toEqual(initialAgeGateState());
  });

  it('대기 중에 얼굴이 계속 없으면 이벤트를 보내지 않는다', () => {
    const { updates } = run([frame(0), frame(100), frame(200)]);
    expect(updates).toEqual([null, null, null]);
  });

  it('얼굴이 처음 보인 뒤 8초 안에 확정이 안 되면 timeout (D16)', () => {
    // 54세와 56세가 번갈아 나오는 경계 나이 손님 (프로토타입 시나리오 ②)
    const frames = Array.from({ length: 60 }, (_, i) => frame(1_000 + i * 166, face(i % 2 ? 54 : 56)));
    const { updates, state } = run(frames);
    const idx = updates.findIndex((u) => u?.type === 'timeout');
    expect(idx).toBeGreaterThan(0);
    expect(frames[idx]!.t - 1_000).toBeGreaterThanOrEqual(8_000);
    expect(frames[idx - 1]!.t - 1_000).toBeLessThan(8_000);
    expect(state.phase).toBe('timeout');
    expect(updates.slice(idx + 1).every((u) => u === null)).toBe(true);
  });

  it('신뢰도 낮은 프레임만 계속 와도 8초가 지나면 timeout', () => {
    const frames = Array.from({ length: 60 }, (_, i) => frame(i * 166, face(60, 0.3)));
    expect(run(frames).updates).toContainEqual({ type: 'timeout' });
  });

  it('elapsedMs는 얼굴이 처음 보인 시각부터 잰다', () => {
    const { updates } = run([frame(5_000, face(62)), frame(5_500, face(62, 0.2)), frame(6_000, face(40))]);
    expect(updates.map((u) => (u?.type === 'detecting' ? u.elapsedMs : null))).toEqual([0, 500, 1_000]);
  });

  it('얼굴이 사라졌다 다시 나타나면 타이머를 새로 잰다', () => {
    const frames = [frame(0, face(60, 0.3)), frame(7_900), frame(8_100, face(60, 0.3)), frame(15_000, face(60, 0.3))];
    const { updates } = run(frames);
    expect(updates[2]).toMatchObject({ type: 'detecting', elapsedMs: 0 });
    expect(updates[3]).toMatchObject({ type: 'detecting', elapsedMs: 6_900 });
  });

  it('같은 프레임에서 확정과 타임아웃이 겹치면 확정한다', () => {
    const frames = [0, 2_000, 4_000, 6_000, 8_000].map((t) => frame(t, face(62)));
    expect(run(frames).last).toMatchObject({ type: 'decided', group: 'senior' });
  });

  it('확정 뒤에는 어떤 프레임도 무시한다 (D18: 재판정 없음)', () => {
    const decided = run([0, 1, 2, 3, 4].map((i) => frame(i, face(62)))).state;
    const after = run([frame(10), frame(11, face(20)), frame(99_999, face(20))], DEFAULT_RULES, decided);
    expect(after.updates).toEqual([null, null, null]);
    expect(after.state).toBe(decided);
  });

  it('설정값(기준 나이, 프레임 수, 신뢰도)을 따른다', () => {
    const rules = { seniorAge: 60, stableFrames: 2, minConfidence: 0.5, decideTimeoutMs: 1_000 };
    expect(run([frame(0, face(58, 0.6)), frame(1, face(58, 0.6))], rules).last).toMatchObject({
      type: 'decided',
      group: 'non_senior',
    });
  });

  it('stableFrames가 1 미만이면 1로 본다', () => {
    const rules = { ...DEFAULT_RULES, stableFrames: 0 };
    expect(run([frame(0, face(70))], rules).last).toMatchObject({ type: 'decided', group: 'senior' });
  });

  it('이벤트에 나이 숫자를 넣지 않는다 (D2)', () => {
    const frames = [frame(0, face(73)), frame(1, face(73, 0.1)), frame(2), ...[3, 4, 5, 6, 7].map((t) => frame(t, face(73)))];
    for (const u of run(frames).updates) {
      if (u) expect(JSON.stringify(u)).not.toContain('73');
      if (u) expect(Object.keys(u)).not.toContain('age');
    }
  });

  it('입력 상태를 바꾸지 않는다', () => {
    const s = initialAgeGateState();
    const copy = structuredClone(s);
    ageGateReducer(s, frame(0, face(62)), DEFAULT_RULES);
    expect(s).toEqual(copy);
  });
});

describe('noFaceGraceMs (얼굴 검출 깜빡임 유예)', () => {
  const grace = { ...DEFAULT_RULES, noFaceGraceMs: 500 };

  it('기본값은 0이다 (계약과 같은 동작)', () => {
    expect(DEFAULT_RULES.noFaceGraceMs).toBe(0);
  });

  it('유예 시간 안에 얼굴이 빠지면 이벤트 없이 연속 기록을 유지한다', () => {
    const { updates } = run([frame(0, face(62)), frame(166, face(62)), frame(332), frame(498, face(62))], grace);
    expect(updates[2]).toBeNull();
    expect(updates[3]).toMatchObject({ type: 'detecting', frameGroup: 'senior', run: 3, elapsedMs: 498 });
  });

  it('마지막으로 얼굴이 보인 뒤 유예 시간이 지나면 no_face로 초기화한다', () => {
    const { updates, state } = run([frame(0, face(62)), frame(300), frame(500)], grace);
    expect(updates[1]).toBeNull();
    expect(updates[2]).toEqual({ type: 'no_face' });
    expect(state).toEqual(initialAgeGateState());
  });

  it('유예 중에도 타임아웃 시간은 흐른다', () => {
    const frames = [frame(0, face(60, 0.3)), frame(7_900, face(60, 0.3)), frame(8_100)];
    expect(run(frames, grace).last).toEqual({ type: 'timeout' });
  });

  it('유예가 0이면 한 프레임만 빠져도 no_face', () => {
    const { updates } = run([frame(0, face(62)), frame(166)], { ...DEFAULT_RULES, noFaceGraceMs: 0 });
    expect(updates[1]).toEqual({ type: 'no_face' });
  });
});

describe('pickLargestFace', () => {
  it('얼굴이 없으면 null', () => {
    expect(pickLargestFace([])).toBeNull();
  });
});
