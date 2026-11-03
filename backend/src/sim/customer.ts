// 손님 연기: Persona 설정대로 키오스크 직원 AI에게 한 마디씩 답하고, 추천을 받으면 주문할지 평가합니다.
import type { LlmClient } from '../chat.js';
import type { MenuKnowledge } from '../menuKnowledge.js';
import type { Customer, CustomerTurn } from './run.js';
import type { Persona } from './personas.js';
import { violations } from './score.js';

const SCHEMA = {
  type: 'object',
  properties: { say: { type: 'string' }, accept: { type: ['boolean', 'null'] }, why: { type: ['string', 'null'] } },
  required: ['say', 'accept', 'why'],
} as const;

/** 손님 설정 카드 (손님 AI 지시문, Claude 시험 도구 출력에 같이 씀) */
export function card(p: Persona): string {
  return [
    `나이 ${p.age}, 성별 ${p.gender}, 배경 ${p.background}. 말하는 방식: ${p.style}.`,
    // 총인원을 분명히: "일행 3명(아이 포함)"을 손님 AI가 "아이 포함 네 명"으로 말한 적이 있음 (2026-11-03 회차)
    `${p.party === 1 ? '혼자 왔음(총 1명)' : `일행은 ${p.withKids ? '아이' : '손님 본인'}까지 모두 합쳐 ${p.party}명`}. 매운맛: ${p.spicy}. 빼야 할 재료: ${p.exclude.length ? p.exclude.join(', ') : '없음'}.`,
    `먹고 싶은 것: ${p.want}.${p.budget ? ` 1인 예산 ${p.budget.toLocaleString('ko-KR')}원.` : ''}`,
  ].join('\n');
}

const RULES = [
  '당신은 중식당 "우루루 평촌본점" 키오스크 앞에 선 손님을 연기합니다. 상대는 키오스크의 직원 AI입니다.',
  '아래 손님 설정 그대로 말합니다. 배경에 맞는 말투·사투리·한국어 실력(서툴면 서툰 대로, 영어를 섞는 사람은 섞어서)을 지킵니다.',
  '직원의 마지막 말에 손님으로서 한 번만 답합니다(say). 실제 손님처럼 대부분 짧게 말하고, 묻지 않은 설정을 한꺼번에 다 말하지 않습니다.',
  '설정에 없는 사실은 지어내지 않습니다. accept와 why는 null로 둡니다(추천 평가 때만 채움).',
];

// ── 예시 답변 손님: 손님 쪽 토큰 0 (팀장 요청 2026-11-03: 토큰이 빨리 닳으면 예시 답변으로 데이터를 계속 만듦) ──
const NUM = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟'];
const SPICY_SAY: Record<Persona['spicy'], string> = { '못 먹음': '매운 건 못 먹어요', 조금: '조금 매운 건 괜찮아요', 좋아함: '매운 거 좋아해요', 상관없음: '맵기는 상관없어요' };
const WANT_SAY: Record<string, string> = {
  면: '면 요리요', 밥: '밥으로 할게요', 딤섬: '딤섬 주세요', '요리 나눠 먹기': '같이 나눠 먹을 요리요',
  아무거나: '아무거나 괜찮아요', '따뜻한 국물': '국물 있는 거요', '아직 안 정함': '잘 모르겠어요, 추천해 주세요',
};
/** 배경 말투로 바꿉니다 (사투리·서툰 한국어·영어 섞기) */
function accent(s: string, background: string, n: number): string {
  // "두 명이에요" → 이라예/이랑께/이유, "못 먹어요" → 예/잉/유 (어미에 맞춰 바꿈, 2026-11-03 첫 회차에서 "못 먹어이유"로 나와 고침)
  if (background.includes('경상도')) return s.replace(/(이에요|예요)$/, '이라예').replace(/요$/, '예');
  if (background.includes('전라도')) return s.replace(/(이에요|예요)$/, '이랑께').replace(/요$/, '요잉');
  if (background.includes('충청도')) return s.replace(/(이에요|예요)$/, '이유').replace(/요$/, '유');
  if (background.includes('중국인')) return s.replace(/(이에요|예요)$/, ' 이에요').replace('는 빼', ' 빼');
  if (background.includes('베트남')) return s.replace(/(\S+) 명이에요/, '$1 사람 있어요');
  if (background.includes('미국인')) return `${['', 'Just me', 'Two', 'Three', 'Four', 'Five', 'Six'][Math.min(n, 6)] || 'Um'}… ${s}`;
  if (background.includes('일본인')) return s.replace(/(이에요|예요)$/, ' 입니다');
  return s;
}

export function scriptedCustomer(knowledge: MenuKnowledge, seed: number): Customer {
  return async (p, turns, final, asking): Promise<CustomerTurn> => {
    if (final) {
      const bad = violations(p, final.picks, knowledge);
      const ok = final.picks.length > 0 && bad.length === 0;
      return { say: '', accept: ok, why: ok ? '조건에 맞아서 주문할게요' : bad[0] ?? '추천이 없어요' };
    }
    const k = (seed + turns.length) % 3;
    const partyText = p.party === 1 ? '혼자예요' : `${NUM[p.party] ?? p.party} 명이에요`;
    const base: Record<string, string> = {
      party: (p.style.includes('고쳐') && p.party > 1 ? `${NUM[p.party - 1]} 명, 아니 ` : '') + partyText + (p.withKids ? ' 아이도 있어요' : ''),
      spicy: SPICY_SAY[p.spicy],
      kind: WANT_SAY[p.want] ?? '아무거나요',
      exclude: p.exclude.length ? `${p.exclude.join(', ')}는 빼 주세요` : '빼는 거 없어요',
      other: ['네', '아무거나 추천해 주세요', '네, 좋아요'][k],
    };
    let say = accent(base[asking ?? 'other'] ?? base.other, p.background, p.party);
    if (p.style.includes('결정') || p.background.includes('느린 말투')) say = `음… ${say}`;
    if (p.style.includes('서두름')) say = `${say}, 빨리요`;
    return { say };
  };
}

/** knowledge: 추천 평가 때 메뉴 이름을 보여 주려고 씁니다 */
export function llmCustomer(llm: LlmClient, knowledge?: MenuKnowledge): Customer {
  return async (persona, turns, final): Promise<CustomerTurn> => {
    // 손님 입장에서는 직원 말이 상대(user), 자기 말이 model
    const messages = turns.map((t) => ({ role: t.role === 'assistant' ? ('user' as const) : ('model' as const), text: t.text }));
    if (final) {
      const names = final.picks.map((id) => knowledge?.byId(id)?.name ?? id).join(', ') || '(추천 메뉴 없음)';
      messages.push({ role: 'user', text: `[추천 결과] ${names}\n손님 설정으로 볼 때 이 추천을 주문하겠습니까? say는 빈 문자열, accept(true/false), why(한 문장)를 주세요.` });
    }
    const text = await llm.generateJson([[...RULES, '', '손님 설정:', card(persona)].join('\n')], messages, SCHEMA, new AbortController().signal);
    const out = JSON.parse(text) as CustomerTurn;
    return { say: typeof out.say === 'string' ? out.say.trim() : '', accept: out.accept ?? null, why: out.why ?? null };
  };
}
