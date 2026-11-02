// 소리 내는 일 두 가지: 음성 안내 읽기, 직원 호출 알림음. 소리를 낼 수 없는 환경이면 조용히 넘어갑니다.
// 음성 안내는 서버의 Google TTS(밝은 직원 목소리)를 먼저 쓰고, 서버가 없거나 실패하면 브라우저 TTS로 읽습니다.
import { apiUrl, config } from '../config';

let token = 0;
let audio: HTMLAudioElement | null = null;
/** 지금 읽고 있는 안내가 끝나면 풀립니다 (마이크 자동 시작용) */
let current: Promise<void> = Promise.resolve();
/** 서버 TTS가 실패하면 잠시 서버를 건너뜁니다 (매 문장마다 기다리지 않게) */
let serverSkipUntil = 0;
const SKIP_MS = 60_000;
const FETCH_TIMEOUT_MS = 12000;

function browserSpeak(text: string, mine: number): Promise<void> {
  return new Promise(resolve => {
    if (!window.speechSynthesis) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = config.ttsRate;
    utterance.onend = utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
    // 일부 브라우저는 onend가 안 올 때가 있어 길이에 비례해 안전장치를 둡니다
    setTimeout(resolve, Math.min(30_000, 1500 + text.length * 180));
    if (mine !== token) resolve();
  });
}

/** 첫인사·맞장구처럼 늘 쓰는 문장의 음성. 서버 캐시는 서버가 잠들면 사라지므로 브라우저에 둡니다 (2026-11-03 설계 4-1) */
const prefetched = new Map<string, Blob>();
async function fetchSpeech(text: string, signal?: AbortSignal): Promise<Blob | null> {
  const res = await fetch(apiUrl('/api/tts'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal });
  return res.ok ? res.blob() : null;
}
export function prefetchSpeech(texts: string[]): void {
  if (!config.ttsServer || typeof fetch !== 'function') return;
  for (const text of texts) {
    if (prefetched.has(text)) continue;
    void fetchSpeech(text).then(blob => { if (blob) prefetched.set(text, blob); }).catch(() => { /* 다음 기회에 */ });
  }
}

async function serverSpeak(text: string, mine: number): Promise<boolean> {
  if (!config.ttsServer || typeof fetch !== 'function' || typeof Audio === 'undefined') return false;
  if (Date.now() < serverSkipUntil && !prefetched.has(text)) return false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const blob = prefetched.get(text) ?? await fetchSpeech(text, abort.signal);
    if (!blob) { serverSkipUntil = Date.now() + SKIP_MS; return false; }
    if (mine !== token) return true; // 그 사이 다른 안내로 바뀜: 조용히 버립니다
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    audio = el;
    await new Promise<void>(resolve => {
      el.onended = el.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      el.play().catch(() => resolve());
    });
    return true;
  } catch {
    serverSkipUntil = Date.now() + SKIP_MS;
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 지금 소리 내 읽고 있는 문장. 마이크에 들린 말이 이 소리의 메아리인지 가릴 때 씁니다 (listening.ts isEcho) */
let speakingNow = '';
export const speakingText = () => speakingNow;
/** 직원 음성이 끝나면(끝까지 읽었거나 멈춤) 알립니다. 핸즈프리 듣기가 그동안 쌓인 메아리를 버리고 새로 듣습니다 */
const silenceListeners = new Set<() => void>();
export function onSilence(listener: () => void): () => void {
  silenceListeners.add(listener);
  return () => { silenceListeners.delete(listener); };
}
/** 직원 음성이 시작되거나 끝날 때마다 알립니다. 화면의 "직원이 말하는 중" 표시가 씁니다 (useSyncExternalStore) */
const speakingListeners = new Set<() => void>();
export function onSpeakingChange(listener: () => void): () => void {
  speakingListeners.add(listener);
  return () => { speakingListeners.delete(listener); };
}
function quiet() {
  if (!speakingNow) return;
  speakingNow = '';
  silenceListeners.forEach(f => f());
  speakingListeners.forEach(f => f());
}

export function speak(text: string): Promise<void> {
  stopSpeaking();
  const mine = ++token;
  speakingNow = text;
  speakingListeners.forEach(f => f());
  current = (async () => {
    try {
      const ok = await serverSpeak(text, mine);
      if (!ok && mine === token) await browserSpeak(text, mine);
    } catch { /* 소리 없이 진행 */ }
    if (mine === token) quiet();
  })();
  return current;
}

export function stopSpeaking() {
  token++;
  quiet();
  window.speechSynthesis?.cancel();
  if (audio) { try { audio.pause(); } catch { /* ignore */ } audio = null; }
}

/** 지금 읽는 안내가 끝나면 풀립니다. 읽는 중이 아니면 바로. */
export const whenSilent = () => current;

/** 짧은 두 음 */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 660].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.25;
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.2, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.25);
    });
  } catch { /* 소리 없이 진행 */ }
}
