import { describe, expect, it } from 'vitest';
import { ackFor, toServerTurns } from './chatClient';

describe('ackFor', () => {
  it('첫 질문(인원)에 답한 뒤에는 맞장구 없이 직원 답을 기다린다', () => {
    expect(ackFor([{ role: 'assistant', text: '우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?' }])).toBeNull();
  });

  it('그다음부터는 맞장구를 하되 기계적인 "네, 알겠어요."는 쓰지 않는다', () => {
    const turns = [
      { role: 'assistant' as const, text: '우루루 평촌본점에 어서 오세요! 몇 분이서 오셨어요?' },
      { role: 'user' as const, text: '두 명이요' },
      { role: 'assistant' as const, text: '두 분이 오셨군요! 매운 음식도 잘 드세요?' },
    ];
    const acks = [3, 5, 7].map(n => ackFor([...turns, ...Array.from({ length: n - 3 }, () => turns[2])]));
    expect(acks.every(a => typeof a === 'string' && a.length > 0)).toBe(true);
    expect(acks).not.toContain('네, 알겠어요.');
  });

  it('손님이 답할 때마다 맞장구가 바뀐다 (같은 말 반복 금지)', () => {
    const before = (answers: number) => [
      { role: 'assistant', text: '몇 분이서 오셨어요?' },
      ...Array.from({ length: answers }, () => [{ role: 'user', text: '네' }, { role: 'assistant', text: '다음 질문?' }]).flat(),
    ];
    expect(ackFor(before(1))).not.toBe(ackFor(before(2)));
  });
});

describe('toServerTurns', () => {
  it('손님이 끊은 직원 말에는 "(끊김)"을 붙이고, 서버가 모르는 필드는 보내지 않는다', () => {
    expect(toServerTurns([
      { role: 'assistant', text: '몇 분이서 오셨어요?', interrupted: true },
      { role: 'user', text: '셋이요' },
    ])).toEqual([
      { role: 'assistant', text: '몇 분이서 오셨어요? (끊김)' },
      { role: 'user', text: '셋이요' },
    ]);
  });
});
