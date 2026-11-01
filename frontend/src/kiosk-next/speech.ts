// 소리 내는 일 두 가지: 음성 안내 읽기, 직원 호출 알림음. 소리를 낼 수 없는 환경이면 조용히 넘어갑니다.
import { config } from '../config';

export function speak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = config.ttsRate;
  window.speechSynthesis.speak(utterance);
}

export const stopSpeaking = () => window.speechSynthesis?.cancel();

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
