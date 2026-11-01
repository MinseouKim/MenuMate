// 큰 묶음 코드 분할 (D79): React, MediaPipe, ONNX Runtime 을 각자 묶음으로 나눠 병렬로 받고, 500KB 경고를 넘지 않게
import { describe, expect, it } from 'vitest';
import { CHUNK_GROUPS } from './buildChunks';

const groupFor = (id: string) => CHUNK_GROUPS.find(g => g.test.test(id))?.name ?? null;

describe('빌드 묶음 나누기', () => {
  it('React 런타임은 react 묶음', () => {
    expect(groupFor('/x/node_modules/react-dom/cjs/react-dom-client.production.js')).toBe('react');
    expect(groupFor('/x/node_modules/react/index.js')).toBe('react');
    expect(groupFor('/x/node_modules/scheduler/index.js')).toBe('react');
  });

  it('AI 라이브러리는 각자 묶음 (AI 모듈과 함께 나중에 불러옴)', () => {
    expect(groupFor('/x/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs')).toBe('mediapipe');
    expect(groupFor('/x/node_modules/onnxruntime-web/dist/ort.bundle.min.mjs')).toBe('onnxruntime');
  });

  it('앱 코드와 AI 모듈 소스는 나누지 않는다', () => {
    expect(groupFor('/x/frontend/src/App.tsx')).toBeNull();
    expect(groupFor('/x/ai/src/index.ts')).toBeNull();
    expect(groupFor('/x/node_modules/react-router/index.js')).toBeNull(); // react 로 시작하는 다른 패키지
  });
});
