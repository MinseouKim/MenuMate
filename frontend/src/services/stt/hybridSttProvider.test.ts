// 브라우저 음성 인식이 없어 이 기기 안의 Whisper로 받아 적을 때, 지어낸 문장·소리 없는 녹음을 손님 말로 넘기지 않는지 (2026-11-03 시연 녹화 버그)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SttCallbacks } from './types';

const fake = vi.hoisted(() => ({ audio: new Float32Array(0), text: '' }));
vi.mock('./audioRecorder', () => ({
  recorderSupported: () => true,
  AudioRecorder: class { start() { return Promise.resolve(); } stop() { return Promise.resolve(fake.audio); } cancel() {} },
}));
vi.mock('./localWhisper', () => ({ loadWhisper: () => Promise.resolve(), transcribeLocal: vi.fn(async () => fake.text) }));

import { HybridSttProvider } from './hybridSttProvider';
import { transcribeLocal } from './localWhisper';

const RATE = 16000;
const speechAudio = () => Float32Array.from({ length: RATE }, (_, i) => 0.12 * Math.sin(2 * Math.PI * 180 * (i / RATE)));

async function listenOnce() {
  const calls: { result: string[]; errors: [string, string | undefined][]; ended: number } = { result: [], errors: [], ended: 0 };
  const cb: SttCallbacks = { onResult: t => calls.result.push(t), onError: (m, c) => calls.errors.push([m, c]), onEnd: () => { calls.ended++; } };
  const stt = new HybridSttProvider();
  stt.start(cb);
  stt.stop();
  await vi.waitFor(() => expect(calls.ended).toBe(1));
  return calls;
}

beforeEach(() => { vi.mocked(transcribeLocal).mockClear(); });
afterEach(() => { fake.audio = new Float32Array(0); fake.text = ''; });

describe('HybridSttProvider 로컬 Whisper 결과 거르기', () => {
  it('말소리가 있고 제대로 받아 적었으면 손님 말로 넘긴다', async () => {
    fake.audio = speechAudio(); fake.text = '두 명이에요';
    const calls = await listenOnce();
    expect(calls.result).toEqual(['두 명이에요']);
    expect(calls.errors).toEqual([]);
  });

  it('Whisper가 지어낸 문장("이 영상은 … 만나요!")은 넘기지 않고, 코드 없는 "못 들음"으로 끝내 핸즈프리가 조용히 다시 듣게 한다', async () => {
    fake.audio = speechAudio(); fake.text = '이 영상은 이 영상에서 영상에서 만나요!';
    const calls = await listenOnce();
    expect(calls.result).toEqual([]);
    expect(calls.errors).toHaveLength(1);
    expect(calls.errors[0][1]).toBeUndefined();
  });

  it('녹음이 길어도 말소리로 보기 어려울 만큼 조용하면 받아 적지도 않는다', async () => {
    fake.audio = Float32Array.from({ length: RATE * 2 }, (_, i) => ((i * 7919) % 13 - 6) / 2000); fake.text = '감사합니다 여러분';
    const calls = await listenOnce();
    expect(transcribeLocal).not.toHaveBeenCalled();
    expect(calls.result).toEqual([]);
    expect(calls.errors[0][1]).toBeUndefined();
  });
});
