"""나이 추정 후보 모델 비교 (D35, 10/26 보고용).

브라우저 모듈과 같은 순서로 처리한다:
  MediaPipe Face Detector(blaze_face_short_range) → 가장 큰 얼굴 → 정사각 크롭(밖은 검정) → 후보 ONNX
전처리 값은 src/ageModels.ts 와 같아야 한다.

준비 (평가 전용, 런타임과 무관):
  python3 -m venv .venv && .venv/bin/pip install onnxruntime mediapipe numpy pillow pyarrow
  npm run models:setup -w ai -- --candidates
  .venv/bin/python ai/eval/eval_age.py --download --data <데이터 폴더>
  .venv/bin/python ai/eval/eval_age.py --data <데이터 폴더> [--limit N] [--json out.json]

데이터 (평가에만 쓰고 저장소에 넣지 않는다):
  - AgeDB 일부 (정확한 나이, 30~80세. 45~65세를 많이 뽑음)       huggingface.co/datasets/marcelohaps/agedb
  - FairFace validation (나이 구간, 인종 라벨. CC BY 4.0)          huggingface.co/datasets/HuggingFaceM4/FairFace
  - face-age-gender-asian test (아시아인, 나이 또는 구간)          huggingface.co/datasets/hiennguyen9874/face-age-gender-asian
"""

from __future__ import annotations

import argparse
import io
import json
import random
import re
import statistics
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

AI_DIR = Path(__file__).resolve().parent.parent
MODELS = AI_DIR / "models"
SENIOR_AGE = 55


@dataclass
class Spec:
    id: str
    path: Path
    input_size: int
    crop_scale: float
    scale: float
    mean: tuple[float, float, float]
    std: tuple[float, float, float]
    read_age: callable


SPECS = {
    "insightface-genderage": Spec(
        "insightface-genderage", MODELS / "age/candidates/insightface-genderage.onnx",
        96, 1.5, 1.0, (0, 0, 0), (1, 1, 1), lambda out: float(out[0][0][2]) * 100,
    ),
    "vit-age-gender-int8": Spec(
        "vit-age-gender-int8", MODELS / "age/candidates/vit-age-gender-int8.onnx",
        224, 1.3, 1 / 255, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), lambda out: float(out[0][0][0]),
    ),
    "vit-age-gender": Spec(
        "vit-age-gender", MODELS / "age/candidates/vit-age-gender.onnx",
        224, 1.3, 1 / 255, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), lambda out: float(out[0][0][0]),
    ),
}


# ---------------------------------------------------------------- 데이터

@dataclass
class Sample:
    source: str
    key: str
    load: callable                 # () -> PIL.Image
    age: int | None = None         # 정확한 나이
    age_range: tuple[int, int] | None = None
    group: str | None = None       # 'East Asian' 등


FAIRFACE_AGES = [(0, 2), (3, 9), (10, 19), (20, 29), (30, 39), (40, 49), (50, 59), (60, 69), (70, 120)]
FAIRFACE_RACES = ["East Asian", "Indian", "Black", "White", "Middle Eastern", "Latino_Hispanic", "Southeast Asian"]


def download(data: Path) -> None:
    data.mkdir(parents=True, exist_ok=True)
    hf = "https://huggingface.co/datasets"
    files = {
        "fairface_val.parquet": f"{hf}/HuggingFaceM4/FairFace/resolve/main/0.25/validation-00000-of-00001-951dbd63c8724ee1.parquet",
        "asian_test.parquet": f"{hf}/hiennguyen9874/face-age-gender-asian/resolve/main/data/test-00000-of-00001.parquet",
    }
    for name, url in files.items():
        if not (data / name).exists():
            print("받는 중", name)
            urllib.request.urlretrieve(url, data / name)
    listing = json.load(urllib.request.urlopen("https://huggingface.co/api/datasets/marcelohaps/agedb"))
    by_age: dict[int, list[str]] = {}
    for s in listing["siblings"]:
        m = re.search(r"_(\d+)_[mfMF]\.jpg$", s["rfilename"])
        if m:
            by_age.setdefault(int(m.group(1)), []).append(s["rfilename"])
    rnd = random.Random(0)
    pick = []
    for a in range(30, 81):
        pool = by_age.get(a, [])
        pick += rnd.sample(pool, min(24 if 45 <= a <= 65 else 10, len(pool)))
    out = data / "agedb"
    out.mkdir(exist_ok=True)

    def fetch(f: str) -> None:
        dest = out / Path(f).name
        if not dest.exists():
            urllib.request.urlretrieve(f"{hf}/marcelohaps/agedb/resolve/main/{f}", dest)

    with ThreadPoolExecutor(12) as ex:
        list(ex.map(fetch, pick))
    print("AgeDB", len(pick), "장")


