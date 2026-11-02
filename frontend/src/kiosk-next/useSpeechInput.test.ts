import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SttCallbacks } from '../services/stt/types';

const speech = vi.hoisted(() => ({ speaking: '', stopSpeaking: vi.fn() }));
vi.mock('./speech', () => ({ speakingText: () => speech.speaking, stopSpeaking: () => { speech.stopSpeaking(); speech.speaking = ''; } }));
vi.mock('../prototype/media', () => ({ microphoneGranted: async () => true, requestMicrophone: async () => null }));

import { useSpeechInput } from './useSpeechInput';

/** 브라우저 음성 인식 자리에 서는 가짜. 화면이 넘긴 콜백을 잡아 두고 손님 말을 흉내 냅니다. */
function fakeStt() {
  const calls = { start: 0, stop: 0 };
  let cb: SttCallbacks | null = null;
  const provider = {
    isSupported: () => true,
    start(c: SttCallbacks) { calls.start++; cb = c; },
    stop() { calls.stop++; },
    cancel() {},
  };
  return { provider, calls, say: () => cb! };
}

async function listen(opts: Parameters<typeof useSpeechInput>[1]) {
  const onResult = vi.fn();
  const hook = renderHook(() => useSpeechInput(onResult, opts));
  await act(async () => { hook.result.current.start(); });
  return { hook, onResult };
}

beforeEach(() => { vi.useFakeTimers(); speech.speaking = ''; speech.stopSpeaking.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe('useSpeechInput 핸즈프리 (2026-11-03 설계 4-1)', () => {
  it('손님이 "~요"로 말을 맺고 0.5초 조용하면 버튼 없이 끝낸다', async () => {
    const stt = fakeStt();
    await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('두 명이에요'));
    act(() => { vi.advanceTimersByTime(499); });
    expect(stt.calls.stop).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(stt.calls.stop).toBe(1);
  });

  it('"그리고"처럼 이어 말할 것 같으면 1.2초까지 기다리고, 말이 이어지면 다시 잰다', async () => {
    const stt = fakeStt();
    await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('짬뽕 하나랑 그리고'));
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => stt.say().onInterim!('짬뽕 하나랑 그리고 탕수육'));
    act(() => { vi.advanceTimersByTime(700); });
    expect(stt.calls.stop).toBe(0);
    act(() => { vi.advanceTimersByTime(100); });
    expect(stt.calls.stop).toBe(1);
  });

  it('직원이 말하는 중: 자기 목소리 메아리는 무시하고, 손님이 끼어들면 바로 멈추고 알린다', async () => {
    const stt = fakeStt();
    const onBargeIn = vi.fn();
    speech.speaking = '몇 분이서 오셨어요?';
    const { hook } = await listen({ handsFree: true, provider: stt.provider, onBargeIn });
    expect(speech.stopSpeaking).not.toHaveBeenCalled(); // 듣기 시작이 직원 말을 끊지 않는다
    act(() => stt.say().onInterim!('몇 분이서'));
    expect(speech.stopSpeaking).not.toHaveBeenCalled();
    expect(hook.result.current.heard).toBe('');
    act(() => stt.say().onInterim!('몇 분이서 오셨어요 셋이요'));
    expect(speech.stopSpeaking).toHaveBeenCalledTimes(1);
    expect(onBargeIn).toHaveBeenCalledTimes(1);
    expect(hook.result.current.heard).toBe('셋이요');
  });

  it('끝난 문장에서 앞에 섞인 직원 목소리를 덜어 내고 넘긴다', async () => {
    const stt = fakeStt();
    speech.speaking = '몇 분이서 오셨어요?';
    const { onResult } = await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('몇 분이서 오셨어요 셋이요'));
    act(() => stt.say().onResult('몇 분이서 오셨어요 셋이요'));
    expect(onResult).toHaveBeenCalledWith('셋이요');
  });

  it('아무 말 없이 끝나면 오류를 띄우지 않고 다시 듣는다', async () => {
    const stt = fakeStt();
    const { hook } = await listen({ handsFree: true, provider: stt.provider });
    act(() => { stt.say().onError('말소리가 들리지 않았어요'); stt.say().onEnd(); });
    expect(hook.result.current.error).toBe('');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(stt.calls.start).toBe(2);
  });

  it('마이크 권한 문제처럼 코드가 있는 오류는 알리고 다시 시도하지 않는다', async () => {
    const stt = fakeStt();
    const { hook } = await listen({ handsFree: true, provider: stt.provider });
    act(() => { stt.say().onError('마이크 권한이 막혀 있어요', 'not-allowed'); stt.say().onEnd(); });
    expect(hook.result.current.error).toContain('마이크 권한');
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(stt.calls.start).toBe(1);
  });
});
