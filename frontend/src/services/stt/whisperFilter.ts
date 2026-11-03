/**
 * 이 기기 안의 Whisper(브라우저 음성 인식이 안 될 때의 대체 수단)가 받아 적은 것을 손님 말로 넘기기 전에 거릅니다.
 * Whisper는 말소리가 없거나 기계음("삐")만 있으면 방송·영상 끝인사 같은 문장을 지어냅니다 (2026-11-03 시연 녹화에서
 * "이 영상은 이 영상에서 영상에서 만나요!"가 손님 말로 /api/chat 에 들어감). 실제 짧은 답("네", "두 명")은 버리지 않습니다.
 * 녹음은 메모리에서 계산만 하고 저장하지 않습니다 (D2).
 */

const RATE = 16000;
/** 20ms 한 칸 */
const FRAME = RATE / 50;
/** 이보다 센(RMS) 칸을 말소리 칸으로 봅니다. 조용한 매장 잡음은 0.002~0.005 정도 */
const VOICE_RMS = 0.01;
/** 말소리 칸이 모두 합쳐 이만큼은 있어야 말로 봅니다. "네" 한 마디(약 0.25초)는 넘고, 딸깍·톡 한 번은 못 넘음 */
const MIN_VOICED_SECONDS = 0.16;

/** 녹음(16kHz 모노)에 말소리로 볼 만한 소리가 있었는지 */
export function speechLike(audio: Float32Array): boolean {
  let voiced = 0;
  for (let start = 0; start + FRAME <= audio.length; start += FRAME) {
    let sum = 0;
    for (let i = start; i < start + FRAME; i++) sum += audio[i] * audio[i];
    if (Math.sqrt(sum / FRAME) >= VOICE_RMS) voiced++;
  }
  return voiced * (FRAME / RATE) >= MIN_VOICED_SECONDS;
}

/** 손님이 키오스크 앞에서 할 리 없는 영상·방송 말투 */
const BROADCAST = [/영상/, /시청/, /구독/, /자막/, /채널/, /여러분/, /\b(MBC|KBS|SBS|JTBC|YTN)\b/i, /뉴스/, /다음 (시간|편)에/, /만나요[.!~]*$/];
/** "감사합니다"만 혼자 나오면 지어낸 것으로 봅니다 (앞뒤에 주문 말이 붙으면 그대로 둠) */
const THANKS_ONLY = /^(정말 |대단히 )?(감사합니다|감사해요|고맙습니다)[.!~]*$/;

/** 소리가 없을 때 Whisper가 지어내기 쉬운 문장인지 */
export function isHallucination(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (THANKS_ONLY.test(t) || BROADCAST.some(re => re.test(t))) return true;
  // 같은 말 되풀이: 한 낱말만 4번 이상("네 네 네 네"), 또는 두 글자 이상 낱말이 3번 이상 연달아("그래서 그래서 그래서").
  // 떨어져 나오는 되풀이("짬뽕 하나 짜장 하나 탕수육 하나")는 실제 주문이라 버리지 않음
  const words = t.replace(/[.,!?~…]/g, '').split(' ').filter(Boolean);
  if (words.length >= 4 && words.every(w => w === words[0])) return true;
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    run = words[i] === words[i - 1] ? run + 1 : 1;
    if (run >= 3 && words[i].length >= 2) return true;
  }
  return false;
}