def useful_range(lo: int, hi: int) -> bool:
    """나이 구간 라벨 중 55 판정의 정답이 분명한 40~49세, 60세 이상만 쓴다. 50~59 구간은 정답을 알 수 없다."""
    return (lo, hi) == (40, 49) or lo >= 60


def load_samples(data: Path) -> list[Sample]:
    import pyarrow.parquet as pq

    samples: list[Sample] = []
    for p in sorted((data / "agedb").glob("*.jpg")):
        m = re.search(r"_(\d+)_[mfMF]\.jpg$", p.name)
        if m:
            samples.append(Sample("agedb", p.name, lambda p=p: Image.open(p), age=int(m.group(1))))

    t = pq.read_table(data / "fairface_val.parquet").to_pylist()
    for i, r in enumerate(t):
        lo, hi = FAIRFACE_AGES[r["age"]]
        b = r["image"]["bytes"]
        if useful_range(lo, hi):
            samples.append(Sample("fairface", str(i), lambda b=b: Image.open(io.BytesIO(b)),
                                  age_range=(lo, hi), group=FAIRFACE_RACES[r["race"]]))

    t = pq.read_table(data / "asian_test.parquet").to_pylist()
    for i, r in enumerate(t):
        lo, hi = (int(x) for x in re.findall(r"\d+", r["age"]))
        if lo != hi and not useful_range(lo, hi):
            continue
        b = r["image"]["bytes"]
        samples.append(Sample("asian", str(i), lambda b=b: Image.open(io.BytesIO(b)),
                              age=lo if lo == hi else None, age_range=(lo, hi), group="Asian"))
    return samples


# ---------------------------------------------------------------- 파이프라인

def make_detector():
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import FaceDetector, FaceDetectorOptions

    det = FaceDetector.create_from_options(FaceDetectorOptions(
        base_options=BaseOptions(model_asset_path=str(MODELS / "face/blaze_face_short_range.tflite")),
        min_detection_confidence=0.5,
    ))

    def detect(img: Image.Image):
        arr = np.asarray(img.convert("RGB"))
        res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=arr))
        best = None
        for d in res.detections:
            b = d.bounding_box
            if b.width > 0 and b.height > 0 and (best is None or b.width * b.height > best[2] * best[3]):
                best = (b.origin_x, b.origin_y, b.width, b.height, d.categories[0].score)
        return best

    return detect


def crop_tensor(img: Image.Image, box, spec: Spec, crop_scale: float) -> np.ndarray:
    x, y, w, h = box[:4]
    side = max(w, h) * crop_scale
    cx, cy = x + w / 2, y + h / 2
    # PIL crop은 영상 밖을 검정(0)으로 채운다. 브라우저의 fillRect 검정 + drawImage와 같다.
    c = img.convert("RGB").crop((round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2)))
    c = c.resize((spec.input_size, spec.input_size), Image.BILINEAR)
    a = np.asarray(c, dtype=np.float32) * spec.scale
    a = (a - np.array(spec.mean, dtype=np.float32)) / np.array(spec.std, dtype=np.float32)
    return a.transpose(2, 0, 1)[None].astype(np.float32)


# ---------------------------------------------------------------- 지표

def is_senior(age: float) -> bool:
    return age >= SENIOR_AGE


@dataclass
class Result:
    preds: dict[str, float] = field(default_factory=dict)   # sample key → 추정 나이
    ms: list[float] = field(default_factory=list)


