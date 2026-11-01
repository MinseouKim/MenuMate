// 빌드 묶음 나누기 (vite.config.ts 가 씀). 이름 = 묶음 파일 이름
export const CHUNK_GROUPS: { name: string; test: RegExp }[] = [
  { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
  { name: 'mediapipe', test: /[\\/]node_modules[\\/]@mediapipe[\\/]/ },
  { name: 'onnxruntime', test: /[\\/]node_modules[\\/]onnxruntime-(web|common)[\\/]/ },
];
