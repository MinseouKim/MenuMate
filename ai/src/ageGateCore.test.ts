import { describe, expect, it, vi } from 'vitest';
import { createAgeGateCore, type AgeEstimator, type Clock, type FaceDetection, type FaceDetector } from './ageGateCore';
import { DEFAULT_RULES, type AgeGateUpdate } from './types';

/** setTimeout을 손으로 돌리는 시계 */
function manualClock() {
  let now = 0;
  let queue: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      queue.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (id) => {
      queue = queue.filter((q) => q.id !== id);
    },
  };
  /** ms만큼 시간을 보내며 예약된 작업을 실행하고, 비동기 추론이 끝나기를 기다린다 */
  async function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      queue.sort((a, b) => a.at - b.at);
      const next = queue[0];
      if (!next || next.at > end) break;
      queue.shift();
      now = next.at;
      next.fn();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }
    now = end;
  }
  return { clock, advance, pending: () => queue.length };
}

const video = { readyState: 4, videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;

function setup(opts: { faces?: () => FaceDetection[]; age?: () => number | Promise<number> } = {}) {
  const detect = vi.fn<FaceDetector['detect']>(opts.faces ?? (() => [{ box: { x: 100, y: 100, width: 200, height: 200 }, score: 0.95 }]));
  const estimate = vi.fn<AgeEstimator['estimate']>(async () => (opts.age ? opts.age() : 63));
  const detector: FaceDetector = { detect, close: vi.fn() };
  const estimator: AgeEstimator = { backend: 'wasm', estimate, close: vi.fn() };
  const { clock, advance, pending } = manualClock();
  const gate = createAgeGateCore(detector, estimator, { rules: DEFAULT_RULES, fps: 5, clock });
  const updates: AgeGateUpdate[] = [];
  gate.onUpdate((u) => updates.push(u));
  return { gate, detect, estimate, detector, estimator, advance, pending, updates };
}

describe('createAgeGateCore', () => {
  it('fps 주기로 추론해 5프레임째에 확정한다', async () => {
    const { gate, advance, updates, detect } = setup();
    gate.start(video);
    await advance(1000);
    expect(detect).toHaveBeenCalledTimes(5);
    expect(updates.map((u) => u.type)).toEqual(['detecting', 'detecting', 'detecting', 'detecting', 'decided']);
    expect(updates[4]).toEqual({ type: 'decided', group: 'senior', ageBand: '55plus', confidence: 0.95, source: 'model' });
  });

  it('확정 뒤에는 reset 전까지 추론하지 않는다', async () => {
    const { gate, advance, detect, updates } = setup();
    gate.start(video);
    await advance(1000);
    await advance(3000);
    expect(detect).toHaveBeenCalledTimes(5);
    gate.reset();
    await advance(400);
    expect(detect).toHaveBeenCalledTimes(7);
    expect(updates.at(-1)).toMatchObject({ type: 'detecting', run: 2 });
  });

  it('가장 큰 얼굴 1개만 나이를 추정한다', async () => {
    const small = { box: { x: 0, y: 0, width: 50, height: 50 }, score: 0.99 };
    const big = { box: { x: 300, y: 100, width: 180, height: 220 }, score: 0.9 };
    const { gate, advance, estimate } = setup({ faces: () => [small, big] });
    gate.start(video);
    await advance(0);
    expect(estimate).toHaveBeenCalledTimes(1);
    expect(estimate.mock.calls[0]![1]).toEqual(big.box);
  });

  it('얼굴이 작으면 신뢰도를 낮춰 판정에 쓰지 않는다', async () => {
    const { gate, advance, updates } = setup({ faces: () => [{ box: { x: 0, y: 0, width: 40, height: 40 }, score: 0.95 }] });
    gate.start(video);
    await advance(0);
    expect(updates[0]).toMatchObject({ type: 'detecting', frameGroup: 'low_confidence' });
  });

  it('얼굴이 없으면 나이 추정을 하지 않는다', async () => {
    const { gate, advance, estimate, updates } = setup({ faces: () => [] });
    gate.start(video);
    await advance(1000);
    expect(estimate).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('영상이 준비되지 않았으면 건너뛴다', async () => {
    const { gate, advance, detect } = setup();
    gate.start({ readyState: 1, videoWidth: 0, videoHeight: 0 } as HTMLVideoElement);
    await advance(1000);
    expect(detect).not.toHaveBeenCalled();
  });

  it('force는 즉시 decided(forced)를 보내고 모델 판정을 멈춘다', async () => {
    const { gate, advance, updates, detect } = setup({ age: () => 20 });
    gate.start(video);
    await advance(200);
    gate.force('senior');
    expect(updates.at(-1)).toEqual({ type: 'decided', group: 'senior', ageBand: '55plus', confidence: 1, source: 'forced' });
    const calls = detect.mock.calls.length;
    await advance(2000);
    expect(detect.mock.calls.length).toBe(calls);
  });

  it('force는 확정 뒤에도 동작한다', async () => {
    const { gate, advance, updates } = setup({ age: () => 30 });
    gate.start(video);
    await advance(1000);
    expect(updates.at(-1)).toMatchObject({ type: 'decided', group: 'non_senior' });
    gate.force('senior');
    expect(updates.at(-1)).toMatchObject({ type: 'decided', group: 'senior', source: 'forced' });
  });

  it('추론 도중 reset되면 그 프레임 결과를 버린다', async () => {
    let release: (n: number) => void = () => {};
    const { gate, advance, updates } = setup({ age: () => new Promise<number>((r) => (release = r)) });
    gate.start(video);
    await advance(0);
    gate.reset();
    release(70);
    await advance(0);
    expect(updates).toEqual([]);
  });

  it('추론 실패는 연속 실패 중 한 번만 알리고 루프는 계속 돈다', async () => {
    let fail = true;
    const { gate, advance, updates, detect } = setup({
      age: () => {
        if (fail) throw new Error('boom');
        return 62;
      },
    });
    gate.start(video);
    await advance(600);
    expect(updates).toEqual([{ type: 'error', code: 'inference_failed', message: 'boom' }]);
    fail = false;
    await advance(200);
    expect(updates.at(-1)).toMatchObject({ type: 'detecting', frameGroup: 'senior' });
    expect(detect.mock.calls.length).toBeGreaterThan(3);
  });

  it('stop하면 추론 예약을 지운다', async () => {
    const { gate, advance, detect, pending } = setup();
    gate.start(video);
    await advance(200);
    gate.stop();
    expect(pending()).toBe(0);
    const calls = detect.mock.calls.length;
    await advance(2000);
    expect(detect.mock.calls.length).toBe(calls);
  });

  it('구독 해제 후에는 이벤트를 받지 않고, 콜백 오류가 다른 구독자를 막지 않는다', async () => {
    const { gate, advance } = setup();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a: AgeGateUpdate[] = [];
    const b: AgeGateUpdate[] = [];
    gate.onUpdate(() => {
      throw new Error('ui bug');
    });
    const off = gate.onUpdate((u) => a.push(u));
    gate.onUpdate((u) => b.push(u));
    gate.start(video);
    await advance(0);
    off();
    await advance(200);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
    err.mockRestore();
  });

  it('dispose는 모델 자원을 닫는다', () => {
    const { gate, detector, estimator } = setup();
    gate.dispose();
    expect(detector.close).toHaveBeenCalled();
    expect(estimator.close).toHaveBeenCalled();
  });
});