def summarize(samples: list[Sample], res: Result) -> dict:
    out: dict = {}

    def acc(items, truth):
        ok = [is_senior(res.preds[s.source + s.key]) == truth(s) for s in items]
        return (round(100 * sum(ok) / len(ok), 1), len(ok)) if ok else (None, 0)

    got = [s for s in samples if s.source + s.key in res.preds]
    exact = [s for s in got if s.age is not None]
    if exact:
        err = [abs(res.preds[s.source + s.key] - s.age) for s in exact]
        out["MAE(정확한 나이 전체)"] = (round(statistics.mean(err), 2), len(err))
        band = [s for s in exact if 50 <= s.age <= 60]
        out["MAE(50~60세)"] = (round(statistics.mean(abs(res.preds[s.source + s.key] - s.age) for s in band), 2), len(band)) if band else (None, 0)
        bias = [res.preds[s.source + s.key] - s.age for s in band]
        out["평균 편향(50~60세, +는 나이 많게)"] = (round(statistics.mean(bias), 2), len(bias)) if bias else (None, 0)
        out["55 경계 정확도(50~60세)"] = acc(band, lambda s: s.age >= SENIOR_AGE)
        out["55 판정 정확도(정확한 나이 전체)"] = acc(exact, lambda s: s.age >= SENIOR_AGE)
        out["고령 재현율(60세 이상 → senior)"] = acc([s for s in exact if s.age >= 60], lambda s: True)
        out["비고령 재현율(45세 이하 → non_senior)"] = acc([s for s in exact if s.age <= 45], lambda s: False)

    ranged = [s for s in got if s.age is None and s.age_range]
    clear = [s for s in ranged if s.age_range[1] < 50 or s.age_range[0] >= 60]
    if clear:
        out["구간 데이터 명확 구간(<50, ≥60) 정확도"] = acc(clear, lambda s: s.age_range[0] >= 60)
        out["  ├ 40~49세 → non_senior"] = acc([s for s in clear if s.age_range == (40, 49)], lambda s: False)
        out["  └ 60세 이상 → senior"] = acc([s for s in clear if s.age_range[0] >= 60], lambda s: True)
        ea = [s for s in clear if s.group in ("East Asian", "Asian")]
        out["동아시아인 명확 구간 정확도"] = acc(ea, lambda s: s.age_range[0] >= 60)
        out["  ├ 동아시아 40~49 → non_senior"] = acc([s for s in ea if s.age_range == (40, 49)], lambda s: False)
        out["  └ 동아시아 60+ → senior"] = acc([s for s in ea if s.age_range[0] >= 60], lambda s: True)
    if res.ms:
        out["CPU 추론 ms (중앙값 40회, Python ORT 1스레드)"] = (round(statistics.median(res.ms), 2), len(res.ms))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="출처별 최대 샘플 수 (0 = 전부)")
    ap.add_argument("--models", default=",".join(SPECS))
    ap.add_argument("--scales", default="", help="크롭 배율 비교 예: 1.2,1.5,1.8 (AgeDB만)")
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()

    if args.download:
        download(args.data)
        return

    samples = load_samples(args.data)
    if args.limit:
        rnd = random.Random(1)
        by: dict[str, list[Sample]] = {}
        for s in samples:
            by.setdefault(s.source, []).append(s)
        samples = [x for v in by.values() for x in (rnd.sample(v, min(args.limit, len(v))))]
    print(f"샘플 {len(samples)}개", {k: sum(1 for s in samples if s.source == k) for k in ("agedb", "fairface", "asian")}, file=sys.stderr)

    detect = make_detector()
    boxes = {}
    t0 = time.time()
    for s in samples:
        try:
            img = s.load()
            img.load()
            b = detect(img)
        except Exception:  # 깨진 파일
            b = None
        if b:
            boxes[s.source + s.key] = b
    print(f"얼굴 검출 {len(boxes)}/{len(samples)} ({time.time() - t0:.0f}s)", file=sys.stderr)

    so1 = ort.SessionOptions()
    so1.intra_op_num_threads = 1
    report = {"samples": len(samples), "detected": len(boxes),
              "detected_by_source": {k: sum(1 for s in samples if s.source == k and s.source + s.key in boxes) for k in ("agedb", "fairface", "asian")},
              "models": {}}
    for mid in args.models.split(","):
        spec = SPECS[mid]
        if not spec.path.exists():
            print(f"건너뜀: {spec.path} 없음", file=sys.stderr)
            continue
        sess = ort.InferenceSession(str(spec.path), providers=["CPUExecutionProvider"])
        timing = ort.InferenceSession(str(spec.path), so1, providers=["CPUExecutionProvider"])
        name = sess.get_inputs()[0].name
        scales = [float(x) for x in args.scales.split(",")] if args.scales else [spec.crop_scale]
        for cs in scales:
            res = Result()
            for s in samples:
                b = boxes.get(s.source + s.key)
                if not b or (args.scales and s.source != "agedb"):
                    continue
                x = crop_tensor(s.load(), b, spec, cs)
                if len(res.ms) < 40:
                    t = time.perf_counter()
                    timing.run(None, {name: x})
                    res.ms.append((time.perf_counter() - t) * 1000)
                out = sess.run(None, {name: x})
                res.preds[s.source + s.key] = spec.read_age(out)
            label = f"{mid} (crop×{cs})"
            report["models"][label] = summarize(samples, res)
            print(f"\n## {label}  모델 {spec.path.stat().st_size / 1e6:.1f}MB")
            for k, (v, n) in report["models"][label].items():
                print(f"  {k}: {v}  (n={n})")
    if args.json:
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
