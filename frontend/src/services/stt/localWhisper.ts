/**
 * 브라우저 음성 인식이 안 될 때의 대체 수단: 브라우저 안에서 Whisper(base, int8)를 돌린다 (D89).
 * 모델 파일은 Backend가 /models/stt/ 로 제공한다 (ai/models/stt/, 받는 법은 ai/MODELS.md). 배포 서버에 파일이 없으면 이 대체 수단은 꺼진다.
 * 불러오는 데 몇 초 걸려서 필요할 때(Web Speech가 안 될 때)만 불러온다.
 */
import { config } from '../../config';
import { isHallucination, speechLike } from './whisperFilter';
const MODEL = 'whisper-base';
const MODEL_ROOT = config.sttModelRoot.endsWith('/') ? config.sttModelRoot : `${config.sttModelRoot}/`;

type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
let loading: Promise<Asr> | null = null;

export function loadWhisper(): Promise<Asr> {
  loading ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    // 모두 로컬 파일만: 모델도, ORT wasm도 CDN에서 받지 않는다
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = MODEL_ROOT;
    const wasmRoot = `${MODEL_ROOT}ort-wasm/`;
    env.backends.onnx.wasm!.wasmPaths = { mjs: `${wasmRoot}ort-wasm-simd-threaded.jsep.mjs`, wasm: `${wasmRoot}ort-wasm-simd-threaded.jsep.wasm` };
    const asr = await pipeline('automatic-speech-recognition', MODEL, {
      device: 'wasm',
      dtype: { encoder_model: 'int8', decoder_model_merged: 'int8' },
    });
    return asr as unknown as Asr;
  })();
  loading.catch(() => { loading = null; }); // 실패하면 다음에 다시 시도
  return loading;
}

/** 16kHz 모노 샘플을 한국어 문장으로. 소리가 없으면 빈 문자열. 지어낸 문장 거르기는 whisperFilter(isHallucination)가 한다 */
export async function transcribeLocal(audio: Float32Array): Promise<string> {
  if (!speechLike(audio)) return '';
  const asr = await loadWhisper();
  const out = await asr(audio, { language: 'korean', task: 'transcribe' });
  const text = (Array.isArray(out) ? out[0]?.text : out.text)?.replace(/\s+/g, ' ').trim() ?? '';
  if (!/[가-힣0-9]/.test(text)) return '';
  return isHallucination(text) ? '' : text;
}
