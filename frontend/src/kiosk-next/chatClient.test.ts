import { describe, expect, it } from 'vitest';
import { toServerTurns } from './chatClient';

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
