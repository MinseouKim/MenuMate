import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SttCallbacks } from '../services/stt/types';

const speech = vi.hoisted(() => ({ speaking: '', stopSpeaking: vi.fn(), silence: new Set<() => void>() }));
/** 직원 음성이 끝남 (끝까지 읽었거나 멈춤) */
const staffDone = () => { speech.speaking = ''; speech.silence.forEach(f => f()); };
vi.mock('./speech', () => ({
  speakingText: () => speech.speaking,
  stopSpeaking: () => { speech.stopSpeaking(); staffDone(); },
  onSilence: (f: () => void) => { speech.silence.add(f); return () => speech.silence.delete(f); },
}));
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
  it('손님이 "~요"로 말을 맺고 조용하면 버튼 없이 끝낸다 (인식 지연을 감안해 0.7초)', async () => {
    const stt = fakeStt();
    await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('두 명이에요'));
    act(() => { vi.advanceTimersByTime(699); });
    expect(stt.calls.stop).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(stt.calls.stop).toBe(1);
  });

  it('"그리고"처럼 이어 말할 것 같으면 더 기다리고, 말이 이어지면 다시 잰다', async () => {
    const stt = fakeStt();
    await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('짬뽕 하나랑 그리고'));
    act(() => { vi.advanceTimersByTime(1300); });
    act(() => stt.say().onInterim!('짬뽕 하나랑 그리고 탕수육'));
    act(() => { vi.advanceTimersByTime(900); });
    expect(stt.calls.stop).toBe(0);
    act(() => { vi.advanceTimersByTime(100); });
    expect(stt.calls.stop).toBe(1);
  });

  it('직원이 말하는 중: 자기 목소리 메아리는 무시하고, 손님 말이 이어지면 멈추고 알린다', async () => {
    const stt = fakeStt();
    const onBargeIn = vi.fn();
    speech.speaking = '몇 분이서 오셨어요?';
    const { hook } = await listen({ handsFree: true, provider: stt.provider, onBargeIn });
    expect(speech.stopSpeaking).not.toHaveBeenCalled(); // 듣기 시작이 직원 말을 끊지 않는다
    act(() => stt.say().onInterim!('몇 분이서'));
    expect(speech.stopSpeaking).not.toHaveBeenCalled();
    expect(hook.result.current.heard).toBe('');
    act(() => stt.say().onInterim!('몇 분이서 오셨어요 셋이요'));
    act(() => stt.say().onInterim!('몇 분이서 오셨어요 셋이요 아이'));
    expect(speech.stopSpeaking).toHaveBeenCalledTimes(1);
    expect(onBargeIn).toHaveBeenCalledTimes(1);
    expect(hook.result.current.heard).toBe('셋이요 아이');
  });

  // ── 2026-11-03 "음성이 전보다 안 좋아졌다" 원인 재현 ──
  it('직원 음성이 끝나면 그동안 쌓인 메아리를 버리고 새로 듣는다 (잘못 알아들은 메아리·맞장구가 손님 말에 섞이던 문제)', async () => {
    const stt = fakeStt();
    speech.speaking = '네!';
    const { onResult } = await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('네'));          // 맞장구 메아리
    speech.speaking = '몇 분이서 오셨어요?';
    act(() => stt.say().onInterim!('네 몇 분이 셨어요')); // 직원 질문 메아리(조금 잘못 알아들음)
    act(() => staffDone());
    expect(stt.calls.start).toBe(2);                 // 버퍼를 비우고 새 듣기
    act(() => stt.say().onInterim!('두 명이에요'));
    act(() => stt.say().onResult('두 명이에요'));
    expect(onResult).toHaveBeenCalledWith('두 명이에요');
  });

  it('끼어든 말 앞의 메아리가 조금 잘못 들렸어도 손님 말만 남긴다', async () => {
    const stt = fakeStt();
    speech.speaking = '몇 분이서 오셨어요?';
    const { onResult } = await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('몇 분이 셨어요'));
    act(() => stt.say().onInterim!('몇 분이 셨어요 셋이요'));
    act(() => stt.say().onInterim!('몇 분이 셨어요 셋이요 아이 하나'));
    act(() => stt.say().onResult('몇 분이 셨어요 셋이요 아이 하나'));
    expect(onResult).toHaveBeenCalledWith('셋이요 아이 하나');
  });

  it('기침·잡음 한 번으로는 직원 말을 끊지 않는다 (손님 말이 두 번 이어 들려야 끊음)', async () => {
    const stt = fakeStt();
    speech.speaking = '몇 분이서 오셨어요?';
    await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('흐음 켁'));
    expect(speech.stopSpeaking).not.toHaveBeenCalled();
  });

  it('한 번에 듣는 8초 제한은 손님이 말을 시작한 뒤부터 잰다 (조용히 기다리던 시간은 빼고)', async () => {
    const stt = fakeStt();
    await listen({ handsFree: true, provider: stt.provider });
    act(() => { vi.advanceTimersByTime(7500); });
    act(() => stt.say().onInterim!('두 명이고 그리고'));
    act(() => { vi.advanceTimersByTime(600); });
    expect(stt.calls.stop).toBe(0);
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

  // ── 2026-11-03 팀장 요청: 말이 끝나면 바로 인식해서 자연스럽게 ──
  it('인식기가 문장을 확정(final)했고 말을 맺은 꼴이면 0.25초 만에 넘기고 끝낸다 (끝 결과를 기다리지 않음)', async () => {
    const stt = fakeStt();
    const { hook, onResult } = await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('두 명이에요', true));
    act(() => { vi.advanceTimersByTime(249); });
    expect(onResult).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onResult).toHaveBeenCalledWith('두 명이에요');
    expect(stt.calls.stop).toBe(1);
    expect(hook.result.current.heard).toBe(''); // 자막은 비워 손님 말풍선(대화 기록)으로 넘어가게
  });

  it('바로 넘긴 뒤 늦게 온 끝 결과는 두 번 넘기지 않고, 그 사이 덧붙은 말만 이어서 넘긴다', async () => {
    const stt = fakeStt();
    const { onResult } = await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('두 명이에요', true));
    act(() => { vi.advanceTimersByTime(250); });
    act(() => stt.say().onResult('두 명이에요 아이 하나'));
    expect(onResult.mock.calls).toEqual([['두 명이에요'], ['아이 하나']]);
    const again = fakeStt();
    const second = await listen({ handsFree: true, provider: again.provider });
    act(() => again.say().onInterim!('셋이요', true));
    act(() => { vi.advanceTimersByTime(250); });
    act(() => again.say().onResult('셋이요'));
    expect(second.onResult.mock.calls).toEqual([['셋이요']]);
  });

  it('final이어도 이어질 꼴("…랑")이면 예전처럼 길게 기다린다', async () => {
    const stt = fakeStt();
    const { onResult } = await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('짬뽕 하나랑', true));
    act(() => { vi.advanceTimersByTime(1399); });
    expect(stt.calls.stop).toBe(0);
    expect(onResult).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(stt.calls.stop).toBe(1);
  });

  it('직원이 말하는 중 끼어들기로 확정되기 전에는 final이어도 넘기지 않는다 (메아리·기침 회귀 방지)', async () => {
    const stt = fakeStt();
    speech.speaking = '몇 분이서 오셨어요?';
    const { onResult } = await listen({ handsFree: true, provider: stt.provider });
    act(() => stt.say().onInterim!('흐음 켁', true));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onResult).not.toHaveBeenCalled();
    expect(stt.calls.stop).toBe(0);
  });

  it('마이크 끄기: 듣기를 멈추고 저절로 다시 듣지 않으며, 켜면 다시 듣는다', async () => {
    const stt = fakeStt();
    const { hook } = await listen({ handsFree: true, provider: stt.provider });
    act(() => hook.result.current.stop());
    expect(hook.result.current.off).toBe(true);
    expect(hook.result.current.listening).toBe(false);
    act(() => { stt.say().onEnd(); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { hook.result.current.start(); });
    expect(stt.calls.start).toBe(1);
    await act(async () => { hook.result.current.resume(); });
    expect(hook.result.current.off).toBe(false);
    expect(hook.result.current.listening).toBe(true);
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
