// 모델과 WASM 파일을 ai/models/ 에 준비한다. 이 명령만 인터넷이 필요하다 (D32).
//   npm run models:setup -w ai                  확정 모델(SELECTED_AGE_MODEL) 준비
//   npm run models:setup -w ai -- --age=vit-age-gender   다른 후보를 age_estimator.onnx로
//   npm run models:setup -w ai -- --candidates  두 후보를 models/age/candidates/ 에도 받기 (비교용)
// Mac과 Windows에서 같게 동작하도록 셸 명령 없이 Node만 쓴다 (D22).

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const AI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = join(AI_DIR, 'models');
const require = createRequire(join(AI_DIR, 'package.json'));

/** 10/26 확정 전까지의 기본값. 확정되면 여기와 MODELS.md를 함께 고친다. */
const SELECTED_AGE_MODEL = 'insightface-genderage';

const FACE_MODEL = {
  file: 'face/blaze_face_short_range.tflite',
  url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  sha256: 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f',
};

const AGE_MODELS = {
  'insightface-genderage': {
    url: 'https://huggingface.co/public-data/insightface/resolve/33c1063c49c785b7652d3fd529f86fa4f149392b/models/buffalo_l/genderage.onnx',
    sha256: '4fde69b1c810857b88c64a335084f1c3fe8f01246c9a191b48c7bb756d6652fb',
  },
  'vit-age-gender': {
    url: 'https://huggingface.co/onnx-community/age-gender-prediction-ONNX/resolve/6c138f6454d37dd55e5d4648e23e1ec23844e705/onnx/model.onnx',
    sha256: '0c35c868ea8ffba6d5fe727c1a6b82d9da600e690342d58ca268270560e28304',
  },
};

const args = process.argv.slice(2);
const ageArg = args.find((a) => a.startsWith('--age='))?.slice('--age='.length) ?? SELECTED_AGE_MODEL;
const withCandidates = args.includes('--candidates');
if (!AGE_MODELS[ageArg]) {
  console.error(`알 수 없는 나이 모델: ${ageArg}. 가능한 값: ${Object.keys(AGE_MODELS).join(', ')}`);
  process.exit(1);
}

async function sha256(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function download({ url, sha256: expected }, dest) {
  await mkdir(dirname(dest), { recursive: true });
  if (existsSync(dest) && (await sha256(dest)) === expected) {
    console.log(`  있음  ${rel(dest)}`);
    return;
  }
  const tmp = `${dest}.part`;
  for (let attempt = 1; ; attempt++) {
    try {
      process.stdout.write(`  받는 중 ${rel(dest)} ... `);
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      const actual = await sha256(tmp);
      if (actual !== expected) throw new Error(`해시 불일치 ${actual}`);
      await rename(tmp, dest);
      console.log(`완료 (${mb((await stat(dest)).size)})`);
      return;
    } catch (e) {
      console.log(`실패: ${e.message}`);
      await rm(tmp, { force: true });
      if (attempt >= 4) throw new Error(`${url} 를 받지 못했습니다`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function copyDir(src, dest, filter) {
  await mkdir(dest, { recursive: true });
  let n = 0;
  for (const name of await readdir(src)) {
    if (!filter(name)) continue;
    await copyFile(join(src, name), join(dest, name));
    n++;
  }
  console.log(`  복사  ${rel(dest)} (${n}개)`);
}

const rel = (p) => p.slice(AI_DIR.length + 1).replaceAll('\\', '/');
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)}MB`;

console.log('얼굴 검출 모델');
await download(FACE_MODEL, join(MODELS, FACE_MODEL.file));

console.log(`나이 추정 모델: ${ageArg}`);
await download(AGE_MODELS[ageArg], join(MODELS, 'age', 'age_estimator.onnx'));
if (withCandidates) {
  for (const [id, m] of Object.entries(AGE_MODELS)) await download(m, join(MODELS, 'age', 'candidates', `${id}.onnx`));
}

console.log('WASM');
const mpDir = join(dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm');
await copyDir(mpDir, join(MODELS, 'mediapipe-wasm'), (f) => /\.(js|wasm)$/.test(f));
const ortDist = dirname(require.resolve('onnxruntime-web'));
await copyDir(ortDist, join(MODELS, 'ort-wasm'), (f) => /^ort-wasm.*\.(mjs|wasm)$/.test(f));

console.log('완료. 이제 인터넷 없이 실행할 수 있습니다.');
