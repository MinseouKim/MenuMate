import { describe, expect, it } from 'vitest';
import { dropPrefix, endpointDelay, finalDelay, isEcho, stripEcho } from './listening';

describe('endpointDelay (말끝 감지)', () => {
  it('"~요/주세요"로 끝나면 0.7초, "그리고/음"처럼 이어 갈 말이면 1.4초, 그 밖은 1초 (인식 지연 감안)', () => {
    expect(endpointDelay('두 명이에요')).toBe(700);
    expect(endpointDelay('새우는 빼 주세요')).toBe(700);
    expect(endpointDelay('짬뽕 하나랑 그리고')).toBe(1400);
    expect(endpointDelay('음')).toBe(1400);
    expect(endpointDelay('셋')).toBe(1000);
  });
  it('큰 글씨 모드(고령 손님)는 0.5초 더 기다린다', () => {
    expect(endpointDelay('두 명이에요', true)).toBe(1200);
    expect(endpointDelay('셋', true)).toBe(1500);
  });
});

describe('isEcho (스피커에서 나온 직원 목소리를 손님 말로 착각하지 않기)', () => {
  const speaking = '우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?';
  it('지금 읽는 문장의 일부를 들은 것이면 메아리 (조금 잘못 알아들어도)', () => {
    expect(isEcho('몇 분이서 오셨어요', speaking)).toBe(true);
    expect(isEcho('평촌 본점에 어서', speaking)).toBe(true);
    expect(isEcho('우르르 평촌본점에 어서 오세요 몇 분이 셨어요', speaking)).toBe(true);
  });
  it('문장에 없는 말이 2자 넘게 섞이면 손님 말', () => {
    expect(isEcho('셋이요', speaking)).toBe(false);
    expect(isEcho('몇 분이서 셋이요 아이 하나', speaking)).toBe(false);
  });
  it('직원이 말하고 있지 않으면 메아리가 아님', () => {
    expect(isEcho('몇 분이서', '')).toBe(false);
  });
});

describe('stripEcho (끼어든 말 앞에 섞인 직원 목소리 덜어 내기)', () => {
  it('앞쪽에 붙은 직원 문장 조각을 뺀다', () => {
    expect(stripEcho('몇 분이서 오셨어요 셋이요', '몇 분이서 오셨어요?')).toBe('셋이요');
    expect(stripEcho('셋이요', '몇 분이서 오셨어요?')).toBe('셋이요');
  });
});

describe('dropPrefix (메아리 스냅샷 뒤만 남기기)', () => {
  it('앞부분이 스냅샷과 같으면(띄어쓰기·문장부호 무시) 그 뒤만 남긴다', () => {
    expect(dropPrefix('몇 분이 셨어요 셋이요 아이 하나', '몇 분이 셨어요')).toBe('셋이요 아이 하나');
    expect(dropPrefix('몇분이 셨어요, 셋이요', '몇 분이 셨어요')).toBe('셋이요');
  });
  it('스냅샷으로 시작하지 않거나 스냅샷이 없으면 그대로 둔다', () => {
    expect(dropPrefix('셋이요', '몇 분이 셨어요')).toBe('셋이요');
    expect(dropPrefix('두 명이에요', '')).toBe('두 명이에요');
  });
});

describe('finalDelay (인식기가 문장을 확정했을 때 바로 넘기기, 2026-11-03 팀장 요청)', () => {
  it('말을 맺은 꼴(…요/…다/…까/…죠)이나 짧은 완결 답(숫자 인원·네)이면 0.25초', () => {
    for (const t of ['두 명이에요', '혼자 왔어요', '괜찮습니다', '이거 맵나요', '맛있겠죠', '셋', '네', '두 명']) expect(finalDelay(t)).toBe(250);
  });
  it('큰 글씨 모드(고령 손님)는 0.2초 더', () => {
    expect(finalDelay('두 명이에요', true)).toBe(450);
  });
  it('이어질 꼴("그리고/랑/하고/근데/음/어")이거나 길게 끝나지 않은 말이면 예전처럼 끝말 대기', () => {
    expect(finalDelay('짬뽕 하나랑')).toBe(endpointDelay('짬뽕 하나랑'));
    expect(finalDelay('음')).toBe(endpointDelay('음'));
    expect(finalDelay('두 명인데 근데')).toBe(endpointDelay('두 명인데 근데'));
    expect(finalDelay('매운 거 잘 못 먹는 아이도 같이')).toBe(endpointDelay('매운 거 잘 못 먹는 아이도 같이'));
    expect(finalDelay('짬뽕 하나랑', true)).toBe(endpointDelay('짬뽕 하나랑', true));
  });
});
