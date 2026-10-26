// 디자인 변경을 받기 쉬운 구조를 지키는지 검사한다.
// 디자인 값은 tokens.css, 문구는 copy.ts 에만 두어야 디자이너 명세를 한 곳에서 반영할 수 있다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..');
const read = (p: string) => readFileSync(join(src, p), 'utf8');
// 블록 주석과 줄 주석(줄 끝 주석 포함)을 지운다. 코드 안 문자열에 // 가 들어가는 경우는 없다
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('색은 tokens.css 에만', () => {
  const css = stripComments(read('styles/global.css'));

  it('global.css 에 색 값(#hex, rgb)이 없다', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)).toBeNull();
  });

  it('global.css 는 tokens.css 의 색 변수만 쓴다 (정의하지 않은 변수 없음)', () => {
    const defined = new Set(read('styles/tokens.css').match(/--[\w-]+(?=\s*:)/g));
    const used = new Set(css.match(/var\((--[\w-]+)/g)?.map(v => v.slice(4)));
    expect([...used].filter(v => !defined.has(v))).toEqual([]);
  });
});

describe('문구는 copy.ts 에만', () => {
  const files = ['screens', 'components'].flatMap(dir =>
    readdirSync(join(src, dir)).filter(f => f.endsWith('.tsx')).map(f => `${dir}/${f}`));

  it.each(files)('%s 에 한국어 문장을 직접 쓰지 않는다', file => {
    const code = stripComments(read(file));
    expect(code.match(/[가-힣]+/g)).toBeNull();
  });
});
