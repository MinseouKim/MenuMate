// 핸즈프리 대화의 듣기 규칙 (2026-11-03 설계 4-1, Yum·프론트 합의). 화면·브라우저와 무관한 순수 함수라 따로 테스트합니다.

/** 이어 말할 것 같은 끝말 ("그리고", "음…") → 조금 더 기다림 */
const CONTINUING = /(그리고|그러니까|근데|그럼|저기|하고|랑|음+|어+)$/;
/** 말을 맺는 끝말 ("~요", "~주세요", "~니다") → 빨리 보냄 */
const FINISHED = /(요|니다)$/;

/**
 * 손님 말이 멈춘 뒤 몇 ms 조용하면 "다 말했다"고 볼지. 버튼을 다시 누르지 않아도 끝나게 합니다.
 * 너무 일찍 끊겨도 생각 중에 이어 말하면 앞말과 합쳐 다시 보내므로(chat/amend) 짧게 잡습니다.
 */
export function endpointDelay(text: string, large = false): number {
  const t = text.trim().replace(/[.!?…~,\s]+$/, '');
  const base = CONTINUING.test(t) ? 1200 : FINISHED.test(t) ? 500 : 800;
  return base + (large ? 500 : 0);
}

const norm = (s: string) => s.replace(/[\s.,!?…~'"“”‘’·]/g, '');

/**
 * 직원 음성이 나오는 동안 들린 말이 그 음성 자체(스피커 → 마이크)인지.
 * 지금 읽는 문장에 없는 글자가 2자를 넘으면 손님이 끼어든 것으로 봅니다.
 */
export function isEcho(heard: string, speaking: string): boolean {
  const s = norm(speaking);
  if (!s) return false;
  const h = norm(heard);
  let unmatched = 0;
  for (let i = 0; i < h.length;) {
    let len = 0;
    for (let l = h.length - i; l >= 2; l--) if (s.includes(h.slice(i, i + l))) { len = l; break; }
    if (len) i += len;
    else { unmatched++; i++; }
    if (unmatched > 2) return false;
  }
  return true;
}

/** 끼어든 말 앞에 섞여 들어온 직원 문장 조각을 덜어 냅니다 ("몇 분이서 오셨어요 셋이요" → "셋이요"). */
export function stripEcho(text: string, spoken: string): string {
  const s = norm(spoken);
  const words = text.trim().split(/\s+/);
  let cut = 0;
  while (cut < words.length && s && s.includes(norm(words.slice(0, cut + 1).join('')))) cut++;
  return words.slice(cut).join(' ');
}
