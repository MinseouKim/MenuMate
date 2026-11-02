// 대화 시뮬레이션용 손님 묶음 (2026-11-03 팀장 요청: 연령대·성별·국적이 다양한 손님과 대화해 데이터를 모음).
// 성별·국적은 말투와 한국어 실력의 다양성을 시험하는 데만 씁니다. "이 성별·국적이면 이 메뉴" 같은 추천 규칙에는 쓰지 않습니다.
// 같은 seed면 같은 손님들이 나오므로, 프롬프트를 고친 뒤 같은 손님으로 다시 시험해 나아졌는지 잴 수 있습니다.

export type SpicyLike = '못 먹음' | '조금' | '좋아함' | '상관없음';
export interface Persona {
  id: string;
  age: string;
  gender: '남' | '여';
  /** 출신·언어 배경 (말투와 한국어 실력에 반영) */
  background: string;
  /** 말하는 방식 */
  style: string;
  party: number;
  withKids: boolean;
  spicy: SpicyLike;
  /** 빼야 하는 재료 (메뉴 데이터의 재료 이름) */
  exclude: string[];
  /** 먹고 싶은 것 (직원이 물어야 말함) */
  want: string;
  /** 1인 예산(원). 없으면 null */
  budget: number | null;
}

/** 시뮬레이터·Claude 시험 도구가 같은 손님 번호로 같은 손님을 쓰도록 공유 */
export const PERSONA_SEED = 2026;

const AGES = ['10대', '20대', '30대', '40대', '50대', '60대', '70대 이상'];
const BACKGROUNDS = [
  '한국인(서울 표준어)', '한국인(경상도 사투리)', '한국인(전라도 사투리)', '한국인(충청도 사투리, 느린 말투)',
  '중국인 유학생(한국어 서툼)', '베트남 출신 직장인(한국어 중급)', '미국인 관광객(한국어 아주 조금, 영어 섞음)',
  '일본인 관광객(한국어 초급)', '우즈베키스탄 출신(무슬림, 돼지고기 안 먹음)', '인도 출신(채식, 고기·해산물 안 먹음)',
];
const STYLES = ['말이 아주 짧음', '수다스러움', '결정을 잘 못함', '바빠서 서두름', '아주 공손함', '말을 자주 고쳐 말함', '무뚝뚝함'];
const SPICY: SpicyLike[] = ['못 먹음', '조금', '좋아함', '상관없음'];
const EXCLUDES = [[], [], [], ['새우'], ['견과류'], ['해산물'], ['돼지고기'], ['계란']];
const WANTS = ['면', '밥', '딤섬', '요리 나눠 먹기', '아무거나', '따뜻한 국물', '아직 안 정함'];
const MEAT = ['돼지고기', '소고기', '닭고기', '오리', '해산물'];

/** 같은 seed면 같은 수열 (mulberry32) */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makePersonas(count: number, seed: number): Persona[] {
  const rnd = random(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  return Array.from({ length: count }, (_, i) => {
    // 연령대·성별·배경은 고르게 돌리고, 나머지는 무작위로 섞습니다.
    const age = AGES[i % AGES.length];
    const background = BACKGROUNDS[(i * 3 + Math.floor(i / BACKGROUNDS.length)) % BACKGROUNDS.length];
    const withKids = ['30대', '40대', '50대'].includes(age) && rnd() < 0.35;
    const party = withKids ? 2 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 5);
    const exclude = new Set(pick(EXCLUDES));
    if (background.includes('돼지고기 안 먹음')) exclude.add('돼지고기');
    if (background.includes('채식')) MEAT.forEach((m) => exclude.add(m));
    return {
      id: `p${seed}-${i + 1}`,
      age,
      gender: i % 2 === 0 ? '여' : '남',
      background,
      style: pick(STYLES),
      party,
      withKids,
      spicy: withKids && rnd() < 0.6 ? '못 먹음' : pick(SPICY),
      exclude: [...exclude],
      want: pick(WANTS),
      budget: rnd() < 0.2 ? 10000 + 5000 * Math.floor(rnd() * 4) : null,
    };
  });
}
