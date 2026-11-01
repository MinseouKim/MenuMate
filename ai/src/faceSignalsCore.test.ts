import { describe, expect, it } from 'vitest';
import { DEFAULT_SIGNAL_RULES, initialSignalState, signalReducer, type SignalFrame, type SignalState } from './faceSignalsCore';

const rules = { ...DEFAULT_SIGNAL_RULES, baselineMs: 1000, holdMs: 1000, cooldownMs: 5000 };

function run(frames: SignalFrame[], from: SignalState = initialSignalState()) {
  const signals: { t: number; signal: string }[] = [];
  let state = from;
  for (const f of frames) {
    const out = signalReducer(state, f, rules);
    state = out.state;
    if (out.signal) signals.push({ t: f.t, signal: out.signal });
  }
  return { state, signals };
}
const frame = (t: number, faceRatio: number | null, squint: number | null = 0): SignalFrame => ({ t, faceRatio, squint });
const series = (from: number, to: number, step: number, ratio: number, squint = 0) => {
  const out: SignalFrame[] = [];
  for (let t = from; t <= to; t += step) out.push(frame(t, ratio, squint));
  return out;
};

describe('faceSignals', () => {
  it('기준 시간 전에는 가까워짐을 판단하지 않는다', () => {
    const { state, signals } = run([...series(0, 500, 100, 0.05), ...series(600, 900, 100, 0.2)]);
    expect(state.baseline).toBeNull();
    expect(signals).toEqual([]);
  });

  it('기준보다 1.6배 커진 상태가 holdMs 이상 이어지면 approach', () => {
    const { signals } = run([...series(0, 1000, 100, 0.05), ...series(1100, 2200, 100, 0.09)]);
    expect(signals).toEqual([{ t: 2100, signal: 'approach' }]);
  });

  it('잠깐 커졌다 돌아오면 신호가 없다', () => {
    const { signals } = run([...series(0, 1000, 100, 0.05), ...series(1100, 1500, 100, 0.09), ...series(1600, 3000, 100, 0.05)]);
    expect(signals).toEqual([]);
  });

  it('눈 찌푸림이 holdMs 이상 이어지면 squint', () => {
    const { signals } = run([...series(0, 1000, 100, 0.05), ...series(1100, 2200, 100, 0.05, 0.7)]);
    expect(signals).toEqual([{ t: 2100, signal: 'squint' }]);
  });

  it('얼굴이 사라지면 진행 중인 후보를 버린다', () => {
    const { signals } = run([...series(0, 1000, 100, 0.05), ...series(1100, 1700, 100, 0.09), frame(1800, null, null), ...series(1900, 2500, 100, 0.09)]);
    expect(signals).toEqual([]);
  });

  it('신호 뒤에는 cooldown 동안 다시 내지 않는다', () => {
    const { signals } = run([...series(0, 1000, 100, 0.05), ...series(1100, 8000, 100, 0.09)]);
    expect(signals.map(s => s.t)).toEqual([2100, 7100]);
  });

  it('기준은 처음 구간의 중앙값이라 튀는 값에 흔들리지 않는다', () => {
    const { state } = run([frame(0, 0.05), frame(200, 0.5), frame(400, 0.05), frame(600, 0.05), frame(800, 0.05), frame(1000, 0.05)]);
    expect(state.baseline).toBe(0.05);
  });
});
